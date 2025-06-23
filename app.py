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

from core.inference import inference_engine
from core.file_utils import validate_path, fix_file_ownership, get_file_format
from core.metadata.normalizer import normalize_metadata_tags, get_metadata_field_mapping
from core.metadata.ffmpeg import run_ffprobe

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

# =============
# APP FUNCTIONS
# =============

@app.route('/')
def index():
    return render_template('index.html')

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
            # Save album art to history's temporary storage
            old_art_path = history.save_album_art(current_art) if current_art else ''
            new_art_path = history.save_album_art(art_data) if art_data else ''
            
            if remove_art:
                action = create_album_art_action(filepath, current_art, None, is_delete=True)
            else:
                action = create_album_art_action(filepath, current_art, art_data)
            
            # Update the action with the saved paths
            action.old_values[filepath] = old_art_path
            action.new_values[filepath] = new_art_path
            
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
            # Save the new album art to history's temporary storage
            new_art_path = history.save_album_art(art_data)
            
            # Add to history if successful
            action = create_batch_album_art_action(folder_path, art_data, file_changes)
            
            # Update the action with saved art paths
            for filepath, old_art in file_changes:
                old_art_path = history.save_album_art(old_art) if old_art else ''
                action.old_values[filepath] = old_art_path
                action.new_values[filepath] = new_art_path
            
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
