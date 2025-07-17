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

"""
Album art extraction operations for Metadata Remote
Handles extracting album artwork from audio files
"""
import logging

from config import FORMAT_METADATA_CONFIG, logger
from core.file_utils import get_file_format
from core.metadata.mutagen_handler import mutagen_handler

def extract_album_art(filepath):
    """
    Extract album art from audio file using Mutagen
    
    Args:
        filepath: Path to the audio file
        
    Returns:
        str: Base64-encoded image data, or None if no art found
    """
    # Check if format supports album art
    _, _, base_format = get_file_format(filepath)
    if base_format in FORMAT_METADATA_CONFIG.get('no_embedded_art', []):
        return None
    
    try:
        # Use mutagen handler for all formats
        art_data = mutagen_handler.get_album_art(filepath)
        
        # If extraction returned None but format supports art, check for corruption
        # This catches cases like truncated OGG/Opus METADATA_BLOCK_PICTURE
        if art_data is None and base_format not in ['wav', 'wv']:
            # Import here to avoid circular dependency at module level
            from core.album_art.processor import detect_corrupted_album_art, fix_corrupted_album_art
            
            if detect_corrupted_album_art(filepath):
                logger.info(f"Detected corrupted album art during read for {filepath}")
                if fix_corrupted_album_art(filepath):
                    # Try extraction again after repair
                    art_data = mutagen_handler.get_album_art(filepath)
                    if art_data:
                        logger.info(f"Successfully extracted album art after repair")
                    else:
                        logger.info(f"Album art removed due to corruption")
        
        return art_data
        
    except Exception as e:
        logger.error(f"Error extracting album art from {filepath}: {e}")
        return None
