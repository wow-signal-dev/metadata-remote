"""
Album art processing and corruption handling for Metadata Remote
Handles detection and repair of corrupted album artwork
"""
import os
import base64
import logging
import mutagen
from PIL import Image
from io import BytesIO

from config import logger, FORMAT_METADATA_CONFIG
from core.file_utils import get_file_format
from core.metadata.mutagen_handler import mutagen_handler

def _validate_image_data(image_bytes):
    """
    Validate image data more thoroughly, including checking for trailing garbage.
    Returns True if corrupted, False if valid.
    """
    try:
        # First try basic PIL validation
        img = Image.open(BytesIO(image_bytes))
        img.verify()
        
        # Reload for further checks
        img = Image.open(BytesIO(image_bytes))
        
        # Check dimensions
        if img.width > 10000 or img.height > 10000:
            return True
            
        # Force full decode
        img.load()
        
        # Check for trailing data based on format
        format_lower = img.format.lower() if img.format else ''
        
        if format_lower == 'jpeg':
            # Find JPEG end marker
            end_marker = b'\xff\xd9'
            end_pos = image_bytes.find(end_marker)
            if end_pos >= 0:
                actual_end = end_pos + 2
                if actual_end < len(image_bytes) - 2:  # Allow 2 bytes padding
                    return True  # Has significant trailing data
                    
        elif format_lower == 'png':
            # PNG ends with IEND chunk
            iend_marker = b'IEND'
            end_pos = image_bytes.rfind(iend_marker)
            if end_pos >= 0:
                # IEND chunk is 12 bytes total (4 length + 4 'IEND' + 4 CRC)
                actual_end = end_pos + 8  # 4 for 'IEND' + 4 for CRC
                if actual_end < len(image_bytes) - 2:
                    return True
                    
        return False
        
    except Exception:
        return True

def detect_corrupted_album_art(filepath):
    """Detect if album art in the file is corrupted using Mutagen"""
    try:
        # Open file with Mutagen to access format-specific data
        audio = mutagen.File(filepath)
        if audio is None:
            return False
            
        # Import format classes
        from mutagen.flac import FLAC
        from mutagen.oggvorbis import OggVorbis
        from mutagen.oggopus import OggOpus
        from mutagen.mp3 import MP3
        from mutagen.mp4 import MP4
        from mutagen.asf import ASF

        # FLAC-specific validation
        if isinstance(audio, FLAC):
            if not audio.pictures:
                return False
            
            for pic in audio.pictures:
                try:
                    if not pic.data:
                        return True
                        
                    # Use enhanced validation
                    if _validate_image_data(pic.data):
                        return True
                    
                except Exception:
                    return True
                    
            return False

        # OGG/Opus-specific validation
        elif isinstance(audio, (OggVorbis, OggOpus)):
            if 'METADATA_BLOCK_PICTURE' not in audio:
                return False
                
            for pic_data in audio['METADATA_BLOCK_PICTURE']:
                try:
                    # Validate base64 encoding
                    try:
                        decoded = base64.b64decode(pic_data, validate=True)
                    except Exception:
                        return True  # Invalid base64
                    
                    # Validate picture block structure
                    if len(decoded) < 32:  # Minimum valid size
                        return True
                        
                    # Parse and validate picture block
                    pic_type, mime_type, image_data = mutagen_handler._parse_flac_picture_block(decoded)
                    
                    # Use enhanced validation
                    if _validate_image_data(image_data):
                        return True
                        
                except Exception:
                    return True
                    
            return False

        # For other formats, try extraction-based validation
        else:
            try:
                art_data = mutagen_handler.get_album_art(filepath)
                
                if not art_data:
                    return False
                
                # Decode and validate
                image_bytes = base64.b64decode(art_data)
                
                # Use enhanced validation
                return _validate_image_data(image_bytes)
                
            except Exception:
                # Check if art exists
                has_art = False
                
                if isinstance(audio, MP3) and audio.tags:
                    has_art = any(k.startswith('APIC') for k in audio.tags.keys())
                elif isinstance(audio, MP4) and 'covr' in audio:
                    has_art = True
                elif isinstance(audio, ASF):
                    has_art = any('WM/Picture' in k for k in audio.keys())
                    
                return has_art

    except Exception as e:
        logger.error(f"Error checking for corrupted art: {e}")
        return False

def fix_corrupted_album_art(filepath):
    """Extract and re-embed album art to fix corruption using Mutagen"""
    try:
        # First try to extract any salvageable art
        existing_art = None
        try:
            existing_art = mutagen_handler.get_album_art(filepath)
        except:
            pass

        # Remove all album art (corrupted or not)
        try:
            mutagen_handler.remove_album_art(filepath)
        except Exception as e:
            logger.error(f"Failed to remove corrupted art: {e}")
            return False

        # If we salvaged art, try to re-embed it
        if existing_art:
            try:
                # Validate the salvaged art
                image_bytes = base64.b64decode(existing_art)
                img = Image.open(BytesIO(image_bytes))
                img.verify()

                # Re-embed the validated art
                mutagen_handler.write_album_art(filepath, existing_art)
                logger.info(f"Successfully fixed corrupted album art in {filepath}")
                return True

            except Exception:
                logger.info(f"Could not salvage art, removed corrupted data from {filepath}")
                return True
        else:
            logger.info(f"Removed corrupted album art from {filepath}")
            return True

    except Exception as e:
        logger.error(f"Error fixing corrupted album art: {e}")
        return False
