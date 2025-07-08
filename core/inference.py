"""
Metadata inference engine for intelligent field suggestions
"""
import re
import time
import hashlib
import urllib.parse
import urllib.request
import urllib.error
import json
import threading
from pathlib import Path
from collections import defaultdict, Counter
from datetime import datetime
from typing import List, Dict, Optional

from config import (
    INFERENCE_CACHE_DURATION, MUSICBRAINZ_RATE_LIMIT,
    MUSICBRAINZ_USER_AGENT, FIELD_THRESHOLDS, logger
)

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
        folder_parts = path.parent.name.split('/')
        
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
        name = Path(filename).stem
        
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
            import os
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

    def _infer_composer(self, evidence_state: dict) -> List[dict]:
        """Infer composer from evidence - especially effective for classical music"""
        candidates = []
        
        # Strategy 1: Classical music filename patterns
        filename = evidence_state['filename_no_ext']
        
        # Pattern: Composer - Work - Movement
        composer_work_pattern = r'^([A-Z][a-zA-Z\s\.,]+)\s*[-_]\s*([^-_]+(?:\s*[Oo]p\.?\s*\d+[a-zA-Z]?))\s*[-_]\s*(.+)'
        match = re.match(composer_work_pattern, filename)
        if match:
            composer_name = match.group(1).strip()
            candidates.append({
                'value': composer_name,
                'confidence': 85,
                'source': 'filename_pattern',
                'evidence': ['classical_pattern']
            })
        
        # Pattern: Look for opus numbers which indicate classical music
        opus_patterns = [
            r'Op\.?\s*\d+[a-zA-Z]?',
            r'BWV\s*\d+',  # Bach
            r'K\.?\s*\d+',  # Mozart/Scarlatti
            r'D\.?\s*\d+',  # Schubert
            r'Hob\.?\s*[IVX]+:\d+',  # Haydn
            r'RV\s*\d+',  # Vivaldi
            r'S\.?\s*\d+'  # Liszt
        ]
        
        for pattern in opus_patterns:
            if re.search(pattern, filename, re.IGNORECASE):
                # Extract potential composer from beginning of filename
                composer_match = re.match(r'^([A-Z][a-zA-Z\s\.,]+?)(?:\s*[-_]|\s+(?:Op|BWV|K|D|Hob|RV|S))', filename)
                if composer_match:
                    candidates.append({
                        'value': composer_match.group(1).strip(),
                        'confidence': 80,
                        'source': 'opus_pattern',
                        'evidence': ['opus_number_found']
                    })
                break
        
        # Strategy 2: Folder structure for classical music
        folder_parts = evidence_state['folder_parts']
        if folder_parts:
            # Check for Classical folder structure
            for i, part in enumerate(folder_parts):
                if part.lower() in ['classical', 'classic', 'klassik']:
                    # Next folder might be composer
                    if i + 1 < len(folder_parts):
                        candidates.append({
                            'value': folder_parts[i + 1],
                            'confidence': 75,
                            'source': 'folder_structure',
                            'evidence': ['classical_folder_structure']
                        })
                    break
            
            # Check parent folder as potential composer
            if evidence_state['folder_name']:
                # Common classical album patterns
                classical_indicators = ['symphony', 'concerto', 'sonata', 'quartet', 'opus', 'suite']
                if any(indicator in evidence_state['folder_name'].lower() for indicator in classical_indicators):
                    # Parent folder might be composer
                    if evidence_state['parent_folder']:
                        candidates.append({
                            'value': evidence_state['parent_folder'],
                            'confidence': 70,
                            'source': 'folder_structure',
                            'evidence': ['classical_work_folder']
                        })
        
        # Strategy 3: Extract from parentheses (often contains composer)
        paren_matches = re.findall(r'\(([^)]+)\)', evidence_state['filename'])
        for match in paren_matches:
            # Check if it looks like a name (capitalized words)
            if re.match(r'^[A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*$', match.strip()):
                candidates.append({
                    'value': match.strip(),
                    'confidence': 65,
                    'source': 'parenthetical',
                    'evidence': ['composer_in_parentheses']
                })
        
        # Strategy 4: Known classical composers quick check
        known_composers = [
            'Bach', 'Mozart', 'Beethoven', 'Brahms', 'Chopin', 'Debussy',
            'Handel', 'Haydn', 'Liszt', 'Mahler', 'Mendelssohn', 'Prokofiev',
            'Rachmaninoff', 'Ravel', 'Schubert', 'Schumann', 'Shostakovich',
            'Sibelius', 'Strauss', 'Stravinsky', 'Tchaikovsky', 'Vivaldi', 'Wagner'
        ]
        
        text_to_search = f"{filename} {evidence_state['folder_name']} {evidence_state.get('parent_folder', '')}"
        for composer in known_composers:
            if composer.lower() in text_to_search.lower():
                candidates.append({
                    'value': composer,
                    'confidence': 90,
                    'source': 'known_composer',
                    'evidence': ['recognized_classical_composer']
                })
                break
        
        return self._deduplicate_candidates(candidates, 'composer')
    
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
        
        # For album field, query if we have artist OR title
        if field == 'album':
            return bool(existing_metadata.get('artist') or existing_metadata.get('title'))
        
        # For artist field, query if we have title OR album
        if field == 'artist':
            return bool(existing_metadata.get('title') or existing_metadata.get('album'))
        
        # For title field, query if we have artist OR album
        if field == 'title':
            return bool(existing_metadata.get('artist') or existing_metadata.get('album'))
        
        # For albumartist field, query if we have album
        if field == 'albumartist':
            return bool(existing_metadata.get('album'))
        
        # For composer field, query if we have title (work name)
        if field == 'composer':
            return bool(existing_metadata.get('title'))
        
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

            elif field == 'composer':
                # Search for classical works
                work_hint = evidence_state['existing_metadata'].get('title', '')
                if not work_hint:
                    # Try to extract from filename
                    work_candidates = self._extract_work_from_filename(evidence_state)
                    if work_candidates:
                        work_hint = work_candidates[0]
                
                if work_hint:
                    results = self._mb_search_work(work_hint)
                    candidates.extend(self._extract_mb_composer_candidates(results))
            
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

    def _extract_work_from_filename(self, evidence_state: dict) -> List[str]:
        """Extract potential work titles from filename for composer search"""
        filename = evidence_state['filename_no_ext']
        works = []
        
        # Remove composer names if found
        for segment_info in evidence_state['filename_segments']:
            parts = segment_info['parts']
            if len(parts) >= 2:
                # Assume last part might be work title
                works.append(parts[-1].strip())
        
        return works

    def _mb_search_work(self, work_title: str) -> dict:
        """Search MusicBrainz for classical works"""
        cache_key = hashlib.md5(f"work:{work_title}".encode()).hexdigest()
        
        with self.cache_lock:
            if cache_key in self.cache:
                cached_data, cached_time = self.cache[cache_key]
                if time.time() - cached_time < INFERENCE_CACHE_DURATION:
                    return cached_data
        
        query = f'work:"{work_title}"'
        url = f"https://musicbrainz.org/ws/2/work/?query={urllib.parse.quote(query)}&fmt=json&limit=5"
        
        try:
            req = urllib.request.Request(url, headers={
                'User-Agent': MUSICBRAINZ_USER_AGENT
            })
            
            with urllib.request.urlopen(req, timeout=10) as response:
                data = json.loads(response.read().decode('utf-8'))
                
                with self.cache_lock:
                    self.cache[cache_key] = (data, time.time())
                
                return data
        except Exception as e:
            logger.error(f"MusicBrainz API error: {e}")
            return {'works': []}

    def _extract_mb_composer_candidates(self, mb_data: dict) -> List[dict]:
        """Extract composer candidates from MusicBrainz work search"""
        candidates = []
        
        for work in mb_data.get('works', [])[:3]:
            # Look for composer relationships
            relations = work.get('relations', [])
            for relation in relations:
                if relation.get('type') == 'composer':
                    artist = relation.get('artist', {})
                    if artist.get('name'):
                        candidates.append({
                            'value': artist['name'],
                            'confidence': 90,
                            'source': 'musicbrainz',
                            'evidence': ['mb_work_composer'],
                            'mbid': artist.get('id')
                        })
                        break
            
            # Also check attributes for composer info
            if not candidates and work.get('disambiguation'):
                # Sometimes composer is in disambiguation
                disambig = work['disambiguation']
                # Simple pattern to extract composer names
                composer_match = re.search(r'by ([A-Z][a-zA-Z\s\.]+)', disambig)
                if composer_match:
                    candidates.append({
                        'value': composer_match.group(1).strip(),
                        'confidence': 70,
                        'source': 'musicbrainz',
                        'evidence': ['mb_work_disambiguation']
                    })
        
        return candidates
    
    def _mb_search_recordings(self, artist: str, title: str) -> dict:
        """Search MusicBrainz for recordings"""
        cache_key = hashlib.md5(f"rec:{artist}:{title}".encode()).hexdigest()
        
        # Check cache
        with self.cache_lock:
            if cache_key in self.cache:
                cached_data, cached_time = self.cache[cache_key]
                if time.time() - cached_time < INFERENCE_CACHE_DURATION:
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
                'User-Agent': MUSICBRAINZ_USER_AGENT
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
                if time.time() - cached_time < INFERENCE_CACHE_DURATION:
                    return cached_data
        
        query = f'artist:"{artist}" AND release:"{album}"'
        url = f"https://musicbrainz.org/ws/2/release/?query={urllib.parse.quote(query)}&fmt=json&limit=5"
        
        try:
            req = urllib.request.Request(url, headers={
                'User-Agent': MUSICBRAINZ_USER_AGENT
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
