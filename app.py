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
    create_metadata_action, create_batch_metadata_action
)

from core.inference import inference_engine
from core.file_utils import validate_path, fix_file_ownership, get_file_format
from core.metadata.normalizer import normalize_metadata_tags, get_metadata_field_mapping
from core.metadata.ffmpeg import run_ffprobe
from core.metadata.reader import read_metadata
from core.metadata.writer import apply_metadata_to_file
from core.album_art.extractor import extract_album_art
from core.album_art.processor import detect_corrupted_album_art, fix_corrupted_album_art
from core.album_art.manager import (
    save_album_art_to_file, process_album_art_change, 
    prepare_batch_album_art_change, record_batch_album_art_history
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

# =============
# APP FUNCTIONS
# =============

@app.route('/')
def index():
    return render_template('index.html')

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
        
        metadata = read_metadata(filepath)
        
        art = extract_album_art(filepath)
        metadata['hasArt'] = bool(art)
        metadata['art'] = art
        
        return jsonify(metadata)
        
    except FileNotFoundError:
        return jsonify({'error': 'File not found'}), 404
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
        
        # Separate metadata from special operations
        metadata_tags = {k: v for k, v in data.items() if k not in ['art', 'removeArt']}
        
        # Process album art changes
        has_art_change, art_data, remove_art = process_album_art_change(filepath, data, current_metadata)
        
        # Track individual metadata field changes
        for field, new_value in metadata_tags.items():
            old_value = current_metadata.get(field, '')
            if old_value != new_value:
                action = create_metadata_action(filepath, field, old_value, new_value)
                history.add_action(action)
        
        # Handle album art changes
        if has_art_change:
            save_album_art_to_file(filepath, art_data, remove_art, track_history=True)
        else:
            # Just apply metadata changes without album art
            apply_metadata_to_file(filepath, metadata_tags)
        
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
    
    # Get list of audio files
    abs_folder_path = validate_path(os.path.join(MUSIC_DIR, folder_path) if folder_path else MUSIC_DIR)
    audio_files = []
    for filename in os.listdir(abs_folder_path):
        file_path = os.path.join(abs_folder_path, filename)
        if os.path.isfile(file_path) and filename.lower().endswith(AUDIO_EXTENSIONS):
            audio_files.append(file_path)
    
    # Prepare for batch changes
    file_changes = prepare_batch_album_art_change(folder_path, art_data, audio_files)
    
    def apply_art(file_path):
        apply_metadata_to_file(file_path, {}, art_data)
    
    # Use process_folder_files to handle the batch operation
    response = process_folder_files(folder_path, apply_art, "updated with album art")
    
    # Check if it's a successful response by examining the response data
    if response.status_code == 200:
        response_data = response.get_json()
        if response_data.get('status') in ['success', 'partial']:
            # Record batch changes in history
            record_batch_album_art_history(folder_path, art_data, file_changes)
    
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
