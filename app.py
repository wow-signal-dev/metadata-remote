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
    create_album_art_action, create_delete_field_action
)

from core.inference import inference_engine
from core.file_utils import validate_path, fix_file_ownership, get_file_format
from core.metadata.normalizer import normalize_metadata_tags, get_metadata_field_mapping
from core.metadata.ffmpeg import run_ffprobe
from core.metadata.reader import read_metadata
from core.metadata.writer import apply_metadata_to_file
from core.metadata.mutagen_handler import mutagen_handler
from core.album_art.extractor import extract_album_art
from core.album_art.processor import detect_corrupted_album_art, fix_corrupted_album_art
from core.album_art.manager import (
    save_album_art_to_file, process_album_art_change, 
    prepare_batch_album_art_change, record_batch_album_art_history
)
from core.batch.processor import process_folder_files

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
                
                # Calculate folder size (optional - can be expensive for large folders)
                folder_size = 0
                try:
                    # Quick size calculation - only immediate audio files, not recursive
                    for f in os.listdir(item_path):
                        if os.path.isfile(os.path.join(item_path, f)) and f.lower().endswith(AUDIO_EXTENSIONS):
                            folder_size += os.path.getsize(os.path.join(item_path, f))
                except OSError:
                    folder_size = 0
                
                items.append({
                    'name': item,
                    'path': item_rel_path,
                    'type': 'folder',
                    'hasAudio': has_audio,
                    'created': os.path.getctime(item_path),
                    'size': folder_size  # Add folder size
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
                    
                    # Get file stats for date and size
                    try:
                        file_stats = os.stat(file_path)
                        file_date = int(file_stats.st_mtime)  # Modification time as Unix timestamp
                        file_size = file_stats.st_size         # Size in bytes
                    except OSError:
                        # If we can't get stats, use defaults
                        file_date = 0
                        file_size = 0
                    
                    files.append({
                        'name': filename,
                        'path': rel_path,
                        'folder': os.path.relpath(root, current_path),
                        'date': file_date,
                        'size': file_size
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
        
        # Get standard fields (for compatibility)
        standard_fields = read_metadata(filepath)
        
        # Get only existing standard fields
        existing_standard_fields = mutagen_handler.read_existing_metadata(filepath)
        
        # Discover all fields
        all_fields = mutagen_handler.discover_all_metadata(filepath)
        
        # Get album art
        art = extract_album_art(filepath)
        standard_fields['hasArt'] = bool(art)
        standard_fields['art'] = art
        
        # Merge standard fields with discovered fields
        # Standard fields take precedence for display
        response_data = {
            'status': 'success',
            'filename': os.path.basename(filepath),
            'file_path': filename,
            'standard_fields': standard_fields,  # Existing 9 fields (with empty values for compatibility)
            'existing_standard_fields': existing_standard_fields,  # Only fields that actually exist
            'all_fields': all_fields,            # All discovered fields
            'album_art_data': art
        }
        
        # For backward compatibility, also include standard fields at root level
        response_data.update(standard_fields)
        
        return jsonify(response_data)
        
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
        logger.info(f"[set_metadata] Received data for {filename}: {data}")
        
        # Get current metadata before changes using the correct method for OGG/OPUS
        current_metadata = read_metadata(filepath)
        logger.info(f"[set_metadata] Current metadata fields: {list(current_metadata.keys())}")
        
        # Separate metadata from special operations
        metadata_tags = {k: v for k, v in data.items() if k not in ['art', 'removeArt']}
        logger.info(f"[set_metadata] Metadata tags to save: {metadata_tags}")
        
        # Process album art changes
        has_art_change, art_data, remove_art = process_album_art_change(filepath, data, current_metadata)
        
        # Track individual metadata field changes
        for field, new_value in metadata_tags.items():
            old_value = current_metadata.get(field, '')
            if old_value != new_value:
                action = create_metadata_action(filepath, field, old_value, new_value)
                history.add_action(action)
        
        # Apply all changes
        if has_art_change:
            logger.info(f"[set_metadata] Applying metadata with album art changes")
            # This will apply both metadata and album art, and track art history
            save_album_art_to_file(filepath, art_data, remove_art, metadata_tags, track_history=True)
        else:
            logger.info(f"[set_metadata] Applying metadata only (no album art changes)")
            # Just apply metadata changes without album art
            apply_metadata_to_file(filepath, metadata_tags)
        
        logger.info(f"[set_metadata] Successfully saved metadata for {filename}")
        return jsonify({'status': 'success'})
        
    except ValueError:
        return jsonify({'error': 'Invalid path'}), 403
    except Exception as e:
        logger.error(f"Error setting metadata: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/metadata/<path:filename>/<field_id>', methods=['DELETE'])
def delete_metadata_field(filename, field_id):
    """Delete a metadata field from a file"""
    try:
        logger.info(f"[DEBUG] DELETE request for field_id: {field_id} from file: {filename}")
        
        file_path = validate_path(os.path.join(MUSIC_DIR, filename))
        
        if not os.path.exists(file_path):
            return jsonify({'error': 'File not found'}), 404
        
        
        # Get current metadata for history
        current_metadata = mutagen_handler.read_metadata(file_path)
        logger.info(f"[DEBUG] Current metadata keys: {list(current_metadata.keys())}")
        
        all_fields = mutagen_handler.get_all_fields(file_path)
        logger.info(f"[DEBUG] All fields keys: {list(all_fields.keys())}")
        
        # Define standard fields that are always valid for deletion
        standard_fields = ['title', 'artist', 'album', 'albumartist', 'date', 'genre', 'composer', 'track', 'disc']
        is_standard = field_id.lower() in standard_fields
        logger.info(f"[DEBUG] Is standard field: {is_standard}")
        
        # Check if field exists (skip check for standard fields as they're excluded from all_fields)
        if field_id.lower() not in standard_fields and field_id not in all_fields:
            return jsonify({'error': 'Field not found'}), 404
        
        
        # Store previous value for history
        if field_id in all_fields:
            previous_value = all_fields[field_id].get('value', '')
        else:
            # For standard fields, get the value from current_metadata
            previous_value = current_metadata.get(field_id, '')
        
        logger.info(f"[DEBUG] Previous value: {previous_value}")
        
        # Delete the field
        success = mutagen_handler.delete_field(file_path, field_id)
        logger.info(f"[DEBUG] Delete operation success: {success}")
        
        if success:
            # Record in history
            action = create_delete_field_action(file_path, field_id, previous_value)
            history.add_action(action)
            
            return jsonify({
                'status': 'success',
                'message': 'Field deleted successfully'
            })
        else:
            return jsonify({
                'status': 'error', 
                'error': 'Failed to delete field'
            }), 500
            
    except ValueError:
        return jsonify({'error': 'Invalid path'}), 403
    except Exception as e:
        logger.error(f"Error deleting metadata field: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/metadata/create-field', methods=['POST'])
def create_custom_field():
    """New endpoint for creating custom metadata fields"""
    data = request.json
    filepath = data.get('filepath')
    field_name = data.get('field_name')
    field_value = data.get('field_value', '')
    apply_to_folder = data.get('apply_to_folder', False)
    
    # Validate inputs
    if not field_name or not filepath:
        return jsonify({'status': 'error', 'message': 'Missing required fields'}), 400
    
    # Validate field name length
    if len(field_name) > 50:
        return jsonify({'status': 'error', 'message': 'Field name must be 50 characters or less'}), 400
    
    # Check for null bytes
    if '\x00' in field_name:
        return jsonify({'status': 'error', 'message': 'Field name contains invalid characters'}), 400
    
    # Sanitize field name (alphanumeric and underscore only)
    if not re.match(r'^[A-Za-z0-9_]+$', field_name):
        return jsonify({'status': 'error', 'message': 'Invalid field name. Only alphanumeric characters and underscores are allowed.'}), 400
    
    try:
        if apply_to_folder:
            # Apply to all files in folder
            folder_path = os.path.dirname(os.path.join(MUSIC_DIR, filepath))
            results = {'status': 'success', 'filesUpdated': 0, 'errors': []}
            
            # Get all audio files in the folder
            audio_files = []
            for filename in os.listdir(folder_path):
                file_path = os.path.join(folder_path, filename)
                if os.path.isfile(file_path) and filename.lower().endswith(AUDIO_EXTENSIONS):
                    audio_files.append(file_path)
            
            # Apply the custom field to each file
            for file_path in audio_files:
                try:
                    success = mutagen_handler.write_custom_field(file_path, field_name, field_value)
                    if success:
                        results['filesUpdated'] += 1
                        # Record in history
                        rel_path = os.path.relpath(file_path, MUSIC_DIR)
                        action = create_metadata_action(file_path, f'custom:{field_name}', '', field_value)
                        history.add_action(action)
                    else:
                        results['errors'].append(f"{os.path.basename(file_path)}: Failed to write field")
                except Exception as e:
                    results['errors'].append(f"{os.path.basename(file_path)}: {str(e)}")
            
            # Determine overall status
            if results['filesUpdated'] == 0:
                results['status'] = 'error'
                results['message'] = 'No files were updated'
            elif results['errors']:
                results['status'] = 'partial'
                results['message'] = f"Updated {results['filesUpdated']} files with errors"
            else:
                results['message'] = f"Successfully updated {results['filesUpdated']} files"
            
            return jsonify(results)
        else:
            # Apply to single file
            full_path = validate_path(os.path.join(MUSIC_DIR, filepath))
            success = mutagen_handler.write_custom_field(full_path, field_name, field_value)
            
            if success:
                # Record in history
                action = create_metadata_action(full_path, f'custom:{field_name}', '', field_value)
                history.add_action(action)
                
                return jsonify({
                    'status': 'success',
                    'message': 'Field created successfully'
                })
            else:
                return jsonify({
                    'status': 'error',
                    'message': 'Failed to create field'
                }), 500
                
    except ValueError:
        return jsonify({'error': 'Invalid path'}), 403
    except Exception as e:
        logger.error(f"Error creating custom field: {e}")
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
                current_metadata = read_metadata(file_path)
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
        
        elif action.action_type == ActionType.DELETE_FIELD:
            # Undo field deletion by restoring the field
            filepath = action.files[0]
            field = action.field
            old_value = action.old_values[filepath]
            
            try:
                apply_metadata_to_file(filepath, {field: old_value})
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
        
        elif action.action_type == ActionType.DELETE_FIELD:
            # Redo field deletion by deleting the field again
            filepath = action.files[0]
            field = action.field
            
            try:
                mutagen_handler.delete_field(filepath, field)
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
        valid_fields = ['title', 'artist', 'album', 'albumartist', 'date', 'genre', 'track', 'disc', 'composer']
        if field not in valid_fields:
            return jsonify({'error': 'Invalid field'}), 400
        
        # Get existing metadata
        existing_metadata = read_metadata(filepath)
        
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
