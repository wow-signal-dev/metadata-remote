"""
Batch file processing operations for Metadata Remote
Handles bulk operations on all files in a folder
"""
import os
import logging
from flask import jsonify

from config import MUSIC_DIR, AUDIO_EXTENSIONS, logger
from core.file_utils import validate_path

def process_folder_files(folder_path, process_func, process_name):
    """
    Generic function to process all audio files in a folder
    
    Args:
        folder_path: Path to the folder containing audio files
        process_func: Function to call for each file (takes file_path as argument)
        process_name: Human-readable name of the process for status messages
        
    Returns:
        Flask JSON response with status and results
    """
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
