"""
File system utilities for Metadata Remote
Handles path validation, file ownership, and format detection
"""
import os
import logging
from pathlib import Path

from config import MUSIC_DIR, OWNER_UID, OWNER_GID, FORMAT_METADATA_CONFIG, logger

def validate_path(filepath):
    """Validate that a path is within MUSIC_DIR"""
    abs_path = os.path.abspath(filepath)
    if not abs_path.startswith(os.path.abspath(MUSIC_DIR)):
        raise ValueError("Invalid path")
    return abs_path

def fix_file_ownership(filepath):
    """Fix file ownership to match Jellyfin's expected user"""
    try:
        os.chown(filepath, OWNER_UID, OWNER_GID)
        logger.info(f"Fixed ownership of {filepath} to {OWNER_UID}:{OWNER_GID}")
    except Exception as e:
        logger.warning(f"Could not fix ownership of {filepath}: {e}")

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
    elif ext in ['.ogg', '.opus']:
        output_format = 'ogg'
    else:
        output_format = base_format
    
    # Determine tag case preference
    use_uppercase = base_format in FORMAT_METADATA_CONFIG.get('uppercase', [])
    
    return output_format, use_uppercase, base_format
