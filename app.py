# Metadata Remote - Intelligent audio metadata editor
# Copyright (C) 2025 Dr. William Nelson Leonard
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU Affero General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.
#
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU Affero General Public License for more details.
#
# You should have received a copy of the GNU Affero General Public License
# along with this program.  If not, see <https://www.gnu.org/licenses/>.

from flask import Flask, jsonify, request, render_template, send_file, Response
import subprocess
import json
import os
import logging
import tempfile
import base64
import re
import urllib.parse
from pathlib import Path
import time
import hashlib
from collections import defaultdict, Counter
from datetime import datetime, timedelta
import difflib
import threading
from typing import Dict, List, Tuple, Optional, Any
import urllib.request
import urllib.error
import uuid
from dataclasses import dataclass, asdict
from enum import Enum

from config import (
    MUSIC_DIR, OWNER_UID, OWNER_GID, PORT, HOST,
    AUDIO_EXTENSIONS, MIME_TYPES, FORMAT_METADATA_CONFIG,
    MAX_HISTORY_ITEMS, INFERENCE_CACHE_DURATION, 
    MUSICBRAINZ_RATE_LIMIT, MUSICBRAINZ_USER_AGENT,
    FIELD_THRESHOLDS, logger
)

from core.history import (
    history, ActionType, HistoryAction,
    create_metadata_action, create_batch_metadata_action,
    create_album_art_action, create_batch_album_art_action
)

app = Flask(__name__)

@app.after_request
def add_cache_headers(response):
    """Add cache-control headers to prevent reverse proxy caching of dynamic content"""
    # Only add cache-control headers to JSON responses (our API endpoints)
    if response.mimetype == 'application/json':
        response.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, private'
        response.headers['Pragma'] = 'no-cache'
        response.headers['Expires'] = '0'
    return response

# =========================
# METADATA INFERENCE ENGINE
# =========================

class MetadataInferenceEngine:
    """Universal Metadata Inference Algorithm Implementation"""
    
    def __init__(self):
        self.cache = {}
        self.cache_lock = threading.Lock()
        self.mb_last_request = 0
        self.mb_rate_limit = MUSICBRAINZ_RATE_LIMIT

        # Confidence thresholds
        self.field_thresholds = FIELD_THRESHOLDS
        
    def infer_field(self, file_path: str, field: str, existing_metadata: dict, folder_context: dict) -> List[dict]:
        """Main entry point for inferring a single field"""
        
        # Build evidence state
        evidence_state = self._build_evidence_state(file_path, existing_metadata, folder_context)
        
        # Phase 1: Local inference
        local_candidates = self._perform_local_inference(evidence_state, field)
        
        # Phase 2: MusicBrainz search (if needed)
        mb_candidates = []
        if self._should_query_musicbrainz(field, local_candidates, existing_metadata):
            mb_candidates = self._query_musicbrainz(evidence_state, field, local_candidates)
        
        # Phase 3: Synthesis
        all_candidates = self._synthesize_candidates(local_candidates, mb_candidates, evidence_state, field)
        
        # Phase 4: Final scoring and sorting
        final_candidates = self._calculate_final_scores(all_candidates, evidence_state, field)
        
        # Return top candidates with confidence >= threshold/2
        threshold = self.field_thresholds.get(field, 70) / 2
        return [c for c in final_candidates if c['confidence'] >= threshold][:5]
    
    def _build_evidence_state(self, file_path: str, existing_metadata: dict, folder_context: dict) -> dict:
        """Build comprehensive evidence state"""
        path = Path(file_path)
        
        # Extract filename features
        filename_segments = self._extract_filename_segments(path.name)
        
        # Analyze folder structure
        folder_parts = path.parent.name.split(os.sep)
        
        # Get sibling files
        siblings = folder_context.get('files', [])
        sibling_patterns = self._analyze_sibling_patterns(siblings, path.name)
        
        return {
            'filepath': file_path,
            'filename': path.name,
            'filename_no_ext': path.stem,
            'extension': path.suffix.lower(),
            'folder_name': path.parent.name,
            'parent_folder': path.parent.parent.name if path.parent.parent else None,
            'folder_parts': folder_parts,
            'existing_metadata': existing_metadata,
            'filename_segments': filename_segments,
            'sibling_patterns': sibling_patterns,
            'sibling_count': len(siblings)
        }
    
    def _extract_filename_segments(self, filename: str) -> List[dict]:
        """Extract meaningful segments from filename"""
        segments = []
        
        # Remove extension
        name = os.path.splitext(filename)[0]
        
        # Try different delimiters
        delimiters = [' - ', '-', '_', '~', ' · ', ' — ', '.', ' ']
        
        for delimiter in delimiters:
            parts = name.split(delimiter)
            if 2 <= len(parts) <= 6:
                segments.append({
                    'parts': parts,
                    'delimiter': delimiter,
                    'confidence': self._delimiter_confidence(delimiter, parts)
                })
        
        # Extract parenthetical info
        paren_matches = re.findall(r'\(([^)]+)\)', name)
        bracket_matches = re.findall(r'\[([^\]]+)\]', name)
        
        for match in paren_matches + bracket_matches:
            segments.append({
                'parts': [match],
                'delimiter': 'parenthetical',
                'confidence': 60
            })
        
        return sorted(segments, key=lambda x: x['confidence'], reverse=True)
    
    def _delimiter_confidence(self, delimiter: str, parts: List[str]) -> float:
        """Calculate confidence for a delimiter based on resulting segments"""
        confidence = 50
        
        # Prefer certain delimiters
        if delimiter == ' - ':
            confidence += 30
        elif delimiter == '-':
            confidence += 20
        elif delimiter == '_':
            confidence += 10
        
        # Check segment quality
        valid_segments = sum(1 for p in parts if 2 <= len(p.strip()) <= 100)
        confidence += (valid_segments / len(parts)) * 20
        
        # Penalize too many segments
        if len(parts) > 4:
            confidence -= (len(parts) - 4) * 10
        
        return min(confidence, 100)
    
    def _analyze_sibling_patterns(self, siblings: List[dict], current_file: str) -> dict:
        """Analyze patterns in sibling files"""
        patterns = {
            'common_prefixes': Counter(),
            'common_suffixes': Counter(),
            'track_pattern': None,
            'disc_pattern': None,
            'common_artist': None,
            'common_album': None
        }
        
        if not siblings:
            return patterns
        
        # Analyze filenames
        filenames = [s['name'] for s in siblings if s['name'] != current_file]
        
        # Find common prefixes/suffixes
        if filenames:
            # Common prefix
            prefix = os.path.commonprefix(filenames)
            if len(prefix) > 3:
                patterns['common_prefixes'][prefix] = len(filenames)
            
            # Track number patterns
            track_matches = []
            for fn in filenames + [current_file]:
                # Match various track patterns
                match = re.match(r'^(\d{1,3})[\s\-_.]+(.+)', fn)
                if match:
                    track_matches.append(match.group(1))
            
            if len(track_matches) > len(filenames) * 0.7:
                patterns['track_pattern'] = 'prefix_number'
        
        return patterns
    
    def _perform_local_inference(self, evidence_state: dict, field: str) -> List[dict]:
        """Perform local inference for a specific field"""
        inference_methods = {
            'title': self._infer_title,
            'artist': self._infer_artist,
            'album': self._infer_album,
            'track': self._infer_track,
            'date': self._infer_date,
            'genre': self._infer_genre,
            'albumartist': self._infer_albumartist,
            'disc': self._infer_disc
        }
        
        method = inference_methods.get(field)
        if method:
            return method(evidence_state)
        return []
    
    def _infer_title(self, evidence_state: dict) -> List[dict]:
        """Infer title from evidence"""
        candidates = []
        
        # Strategy 1: From filename segments
        for segment_info in evidence_state['filename_segments']:
            parts = segment_info['parts']
            delimiter = segment_info['delimiter']
            
            # Common patterns
            if len(parts) == 2:
                # Assume "Artist - Title" or "Track - Title"
                if re.match(r'^\d{1,3}$', parts[0].strip()):
                    # First part is track number
                    candidates.append({
                        'value': parts[1].strip(),
                        'confidence': 85,
                        'source': 'filename_pattern',
                        'evidence': ['track_number_prefix']
                    })
                else:
                    # Might be "Artist - Title"
                    candidates.append({
                        'value': parts[1].strip(),
                        'confidence': 75,
                        'source': 'filename_pattern',
                        'evidence': ['two_part_split']
                    })
            
            elif len(parts) >= 3:
                # Try "Track - Artist - Title" or "Artist - Album - Title"
                if re.match(r'^\d{1,3}$', parts[0].strip()):
                    candidates.append({
                        'value': parts[-1].strip(),
                        'confidence': 80,
                        'source': 'filename_pattern',
                        'evidence': ['track_prefix_multipart']
                    })
                else:
                    # Last part might be title
                    candidates.append({
                        'value': parts[-1].strip(),
                        'confidence': 65,
                        'source': 'filename_pattern',
                        'evidence': ['last_segment']
                    })
        
        # Strategy 2: Remove track numbers and common prefixes
        filename_clean = evidence_state['filename_no_ext']
        
        # Remove leading track numbers
        track_removed = re.sub(r'^\d{1,3}[\s\-_.]+', '', filename_clean)
        if track_removed != filename_clean:
            candidates.append({
                'value': track_removed.strip(),
                'confidence': 70,
                'source': 'filename_cleaned',
                'evidence': ['track_number_removed']
            })
        
        # Strategy 3: Remove artist if known
        if evidence_state['existing_metadata'].get('artist'):
            artist = evidence_state['existing_metadata']['artist']
            patterns = [
                f"{artist} - ",
                f"{artist} — ",
                f"{artist} · ",
                f"{artist}_",
            ]
            for pattern in patterns:
                if filename_clean.startswith(pattern):
                    title = filename_clean[len(pattern):].strip()
                    candidates.append({
                        'value': title,
                        'confidence': 90,
                        'source': 'artist_removal',
                        'evidence': ['known_artist_prefix']
                    })
                    break
        
        # Remove duplicates and clean up
        seen = set()
        unique_candidates = []
        for c in candidates:
            cleaned_value = self._clean_title(c['value'])
            if cleaned_value and cleaned_value not in seen:
                seen.add(cleaned_value)
                c['value'] = cleaned_value
                unique_candidates.append(c)
        
        return sorted(unique_candidates, key=lambda x: x['confidence'], reverse=True)
    
    def _infer_artist(self, evidence_state: dict) -> List[dict]:
        """Infer artist from evidence"""
        candidates = []
        
        # Strategy 1: From folder structure
        folder_parts = evidence_state['folder_parts']
        if folder_parts:
            # Common pattern: /Artist/Album/
            if len(folder_parts) >= 2:
                candidates.append({
                    'value': folder_parts[-2],
                    'confidence': 80,
                    'source': 'folder_structure',
                    'evidence': ['parent_folder']
                })
            
            # Check grandparent folder
            if evidence_state['parent_folder']:
                candidates.append({
                    'value': evidence_state['parent_folder'],
                    'confidence': 75,
                    'source': 'folder_structure',
                    'evidence': ['grandparent_folder']
                })
        
        # Strategy 2: From filename segments
        for segment_info in evidence_state['filename_segments']:
            parts = segment_info['parts']
            
            if len(parts) >= 2:
                # First part might be artist (unless it's a track number)
                first_part = parts[0].strip()
                if not re.match(r'^\d{1,3}$', first_part):
                    candidates.append({
                        'value': first_part,
                        'confidence': 70,
                        'source': 'filename_pattern',
                        'evidence': ['first_segment']
                    })
                
                # For 3+ parts, second might be artist
                if len(parts) >= 3 and re.match(r'^\d{1,3}$', parts[0].strip()):
                    candidates.append({
                        'value': parts[1].strip(),
                        'confidence': 75,
                        'source': 'filename_pattern',
                        'evidence': ['middle_segment_after_track']
                    })
        
        # Strategy 3: From album artist if present
        if evidence_state['existing_metadata'].get('albumartist'):
            candidates.append({
                'value': evidence_state['existing_metadata']['albumartist'],
                'confidence': 85,
                'source': 'existing_metadata',
                'evidence': ['albumartist_fallback']
            })
        
        # Clean and deduplicate
        return self._deduplicate_candidates(candidates, 'artist')
    
    def _infer_album(self, evidence_state: dict) -> List[dict]:
        """Infer album from evidence"""
        candidates = []
        
        # Strategy 1: From folder name
        folder_name = evidence_state['folder_name']
        if folder_name and folder_name not in ['.', '..', '']:
            confidence = 85
            
            # Check if folder matches pattern "Artist - Album" 
            if ' - ' in folder_name:
                parts = folder_name.split(' - ', 1)
                if len(parts) == 2:
                    # Check if first part matches known artist
                    if evidence_state['existing_metadata'].get('artist'):
                        if parts[0].lower() == evidence_state['existing_metadata']['artist'].lower():
                            candidates.append({
                                'value': parts[1],
                                'confidence': 95,
                                'source': 'folder_pattern',
                                'evidence': ['artist_album_folder']
                            })
                        else:
                            candidates.append({
                                'value': parts[1],
                                'confidence': 80,
                                'source': 'folder_pattern',
                                'evidence': ['two_part_folder']
                            })
                    else:
                        candidates.append({
                            'value': parts[1],
                            'confidence': 80,
                            'source': 'folder_pattern',
                            'evidence': ['two_part_folder']
                        })
            else:
                # Plain folder name
                candidates.append({
                    'value': folder_name,
                    'confidence': confidence,
                    'source': 'folder_name',
                    'evidence': ['direct_folder']
                })
        
        # Strategy 2: From filename if it contains album info
        for segment_info in evidence_state['filename_segments']:
            parts = segment_info['parts']
            
            # Pattern: "Artist - Album - Title"
            if len(parts) >= 3:
                # Middle part might be album
                middle_idx = len(parts) // 2
                candidates.append({
                    'value': parts[middle_idx].strip(),
                    'confidence': 60,
                    'source': 'filename_pattern',
                    'evidence': ['middle_segment']
                })
        
        # Strategy 3: Common album patterns in parentheses
        paren_matches = re.findall(r'\(([^)]+)\)', evidence_state['filename'])
        for match in paren_matches:
            # Check if it's a year
            if not re.match(r'^\d{4}$', match):
                candidates.append({
                    'value': match,
                    'confidence': 55,
                    'source': 'parenthetical',
                    'evidence': ['parentheses_content']
                })
        
        return self._deduplicate_candidates(candidates, 'album')
    
    def _infer_track(self, evidence_state: dict) -> List[dict]:
        """Infer track number from evidence"""
        candidates = []
        
        filename = evidence_state['filename_no_ext']
        
        # Strategy 1: Leading numbers
        patterns = [
            (r'^(\d{1,3})[\s\-_.]+', 95),  # "01 - ", "1. ", etc
            (r'^(\d{1,3})\s*$', 90),        # Just a number
            (r'^\[(\d{1,3})\]', 85),        # "[01]"
            (r'^track[\s_]*(\d{1,3})', 85), # "track01", "track_1"
            (r'[\s\-_](\d{1,3})[\s\-_]', 70), # Number in middle
        ]
        
        for pattern, confidence in patterns:
            match = re.search(pattern, filename, re.IGNORECASE)
            if match:
                track_num = match.group(1).lstrip('0') or '0'
                candidates.append({
                    'value': track_num,
                    'confidence': confidence,
                    'source': 'filename_pattern',
                    'evidence': [f'pattern:{pattern}']
                })
        
        # Strategy 2: From sibling patterns
        if evidence_state['sibling_patterns'].get('track_pattern') == 'prefix_number':
            # Try to extract from current filename using same pattern
            match = re.match(r'^(\d{1,3})[\s\-_.]+', filename)
            if match:
                candidates.append({
                    'value': match.group(1).lstrip('0') or '0',
                    'confidence': 90,
                    'source': 'sibling_pattern',
                    'evidence': ['consistent_numbering']
                })
        
        # Remove duplicates, keep highest confidence
        track_dict = {}
        for c in candidates:
            track_val = c['value']
            if track_val not in track_dict or c['confidence'] > track_dict[track_val]['confidence']:
                track_dict[track_val] = c
        
        return sorted(track_dict.values(), key=lambda x: x['confidence'], reverse=True)
    
    def _infer_date(self, evidence_state: dict) -> List[dict]:
        """Infer date/year from evidence"""
        candidates = []
        
        # Look for 4-digit years
        year_pattern = r'\b(19[5-9]\d|20[0-2]\d)\b'
        
        # Strategy 1: From filename
        filename_years = re.findall(year_pattern, evidence_state['filename'])
        for year in filename_years:
            candidates.append({
                'value': year,
                'confidence': 75,
                'source': 'filename',
                'evidence': ['year_in_filename']
            })
        
        # Strategy 2: From folder name
        folder_years = re.findall(year_pattern, evidence_state['folder_name'])
        for year in folder_years:
            candidates.append({
                'value': year,
                'confidence': 80,
                'source': 'folder_name',
                'evidence': ['year_in_folder']
            })
        
        # Strategy 3: From parentheses (often contains year)
        paren_matches = re.findall(r'\((\d{4})\)', evidence_state['filename'] + ' ' + evidence_state['folder_name'])
        for year in paren_matches:
            if re.match(year_pattern, year):
                candidates.append({
                    'value': year,
                    'confidence': 85,
                    'source': 'parenthetical',
                    'evidence': ['year_in_parentheses']
                })
        
        # Validate years
        current_year = datetime.now().year
        valid_candidates = []
        for c in candidates:
            year_int = int(c['value'])
            if 1950 <= year_int <= current_year + 1:
                valid_candidates.append(c)
        
        return self._deduplicate_candidates(valid_candidates, 'date')
    
    def _infer_genre(self, evidence_state: dict) -> List[dict]:
        """Infer genre - basic implementation"""
        # Genre inference is very difficult without external data
        # This is where MusicBrainz will be most helpful
        return []
    
    def _infer_albumartist(self, evidence_state: dict) -> List[dict]:
        """Infer album artist from evidence"""
        candidates = []
        
        # Strategy 1: Use artist if available
        if evidence_state['existing_metadata'].get('artist'):
            candidates.append({
                'value': evidence_state['existing_metadata']['artist'],
                'confidence': 80,
                'source': 'existing_metadata',
                'evidence': ['artist_as_albumartist']
            })
        
        # Strategy 2: From folder structure (same as artist inference)
        artist_candidates = self._infer_artist(evidence_state)
        for ac in artist_candidates:
            candidates.append({
                'value': ac['value'],
                'confidence': ac['confidence'] * 0.9,  # Slightly lower confidence
                'source': ac['source'],
                'evidence': ac['evidence'] + ['inferred_as_artist']
            })
        
        return self._deduplicate_candidates(candidates, 'albumartist')
    
    def _infer_disc(self, evidence_state: dict) -> List[dict]:
        """Infer disc number from evidence"""
        candidates = []
        
        filename = evidence_state['filename_no_ext']
        folder = evidence_state['folder_name']
        
        # Patterns to check
        patterns = [
            (r'\bCD[\s]?(\d{1,2})\b', 90),
            (r'\bDisc[\s]?(\d{1,2})\b', 90),
            (r'\bDisk[\s]?(\d{1,2})\b', 90),
            (r'\bD(\d{1,2})\b', 70),
            (r'\[(\d{1,2})\]', 60),  # Might be disc in brackets
        ]
        
        # Check filename and folder
        for text in [filename, folder]:
            for pattern, confidence in patterns:
                match = re.search(pattern, text, re.IGNORECASE)
                if match:
                    disc_num = match.group(1).lstrip('0') or '0'
                    candidates.append({
                        'value': disc_num,
                        'confidence': confidence,
                        'source': 'filename' if text == filename else 'folder',
                        'evidence': [f'pattern:{pattern}']
                    })
        
        return self._deduplicate_candidates(candidates, 'disc')
    
    def _clean_title(self, title: str) -> str:
        """Clean up a title string"""
        # Remove common artifacts
        title = re.sub(r'\.(mp3|flac|m4a|wav|wma|wv)$', '', title, flags=re.IGNORECASE)
        title = re.sub(r'^[\d\s\-_.]+', '', title)  # Remove leading track numbers
        title = re.sub(r'\s+', ' ', title)  # Normalize whitespace
        title = title.strip(' -_.')
        
        # Remove quality indicators
        quality_patterns = [
            r'\[?\d{3,4}kbps\]?',
            r'\[?320\]?',
            r'\[?FLAC\]?',
            r'\[?MP3\]?',
            r'\(Explicit\)',
            r'\[Explicit\]',
        ]
        for pattern in quality_patterns:
            title = re.sub(pattern, '', title, flags=re.IGNORECASE)
        
        return title.strip()
    
    def _deduplicate_candidates(self, candidates: List[dict], field: str) -> List[dict]:
        """Remove duplicate candidates, keeping highest confidence"""
        seen = {}
        for c in candidates:
            # Normalize value for comparison
            normalized = c['value'].lower().strip()
            
            if normalized not in seen or c['confidence'] > seen[normalized]['confidence']:
                seen[normalized] = c
        
        return sorted(seen.values(), key=lambda x: x['confidence'], reverse=True)
    
    def _should_query_musicbrainz(self, field: str, local_candidates: List[dict], existing_metadata: dict) -> bool:
        """Determine if MusicBrainz query would be helpful"""
        
        # Don't query for track or disc numbers
        if field in ['track', 'disc']:
            return False
        
        # If we have no local candidates, definitely query
        if not local_candidates:
            return True
        
        # If highest confidence is low, query
        if local_candidates[0]['confidence'] < 70:
            return True
        
        # For certain fields, query if we have good context
        if field == 'genre':
            return bool(existing_metadata.get('artist') or existing_metadata.get('album'))
        
        if field == 'date':
            return bool(existing_metadata.get('artist') and existing_metadata.get('album'))
        
        return False
    
    def _query_musicbrainz(self, evidence_state: dict, field: str, local_candidates: List[dict]) -> List[dict]:
        """Query MusicBrainz API strategically"""
        
        # Rate limiting
        with self.cache_lock:
            time_since_last = time.time() - self.mb_last_request
            if time_since_last < self.mb_rate_limit:
                time.sleep(self.mb_rate_limit - time_since_last)
            self.mb_last_request = time.time()
        
        candidates = []
        
        try:
            # Build query based on what we know
            if field in ['title', 'artist', 'album']:
                # Try recording search if we have artist + title hints
                if (evidence_state['existing_metadata'].get('artist') or 
                    (local_candidates and field == 'artist')):
                    
                    artist = evidence_state['existing_metadata'].get('artist', '')
                    if not artist and field == 'artist' and local_candidates:
                        artist = local_candidates[0]['value']
                    
                    title_hint = evidence_state['existing_metadata'].get('title', '')
                    if not title_hint and field == 'title' and local_candidates:
                        title_hint = local_candidates[0]['value']
                    elif not title_hint:
                        # Try to extract from filename
                        title_candidates = self._infer_title(evidence_state)
                        if title_candidates:
                            title_hint = title_candidates[0]['value']
                    
                    if artist and title_hint:
                        results = self._mb_search_recordings(artist, title_hint)
                        candidates.extend(self._extract_mb_candidates(results, field))
            
            elif field == 'genre':
                # Search by artist
                artist = evidence_state['existing_metadata'].get('artist')
                if artist:
                    results = self._mb_search_artist(artist)
                    candidates.extend(self._extract_mb_genre_candidates(results))
            
            elif field == 'date':
                # Search by artist + album
                artist = evidence_state['existing_metadata'].get('artist')
                album = evidence_state['existing_metadata'].get('album')
                if artist and album:
                    results = self._mb_search_release(artist, album)
                    candidates.extend(self._extract_mb_date_candidates(results))
        
        except Exception as e:
            logger.error(f"MusicBrainz query error: {e}")
        
        return candidates
    
    def _mb_search_recordings(self, artist: str, title: str) -> dict:
        """Search MusicBrainz for recordings"""
        cache_key = hashlib.md5(f"rec:{artist}:{title}".encode()).hexdigest()
        
        # Check cache
        with self.cache_lock:
            if cache_key in self.cache:
                cached_data, cached_time = self.cache[cache_key]
                if time.time() - cached_time < 3600:  # 1 hour cache
                    return cached_data
        
        # Build query
        query = f'artist:"{artist}" AND recording:"{title}"'
        url = f"https://musicbrainz.org/ws/2/recording/?query={urllib.parse.quote(query)}&fmt=json&limit=5"
        
        try:
            req = urllib.request.Request(url, headers={
                'User-Agent': MUSICBRAINZ_USER_AGENT
            })
            
            with urllib.request.urlopen(req, timeout=10) as response:
                data = json.loads(response.read().decode('utf-8'))
                
                # Cache result
                with self.cache_lock:
                    self.cache[cache_key] = (data, time.time())
                
                return data
        except Exception as e:
            logger.error(f"MusicBrainz API error: {e}")
            return {'recordings': []}
    
    def _mb_search_artist(self, artist: str) -> dict:
        """Search MusicBrainz for artist"""
        cache_key = hashlib.md5(f"artist:{artist}".encode()).hexdigest()
        
        with self.cache_lock:
            if cache_key in self.cache:
                cached_data, cached_time = self.cache[cache_key]
                if time.time() - cached_time < INFERENCE_CACHE_DURATION:
                    return cached_data
        
        query = f'artist:"{artist}"'
        url = f"https://musicbrainz.org/ws/2/artist/?query={urllib.parse.quote(query)}&fmt=json&limit=3"
        
        try:
            req = urllib.request.Request(url, headers={
                'User-Agent': 'Metadata-Remote/1.0'
            })
            
            with urllib.request.urlopen(req, timeout=10) as response:
                data = json.loads(response.read().decode('utf-8'))
                
                with self.cache_lock:
                    self.cache[cache_key] = (data, time.time())
                
                return data
        except Exception as e:
            logger.error(f"MusicBrainz API error: {e}")
            return {'artists': []}
    
    def _mb_search_release(self, artist: str, album: str) -> dict:
        """Search MusicBrainz for release"""
        cache_key = hashlib.md5(f"release:{artist}:{album}".encode()).hexdigest()
        
        with self.cache_lock:
            if cache_key in self.cache:
                cached_data, cached_time = self.cache[cache_key]
                if time.time() - cached_time < 3600:
                    return cached_data
        
        query = f'artist:"{artist}" AND release:"{album}"'
        url = f"https://musicbrainz.org/ws/2/release/?query={urllib.parse.quote(query)}&fmt=json&limit=5"
        
        try:
            req = urllib.request.Request(url, headers={
                'User-Agent': 'Metadata-Remote/1.0'
            })
            
            with urllib.request.urlopen(req, timeout=10) as response:
                data = json.loads(response.read().decode('utf-8'))
                
                with self.cache_lock:
                    self.cache[cache_key] = (data, time.time())
                
                return data
        except Exception as e:
            logger.error(f"MusicBrainz API error: {e}")
            return {'releases': []}
    
    def _extract_mb_candidates(self, mb_data: dict, field: str) -> List[dict]:
        """Extract candidates from MusicBrainz recording search"""
        candidates = []
        
        for recording in mb_data.get('recordings', [])[:3]:
            score = recording.get('score', 0)
            
            if field == 'title':
                candidates.append({
                    'value': recording.get('title', ''),
                    'confidence': min(score, 90),
                    'source': 'musicbrainz',
                    'evidence': ['mb_recording'],
                    'mbid': recording.get('id')
                })
            
            elif field == 'artist':
                # Get artist from artist-credit
                artist_credit = recording.get('artist-credit', [])
                if artist_credit:
                    artist_name = artist_credit[0].get('name', '')
                    if artist_name:
                        candidates.append({
                            'value': artist_name,
                            'confidence': min(score * 0.9, 85),
                            'source': 'musicbrainz',
                            'evidence': ['mb_artist_credit'],
                            'mbid': artist_credit[0].get('artist', {}).get('id')
                        })
            
            elif field == 'album':
                # Get album from releases
                releases = recording.get('releases', [])
                for release in releases[:2]:
                    album_title = release.get('title', '')
                    if album_title:
                        candidates.append({
                            'value': album_title,
                            'confidence': min(score * 0.8, 80),
                            'source': 'musicbrainz',
                            'evidence': ['mb_release'],
                            'mbid': release.get('id')
                        })
        
        return candidates
    
    def _extract_mb_genre_candidates(self, mb_data: dict) -> List[dict]:
        """Extract genre candidates from MusicBrainz artist data"""
        candidates = []
        
        for artist in mb_data.get('artists', [])[:1]:  # Just top result
            tags = artist.get('tags', [])
            for tag in tags[:3]:  # Top 3 tags
                if tag.get('count', 0) > 0:
                    candidates.append({
                        'value': tag.get('name', ''),
                        'confidence': min(60 + tag.get('count', 0), 80),
                        'source': 'musicbrainz',
                        'evidence': ['mb_artist_tag'],
                        'tag_count': tag.get('count', 0)
                    })
        
        return candidates
    
    def _extract_mb_date_candidates(self, mb_data: dict) -> List[dict]:
        """Extract date candidates from MusicBrainz release data"""
        candidates = []
        
        for release in mb_data.get('releases', [])[:3]:
            date_str = release.get('date', '')
            if date_str:
                # Extract year
                year_match = re.match(r'^(\d{4})', date_str)
                if year_match:
                    candidates.append({
                        'value': year_match.group(1),
                        'confidence': 85,
                        'source': 'musicbrainz',
                        'evidence': ['mb_release_date'],
                        'mbid': release.get('id')
                    })
        
        return candidates
    
    def _synthesize_candidates(self, local: List[dict], mb: List[dict], evidence_state: dict, field: str) -> List[dict]:
        """Synthesize local and MusicBrainz candidates"""
        all_candidates = []
        
        # Add all candidates
        all_candidates.extend(local)
        all_candidates.extend(mb)
        
        # Look for consensus
        value_groups = defaultdict(list)
        for c in all_candidates:
            normalized = c['value'].lower().strip()
            value_groups[normalized].append(c)
        
        synthesized = []
        for normalized, group in value_groups.items():
            if len(group) > 1:
                # Multiple sources agree
                sources = set(c['source'] for c in group)
                max_confidence = max(c['confidence'] for c in group)
                
                # Consensus boost
                if 'local' in sources and 'musicbrainz' in sources:
                    confidence_boost = 15
                else:
                    confidence_boost = 5
                
                synthesized.append({
                    'value': group[0]['value'],  # Use original casing
                    'confidence': min(max_confidence + confidence_boost, 95),
                    'source': 'consensus',
                    'evidence': ['multiple_sources_agree'],
                    'sources': list(sources),
                    'agreement_count': len(group)
                })
            else:
                # Single source
                synthesized.append(group[0])
        
        return synthesized
    
    def _calculate_final_scores(self, candidates: List[dict], evidence_state: dict, field: str) -> List[dict]:
        """Calculate final confidence scores with context awareness"""
        
        for candidate in candidates:
            # Apply contextual adjustments
            confidence = candidate['confidence']
            
            # Boost if value appears in multiple places
            value_lower = candidate['value'].lower()
            appearances = 0
            
            if value_lower in evidence_state['filename'].lower():
                appearances += 1
            if value_lower in evidence_state['folder_name'].lower():
                appearances += 1
            if evidence_state['parent_folder'] and value_lower in evidence_state['parent_folder'].lower():
                appearances += 1
            
            if appearances > 1:
                confidence = min(confidence + (appearances * 5), 100)
            
            # Field-specific adjustments
            if field == 'artist' and evidence_state['existing_metadata'].get('albumartist'):
                if value_lower == evidence_state['existing_metadata']['albumartist'].lower():
                    confidence = min(confidence + 10, 100)
            
            candidate['confidence'] = round(confidence)
        
        # Sort by confidence
        return sorted(candidates, key=lambda x: x['confidence'], reverse=True)

# Create global inference engine instance
inference_engine = MetadataInferenceEngine()

# =============
# APP FUNCTIONS
# =============

@app.route('/')
def index():
    return render_template('index.html')

def fix_file_ownership(filepath):
    """Fix file ownership to match Jellyfin's expected user"""
    try:
        os.chown(filepath, OWNER_UID, OWNER_GID)
        logger.info(f"Fixed ownership of {filepath} to {OWNER_UID}:{OWNER_GID}")
    except Exception as e:
        logger.warning(f"Could not fix ownership of {filepath}: {e}")

def validate_path(filepath):
    """Validate that a path is within MUSIC_DIR"""
    abs_path = os.path.abspath(filepath)
    if not abs_path.startswith(os.path.abspath(MUSIC_DIR)):
        raise ValueError("Invalid path")
    return abs_path

def get_file_format(filepath):
    """Get file format and metadata tag case preference"""
    ext = os.path.splitext(filepath.lower())[1]
    base_format = ext[1:]  # Remove the dot
    
    # Determine the container format for output
    if ext == '.m4a':
        output_format = 'mp4'
    elif ext == '.wav':
        output_format = 'wav'
    elif ext == '.wma':
        output_format = 'asf'  # WMA uses ASF container
    elif ext == '.wv':
        output_format = 'wv'
    else:
        output_format = base_format
    
    # Determine tag case preference
    use_uppercase = base_format in FORMAT_METADATA_CONFIG.get('uppercase', [])
    
    return output_format, use_uppercase, base_format

def run_ffprobe(filepath):
    """Run ffprobe and return parsed JSON data"""
    cmd = ['ffprobe', '-v', 'quiet', '-print_format', 'json', '-show_format', filepath]
    result = subprocess.run(cmd, capture_output=True, text=True)
    
    if result.returncode != 0:
        logger.error(f"FFprobe error: {result.stderr}")
        raise Exception('Failed to read metadata')
    
    return json.loads(result.stdout)

def normalize_metadata_tags(tags, format_type=''):
    """Normalize common tag names from various formats"""
    # Handle iTunes/MP4 specific tags
    if format_type in FORMAT_METADATA_CONFIG.get('itunes', []):
        return {
            'title': tags.get('title', tags.get('TITLE', tags.get('©nam', ''))),
            'artist': tags.get('artist', tags.get('ARTIST', tags.get('©ART', ''))),
            'album': tags.get('album', tags.get('ALBUM', tags.get('©alb', ''))),
            'albumartist': tags.get('albumartist', tags.get('ALBUMARTIST', 
                           tags.get('album_artist', tags.get('ALBUM_ARTIST', 
                           tags.get('aART', ''))))),
            'date': tags.get('date', tags.get('DATE', tags.get('©day', 
                    tags.get('year', tags.get('YEAR', ''))))),
            'genre': tags.get('genre', tags.get('GENRE', tags.get('©gen', ''))),
            'track': tags.get('track', tags.get('TRACK', tags.get('trkn', ''))),
            'disc': tags.get('disc', tags.get('DISC', tags.get('disk', 
                    tags.get('discnumber', tags.get('DISCNUMBER', '')))))
        }
    
    # Standard normalization for other formats
    return {
        'title': tags.get('title', tags.get('TITLE', tags.get('Title', ''))),
        'artist': tags.get('artist', tags.get('ARTIST', tags.get('Artist', ''))),
        'album': tags.get('album', tags.get('ALBUM', tags.get('Album', ''))),
        'albumartist': tags.get('albumartist', tags.get('ALBUMARTIST', 
                       tags.get('album_artist', tags.get('ALBUM_ARTIST', 
                       tags.get('AlbumArtist', ''))))),
        'date': tags.get('year', tags.get('YEAR', tags.get('Year',
                tags.get('date', tags.get('DATE', tags.get('Date', '')))))),
        'genre': tags.get('genre', tags.get('GENRE', tags.get('Genre', ''))),
        'track': tags.get('track', tags.get('TRACK', tags.get('Track', 
                 tags.get('tracknumber', tags.get('TRACKNUMBER', ''))))),
        'disc': tags.get('disc', tags.get('DISC', tags.get('Disc',
                tags.get('discnumber', tags.get('DISCNUMBER', 
                tags.get('disk', tags.get('DISK', '')))))))
    }

def get_metadata_field_mapping(use_uppercase, format_type=''):
    """Get proper metadata field names based on format"""
    # Special handling for iTunes/MP4 formats
    if format_type in FORMAT_METADATA_CONFIG.get('itunes', []):
        return {
            'title': 'title',
            'artist': 'artist',
            'album': 'album',
            'albumartist': 'albumartist',
            'date': 'date',
            'year': 'date',
            'genre': 'genre',
            'track': 'track',
            'disc': 'disc'
        }
    
    base_mapping = {
        'title': 'title',
        'artist': 'artist',
        'album': 'album',
        'albumartist': 'albumartist',
        'date': 'date',
        'year': 'date',
        'genre': 'genre',
        'track': 'track',
        'disc': 'disc'
    }
    
    if use_uppercase:
        return {k: v.upper() for k, v in base_mapping.items()}
    return base_mapping

def extract_album_art(filepath):
    """Extract album art from audio file"""
    # Check if format supports album art
    _, _, base_format = get_file_format(filepath)
    if base_format in FORMAT_METADATA_CONFIG.get('no_embedded_art', []):
        return None
    
    art_cmd = ['ffmpeg', '-i', filepath, '-an', '-vcodec', 'copy', '-f', 'image2pipe', '-']
    result = subprocess.run(art_cmd, capture_output=True)
    
    if result.returncode == 0 and result.stdout:
        return base64.b64encode(result.stdout).decode('utf-8')
    return None

def apply_metadata_to_file(filepath, new_tags, art_data=None, remove_art=False):
    """Apply metadata changes to a single file"""
    # Get file format
    output_format, use_uppercase, base_format = get_file_format(filepath)
    ext = os.path.splitext(filepath)[1]
    
    # Check for and fix corrupted album art before proceeding
    if not remove_art and not art_data:
        if detect_corrupted_album_art(filepath):
            logger.info(f"Detected corrupted album art in {filepath}, attempting to fix...")
            fix_corrupted_album_art(filepath)
    
    # Check if format supports embedded album art
    if art_data and base_format in FORMAT_METADATA_CONFIG.get('no_embedded_art', []):
        logger.warning(f"Format {base_format} does not support embedded album art")
        art_data = None
    
    # Create temp file
    fd, temp_file = tempfile.mkstemp(suffix=ext, dir=os.path.dirname(filepath))
    os.close(fd)
    
    try:
        # Build ffmpeg command
        if art_data:
            # Decode and save art to temp file
            art_bytes = base64.b64decode(art_data.split(',')[1] if ',' in art_data else art_data)
            fd2, temp_art_file = tempfile.mkstemp(suffix='.jpg')
            with os.fdopen(fd2, 'wb') as f:
                f.write(art_bytes)
            
            # Map only audio streams from original file, then add new art
            cmd = [
                'ffmpeg', '-i', filepath, '-i', temp_art_file, '-y',
                '-map', '0:a', '-map', '1', '-c:v', 'mjpeg',
                '-disposition:v', 'attached_pic', '-codec:a', 'copy',
                '-f', output_format
            ]
        elif remove_art:
            cmd = [
                'ffmpeg', '-i', filepath, '-y',
                '-map', '0:a', '-codec', 'copy', '-f', output_format
            ]
        else:
            cmd = [
                'ffmpeg', '-i', filepath, '-y',
                '-map', '0', '-codec', 'copy', '-f', output_format
            ]
        
        # Add only the metadata fields we're changing
        # Get proper field names based on format
        field_mapping = get_metadata_field_mapping(use_uppercase, base_format)
        
        # Special handling for OGG/Vorbis format
        if base_format == 'ogg':
            # OGG uses specific tag names
            ogg_tag_mapping = {
                'title': 'TITLE',
                'artist': 'ARTIST',
                'album': 'ALBUM',
                'albumartist': 'ALBUMARTIST',
                'date': 'DATE',
                'year': 'DATE',  # Map year to DATE for OGG
                'genre': 'GENRE',
                'track': 'TRACKNUMBER',
                'disc': 'DISCNUMBER'
            }
            
            for field, value in new_tags.items():
                if field in ['art', 'removeArt']:
                    continue
                
                # Get the OGG-specific tag name
                ogg_field = ogg_tag_mapping.get(field, field.upper())
                
                if value:
                    cmd.extend(['-metadata', f'{ogg_field}={value}'])
                else:
                    # Clear the field by setting it to empty
                    cmd.extend(['-metadata', f'{ogg_field}='])
        
        # Special handling for WAV format
        elif base_format == 'wav':
            # WAV uses INFO tags with specific names
            wav_tag_mapping = {
                'title': 'INAM',
                'artist': 'IART',
                'album': 'IPRD',
                'albumartist': 'IART',  # WAV doesn't have separate albumartist
                'date': 'ICRD',
                'year': 'ICRD',
                'genre': 'IGNR',
                'comment': 'ICMT',
                'copyright': 'ICOP',
                'track': 'ITRK'
            }
            
            for field, value in new_tags.items():
                if field in ['art', 'removeArt']:
                    continue
                
                # Get the WAV-specific tag name
                wav_field = wav_tag_mapping.get(field, field.upper())
                
                if value:
                    cmd.extend(['-metadata', f'{wav_field}={value}'])
                else:
                    # Clear the field
                    cmd.extend(['-metadata', f'{wav_field}='])
                    
            # Warn about limited support
            if base_format in FORMAT_METADATA_CONFIG.get('limited', []):
                logger.info(f"Note: {base_format} format has limited metadata support. Some fields may not be saved.")
        
        # Standard handling for other formats (MP3, FLAC, M4A, WMA, WV)
        else:
            for field, value in new_tags.items():
                if field in ['art', 'removeArt']:
                    continue
                
                # Get proper tag name for this format
                proper_tag_name = field_mapping.get(field, field.upper() if use_uppercase else field)
                
                # Special case: some formats use different names for certain fields
                if base_format == 'mp3' and use_uppercase:
                    # MP3 ID3v2 uses specific uppercase tags
                    mp3_special_mapping = {
                        'albumartist': 'TPE2',
                        'track': 'TRCK',
                        'disc': 'TPOS',
                        'year': 'TDRC',
                        'date': 'TDRC'
                    }
                    proper_tag_name = mp3_special_mapping.get(field, proper_tag_name)
                
                if value:
                    cmd.extend(['-metadata', f'{proper_tag_name}={value}'])
                else:
                    # Clear the field by setting it to empty
                    cmd.extend(['-metadata', f'{proper_tag_name}='])
        
        # Add output file
        cmd.append(temp_file)
        
        # Log command for debugging (but not the full command to avoid clutter)
        logger.debug(f"Applying metadata changes to {os.path.basename(filepath)}")
        logger.debug(f"Changed fields: {', '.join(k for k in new_tags.keys() if k not in ['art', 'removeArt'])}")
        if art_data:
            logger.debug("Adding album art")
        elif remove_art:
            logger.debug("Removing album art")
        
        # Execute ffmpeg
        result = subprocess.run(cmd, capture_output=True, text=True)
        
        if result.returncode != 0:
            logger.error(f"FFmpeg stderr: {result.stderr}")
            # Check for specific errors
            if "Unsupported codec id in stream" in result.stderr and base_format in FORMAT_METADATA_CONFIG.get('no_embedded_art', []):
                raise Exception(f"Album art is not supported for {base_format.upper()} files")
            raise Exception(f"FFmpeg failed: {result.stderr}")
        
        # Replace original file
        os.replace(temp_file, filepath)
        fix_file_ownership(filepath)
        
        # Clean up temp art file if exists
        if art_data and 'temp_art_file' in locals():
            os.remove(temp_art_file)
        
        logger.info(f"Successfully updated {os.path.basename(filepath)}")
            
    except Exception as e:
        # Clean up on error
        if os.path.exists(temp_file):
            os.remove(temp_file)
        if art_data and 'temp_art_file' in locals() and os.path.exists(temp_art_file):
            os.remove(temp_art_file)
        raise

def detect_corrupted_album_art(filepath):
    """Detect if album art in the file is corrupted"""
    try:
        # First, try to run ffprobe normally
        probe_data = run_ffprobe(filepath)
        
        # Also try to extract art and see if FFmpeg complains
        art_cmd = ['ffmpeg', '-i', filepath, '-an', '-vcodec', 'copy', '-f', 'image2pipe', '-']
        # Remove text=True - we're dealing with binary data!
        result = subprocess.run(art_cmd, capture_output=True, timeout=5)
        
        # Check for various corruption indicators
        corruption_indicators = [
            "Invalid PNG signature",
            "Could not find codec parameters",
            "dimensions not set",
            "Invalid data found when processing input",
            "Error while decoding stream",
            "Invalid pixel format",
            "Invalid image size",
            "Truncated or corrupted",
        ]
        
        # Check stderr for corruption indicators - decode it properly
        if result.stderr:
            stderr_text = result.stderr.decode('utf-8', errors='ignore')
            for indicator in corruption_indicators:
                if indicator in stderr_text:
                    logger.info(f"Detected corruption indicator: {indicator}")
                    return True
        
        # Check if FFmpeg failed to extract art but there is a video stream
        streams = probe_data.get('streams', [])
        has_video_stream = any(s.get('codec_type') == 'video' for s in streams)
        
        if has_video_stream and result.returncode != 0:
            # There's supposed to be art but extraction failed
            return True
            
        # Check for specific metadata inconsistencies
        for stream in streams:
            if stream.get('codec_type') == 'video':
                width = stream.get('width', 0)
                height = stream.get('height', 0)
                codec_name = stream.get('codec_name', '')
                
                # Invalid dimensions
                if width == 0 or height == 0:
                    return True
                
                # Suspiciously large dimensions (probably corrupted)
                if width > 10000 or height > 10000:
                    return True
                    
        return False
        
    except subprocess.TimeoutExpired:
        # If ffmpeg hangs, that's also a sign of corruption
        logger.warning(f"FFmpeg timed out checking {filepath} - likely corrupted")
        return True
    except Exception as e:
        logger.error(f"Error checking for corrupted art: {e}")
        return False

def fix_corrupted_album_art(filepath):
    """Extract and re-embed album art to fix corruption"""
    try:
        # Step 1: Try multiple methods to extract the image data
        image_data = None
        image_format = None
        
        # Method 1: Try to extract as-is (might work despite corruption)
        art_cmd = ['ffmpeg', '-i', filepath, '-an', '-vcodec', 'copy', '-f', 'image2pipe', '-']
        result = subprocess.run(art_cmd, capture_output=True, timeout=5)
        
        if result.returncode == 0 and result.stdout:
            image_data = result.stdout
            # Try to detect format from magic bytes
            if image_data[:2] == b'\xff\xd8':
                image_format = 'jpeg'
            elif image_data[:8] == b'\x89PNG\r\n\x1a\n':
                image_format = 'png'
            elif image_data[:4] == b'RIFF' and image_data[8:12] == b'WEBP':
                image_format = 'webp'
            else:
                # Default to JPEG if we can't determine
                image_format = 'jpeg'
        
        # Method 2: If that failed, try to decode and re-encode
        if not image_data:
            decode_cmd = [
                'ffmpeg', '-i', filepath, '-an', '-vframes', '1',
                '-f', 'image2pipe', '-vcodec', 'mjpeg', '-'
            ]
            result = subprocess.run(decode_cmd, capture_output=True, timeout=5)
            
            if result.returncode == 0 and result.stdout:
                image_data = result.stdout
                image_format = 'jpeg'
        
        # Method 3: If still no luck, try to extract with error concealment
        if not image_data:
            concealment_cmd = [
                'ffmpeg', '-err_detect', 'ignore_err', '-i', filepath,
                '-an', '-vframes', '1', '-f', 'image2pipe', '-vcodec', 'mjpeg', '-'
            ]
            result = subprocess.run(concealment_cmd, capture_output=True, timeout=5)
            
            if result.returncode == 0 and result.stdout:
                image_data = result.stdout
                image_format = 'jpeg'
        
        # If we couldn't extract any image data, we'll need to remove the art
        if not image_data:
            logger.warning(f"Could not extract any valid image data from {filepath}")
            # Strip the corrupted art stream
            output_format, _, _ = get_file_format(filepath)
            ext = os.path.splitext(filepath)[1]
            fd, temp_file = tempfile.mkstemp(suffix=ext, dir=os.path.dirname(filepath))
            os.close(fd)
            
            strip_cmd = [
                'ffmpeg', '-i', filepath, '-y',
                '-map', '0:a', '-codec', 'copy', '-f', output_format,
                temp_file
            ]
            
            result = subprocess.run(strip_cmd, capture_output=True, text=True)
            if result.returncode == 0:
                os.replace(temp_file, filepath)
                fix_file_ownership(filepath)
                return True
            else:
                if os.path.exists(temp_file):
                    os.remove(temp_file)
                return False
        
        # Step 2: Create a clean file without album art
        output_format, _, _ = get_file_format(filepath)
        ext = os.path.splitext(filepath)[1]
        fd, temp_file = tempfile.mkstemp(suffix=ext, dir=os.path.dirname(filepath))
        os.close(fd)
        
        try:
            # Strip all video streams
            strip_cmd = [
                'ffmpeg', '-i', filepath, '-y',
                '-map', '0:a', '-codec', 'copy', '-f', output_format,
                temp_file
            ]
            
            result = subprocess.run(strip_cmd, capture_output=True, text=True)
            if result.returncode != 0:
                raise Exception(f"Failed to strip art: {result.stderr}")
            
            # Step 3: Save the extracted image to a temp file
            image_ext = '.jpg' if image_format == 'jpeg' else f'.{image_format}'
            fd2, temp_art_file = tempfile.mkstemp(suffix=image_ext)
            with os.fdopen(fd2, 'wb') as f:
                f.write(image_data)
            
            # Step 4: Re-embed the art properly
            fd3, final_file = tempfile.mkstemp(suffix=ext, dir=os.path.dirname(filepath))
            os.close(fd3)
            
            # Use appropriate codec based on detected format
            video_codec = 'mjpeg' if image_format == 'jpeg' else 'png'
            
            embed_cmd = [
                'ffmpeg', '-i', temp_file, '-i', temp_art_file, '-y',
                '-map', '0:a', '-map', '1', '-c:v', video_codec,
                '-disposition:v', 'attached_pic', '-codec:a', 'copy',
                '-f', output_format, final_file
            ]
            
            result = subprocess.run(embed_cmd, capture_output=True, text=True)
            if result.returncode != 0:
                raise Exception(f"Failed to embed art: {result.stderr}")
            
            # Replace original file
            os.replace(final_file, filepath)
            fix_file_ownership(filepath)
            
            # Cleanup
            os.remove(temp_file)
            os.remove(temp_art_file)
            
            logger.info(f"Successfully fixed corrupted album art in {filepath} (format: {image_format})")
            return True
            
        except Exception as e:
            # Cleanup on error
            if os.path.exists(temp_file):
                os.remove(temp_file)
            if 'temp_art_file' in locals() and os.path.exists(temp_art_file):
                os.remove(temp_art_file)
            if 'final_file' in locals() and os.path.exists(final_file):
                os.remove(final_file)
            raise
            
    except subprocess.TimeoutExpired:
        logger.error(f"Timeout while fixing corrupted album art in {filepath}")
        return False
    except Exception as e:
        logger.error(f"Error fixing corrupted album art: {e}")
        return False

@app.route('/stream/<path:filepath>')
def stream_audio(filepath):
    """Stream audio file with range request support"""
    try:
        file_path = validate_path(os.path.join(MUSIC_DIR, filepath))
        
        if not os.path.exists(file_path):
            return jsonify({'error': 'File not found'}), 404
        
        file_size = os.path.getsize(file_path)
        range_header = request.headers.get('range', None)
        
        # Prepare filename for Content-Disposition header
        basename = os.path.basename(file_path)
        safe_filename = basename.encode('ascii', 'ignore').decode('ascii')
        utf8_filename = urllib.parse.quote(basename, safe='')
        
        # Get MIME type
        ext = os.path.splitext(file_path.lower())[1]
        mimetype = MIME_TYPES.get(ext, 'audio/mpeg')
        
        if range_header:
            # Parse range header
            byte_start = 0
            byte_end = file_size - 1
            
            match = re.search(r'bytes=(\d+)-(\d*)', range_header)
            if match:
                byte_start = int(match.group(1))
                if match.group(2):
                    byte_end = int(match.group(2))
            
            # Generate partial content
            def generate():
                with open(file_path, 'rb') as f:
                    f.seek(byte_start)
                    remaining = byte_end - byte_start + 1
                    chunk_size = 8192
                    
                    while remaining > 0:
                        to_read = min(chunk_size, remaining)
                        chunk = f.read(to_read)
                        if not chunk:
                            break
                        remaining -= len(chunk)
                        yield chunk
            
            return Response(
                generate(),
                status=206,
                mimetype=mimetype,
                headers={
                    'Content-Range': f'bytes {byte_start}-{byte_end}/{file_size}',
                    'Accept-Ranges': 'bytes',
                    'Content-Length': str(byte_end - byte_start + 1),
                    'Content-Disposition': f'inline; filename="{safe_filename}"; filename*=UTF-8\'\'{utf8_filename}'
                }
            )
        else:
            # Return full file
            return send_file(file_path, mimetype=mimetype, as_attachment=False)
            
    except ValueError:
        return jsonify({'error': 'Invalid path'}), 403
    except Exception as e:
        logger.error(f"Error streaming file {filepath}: {e}")
        return jsonify({'error': str(e)}), 500

def build_tree_items(path, rel_path=''):
    """Build tree items for a directory"""
    items = []
    try:
        for item in sorted(os.listdir(path)):
            item_path = os.path.join(path, item)
            item_rel_path = os.path.join(rel_path, item) if rel_path else item
            
            if os.path.isdir(item_path):
                # Check if folder contains audio files
                has_audio = any(
                    f.lower().endswith(AUDIO_EXTENSIONS)
                    for f in os.listdir(item_path)
                    if os.path.isfile(os.path.join(item_path, f))
                )
                
                items.append({
                    'name': item,
                    'path': item_rel_path,
                    'type': 'folder',
                    'hasAudio': has_audio,
                    'created': os.path.getctime(item_path)
                })
    except PermissionError:
        pass
    
    return items

@app.route('/tree/')
@app.route('/tree/<path:subpath>')
def get_tree(subpath=''):
    """Get folder tree structure"""
    try:
        current_path = validate_path(os.path.join(MUSIC_DIR, subpath))
        
        if not os.path.exists(current_path):
            return jsonify({'error': 'Path not found'}), 404
        
        items = build_tree_items(current_path, subpath)
        return jsonify({'items': items})
        
    except ValueError:
        return jsonify({'error': 'Invalid path'}), 403
    except Exception as e:
        logger.error(f"Error building tree: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/files/<path:folder_path>')
def get_files(folder_path):
    """Get all audio files in folder and subfolders"""
    try:
        current_path = validate_path(os.path.join(MUSIC_DIR, folder_path))
        
        if not os.path.exists(current_path):
            return jsonify({'error': 'Path not found'}), 404
        
        files = []
        
        # Walk through directory and subdirectories
        for root, dirs, filenames in os.walk(current_path):
            for filename in sorted(filenames):
                if filename.lower().endswith(AUDIO_EXTENSIONS):
                    file_path = os.path.join(root, filename)
                    rel_path = os.path.relpath(file_path, MUSIC_DIR)
                    files.append({
                        'name': filename,
                        'path': rel_path,
                        'folder': os.path.relpath(root, current_path)
                    })
        
        return jsonify({'files': files})
        
    except ValueError:
        return jsonify({'error': 'Invalid path'}), 403
    except Exception as e:
        logger.error(f"Error getting files: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/rename', methods=['POST'])
def rename_file():
    """Rename a file"""
    try:
        data = request.json
        old_path = validate_path(os.path.join(MUSIC_DIR, data['oldPath']))
        new_name = data['newName']
        
        if not os.path.exists(old_path):
            return jsonify({'error': 'File not found'}), 404
        
        # Validate new name
        if not new_name or '/' in new_name or '\\' in new_name:
            return jsonify({'error': 'Invalid filename'}), 400
        
        # Ensure proper extension
        old_ext = os.path.splitext(old_path)[1].lower()
        if not os.path.splitext(new_name)[1].lower():
            new_name += old_ext
        
        # Build new path
        new_path = os.path.join(os.path.dirname(old_path), new_name)
        
        # Check if target exists
        if os.path.exists(new_path) and new_path != old_path:
            return jsonify({'error': 'File already exists'}), 400
        
        # Rename file
        os.rename(old_path, new_path)
        fix_file_ownership(new_path)
        
        # Update all history references to use the new filename
        history.update_file_references(old_path, new_path)
        
        # Return new relative path
        new_rel_path = os.path.relpath(new_path, MUSIC_DIR)
        return jsonify({'status': 'success', 'newPath': new_rel_path})
        
    except ValueError:
        return jsonify({'error': 'Invalid path'}), 403
    except Exception as e:
        logger.error(f"Error renaming file: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/metadata/<path:filename>')
def get_metadata(filename):
    """Get metadata for a file"""
    try:
        filepath = validate_path(os.path.join(MUSIC_DIR, filename))
        
        if not os.path.exists(filepath):
            return jsonify({'error': 'File not found'}), 404
        
        # Get metadata
        probe_data = run_ffprobe(filepath)
        tags = probe_data.get('format', {}).get('tags', {})
        
        # Get format info for proper normalization
        _, _, base_format = get_file_format(filepath)
        
        # Normalize tags
        metadata = normalize_metadata_tags(tags, base_format)
        
        # Get album art
        art = extract_album_art(filepath)
        metadata['hasArt'] = bool(art)
        metadata['art'] = art
        
        # Add format info for client
        metadata['format'] = base_format
        
        # Add format limitations info
        metadata['formatLimitations'] = {
            'supportsAlbumArt': base_format not in FORMAT_METADATA_CONFIG.get('no_embedded_art', []),
            'hasLimitedMetadata': base_format in FORMAT_METADATA_CONFIG.get('limited', [])
        }
        
        return jsonify(metadata)
        
    except ValueError:
        return jsonify({'error': 'Invalid path'}), 403
    except Exception as e:
        logger.error(f"Error reading metadata for {filename}: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/metadata/<path:filename>', methods=['POST'])
def set_metadata(filename):
    """Set metadata for a file"""
    try:
        filepath = validate_path(os.path.join(MUSIC_DIR, filename))
        
        if not os.path.exists(filepath):
            return jsonify({'error': 'File not found'}), 404
        
        data = request.json
        
        # Get current metadata before changes
        probe_data = run_ffprobe(filepath)
        tags = probe_data.get('format', {}).get('tags', {})
        _, _, base_format = get_file_format(filepath)
        current_metadata = normalize_metadata_tags(tags, base_format)
        current_art = extract_album_art(filepath)
        
        # Separate metadata from special operations
        metadata_tags = {k: v for k, v in data.items() if k not in ['art', 'removeArt']}
        art_data = data.get('art')
        remove_art = data.get('removeArt', False)
        
        # Track individual field changes
        for field, new_value in metadata_tags.items():
            old_value = current_metadata.get(field, '')
            if old_value != new_value:
                action = create_metadata_action(filepath, field, old_value, new_value)
                history.add_action(action)
        
        # Track album art changes
        if art_data or remove_art:
            if remove_art:
                action = create_album_art_action(filepath, current_art, None, is_delete=True)
            else:
                action = create_album_art_action(filepath, current_art, art_data)
            history.add_action(action)
        
        # Apply changes
        apply_metadata_to_file(filepath, metadata_tags, art_data, remove_art)
        
        return jsonify({'status': 'success'})
        
    except ValueError:
        return jsonify({'error': 'Invalid path'}), 403
    except Exception as e:
        logger.error(f"Error setting metadata: {str(e)}")
        return jsonify({'error': str(e)}), 500

def process_folder_files(folder_path, process_func, process_name):
    """Generic function to process all audio files in a folder"""
    try:
        abs_folder_path = validate_path(os.path.join(MUSIC_DIR, folder_path) if folder_path else MUSIC_DIR)
        
        if not os.path.exists(abs_folder_path):
            return jsonify({'error': 'Folder not found'}), 404
        
        # Get all audio files in the folder (not subfolders)
        audio_files = []
        for filename in os.listdir(abs_folder_path):
            file_path = os.path.join(abs_folder_path, filename)
            if os.path.isfile(file_path) and filename.lower().endswith(AUDIO_EXTENSIONS):
                audio_files.append(file_path)
        
        if not audio_files:
            return jsonify({'error': 'No audio files found in folder'}), 404
        
        files_updated = 0
        errors = []
        
        # Process each file
        for file_path in audio_files:
            filename = os.path.basename(file_path)
            try:
                process_func(file_path)
                files_updated += 1
            except Exception as e:
                logger.error(f"Error processing {filename}: {e}")
                errors.append(f"{filename}: {str(e)}")
        
        # Return results
        if files_updated == 0:
            return jsonify({
                'status': 'error',
                'error': f'No files were {process_name}',
                'errors': errors
            }), 500
        elif errors:
            return jsonify({
                'status': 'partial',
                'filesUpdated': files_updated,
                'errors': errors
            })
        else:
            return jsonify({
                'status': 'success',
                'filesUpdated': files_updated
            })
            
    except ValueError:
        return jsonify({'error': 'Invalid path'}), 403
    except Exception as e:
        logger.error(f"Error {process_name} folder: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/apply-art-to-folder', methods=['POST'])
def apply_art_to_folder():
    """Apply album art to all audio files in a folder"""
    data = request.json
    folder_path = data.get('folderPath', '')
    art_data = data.get('art')
    
    if not art_data:
        return jsonify({'error': 'No album art provided'}), 400
    
    # Collect changes before applying
    file_changes = []
    abs_folder_path = validate_path(os.path.join(MUSIC_DIR, folder_path) if folder_path else MUSIC_DIR)
    
    for filename in os.listdir(abs_folder_path):
        file_path = os.path.join(abs_folder_path, filename)
        if os.path.isfile(file_path) and filename.lower().endswith(AUDIO_EXTENSIONS):
            try:
                current_art = extract_album_art(file_path)
                file_changes.append((file_path, current_art))
            except:
                pass
    
    def apply_art(file_path):
        apply_metadata_to_file(file_path, {}, art_data)
    
    # Use process_folder_files to handle the batch operation
    response = process_folder_files(folder_path, apply_art, "updated with album art")
    
    # Check if it's a successful response by examining the response data
    if response.status_code == 200:
        response_data = response.get_json()
        if response_data.get('status') in ['success', 'partial']:
            # Add to history if successful
            action = create_batch_album_art_action(folder_path, art_data, file_changes)
            history.add_action(action)
    
    return response

@app.route('/apply-field-to-folder', methods=['POST'])
def apply_field_to_folder():
    """Apply a specific metadata field to all audio files in a folder"""
    data = request.json
    folder_path = data.get('folderPath', '')
    field = data.get('field')
    value = data.get('value', '').strip()
    
    if not field:
        return jsonify({'error': 'No field specified'}), 400
    
    # Collect current values before applying changes
    file_changes = []
    abs_folder_path = validate_path(os.path.join(MUSIC_DIR, folder_path) if folder_path else MUSIC_DIR)
    
    for filename in os.listdir(abs_folder_path):
        file_path = os.path.join(abs_folder_path, filename)
        if os.path.isfile(file_path) and filename.lower().endswith(AUDIO_EXTENSIONS):
            try:
                probe_data = run_ffprobe(file_path)
                tags = probe_data.get('format', {}).get('tags', {})
                _, _, base_format = get_file_format(file_path)
                current_metadata = normalize_metadata_tags(tags, base_format)
                old_value = current_metadata.get(field, '')
                file_changes.append((file_path, old_value, value))
            except:
                pass
    
    def apply_field(file_path):
        apply_metadata_to_file(file_path, {field: value})
    
    response = process_folder_files(folder_path, apply_field, f"updated with {field}")
    
    # Check if it's a successful response by examining the response data
    if response.status_code == 200:
        response_data = response.get_json()
        if response_data.get('status') in ['success', 'partial']:
            # Add to history if successful
            action = create_batch_metadata_action(folder_path, field, value, file_changes)
            history.add_action(action)
    
    return response

# =================
# HISTORY ENDPOINTS
# =================

@app.route('/history')
def get_history():
    """Get all editing history"""
    return jsonify({'actions': history.get_all_actions()})

@app.route('/history/<action_id>')
def get_history_action(action_id):
    """Get details for a specific action"""
    action = history.get_action(action_id)
    if not action:
        return jsonify({'error': 'Action not found'}), 404
    
    return jsonify(action.get_details())

@app.route('/history/<action_id>/undo', methods=['POST'])
def undo_action(action_id):
    """Undo a specific action"""
    action = history.get_action(action_id)
    if not action:
        return jsonify({'error': 'Action not found'}), 404
    
    if action.is_undone:
        return jsonify({'error': 'Action is already undone'}), 400
    
    try:
        errors = []
        files_updated = 0
        
        if action.action_type == ActionType.METADATA_CHANGE:
            # Undo single metadata change
            filepath = action.files[0]
            field = action.field
            old_value = action.old_values[filepath]
            
            try:
                apply_metadata_to_file(filepath, {field: old_value})
                files_updated += 1
            except Exception as e:
                errors.append(f"{os.path.basename(filepath)}: {str(e)}")
        
        elif action.action_type == ActionType.BATCH_METADATA:
            # Undo batch metadata changes
            for filepath in action.files:
                try:
                    old_value = action.old_values.get(filepath, '')
                    apply_metadata_to_file(filepath, {action.field: old_value})
                    files_updated += 1
                except Exception as e:
                    errors.append(f"{os.path.basename(filepath)}: {str(e)}")

        elif action.action_type in [ActionType.ALBUM_ART_CHANGE, ActionType.ALBUM_ART_DELETE]:
            # Undo album art change
            filepath = action.files[0]
            old_art_path = action.old_values[filepath]
            
            try:
                if old_art_path:
                    old_art = history.load_album_art(old_art_path)
                    if old_art:
                        apply_metadata_to_file(filepath, {}, old_art)
                    else:
                        apply_metadata_to_file(filepath, {}, remove_art=True)
                else:
                    apply_metadata_to_file(filepath, {}, remove_art=True)
                files_updated += 1
            except Exception as e:
                errors.append(f"{os.path.basename(filepath)}: {str(e)}")
        
        elif action.action_type == ActionType.BATCH_ALBUM_ART:
            # Undo batch album art changes
            for filepath in action.files:
                try:
                    old_art_path = action.old_values.get(filepath, '')
                    if old_art_path:
                        old_art = history.load_album_art(old_art_path)
                        if old_art:
                            apply_metadata_to_file(filepath, {}, old_art)
                        else:
                            apply_metadata_to_file(filepath, {}, remove_art=True)
                    else:
                        apply_metadata_to_file(filepath, {}, remove_art=True)
                    files_updated += 1
                except Exception as e:
                    errors.append(f"{os.path.basename(filepath)}: {str(e)}")

        # Mark as undone
        action.is_undone = True
        
        # Return result
        response_data = {
            'filesUpdated': files_updated,
            'action': action.to_dict()
        }
        
        if files_updated == 0:
            response_data['status'] = 'error'
            response_data['error'] = 'No files were undone'
            response_data['errors'] = errors
            return jsonify(response_data), 500
        elif errors:
            response_data['status'] = 'partial'
            response_data['errors'] = errors
            return jsonify(response_data)
        else:
            response_data['status'] = 'success'
            return jsonify(response_data)
    
    except Exception as e:
        logger.error(f"Error undoing action {action_id}: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/history/<action_id>/redo', methods=['POST'])
def redo_action(action_id):
    """Redo a previously undone action"""
    action = history.get_action(action_id)
    if not action:
        return jsonify({'error': 'Action not found'}), 404
    
    if not action.is_undone:
        return jsonify({'error': 'Action is not undone'}), 400
    
    try:
        errors = []
        files_updated = 0
        
        if action.action_type == ActionType.METADATA_CHANGE:
            # Redo single metadata change
            filepath = action.files[0]
            field = action.field
            new_value = action.new_values[filepath]
            
            try:
                apply_metadata_to_file(filepath, {field: new_value})
                files_updated += 1
            except Exception as e:
                errors.append(f"{os.path.basename(filepath)}: {str(e)}")
        
        elif action.action_type == ActionType.BATCH_METADATA:
            # Redo batch metadata changes
            for filepath in action.files:
                try:
                    new_value = action.new_values.get(filepath, '')
                    apply_metadata_to_file(filepath, {action.field: new_value})
                    files_updated += 1
                except Exception as e:
                    errors.append(f"{os.path.basename(filepath)}: {str(e)}")

        elif action.action_type in [ActionType.ALBUM_ART_CHANGE, ActionType.ALBUM_ART_DELETE]:
            # Redo album art change
            filepath = action.files[0]
            new_art_path = action.new_values[filepath]
            
            try:
                if new_art_path:
                    new_art = history.load_album_art(new_art_path)
                    if new_art:
                        apply_metadata_to_file(filepath, {}, new_art)
                    else:
                        apply_metadata_to_file(filepath, {}, remove_art=True)
                else:
                    apply_metadata_to_file(filepath, {}, remove_art=True)
                files_updated += 1
            except Exception as e:
                errors.append(f"{os.path.basename(filepath)}: {str(e)}")
        
        elif action.action_type == ActionType.BATCH_ALBUM_ART:
            # Redo batch album art changes
            for filepath in action.files:
                try:
                    new_art_path = action.new_values.get(filepath, '')
                    if new_art_path:
                        new_art = history.load_album_art(new_art_path)
                        if new_art:
                            apply_metadata_to_file(filepath, {}, new_art)
                        else:
                            apply_metadata_to_file(filepath, {}, remove_art=True)
                    else:
                        apply_metadata_to_file(filepath, {}, remove_art=True)
                    files_updated += 1
                except Exception as e:
                    errors.append(f"{os.path.basename(filepath)}: {str(e)}")

        # Mark as not undone
        action.is_undone = False
        
        # Return result
        response_data = {
            'filesUpdated': files_updated,
            'action': action.to_dict()
        }
        
        if files_updated == 0:
            response_data['status'] = 'error'
            response_data['error'] = 'No files were redone'
            response_data['errors'] = errors
            return jsonify(response_data), 500
        elif errors:
            response_data['status'] = 'partial'
            response_data['errors'] = errors
            return jsonify(response_data)
        else:
            response_data['status'] = 'success'
            return jsonify(response_data)
    
    except Exception as e:
        logger.error(f"Error redoing action {action_id}: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/history/clear', methods=['POST'])
def clear_history():
    """Clear all editing history"""
    try:
        history.clear()
        return jsonify({
            'status': 'success',
            'message': 'History cleared successfully'
        })
    except Exception as e:
        logger.error(f"Error clearing history: {e}")
        return jsonify({'error': str(e)}), 500

# ==================
# INFERENCE ENDPOINT
# ==================

@app.route('/infer/<path:filename>/<field>')
def infer_metadata_field(filename, field):
    """Infer metadata suggestions for a specific field"""
    try:
        filepath = validate_path(os.path.join(MUSIC_DIR, filename))
        
        if not os.path.exists(filepath):
            return jsonify({'error': 'File not found'}), 404
        
        # Validate field
        valid_fields = ['title', 'artist', 'album', 'albumartist', 'date', 'genre', 'track', 'disc']
        if field not in valid_fields:
            return jsonify({'error': 'Invalid field'}), 400
        
        # Get existing metadata
        probe_data = run_ffprobe(filepath)
        tags = probe_data.get('format', {}).get('tags', {})
        _, _, base_format = get_file_format(filepath)
        existing_metadata = normalize_metadata_tags(tags, base_format)
        
        # Get folder context (sibling files)
        folder_path = os.path.dirname(filepath)
        sibling_files = []
        try:
            for fn in os.listdir(folder_path):
                if fn.lower().endswith(AUDIO_EXTENSIONS):
                    sibling_files.append({'name': fn, 'path': os.path.join(folder_path, fn)})
        except:
            pass
        
        folder_context = {
            'files': sibling_files
        }
        
        # Run inference
        suggestions = inference_engine.infer_field(filepath, field, existing_metadata, folder_context)
        
        # Format response
        return jsonify({
            'field': field,
            'suggestions': suggestions[:5]  # Limit to top 5
        })
        
    except ValueError:
        return jsonify({'error': 'Invalid path'}), 403
    except Exception as e:
        logger.error(f"Error inferring metadata for {filename}/{field}: {e}")
        return jsonify({'error': str(e)}), 500

# Enable template auto-reloading
app.config['TEMPLATES_AUTO_RELOAD'] = True

if __name__ == '__main__':
    app.run(host=HOST, port=PORT, debug=False)
