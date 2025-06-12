from flask import Flask, jsonify, request, render_template, send_file, Response
import subprocess
import json
import os
import logging
import tempfile
import base64
import io
from pathlib import Path

app = Flask(__name__)
MUSIC_DIR = os.environ.get('MUSIC_DIR', '/music')

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

@app.route('/')
def index():
    return render_template('index.html')

def fix_file_ownership(filepath):
    """Fix file ownership to match Jellyfin's expected user (1000:1000)"""
    try:
        os.chown(filepath, 1000, 1000)
        logger.info(f"Fixed ownership of {filepath} to 1000:1000")
    except Exception as e:
        logger.warning(f"Could not fix ownership of {filepath}: {e}")

@app.route('/stream/<path:filepath>')
def stream_audio(filepath):
    """Stream audio file"""
    try:
        file_path = os.path.join(MUSIC_DIR, filepath)
        
        # Security check
        if not os.path.abspath(file_path).startswith(os.path.abspath(MUSIC_DIR)):
            return jsonify({'error': 'Invalid path'}), 403
            
        if not os.path.exists(file_path):
            return jsonify({'error': 'File not found'}), 404
            
        # Get file size for range requests
        file_size = os.path.getsize(file_path)
        
        # Handle range requests for seeking
        range_header = request.headers.get('range', None)
        if range_header:
            # Parse range header
            byte_start = 0
            byte_end = file_size - 1
            
            if range_header:
                match = re.search(r'bytes=(\d+)-(\d*)', range_header)
                if match:
                    byte_start = int(match.group(1))
                    if match.group(2):
                        byte_end = int(match.group(2))
            
            # Open file and seek to start position
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
            
            # Return partial content
            response = Response(
                generate(),
                status=206,
                mimetype='audio/mpeg' if file_path.lower().endswith('.mp3') else 'audio/flac',
                headers={
                    'Content-Range': f'bytes {byte_start}-{byte_end}/{file_size}',
                    'Accept-Ranges': 'bytes',
                    'Content-Length': str(byte_end - byte_start + 1),
                    'Content-Disposition': f'inline; filename="{os.path.basename(file_path)}"'
                }
            )
            return response
        else:
            # Return full file
            return send_file(
                file_path,
                mimetype='audio/mpeg' if file_path.lower().endswith('.mp3') else 'audio/flac',
                as_attachment=False,
                download_name=os.path.basename(file_path)
            )
            
    except Exception as e:
        logger.error(f"Error streaming file {filepath}: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/tree/')
@app.route('/tree/<path:subpath>')
def get_tree(subpath=''):
    """Get folder tree structure"""
    try:
        current_path = os.path.join(MUSIC_DIR, subpath)
        
        # Security check
        if not os.path.abspath(current_path).startswith(os.path.abspath(MUSIC_DIR)):
            return jsonify({'error': 'Invalid path'}), 403
            
        if not os.path.exists(current_path):
            return jsonify({'error': 'Path not found'}), 404
        
        def build_tree(path, rel_path=''):
            items = []
            try:
                for item in sorted(os.listdir(path)):
                    item_path = os.path.join(path, item)
                    item_rel_path = os.path.join(rel_path, item) if rel_path else item
                    
                    if os.path.isdir(item_path):
                        # Check if folder contains audio files
                        has_audio = any(
                            f.lower().endswith(('.mp3', '.flac'))
                            for f in os.listdir(item_path)
                            if os.path.isfile(os.path.join(item_path, f))
                        )
                        # Get folder creation time
                        ctime = os.path.getctime(item_path)
                        items.append({
                            'name': item,
                            'path': item_rel_path,
                            'type': 'folder',
                            'hasAudio': has_audio,
                            'created': ctime  # Added this line for date sorting
                        })
            except PermissionError:
                pass
            
            return items
        
        # For root, build complete tree
        if not subpath:
            return jsonify({'items': build_tree(MUSIC_DIR)})
        else:
            # For subpath, return its children
            return jsonify({'items': build_tree(current_path, subpath)})
            
    except Exception as e:
        logger.error(f"Error building tree: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/files/<path:folder_path>')
def get_files(folder_path):
    """Get all audio files in folder and subfolders"""
    try:
        current_path = os.path.join(MUSIC_DIR, folder_path)
        
        # Security check
        if not os.path.abspath(current_path).startswith(os.path.abspath(MUSIC_DIR)):
            return jsonify({'error': 'Invalid path'}), 403
            
        if not os.path.exists(current_path):
            return jsonify({'error': 'Path not found'}), 404
        
        files = []
        
        # Walk through directory and subdirectories
        for root, dirs, filenames in os.walk(current_path):
            for filename in sorted(filenames):
                if filename.lower().endswith(('.mp3', '.flac')):
                    file_path = os.path.join(root, filename)
                    rel_path = os.path.relpath(file_path, MUSIC_DIR)
                    files.append({
                        'name': filename,
                        'path': rel_path,
                        'folder': os.path.relpath(root, current_path)
                    })
        
        return jsonify({'files': files})
        
    except Exception as e:
        logger.error(f"Error getting files: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/rename', methods=['POST'])
def rename_file():
    """Rename a file"""
    try:
        data = request.json
        old_path = os.path.join(MUSIC_DIR, data['oldPath'])
        new_name = data['newName']
        
        # Security checks
        if not os.path.abspath(old_path).startswith(os.path.abspath(MUSIC_DIR)):
            return jsonify({'error': 'Invalid path'}), 403
            
        if not os.path.exists(old_path):
            return jsonify({'error': 'File not found'}), 404
            
        # Validate new name
        if not new_name or '/' in new_name or '\\' in new_name:
            return jsonify({'error': 'Invalid filename'}), 400
            
        # Ensure proper extension
        old_ext = os.path.splitext(old_path)[1].lower()
        new_ext = os.path.splitext(new_name)[1].lower()
        
        if new_ext != old_ext:
            new_name = os.path.splitext(new_name)[0] + old_ext
        
        # Build new path
        old_dir = os.path.dirname(old_path)
        new_path = os.path.join(old_dir, new_name)
        
        # Check if target exists
        if os.path.exists(new_path) and new_path != old_path:
            return jsonify({'error': 'File already exists'}), 400
            
        # Rename file
        os.rename(old_path, new_path)
        fix_file_ownership(new_path)
        
        # Return new relative path
        new_rel_path = os.path.relpath(new_path, MUSIC_DIR)
        return jsonify({'status': 'success', 'newPath': new_rel_path})
        
    except Exception as e:
        logger.error(f"Error renaming file: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/metadata/<path:filename>')
def get_metadata(filename):
    try:
        filepath = os.path.join(MUSIC_DIR, filename)
        
        # Security check
        if not os.path.abspath(filepath).startswith(os.path.abspath(MUSIC_DIR)):
            return jsonify({'error': 'Invalid path'}), 403
            
        if not os.path.exists(filepath):
            return jsonify({'error': 'File not found'}), 404
            
        cmd = ['ffprobe', '-v', 'quiet', '-print_format', 'json', '-show_format', filepath]
        result = subprocess.run(cmd, capture_output=True, text=True)
        
        if result.returncode != 0:
            logger.error(f"FFprobe error: {result.stderr}")
            return jsonify({'error': 'Failed to read metadata'}), 500
            
        data = json.loads(result.stdout)
        tags = data.get('format', {}).get('tags', {})
        
        # Normalize common tag names
        metadata = {
            'title': tags.get('title', tags.get('TITLE', '')),
            'artist': tags.get('artist', tags.get('ARTIST', '')),
            'album': tags.get('album', tags.get('ALBUM', '')),
            'albumartist': tags.get('albumartist', tags.get('ALBUMARTIST', tags.get('album_artist', tags.get('ALBUM_ARTIST', '')))),
            'date': tags.get('year', tags.get('YEAR', tags.get('date', tags.get('DATE', '')))),  # Prioritize year over date
            'genre': tags.get('genre', tags.get('GENRE', '')),
            'track': tags.get('track', tags.get('TRACK', '')),
            'disc': tags.get('disc', tags.get('DISC', tags.get('discnumber', tags.get('DISCNUMBER', ''))))
        }
        
        # Get album art
        metadata['hasArt'] = False
        metadata['art'] = None
        
        # Try to extract album art
        art_cmd = [
            'ffmpeg', '-i', filepath, '-an', '-vcodec', 'copy',
            '-f', 'image2pipe', '-'
        ]
        art_result = subprocess.run(art_cmd, capture_output=True)
        
        if art_result.returncode == 0 and art_result.stdout:
            # Convert to base64
            metadata['hasArt'] = True
            metadata['art'] = base64.b64encode(art_result.stdout).decode('utf-8')
        
        return jsonify(metadata)
    except Exception as e:
        logger.error(f"Error reading metadata for {filename}: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/metadata/<path:filename>', methods=['POST'])
def set_metadata(filename):
    try:
        filepath = os.path.join(MUSIC_DIR, filename)
        
        # Security check
        if not os.path.abspath(filepath).startswith(os.path.abspath(MUSIC_DIR)):
            return jsonify({'error': 'Invalid path'}), 403
            
        if not os.path.exists(filepath):
            return jsonify({'error': 'File not found'}), 404
            
        # Get existing metadata
        probe_cmd = ['ffprobe', '-v', 'quiet', '-print_format', 'json', '-show_format', filepath]
        probe_result = subprocess.run(probe_cmd, capture_output=True, text=True)
        
        if probe_result.returncode != 0:
            logger.error(f"FFprobe error: {probe_result.stderr}")
            return jsonify({'error': 'Failed to read existing metadata'}), 500
            
        probe_data = json.loads(probe_result.stdout)
        existing_tags = probe_data.get('format', {}).get('tags', {})
        
        # Get the new tags from the request
        data = request.json
        new_tags = {k: v for k, v in data.items() if k not in ['art', 'removeArt']}
        
        # Determine file format
        if filepath.lower().endswith('.mp3'):
            ext = '.mp3'
            output_format = 'mp3'
            use_uppercase = True  # MP3 typically uses uppercase
        elif filepath.lower().endswith('.flac'):
            ext = '.flac'
            output_format = 'flac'
            use_uppercase = False  # FLAC typically uses lowercase
        else:
            return jsonify({'error': 'Unsupported file format'}), 400
        
        # Create temp file
        fd, temp_file = tempfile.mkstemp(suffix=ext, dir=os.path.dirname(filepath))
        os.close(fd)
        
        try:
            # Handle album art
            temp_art_file = None
            
            # Build ffmpeg command based on whether we're handling album art
            if data.get('art'):
                # Decode base64 image
                try:
                    art_data = base64.b64decode(data['art'].split(',')[1] if ',' in data['art'] else data['art'])
                    fd, temp_art_file = tempfile.mkstemp(suffix='.jpg')
                    with os.fdopen(fd, 'wb') as f:
                        f.write(art_data)
                    
                    # Build command with album art
                    cmd = [
                        'ffmpeg',
                        '-i', filepath,
                        '-i', temp_art_file,
                        '-y',
                        '-map', '0',
                        '-map', '1',
                        '-c:v', 'mjpeg',
                        '-disposition:v', 'attached_pic',
                        '-codec:a', 'copy',
                        '-f', output_format
                    ]
                except Exception as e:
                    logger.error(f"Error processing album art: {e}")
                    # Fall back to regular command if art processing fails
                    if temp_art_file and os.path.exists(temp_art_file):
                        os.remove(temp_art_file)
                        temp_art_file = None
                    cmd = [
                        'ffmpeg',
                        '-i', filepath,
                        '-y',
                        '-map', '0',
                        '-codec', 'copy',
                        '-f', output_format
                    ]
            elif data.get('removeArt'):
                # Remove album art by only mapping audio streams
                cmd = [
                    'ffmpeg',
                    '-i', filepath,
                    '-y',
                    '-map', '0:a',
                    '-codec', 'copy',
                    '-f', output_format
                ]
            else:
                # Regular command without art changes
                cmd = [
                    'ffmpeg',
                    '-i', filepath,
                    '-y',
                    '-map', '0',
                    '-codec', 'copy',
                    '-f', output_format
                ]
            
            # Merge tags
            merged_tags = existing_tags.copy()
            
            # Map frontend fields to metadata tags with proper case
            field_mapping = {
                'title': 'TITLE' if use_uppercase else 'title',
                'artist': 'ARTIST' if use_uppercase else 'artist',
                'album': 'ALBUM' if use_uppercase else 'album',
                'albumartist': 'ALBUMARTIST' if use_uppercase else 'albumartist',
                'date': 'DATE' if use_uppercase else 'date',
                'year': 'DATE' if use_uppercase else 'date',  # Map year to date
                'genre': 'GENRE' if use_uppercase else 'genre',
                'track': 'TRACK' if use_uppercase else 'track',
                'disc': 'DISC' if use_uppercase else 'disc'
            }
            
            # Special handling for fields with multiple possible names
            albumartist_variants = ['albumartist', 'ALBUMARTIST', 'album_artist', 'ALBUM_ARTIST']
            disc_variants = ['disc', 'DISC', 'discnumber', 'DISCNUMBER']
            
            for key, value in new_tags.items():
                # Determine the proper tag name for this field
                proper_tag_name = field_mapping.get(key, key.upper() if use_uppercase else key)
                
                # Special handling for albumartist
                if key == 'albumartist':
                    # Remove all variants
                    for variant in albumartist_variants:
                        if variant in merged_tags:
                            del merged_tags[variant]
                    # Add with proper name if value is not empty
                    if value:
                        merged_tags[proper_tag_name] = value
                        
                # Special handling for disc
                elif key == 'disc':
                    # Remove all variants
                    for variant in disc_variants:
                        if variant in merged_tags:
                            del merged_tags[variant]
                    # Add with proper name if value is not empty
                    if value:
                        merged_tags[proper_tag_name] = value
                        
                else:
                    # For other fields, check if any case variant exists
                    found_key = None
                    for existing_key in list(merged_tags.keys()):
                        if existing_key.lower() == key.lower():
                            found_key = existing_key
                            break
                    
                    if found_key:
                        # Update or remove existing tag
                        if value:
                            # Remove old key and add with new value
                            del merged_tags[found_key]
                            merged_tags[proper_tag_name] = value
                        else:
                            # Remove the tag
                            del merged_tags[found_key]
                    else:
                        # Add new tag if value is not empty
                        if value:
                            merged_tags[proper_tag_name] = value
            
            # Add all metadata to ffmpeg command
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
            
            # Clean up temp art file
            if temp_art_file and os.path.exists(temp_art_file):
                os.remove(temp_art_file)
            
            return jsonify({'status': 'success'})
            
        except Exception as e:
            # Clean up temp files on error
            if os.path.exists(temp_file):
                os.remove(temp_file)
            if temp_art_file and os.path.exists(temp_art_file):
                os.remove(temp_art_file)
            raise
            
    except Exception as e:
        logger.error(f"Error setting metadata: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/apply-art-to-folder', methods=['POST'])
def apply_art_to_folder():
    """Apply album art to all audio files in a specific folder (not subfolders)"""
    try:
        data = request.json
        folder_path = data.get('folderPath', '')
        art_data = data.get('art')
        
        if not art_data:
            return jsonify({'error': 'No album art provided'}), 400
        
        # Convert folder path to absolute path
        abs_folder_path = os.path.join(MUSIC_DIR, folder_path) if folder_path else MUSIC_DIR
        
        # Security check
        if not os.path.abspath(abs_folder_path).startswith(os.path.abspath(MUSIC_DIR)):
            return jsonify({'error': 'Invalid path'}), 403
            
        if not os.path.exists(abs_folder_path):
            return jsonify({'error': 'Folder not found'}), 404
        
        # Get all audio files in the folder (not subfolders)
        audio_files = []
        try:
            for filename in os.listdir(abs_folder_path):
                file_path = os.path.join(abs_folder_path, filename)
                # Only process files directly in this folder, not subdirectories
                if os.path.isfile(file_path) and filename.lower().endswith(('.mp3', '.flac')):
                    audio_files.append(file_path)
        except Exception as e:
            logger.error(f"Error listing folder contents: {e}")
            return jsonify({'error': 'Error accessing folder'}), 500
        
        if not audio_files:
            return jsonify({'error': 'No audio files found in folder'}), 404
        
        # Decode album art once
        try:
            art_bytes = base64.b64decode(art_data.split(',')[1] if ',' in art_data else art_data)
        except Exception as e:
            logger.error(f"Error decoding album art: {e}")
            return jsonify({'error': 'Invalid album art data'}), 400
        
        # Create temp file for album art
        fd, temp_art_file = tempfile.mkstemp(suffix='.jpg')
        try:
            with os.fdopen(fd, 'wb') as f:
                f.write(art_bytes)
            
            files_updated = 0
            errors = []
            
            # Process each audio file
            for file_path in audio_files:
                try:
                    filename = os.path.basename(file_path)
                    
                    # Get existing metadata
                    probe_cmd = ['ffprobe', '-v', 'quiet', '-print_format', 'json', '-show_format', file_path]
                    probe_result = subprocess.run(probe_cmd, capture_output=True, text=True)
                    
                    if probe_result.returncode != 0:
                        logger.error(f"FFprobe error for {filename}: {probe_result.stderr}")
                        errors.append(f"{filename}: Failed to read metadata")
                        continue
                    
                    probe_data = json.loads(probe_result.stdout)
                    existing_tags = probe_data.get('format', {}).get('tags', {})
                    
                    # Determine file format
                    if file_path.lower().endswith('.mp3'):
                        ext = '.mp3'
                        output_format = 'mp3'
                    elif file_path.lower().endswith('.flac'):
                        ext = '.flac'
                        output_format = 'flac'
                    else:
                        errors.append(f"{filename}: Unsupported format")
                        continue
                    
                    # Create temp file for this audio file
                    fd2, temp_audio_file = tempfile.mkstemp(suffix=ext, dir=os.path.dirname(file_path))
                    os.close(fd2)
                    
                    try:
                        # Build ffmpeg command with album art
                        cmd = [
                            'ffmpeg',
                            '-i', file_path,
                            '-i', temp_art_file,
                            '-y',
                            '-map', '0',
                            '-map', '1',
                            '-c:v', 'mjpeg',
                            '-disposition:v', 'attached_pic',
                            '-codec:a', 'copy',
                            '-f', output_format
                        ]
                        
                        # Add all existing metadata
                        for key, value in existing_tags.items():
                            cmd.extend(['-metadata', f'{key}={value}'])
                        
                        cmd.append(temp_audio_file)
                        
                        # Execute ffmpeg
                        result = subprocess.run(cmd, capture_output=True, text=True)
                        
                        if result.returncode != 0:
                            logger.error(f"FFmpeg error for {filename}: {result.stderr}")
                            errors.append(f"{filename}: FFmpeg processing failed")
                            continue
                        
                        # Replace original file
                        os.replace(temp_audio_file, file_path)
                        fix_file_ownership(file_path)
                        files_updated += 1
                        
                    finally:
                        # Clean up temp audio file if it still exists
                        if os.path.exists(temp_audio_file):
                            os.remove(temp_audio_file)
                            
                except Exception as e:
                    logger.error(f"Error processing {filename}: {e}")
                    errors.append(f"{filename}: {str(e)}")
                    
        finally:
            # Clean up temp art file
            if os.path.exists(temp_art_file):
                os.remove(temp_art_file)
        
        # Return results
        if files_updated == 0:
            return jsonify({
                'status': 'error',
                'error': 'No files were updated',
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
            
    except Exception as e:
        logger.error(f"Error applying art to folder: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/apply-field-to-folder', methods=['POST'])
def apply_field_to_folder():
    """Apply a specific metadata field to all audio files in a folder (not subfolders)"""
    try:
        data = request.json
        folder_path = data.get('folderPath', '')
        field = data.get('field')
        value = data.get('value', '').strip()
        
        if not field:
            return jsonify({'error': 'No field specified'}), 400
        
        # Convert folder path to absolute path
        abs_folder_path = os.path.join(MUSIC_DIR, folder_path) if folder_path else MUSIC_DIR
        
        # Security check
        if not os.path.abspath(abs_folder_path).startswith(os.path.abspath(MUSIC_DIR)):
            return jsonify({'error': 'Invalid path'}), 403
            
        if not os.path.exists(abs_folder_path):
            return jsonify({'error': 'Folder not found'}), 404
        
        # Get all audio files in the folder (not subfolders)
        audio_files = []
        try:
            for filename in os.listdir(abs_folder_path):
                file_path = os.path.join(abs_folder_path, filename)
                # Only process files directly in this folder, not subdirectories
                if os.path.isfile(file_path) and filename.lower().endswith(('.mp3', '.flac')):
                    audio_files.append(file_path)
        except Exception as e:
            logger.error(f"Error listing folder contents: {e}")
            return jsonify({'error': 'Error accessing folder'}), 500
        
        if not audio_files:
            return jsonify({'error': 'No audio files found in folder'}), 404
        
        files_updated = 0
        errors = []
        
        # Process each audio file
        for file_path in audio_files:
            try:
                filename = os.path.basename(file_path)
                
                # Get existing metadata
                probe_cmd = ['ffprobe', '-v', 'quiet', '-print_format', 'json', '-show_format', file_path]
                probe_result = subprocess.run(probe_cmd, capture_output=True, text=True)
                
                if probe_result.returncode != 0:
                    logger.error(f"FFprobe error for {filename}: {probe_result.stderr}")
                    errors.append(f"{filename}: Failed to read metadata")
                    continue
                
                probe_data = json.loads(probe_result.stdout)
                existing_tags = probe_data.get('format', {}).get('tags', {})
                
                # Determine file format
                if file_path.lower().endswith('.mp3'):
                    ext = '.mp3'
                    output_format = 'mp3'
                    use_uppercase = True  # MP3 typically uses uppercase
                elif file_path.lower().endswith('.flac'):
                    ext = '.flac'
                    output_format = 'flac'
                    use_uppercase = False  # FLAC typically uses lowercase
                else:
                    errors.append(f"{filename}: Unsupported format")
                    continue
                
                # Create temp file for this audio file
                fd, temp_file = tempfile.mkstemp(suffix=ext, dir=os.path.dirname(file_path))
                os.close(fd)
                
                try:
                    # Build ffmpeg command
                    cmd = [
                        'ffmpeg',
                        '-i', file_path,
                        '-y',
                        '-map', '0',
                        '-codec', 'copy',
                        '-f', output_format
                    ]
                    
                    # Map frontend fields to metadata tags with proper case
                    field_mapping = {
                        'title': 'TITLE' if use_uppercase else 'title',
                        'artist': 'ARTIST' if use_uppercase else 'artist',
                        'album': 'ALBUM' if use_uppercase else 'album',
                        'albumartist': 'ALBUMARTIST' if use_uppercase else 'albumartist',
                        'date': 'DATE' if use_uppercase else 'date',
                        'year': 'DATE' if use_uppercase else 'date',
                        'genre': 'GENRE' if use_uppercase else 'genre',
                        'track': 'TRACK' if use_uppercase else 'track',
                        'disc': 'DISC' if use_uppercase else 'disc'
                    }
                    
                    # Special handling for fields with multiple possible names
                    albumartist_variants = ['albumartist', 'ALBUMARTIST', 'album_artist', 'ALBUM_ARTIST']
                    disc_variants = ['disc', 'DISC', 'discnumber', 'DISCNUMBER']
                    
                    # Copy existing tags
                    merged_tags = existing_tags.copy()
                    
                    # Update the specific field
                    proper_tag_name = field_mapping.get(field, field.upper() if use_uppercase else field)
                    
                    # Special handling for albumartist
                    if field == 'albumartist':
                        # Remove all variants
                        for variant in albumartist_variants:
                            if variant in merged_tags:
                                del merged_tags[variant]
                        # Add with proper name if value is not empty
                        if value:
                            merged_tags[proper_tag_name] = value
                            
                    # Special handling for disc
                    elif field == 'disc':
                        # Remove all variants
                        for variant in disc_variants:
                            if variant in merged_tags:
                                del merged_tags[variant]
                        # Add with proper name if value is not empty
                        if value:
                            merged_tags[proper_tag_name] = value
                            
                    else:
                        # For other fields, check if any case variant exists
                        found_key = None
                        for existing_key in list(merged_tags.keys()):
                            if existing_key.lower() == field.lower():
                                found_key = existing_key
                                break
                        
                        if found_key:
                            # Update or remove existing tag
                            if value:
                                # Remove old key and add with new value
                                del merged_tags[found_key]
                                merged_tags[proper_tag_name] = value
                            else:
                                # Remove the tag
                                del merged_tags[found_key]
                        else:
                            # Add new tag if value is not empty
                            if value:
                                merged_tags[proper_tag_name] = value
                    
                    # Add all metadata to ffmpeg command
                    for key, tag_value in merged_tags.items():
                        cmd.extend(['-metadata', f'{key}={tag_value}'])
                    
                    cmd.append(temp_file)
                    
                    # Execute ffmpeg
                    result = subprocess.run(cmd, capture_output=True, text=True)
                    
                    if result.returncode != 0:
                        logger.error(f"FFmpeg error for {filename}: {result.stderr}")
                        errors.append(f"{filename}: FFmpeg processing failed")
                        continue
                    
                    # Replace original file
                    os.replace(temp_file, file_path)
                    fix_file_ownership(file_path)
                    files_updated += 1
                    
                except Exception as e:
                    logger.error(f"Error updating {filename}: {e}")
                    errors.append(f"{filename}: {str(e)}")
                finally:
                    # Clean up temp file if it still exists
                    if os.path.exists(temp_file):
                        os.remove(temp_file)
                        
            except Exception as e:
                logger.error(f"Error processing {filename}: {e}")
                errors.append(f"{filename}: {str(e)}")
        
        # Return results
        if files_updated == 0:
            return jsonify({
                'status': 'error',
                'error': 'No files were updated',
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
            
    except Exception as e:
        logger.error(f"Error applying field to folder: {str(e)}")
        return jsonify({'error': str(e)}), 500

# Enable template auto-reloading
app.config['TEMPLATES_AUTO_RELOAD'] = True

# Add missing re import for range header parsing
import re

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8338, debug=False)