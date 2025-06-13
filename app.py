from flask import Flask, jsonify, request, render_template, send_file, Response
import subprocess
import json
import os
import logging
import tempfile
import base64
import re
from pathlib import Path

app = Flask(__name__)
MUSIC_DIR = os.environ.get('MUSIC_DIR', '/music')

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Constants
AUDIO_EXTENSIONS = ('.mp3', '.flac')
OWNER_UID = 1000
OWNER_GID = 1000

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
    if filepath.lower().endswith('.mp3'):
        return 'mp3', True  # MP3 uses uppercase tags
    elif filepath.lower().endswith('.flac'):
        return 'flac', False  # FLAC uses lowercase tags
    else:
        raise ValueError("Unsupported file format")

def run_ffprobe(filepath):
    """Run ffprobe and return parsed JSON data"""
    cmd = ['ffprobe', '-v', 'quiet', '-print_format', 'json', '-show_format', filepath]
    result = subprocess.run(cmd, capture_output=True, text=True)
    
    if result.returncode != 0:
        logger.error(f"FFprobe error: {result.stderr}")
        raise Exception('Failed to read metadata')
    
    return json.loads(result.stdout)

def normalize_metadata_tags(tags):
    """Normalize common tag names from various formats"""
    return {
        'title': tags.get('title', tags.get('TITLE', '')),
        'artist': tags.get('artist', tags.get('ARTIST', '')),
        'album': tags.get('album', tags.get('ALBUM', '')),
        'albumartist': tags.get('albumartist', tags.get('ALBUMARTIST', 
                       tags.get('album_artist', tags.get('ALBUM_ARTIST', '')))),
        'date': tags.get('year', tags.get('YEAR', 
                tags.get('date', tags.get('DATE', '')))),
        'genre': tags.get('genre', tags.get('GENRE', '')),
        'track': tags.get('track', tags.get('TRACK', '')),
        'disc': tags.get('disc', tags.get('DISC', 
                tags.get('discnumber', tags.get('DISCNUMBER', ''))))
    }

def get_metadata_field_mapping(use_uppercase):
    """Get proper metadata field names based on format"""
    base_mapping = {
        'title': 'title',
        'artist': 'artist',
        'album': 'album',
        'albumartist': 'albumartist',
        'date': 'date',
        'year': 'date',  # Map year to date
        'genre': 'genre',
        'track': 'track',
        'disc': 'disc'
    }
    
    if use_uppercase:
        return {k: v.upper() for k, v in base_mapping.items()}
    return base_mapping

def merge_metadata_tags(existing_tags, new_tags, use_uppercase):
    """Merge new tags into existing tags with proper handling"""
    merged = existing_tags.copy()
    field_mapping = get_metadata_field_mapping(use_uppercase)
    
    # Special tag variants to handle
    albumartist_variants = ['albumartist', 'ALBUMARTIST', 'album_artist', 'ALBUM_ARTIST']
    disc_variants = ['disc', 'DISC', 'discnumber', 'DISCNUMBER']
    
    for key, value in new_tags.items():
        if key in ['art', 'removeArt']:
            continue
            
        proper_tag_name = field_mapping.get(key, key.upper() if use_uppercase else key)
        
        if key == 'albumartist':
            # Remove all variants
            for variant in albumartist_variants:
                merged.pop(variant, None)
            if value:
                merged[proper_tag_name] = value
                
        elif key == 'disc':
            # Remove all variants
            for variant in disc_variants:
                merged.pop(variant, None)
            if value:
                merged[proper_tag_name] = value
                
        else:
            # Find and remove any case variant
            for existing_key in list(merged.keys()):
                if existing_key.lower() == key.lower():
                    del merged[existing_key]
                    break
            
            if value:
                merged[proper_tag_name] = value
    
    return merged

def extract_album_art(filepath):
    """Extract album art from audio file"""
    art_cmd = ['ffmpeg', '-i', filepath, '-an', '-vcodec', 'copy', '-f', 'image2pipe', '-']
    result = subprocess.run(art_cmd, capture_output=True)
    
    if result.returncode == 0 and result.stdout:
        return base64.b64encode(result.stdout).decode('utf-8')
    return None

def apply_metadata_to_file(filepath, new_tags, art_data=None, remove_art=False):
    """Apply metadata changes to a single file"""
    # Get file format
    output_format, use_uppercase = get_file_format(filepath)
    ext = '.' + output_format
    
    # Get existing metadata
    probe_data = run_ffprobe(filepath)
    existing_tags = probe_data.get('format', {}).get('tags', {})
    
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
            
            cmd = [
                'ffmpeg', '-i', filepath, '-i', temp_art_file, '-y',
                '-map', '0', '-map', '1', '-c:v', 'mjpeg',
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
        
        # Merge tags
        merged_tags = merge_metadata_tags(existing_tags, new_tags, use_uppercase)
        
        # Add metadata to command
        for key, value in merged_tags.items():
            cmd.extend(['-metadata', f'{key}={value}'])
        
        cmd.append(temp_file)
        
        # Execute ffmpeg
        result = subprocess.run(cmd, capture_output=True, text=True)
        
        if result.returncode != 0:
            logger.error(f"FFmpeg stderr: {result.stderr}")
            raise Exception(f"FFmpeg failed: {result.stderr}")
        
        # Replace original file
        os.replace(temp_file, filepath)
        fix_file_ownership(filepath)
        
        # Clean up temp art file if exists
        if art_data and 'temp_art_file' in locals():
            os.remove(temp_art_file)
            
    except Exception:
        if os.path.exists(temp_file):
            os.remove(temp_file)
        raise

@app.route('/stream/<path:filepath>')
def stream_audio(filepath):
    """Stream audio file with range request support"""
    try:
        file_path = validate_path(os.path.join(MUSIC_DIR, filepath))
        
        if not os.path.exists(file_path):
            return jsonify({'error': 'File not found'}), 404
        
        file_size = os.path.getsize(file_path)
        range_header = request.headers.get('range', None)
        
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
            
            mimetype = 'audio/mpeg' if file_path.lower().endswith('.mp3') else 'audio/flac'
            
            return Response(
                generate(),
                status=206,
                mimetype=mimetype,
                headers={
                    'Content-Range': f'bytes {byte_start}-{byte_end}/{file_size}',
                    'Accept-Ranges': 'bytes',
                    'Content-Length': str(byte_end - byte_start + 1),
                    'Content-Disposition': f'inline; filename="{os.path.basename(file_path)}"'
                }
            )
        else:
            # Return full file
            mimetype = 'audio/mpeg' if file_path.lower().endswith('.mp3') else 'audio/flac'
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
        
        # Normalize tags
        metadata = normalize_metadata_tags(tags)
        
        # Get album art
        art = extract_album_art(filepath)
        metadata['hasArt'] = bool(art)
        metadata['art'] = art
        
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
        
        # Separate metadata from special operations
        metadata_tags = {k: v for k, v in data.items() if k not in ['art', 'removeArt']}
        art_data = data.get('art')
        remove_art = data.get('removeArt', False)
        
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
    
    def apply_art(file_path):
        apply_metadata_to_file(file_path, {}, art_data)
    
    return process_folder_files(folder_path, apply_art, "updated with album art")

@app.route('/apply-field-to-folder', methods=['POST'])
def apply_field_to_folder():
    """Apply a specific metadata field to all audio files in a folder"""
    data = request.json
    folder_path = data.get('folderPath', '')
    field = data.get('field')
    value = data.get('value', '').strip()
    
    if not field:
        return jsonify({'error': 'No field specified'}), 400
    
    def apply_field(file_path):
        apply_metadata_to_file(file_path, {field: value})
    
    return process_folder_files(folder_path, apply_field, f"updated with {field}")

# Enable template auto-reloading
app.config['TEMPLATES_AUTO_RELOAD'] = True

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8338, debug=False)
