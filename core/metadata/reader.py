"""
Metadata reading operations for Metadata Remote
Handles extracting and formatting metadata from audio files using Mutagen
"""
import os
import logging

from config import FORMAT_METADATA_CONFIG, logger
from core.file_utils import get_file_format
from core.metadata.mutagen_handler import mutagen_handler
from core.metadata.ffmpeg import run_ffprobe


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
    
    # Get format info for proper normalization
    _, _, base_format = get_file_format(filepath)
    
    try:
        # Try to read metadata using Mutagen first
        metadata = mutagen_handler.read_metadata(filepath)
        
        # Add format info for client
        metadata['format'] = base_format
        
        # Add format limitations info
        metadata['formatLimitations'] = {
            'supportsAlbumArt': base_format not in FORMAT_METADATA_CONFIG.get('no_embedded_art', []),
            'hasLimitedMetadata': base_format in FORMAT_METADATA_CONFIG.get('limited', [])
        }
        
        return metadata
        
    except Exception as e:
        # If Mutagen fails, fall back to FFmpeg
        logger.warning(f"Mutagen failed to read {filepath}: {e}")
        logger.info("Falling back to FFmpeg...")
        return _read_metadata_with_ffmpeg(filepath)


def _read_metadata_with_ffmpeg(filepath):
    """
    Fallback method using FFmpeg for formats not supported by Mutagen
    
    This is the original implementation kept as a fallback
    """
    from core.metadata.normalizer import normalize_metadata_tags
    
    # Get metadata using ffprobe
    probe_data = run_ffprobe(filepath)
    
    # Get format info for proper normalization
    _, _, base_format = get_file_format(filepath)
    
    # More comprehensive metadata extraction for OGG/Opus
    tags = {}
    if base_format in ['ogg', 'opus']:
        # For OGG/Opus files, we need to check both stream and format levels
        # as per the research document
        
        # First try stream tags (typical for Opus)
        for stream in probe_data.get('streams', []):
            if stream.get('codec_type') == 'audio':
                stream_tags = stream.get('tags', {})
                if stream_tags:
                    tags = stream_tags
                    break
        
        # If no stream tags or incomplete, merge with format tags
        format_tags = probe_data.get('format', {}).get('tags', {})
        if not tags:
            tags = format_tags
        else:
            # Merge format tags for any missing fields
            for key, value in format_tags.items():
                if key not in tags:
                    tags[key] = value
    else:
        # For other formats, use format tags
        tags = probe_data.get('format', {}).get('tags', {})
    
    # Normalize tags
    metadata = normalize_metadata_tags(tags, base_format)
    
    # Add format info for client
    metadata['format'] = base_format
    
    # Add format limitations info
    metadata['formatLimitations'] = {
        'supportsAlbumArt': base_format not in FORMAT_METADATA_CONFIG.get('no_embedded_art', []),
        'hasLimitedMetadata': base_format in FORMAT_METADATA_CONFIG.get('limited', [])
    }
    
    return metadata


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