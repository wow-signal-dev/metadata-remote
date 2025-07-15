"""
Metadata reading operations for Metadata Remote
Handles extracting and formatting metadata from audio files using Mutagen
"""
import os
import logging

from config import FORMAT_METADATA_CONFIG, logger
from core.file_utils import get_file_format
from core.metadata.mutagen_handler import mutagen_handler


def read_metadata(filepath):
    """
    Read metadata from an audio file and return formatted data using Mutagen
    
    Args:
        filepath: Full path to the audio file
        
    Returns:
        dict: Metadata dictionary with normalized tags and format info
        
    Raises:
        FileNotFoundError: If the file doesn't exist
        Exception: For any errors during metadata reading
    """
    if not os.path.exists(filepath):
        raise FileNotFoundError(f"File not found: {filepath}")
    
    try:
        
        # Get file format
        audio_format, format_key, base_format = get_file_format(filepath)
        
        # Read metadata using mutagen
        metadata = mutagen_handler.read_metadata(filepath)
        
        if metadata:
            # Add format information
            metadata['format'] = audio_format
            metadata['format_key'] = format_key
            metadata['base_format'] = base_format
            return metadata
        else:
            logger.error(f"Could not read metadata from {filepath}")
            return {}
            
    except Exception as e:
        logger.error(f"Failed to read metadata from {filepath}: {e}")
        return {}


def get_format_limitations(base_format):
    """
    Get format limitations for a given audio format
    
    Args:
        base_format: The base format string (e.g., 'mp3', 'flac')
        
    Returns:
        dict: Dictionary with format limitation flags
    """
    return {
        'supportsAlbumArt': base_format not in FORMAT_METADATA_CONFIG.get('no_embedded_art', []),
        'hasLimitedMetadata': base_format in FORMAT_METADATA_CONFIG.get('limited', [])
    }