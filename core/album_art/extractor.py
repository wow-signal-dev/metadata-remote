"""
Album art extraction operations for Metadata Remote
Handles extracting album artwork from audio files
"""
import subprocess
import base64
import logging

from config import FORMAT_METADATA_CONFIG, logger
from core.file_utils import get_file_format

def extract_album_art(filepath):
    """
    Extract album art from audio file
    
    Args:
        filepath: Path to the audio file
        
    Returns:
        str: Base64-encoded image data, or None if no art found
    """
    # Check if format supports album art
    _, _, base_format = get_file_format(filepath)
    if base_format in FORMAT_METADATA_CONFIG.get('no_embedded_art', []):
        logger.debug(f"Format {base_format} does not support embedded album art")
        return None
    
    # Build ffmpeg command to extract album art
    art_cmd = ['ffmpeg', '-i', filepath, '-an', '-vcodec', 'copy', '-f', 'image2pipe', '-']
    
    try:
        result = subprocess.run(art_cmd, capture_output=True, timeout=10)
        
        if result.returncode == 0 and result.stdout:
            # Successfully extracted album art
            encoded_data = base64.b64encode(result.stdout).decode('utf-8')
            logger.debug(f"Successfully extracted album art from {filepath}")
            return encoded_data
        else:
            # No album art found or extraction failed
            logger.debug(f"No album art found in {filepath}")
            return None
            
    except subprocess.TimeoutExpired:
        logger.error(f"Timeout while extracting album art from {filepath}")
        return None
    except Exception as e:
        logger.error(f"Error extracting album art from {filepath}: {e}")
        return None
