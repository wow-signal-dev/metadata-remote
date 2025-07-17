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
Metadata writing operations for Metadata Remote
Handles applying metadata changes to audio files using Mutagen
"""
import os
import logging

from config import FORMAT_METADATA_CONFIG, logger
from core.file_utils import get_file_format, fix_file_ownership
from core.metadata.mutagen_handler import mutagen_handler


def apply_metadata_to_file(filepath, new_tags, art_data=None, remove_art=False):
    """
    Apply metadata changes to a single file using Mutagen
    
    Args:
        filepath: Path to the audio file
        new_tags: Dictionary of metadata fields to update
        art_data: Base64 encoded album art data (optional)
        remove_art: Whether to remove existing album art (optional)
        
    Raises:
        Exception: For any errors during metadata writing
    """
    # Import from the processor module
    from core.album_art.processor import detect_corrupted_album_art, fix_corrupted_album_art
    
    # Get file format
    _, _, base_format = get_file_format(filepath)
    
    # Check for and fix corrupted album art before proceeding
    if not remove_art and not art_data:
        if detect_corrupted_album_art(filepath):
            logger.info(f"Detected corrupted album art in {filepath}, attempting to fix...")
            fix_corrupted_album_art(filepath)
    
    # Check if format supports embedded album art
    if art_data and base_format in FORMAT_METADATA_CONFIG.get('no_embedded_art', []):
        logger.warning(f"Format {base_format} does not support embedded album art")
        art_data = None
    
    try:
        # First, handle album art operations if needed
        if remove_art:
            mutagen_handler.remove_album_art(filepath)
        elif art_data:
            mutagen_handler.write_album_art(filepath, art_data)
        else:
            # For OGG/Opus files, we need to preserve existing album art
            # when only updating text metadata
            if base_format in ['ogg', 'opus']:
                existing_art = mutagen_handler.get_album_art(filepath)
                if existing_art:
                    # We'll re-write it after updating metadata
                    art_data = existing_art
        
        # Prepare metadata for writing (exclude art-related fields)
        metadata_to_write = {}
        for field, value in new_tags.items():
            if field not in ['art', 'removeArt']:
                metadata_to_write[field] = value
        
        # Write metadata
        if metadata_to_write:
            mutagen_handler.write_metadata(filepath, metadata_to_write)
        
        # For OGG/Opus, re-write preserved album art if needed
        if base_format in ['ogg', 'opus'] and art_data and not remove_art and 'art' not in new_tags:
            mutagen_handler.write_album_art(filepath, art_data)
        
        # Fix file ownership
        fix_file_ownership(filepath)
        
        logger.info(f"Successfully updated {os.path.basename(filepath)}")
    
    except Exception as e:
        logger.error(f"Failed to apply metadata to {filepath}: {e}")
        raise