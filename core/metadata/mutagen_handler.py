
"""
Centralized Mutagen operations for Metadata Remote
Handles all metadata reading and writing using Mutagen library

This module uses Mutagen (https://github.com/quodlibet/mutagen)
Licensed under LGPL-2.1+ for audio metadata operations.
"""

import os
import base64
import logging
from typing import Dict, Any, Optional, Union, Tuple
import unicodedata

from mutagen import File
from mutagen.mp3 import MP3
from mutagen.id3 import ID3, APIC, TPE1, TPE2, TIT2, TALB, TDRC, TCON, TRCK, TPOS, TCOM, TXXX, ID3NoHeaderError
from mutagen.oggvorbis import OggVorbis
from mutagen.oggopus import OggOpus
from mutagen.flac import FLAC, Picture
from mutagen.mp4 import MP4, MP4Cover
from mutagen.asf import ASF
from mutagen.wavpack import WavPack
from mutagen.wave import WAVE
from mutagen.id3 import PictureType

from config import logger, FORMAT_METADATA_CONFIG


class MutagenHandler:
    """Centralized handler for all Mutagen operations"""
    
    def __init__(self):
        # Tag mapping for different formats
        self.tag_mappings = {
            'mp3': {
                'title': 'TIT2',
                'artist': 'TPE1',
                'album': 'TALB',
                'albumartist': 'TPE2',
                'date': 'TDRC',
                'year': 'TDRC',
                'genre': 'TCON',
                'track': 'TRCK',
                'disc': 'TPOS',
                'composer': 'TCOM'
            },
            'ogg': {  # Vorbis comments (used by OGG Vorbis and Opus)
                'title': 'TITLE',
                'artist': 'ARTIST',
                'album': 'ALBUM',
                'albumartist': 'ALBUMARTIST',
                'date': 'DATE',
                'year': 'DATE',
                'genre': 'GENRE',
                'track': 'TRACKNUMBER',
                'disc': 'DISCNUMBER',
                'composer': 'COMPOSER'
            },
            'flac': {  # FLAC uses Vorbis comments
                'title': 'title',
                'artist': 'artist',
                'album': 'album',
                'albumartist': 'albumartist',
                'date': 'date',
                'year': 'date',
                'genre': 'genre',
                'track': 'tracknumber',
                'disc': 'discnumber',
                'composer': 'composer'
            },
            'mp4': {  # MP4/M4A atoms
                'title': '\xa9nam',
                'artist': '\xa9ART',
                'album': '\xa9alb',
                'albumartist': 'aART',
                'date': '\xa9day',
                'year': '\xa9day',
                'genre': '\xa9gen',
                'track': 'trkn',
                'disc': 'disk',
                'composer': '\xa9wrt'
            },
            'asf': {  # WMA
                'title': 'Title',
                'artist': 'Author',
                'album': 'WM/AlbumTitle',
                'albumartist': 'WM/AlbumArtist',
                'date': 'WM/Year',
                'year': 'WM/Year',
                'genre': 'WM/Genre',
                'track': 'WM/TrackNumber',
                'disc': 'WM/PartOfSet',
                'composer': 'WM/Composer'
            },
            'wav': {  # WAV uses ID3v2 tags in Mutagen
                'title': 'TIT2',
                'artist': 'TPE1',
                'album': 'TALB',
                'albumartist': 'TPE2',
                'date': 'TDRC',
                'year': 'TDRC',
                'genre': 'TCON',
                'track': 'TRCK',
                'disc': 'TPOS',
                'composer': 'TCOM'
            },
            'wavpack': {  # WavPack uses APEv2 tags
                'title': 'Title',
                'artist': 'Artist',
                'album': 'Album',
                'albumartist': 'AlbumArtist',
                'date': 'Date',
                'year': 'Year',
                'genre': 'Genre',
                'track': 'Track',
                'disc': 'Disc',
                'composer': 'Composer'
            }
        }
    
    def _is_valid_field(self, field_id: str, field_value: Any) -> bool:
        """Check if field should be sent to frontend"""
        
        # Field ID validation
        if len(field_id) > 50:
            logger.warning(f"Skipping field with excessive ID length ({len(field_id)}): {field_id[:50]}...")
            return False
        
        if '\x00' in str(field_id):
            logger.warning(f"Skipping field with null byte in ID: {field_id[:50]}...")
            return False
        
        # Field value validation - only block actual binary data
        try:
            # Attempt to work with the value as text
            if isinstance(field_value, bytes):
                # Try to decode as UTF-8
                field_value.decode('utf-8')
            else:
                # Ensure it can be converted to string
                str(field_value)
            
            return True
            
        except Exception as e:
            logger.debug(f"Skipping field {field_id}: binary data that cannot be decoded as text")
            return False
    
    def normalize_composer_text(self, composer_text: str) -> str:
        """
        Normalize composer text for cross-platform compatibility
        Handles Unicode normalization and full-width character replacement
        """
        if not composer_text:
            return composer_text

        # Normalize to NFC form using unicodedata
        normalized = unicodedata.normalize('NFC', composer_text)
        
        # Replace full-width Unicode characters
        replacements = {
            '：': ':', '？': '?', '｜': '|', 
            '＊': '*', '＂': '"', '／': '/',
            '＼': '\\', '＜': '<', '＞': '>',
            '．': '.', '，': ',', '；': ';'
        }
        
        for bad, good in replacements.items():
            normalized = normalized.replace(bad, good)
        
        return normalized.strip()
    
    def detect_format(self, filepath: str) -> Tuple[Optional[File], str]:
        """
        Detect file format and return Mutagen file object
        
        Returns:
            Tuple of (Mutagen File object, format string)
        """
        try:
            audio_file = File(filepath)
            if audio_file is None:
                raise Exception("Unsupported file format")
            
            # Determine format type
            format_map = {
                MP3: 'mp3',
                OggVorbis: 'ogg',
                OggOpus: 'ogg',  # We use 'ogg' for both Vorbis and Opus
                FLAC: 'flac',
                MP4: 'mp4',
                ASF: 'asf',
                WavPack: 'wavpack',
                WAVE: 'wav'
            }
            
            format_type = 'unknown'
            for file_type, format_name in format_map.items():
                if isinstance(audio_file, file_type):
                    format_type = format_name
                    break
            
            return audio_file, format_type
            
        except Exception as e:
            logger.error(f"Error detecting format for {filepath}: {e}")
            return None, 'unknown'
    
    def read_metadata(self, filepath: str) -> Dict[str, Any]:
        """
        Read metadata from audio file using Mutagen
        
        Returns:
            Dictionary with normalized metadata
        """
        audio_file, format_type = self.detect_format(filepath)
        if audio_file is None:
            raise Exception("Could not read file with Mutagen")
        
        metadata = {
            'title': '',
            'artist': '',
            'album': '',
            'albumartist': '',
            'date': '',
            'genre': '',
            'track': '',
            'disc': '',
            'composer': '',
            'format': format_type  # Include format information
        }
        
        # Get the appropriate tag mapping
        tag_map = self.tag_mappings.get(format_type, {})
        
        # Special handling for different formats
        if isinstance(audio_file, MP3):
            # MP3 uses ID3 tags
            for field, tag_name in tag_map.items():
                if tag_name in audio_file:
                    value = str(audio_file[tag_name][0]) if audio_file[tag_name] else ''
                    metadata[field] = value
        
        elif isinstance(audio_file, (OggVorbis, OggOpus, FLAC)):
            # These use Vorbis comments
            for field, tag_name in tag_map.items():
                if format_type == 'flac':
                    # FLAC uses lowercase
                    tag_name = tag_name.lower()
                if tag_name in audio_file:
                    value = audio_file[tag_name]
                    # Vorbis comments can be lists
                    if isinstance(value, list):
                        value = value[0] if value else ''
                    metadata[field] = str(value)
        
        elif isinstance(audio_file, MP4):
            # MP4 uses atoms
            for field, atom in tag_map.items():
                if atom in audio_file:
                    value = audio_file[atom]
                    if isinstance(value, list):
                        value = value[0]
                    # Special handling for track/disc tuples
                    if field in ['track', 'disc'] and isinstance(value, tuple):
                        value = str(value[0]) if value[0] else ''
                    metadata[field] = str(value)
        
        elif isinstance(audio_file, ASF):
            # WMA/ASF
            for field, tag_name in tag_map.items():
                if tag_name in audio_file:
                    value = audio_file[tag_name]
                    if isinstance(value, list):
                        value = value[0]
                    metadata[field] = str(value.value) if hasattr(value, 'value') else str(value)
        
        elif isinstance(audio_file, WAVE):
            # WAV uses ID3 tags in Mutagen
            if hasattr(audio_file, 'tags') and audio_file.tags:
                for field, tag_name in tag_map.items():
                    if tag_name in audio_file.tags:
                        tag = audio_file.tags[tag_name]
                        if hasattr(tag, 'text'):
                            # ID3 text frames
                            metadata[field] = str(tag.text[0]) if tag.text else ''
                        else:
                            metadata[field] = str(tag[0]) if tag else ''
        
        elif isinstance(audio_file, WavPack):
            # WavPack uses APEv2 tags
            for field, tag_name in tag_map.items():
                if tag_name in audio_file:
                    value = audio_file[tag_name]
                    # APEv2 tags can be lists
                    if isinstance(value, list):
                        value = value[0] if value else ''
                    metadata[field] = str(value)
        
        return metadata
    
    def read_existing_metadata(self, filepath: str) -> Dict[str, Any]:
        """
        Read only existing metadata fields from audio file using Mutagen
        
        Returns:
            Dictionary with only existing metadata fields (no empty defaults)
        """
        audio_file, format_type = self.detect_format(filepath)
        if audio_file is None:
            raise Exception("Could not read file with Mutagen")
        
        metadata = {
            'format': format_type  # Include format information
        }
        
        # Get the appropriate tag mapping
        tag_map = self.tag_mappings.get(format_type, {})
        
        # Special handling for different formats
        if isinstance(audio_file, MP3):
            # MP3 uses ID3 tags
            for field, tag_name in tag_map.items():
                if tag_name in audio_file:
                    value = str(audio_file[tag_name][0]) if audio_file[tag_name] else ''
                    if value:  # Only include non-empty values
                        metadata[field] = value
        
        elif isinstance(audio_file, (OggVorbis, OggOpus, FLAC)):
            # These use Vorbis comments
            for field, tag_name in tag_map.items():
                if format_type == 'flac':
                    # FLAC uses lowercase
                    tag_name = tag_name.lower()
                if tag_name in audio_file:
                    value = audio_file[tag_name]
                    # Vorbis comments can be lists
                    if isinstance(value, list):
                        value = value[0] if value else ''
                    if value:  # Only include non-empty values
                        metadata[field] = str(value)
        
        elif isinstance(audio_file, MP4):
            # MP4 uses atoms
            for field, atom in tag_map.items():
                if atom in audio_file:
                    value = audio_file[atom]
                    if isinstance(value, list):
                        value = value[0]
                    # Special handling for track/disc tuples
                    if field in ['track', 'disc'] and isinstance(value, tuple):
                        value = str(value[0]) if value[0] else ''
                    if value:  # Only include non-empty values
                        metadata[field] = str(value)
        
        elif isinstance(audio_file, ASF):
            # WMA/ASF
            for field, tag_name in tag_map.items():
                if tag_name in audio_file:
                    value = audio_file[tag_name]
                    if isinstance(value, list):
                        value = value[0]
                    value_str = str(value.value) if hasattr(value, 'value') else str(value)
                    if value_str:  # Only include non-empty values
                        metadata[field] = value_str
        
        elif isinstance(audio_file, WAVE):
            # WAV uses ID3 tags in Mutagen
            if hasattr(audio_file, 'tags') and audio_file.tags:
                for field, tag_name in tag_map.items():
                    if tag_name in audio_file.tags:
                        tag = audio_file.tags[tag_name]
                        if hasattr(tag, 'text'):
                            # ID3 text frames
                            value = str(tag.text[0]) if tag.text else ''
                        else:
                            value = str(tag[0]) if tag else ''
                        if value:  # Only include non-empty values
                            metadata[field] = value
        
        elif isinstance(audio_file, WavPack):
            # WavPack uses APEv2 tags
            for field, tag_name in tag_map.items():
                if tag_name in audio_file:
                    value = audio_file[tag_name]
                    # APEv2 tags can be lists
                    if isinstance(value, list):
                        value = value[0] if value else ''
                    if value:  # Only include non-empty values
                        metadata[field] = str(value)
        
        return metadata
    
    def write_metadata(self, filepath: str, metadata: Dict[str, str], 
                      preserve_other_tags: bool = True) -> None:
        """
        Write metadata to audio file using Mutagen
        
        Args:
            filepath: Path to audio file
            metadata: Dictionary of metadata to write
            preserve_other_tags: Whether to preserve existing tags not in metadata dict
        """
        logger.info(f"[write_metadata] Writing metadata to {filepath}")
        logger.info(f"[write_metadata] Metadata to write: {metadata}")
        
        audio_file, format_type = self.detect_format(filepath)
        if audio_file is None:
            raise Exception("Could not open file with Mutagen")
        
        logger.info(f"[write_metadata] File format: {format_type}")
        logger.info(f"[write_metadata] Existing tags: {list(audio_file.tags.keys()) if audio_file.tags else 'No tags'}")
        
        # Get the appropriate tag mapping
        tag_map = self.tag_mappings.get(format_type, {})
        
        # Separate standard fields from custom fields
        standard_fields = {}
        custom_fields = {}
        
        for field, value in metadata.items():
            if field in tag_map:
                standard_fields[field] = value
            else:
                # This is a custom field
                custom_fields[field] = value
        
        logger.info(f"[write_metadata] Standard fields: {standard_fields}")
        logger.info(f"[write_metadata] Custom fields: {custom_fields}")
        
        # Special handling for different formats
        if isinstance(audio_file, MP3):
            # Initialize ID3 tags if needed
            if audio_file.tags is None:
                audio_file.add_tags()
            
            # Update standard tags
            for field, value in standard_fields.items():
                if field in ['art', 'removeArt']:
                    continue
                
                tag_name = tag_map.get(field)
                if not tag_name:
                    continue
                
                logger.info(f"[write_metadata] Processing standard field '{field}' -> tag '{tag_name}' with value: '{value}'")
                
                # Normalize composer text
                if field == 'composer' and value:
                    value = self.normalize_composer_text(value)
                
                # Handle empty values by deleting the frame
                if not value:
                    logger.info(f"[write_metadata] Field '{field}' has empty value, checking if tag '{tag_name}' exists")
                    if tag_name in audio_file.tags:
                        logger.info(f"[write_metadata] Deleting existing tag '{tag_name}'")
                        del audio_file.tags[tag_name]
                    else:
                        logger.info(f"[write_metadata] Tag '{tag_name}' doesn't exist, nothing to delete")
                    continue
                
                # Create appropriate ID3 frames
                logger.info(f"[write_metadata] Creating/updating tag '{tag_name}' for field '{field}'")
                if tag_name == 'TPE1':
                    audio_file.tags[tag_name] = TPE1(encoding=3, text=value)
                elif tag_name == 'TPE2':
                    audio_file.tags[tag_name] = TPE2(encoding=3, text=value)
                elif tag_name == 'TIT2':
                    audio_file.tags[tag_name] = TIT2(encoding=3, text=value)
                elif tag_name == 'TALB':
                    audio_file.tags[tag_name] = TALB(encoding=3, text=value)
                elif tag_name == 'TDRC':
                    audio_file.tags[tag_name] = TDRC(encoding=3, text=value)
                elif tag_name == 'TCON':
                    audio_file.tags[tag_name] = TCON(encoding=3, text=value)
                elif tag_name == 'TRCK':
                    audio_file.tags[tag_name] = TRCK(encoding=3, text=value)
                elif tag_name == 'TPOS':
                    audio_file.tags[tag_name] = TPOS(encoding=3, text=value)
                elif tag_name == 'TCOM':
                    audio_file.tags[tag_name] = TCOM(encoding=3, text=value)
            
            # Handle custom fields using TXXX frames
            for field, value in custom_fields.items():
                if field in ['art', 'removeArt']:
                    continue
                    
                # Create TXXX frame key
                txxx_key = f'TXXX:{field}'
                
                if value:
                    # Add or update TXXX frame
                    audio_file.tags[txxx_key] = TXXX(
                        encoding=3,  # UTF-8
                        desc=field,
                        text=[value]
                    )
                else:
                    # Remove field if empty value
                    if txxx_key in audio_file.tags:
                        del audio_file.tags[txxx_key]
        
        elif isinstance(audio_file, (OggVorbis, OggOpus, FLAC)):
            # Vorbis comments - handle standard fields
            for field, value in standard_fields.items():
                if field in ['art', 'removeArt']:
                    continue
                
                tag_name = tag_map.get(field)
                if not tag_name:
                    continue
                
                # FLAC uses lowercase
                if isinstance(audio_file, FLAC):
                    tag_name = tag_name.lower()
                
                # Normalize composer text
                if field == 'composer' and value:
                    value = self.normalize_composer_text(value)
                
                if value:
                    audio_file[tag_name] = value
                else:
                    # Delete tag when empty value is explicitly provided
                    if tag_name in audio_file:
                        del audio_file[tag_name]
            
            # Handle custom fields - Vorbis comments are flexible
            for field, value in custom_fields.items():
                if field in ['art', 'removeArt']:
                    continue
                
                # Use uppercase for consistency
                field_key = field.upper()
                
                if value:
                    audio_file[field_key] = value
                else:
                    # Remove field if empty value
                    if field_key in audio_file:
                        del audio_file[field_key]
        
        elif isinstance(audio_file, MP4):
            # MP4 atoms - handle standard fields
            for field, value in standard_fields.items():
                if field in ['art', 'removeArt']:
                    continue
                
                atom = tag_map.get(field)
                if not atom:
                    continue
                
                # Normalize composer text
                if field == 'composer' and value:
                    value = self.normalize_composer_text(value)
                
                # Handle empty values by deleting the atom
                if not value:
                    if atom in audio_file:
                        del audio_file[atom]
                    continue
                
                # Special handling for track/disc
                if field == 'track':
                    try:
                        track_num = int(value.split('/')[0])
                        total = int(value.split('/')[1]) if '/' in value else 0
                        audio_file[atom] = [(track_num, total)]
                    except:
                        audio_file[atom] = [value]
                elif field == 'disc':
                    try:
                        disc_num = int(value.split('/')[0])
                        total = int(value.split('/')[1]) if '/' in value else 0
                        audio_file[atom] = [(disc_num, total)]
                    except:
                        audio_file[atom] = [value]
                else:
                    audio_file[atom] = [value]
            
            # Handle custom fields using freeform atoms
            for field, value in custom_fields.items():
                if field in ['art', 'removeArt']:
                    continue
                
                # Use freeform atoms for custom fields
                key = f"----:com.apple.iTunes:{field}"
                
                if value:
                    # MP4 freeform atoms store bytes
                    audio_file[key] = [value.encode('utf-8')]
                else:
                    # Remove field if empty value
                    if key in audio_file:
                        del audio_file[key]
        
        elif isinstance(audio_file, ASF):
            # WMA/ASF - handle standard fields
            for field, value in standard_fields.items():
                if field in ['art', 'removeArt']:
                    continue
                
                tag_name = tag_map.get(field)
                if not tag_name:
                    continue
                
                # Normalize composer text
                if field == 'composer' and value:
                    value = self.normalize_composer_text(value)
                
                if value:
                    audio_file[tag_name] = value
                else:
                    # Delete tag when empty value is explicitly provided
                    if tag_name in audio_file:
                        del audio_file[tag_name]
            
            # Handle custom fields - ASF uses WM/ prefix for extended attributes
            for field, value in custom_fields.items():
                if field in ['art', 'removeArt']:
                    continue
                
                # ASF uses WM/ prefix for extended attributes
                field_key = f"WM/{field}" if not field.startswith('WM/') else field
                
                if value:
                    audio_file[field_key] = value
                else:
                    # Remove field if empty value
                    if field_key in audio_file:
                        del audio_file[field_key]
        
        elif isinstance(audio_file, WAVE):
            # WAV uses ID3 tags in Mutagen
            if audio_file.tags is None:
                audio_file.add_tags()
            
            # WAV files use ID3 tags, so handle them like MP3 - standard fields
            for field, value in standard_fields.items():
                if field in ['art', 'removeArt']:
                    continue
                
                tag_name = tag_map.get(field)
                if not tag_name:
                    continue
                
                # Normalize composer text
                if field == 'composer' and value:
                    value = self.normalize_composer_text(value)
                
                # Handle empty values by deleting the frame
                if not value:
                    if tag_name in audio_file.tags:
                        del audio_file.tags[tag_name]
                    continue
                
                # Create appropriate ID3 frames (same as MP3)
                if tag_name == 'TPE1':
                    audio_file.tags[tag_name] = TPE1(encoding=3, text=value)
                elif tag_name == 'TPE2':
                    audio_file.tags[tag_name] = TPE2(encoding=3, text=value)
                elif tag_name == 'TIT2':
                    audio_file.tags[tag_name] = TIT2(encoding=3, text=value)
                elif tag_name == 'TALB':
                    audio_file.tags[tag_name] = TALB(encoding=3, text=value)
                elif tag_name == 'TDRC':
                    audio_file.tags[tag_name] = TDRC(encoding=3, text=value)
                elif tag_name == 'TCON':
                    audio_file.tags[tag_name] = TCON(encoding=3, text=value)
                elif tag_name == 'TRCK':
                    audio_file.tags[tag_name] = TRCK(encoding=3, text=value)
                elif tag_name == 'TPOS':
                    audio_file.tags[tag_name] = TPOS(encoding=3, text=value)
                elif tag_name == 'TCOM':
                    audio_file.tags[tag_name] = TCOM(encoding=3, text=value)
            
            # Handle custom fields using TXXX frames (same as MP3)
            for field, value in custom_fields.items():
                if field in ['art', 'removeArt']:
                    continue
                    
                # Create TXXX frame key
                txxx_key = f'TXXX:{field}'
                
                if value:
                    # Add or update TXXX frame
                    audio_file.tags[txxx_key] = TXXX(
                        encoding=3,  # UTF-8
                        desc=field,
                        text=[value]
                    )
                else:
                    # Remove field if empty value
                    if txxx_key in audio_file.tags:
                        del audio_file.tags[txxx_key]
        
        elif isinstance(audio_file, WavPack):
            # WavPack uses APEv2 tags - handle standard fields
            for field, value in standard_fields.items():
                if field in ['art', 'removeArt']:
                    continue
                
                tag_name = tag_map.get(field)
                if not tag_name:
                    continue
                
                # Normalize composer text
                if field == 'composer' and value:
                    value = self.normalize_composer_text(value)
                
                if value:
                    audio_file[tag_name] = value
                else:
                    # Delete tag when empty value is explicitly provided
                    if tag_name in audio_file:
                        del audio_file[tag_name]
            
            # Handle custom fields - APEv2 tags are straightforward
            for field, value in custom_fields.items():
                if field in ['art', 'removeArt']:
                    continue
                
                if value:
                    audio_file[field] = value
                else:
                    # Remove field if empty value
                    if field in audio_file:
                        del audio_file[field]
        
        # Save the file
        logger.info(f"[write_metadata] Saving file with updated metadata")
        audio_file.save()
        logger.info(f"[write_metadata] File saved successfully")
    
    def get_album_art(self, filepath: str) -> Optional[str]:
        """
        Extract album art from audio file
        
        Returns:
            Base64-encoded image data or None
        """
        audio_file, format_type = self.detect_format(filepath)
        if audio_file is None:
            return None
        
        try:
            if isinstance(audio_file, MP3):
                # Look for APIC frames
                for key in audio_file.tags.keys():
                    if key.startswith('APIC'):
                        apic = audio_file.tags[key]
                        return base64.b64encode(apic.data).decode('utf-8')
            
            elif isinstance(audio_file, (OggVorbis, OggOpus)):
                # Check for METADATA_BLOCK_PICTURE
                if 'METADATA_BLOCK_PICTURE' in audio_file:
                    # It's already base64 encoded in the file
                    picture_data = audio_file['METADATA_BLOCK_PICTURE'][0]
                    # Decode the base64 METADATA_BLOCK_PICTURE
                    try:
                        picture_block = base64.b64decode(picture_data)
                        # Parse the picture block to get the actual image data
                        pic_type, mime_type, image_data = self._parse_flac_picture_block(picture_block)
                        return base64.b64encode(image_data).decode('utf-8')
                    except:
                        logger.warning("Failed to parse METADATA_BLOCK_PICTURE")
                        return None
            
            elif isinstance(audio_file, FLAC):
                # FLAC stores pictures differently
                if audio_file.pictures:
                    return base64.b64encode(audio_file.pictures[0].data).decode('utf-8')
            
            elif isinstance(audio_file, MP4):
                # MP4 cover art
                if 'covr' in audio_file:
                    covers = audio_file['covr']
                    if covers:
                        return base64.b64encode(bytes(covers[0])).decode('utf-8')
            
            elif isinstance(audio_file, ASF):
                # WMA album art
                for key in audio_file.keys():
                    if 'WM/Picture' in key:
                        picture = audio_file[key][0]
                        if hasattr(picture, 'value'):
                            # Skip the picture type and description to get to the actual data
                            # WM/Picture format is complex, might need adjustment
                            return base64.b64encode(picture.value).decode('utf-8')
            
            elif isinstance(audio_file, (WAVE, WavPack)):
                # WAV and WavPack don't support embedded album art
                return None
            
        except Exception as e:
            logger.error(f"Error extracting album art: {e}")
        
        return None
    
    def write_album_art(self, filepath: str, art_data: str, mime_type: str = None) -> None:
        """
        Write album art to audio file
        
        Args:
            filepath: Path to audio file
            art_data: Base64-encoded image data (may include data URI prefix)
            mime_type: MIME type of the image (will be detected if not provided)
        """
        audio_file, format_type = self.detect_format(filepath)
        if audio_file is None:
            raise Exception("Could not open file with Mutagen")
        
        # Check if format supports album art
        base_format = os.path.splitext(filepath)[1].lstrip('.')
        if base_format in FORMAT_METADATA_CONFIG.get('no_embedded_art', []):
            logger.warning(f"Format {base_format} does not support embedded album art")
            return
        
        # Decode the image data
        if ',' in art_data:
            # Remove data URI prefix
            image_data = base64.b64decode(art_data.split(',')[1])
        else:
            image_data = base64.b64decode(art_data)
        
        # Detect MIME type if not provided
        if not mime_type:
            mime_type = self._detect_mime_type(image_data)
        
        if isinstance(audio_file, MP3):
            # Remove existing APIC frames
            audio_file.tags.delall('APIC')
            # Add new APIC frame
            audio_file.tags.add(
                APIC(
                    encoding=3,  # UTF-8
                    mime=mime_type,
                    type=PictureType.COVER_FRONT,
                    desc='Cover',
                    data=image_data
                )
            )
        
        elif isinstance(audio_file, (OggVorbis, OggOpus)):
            # Create METADATA_BLOCK_PICTURE
            picture_block = self._create_flac_picture_block(
                image_data, mime_type, pic_type=3, description=""
            )
            # Encode to base64 and set
            audio_file['METADATA_BLOCK_PICTURE'] = [base64.b64encode(picture_block).decode('ascii')]
        
        elif isinstance(audio_file, FLAC):
            # Clear existing pictures
            audio_file.clear_pictures()
            # Create and add picture
            picture = Picture()
            picture.type = PictureType.COVER_FRONT
            picture.mime = mime_type
            picture.desc = 'Cover'
            picture.data = image_data
            audio_file.add_picture(picture)
        
        elif isinstance(audio_file, MP4):
            # Determine format based on MIME type
            if mime_type == 'image/jpeg':
                cover_format = MP4Cover.FORMAT_JPEG
            elif mime_type == 'image/png':
                cover_format = MP4Cover.FORMAT_PNG
            else:
                cover_format = MP4Cover.FORMAT_JPEG  # Default
            
            audio_file['covr'] = [MP4Cover(image_data, imageformat=cover_format)]
        
        elif isinstance(audio_file, ASF):
            # WMA is more complex, might need specialized handling
            # For now, log a warning
            logger.warning("WMA album art writing is not fully implemented yet")
            return
        
        elif isinstance(audio_file, (WAVE, WavPack)):
            # WAV and WavPack don't support embedded album art
            logger.warning(f"{type(audio_file).__name__} format does not support embedded album art")
            return
        
        # Save the file
        audio_file.save()
    
    def remove_album_art(self, filepath: str) -> None:
        """Remove all album art from audio file"""
        audio_file, format_type = self.detect_format(filepath)
        if audio_file is None:
            raise Exception("Could not open file with Mutagen")
        
        if isinstance(audio_file, MP3):
            # Remove all APIC frames
            audio_file.tags.delall('APIC')
        
        elif isinstance(audio_file, (OggVorbis, OggOpus)):
            # Remove METADATA_BLOCK_PICTURE
            if 'METADATA_BLOCK_PICTURE' in audio_file:
                del audio_file['METADATA_BLOCK_PICTURE']
        
        elif isinstance(audio_file, FLAC):
            # Clear all pictures
            audio_file.clear_pictures()
        
        elif isinstance(audio_file, MP4):
            # Remove cover atom
            if 'covr' in audio_file:
                del audio_file['covr']
        
        elif isinstance(audio_file, ASF):
            # Remove WM/Picture tags
            keys_to_remove = [k for k in audio_file.keys() if 'WM/Picture' in k]
            for key in keys_to_remove:
                del audio_file[key]
        
        elif isinstance(audio_file, (WAVE, WavPack)):
            # WAV and WavPack don't support embedded album art
            pass
        
        # Save the file
        audio_file.save()
    
    def _detect_mime_type(self, image_data: bytes) -> str:
        """Detect MIME type from image data"""
        if image_data[:2] == b'\xff\xd8':
            return 'image/jpeg'
        elif image_data[:8] == b'\x89PNG\r\n\x1a\n':
            return 'image/png'
        elif image_data[:4] == b'GIF8':
            return 'image/gif'
        elif image_data[:4] == b'RIFF' and image_data[8:12] == b'WEBP':
            return 'image/webp'
        else:
            return 'image/jpeg'  # Default
    
    def _create_flac_picture_block(self, image_data: bytes, mime_type: str,
                                  pic_type: int = 3, description: str = "") -> bytes:
        """
        Create FLAC METADATA_BLOCK_PICTURE structure
        Used for OGG Vorbis/Opus and FLAC
        """
        import struct
        
        # Encode strings
        mime_bytes = mime_type.encode('utf-8')
        desc_bytes = description.encode('utf-8')
        
        # Build the picture block
        data = bytearray()
        
        # Picture type (32-bit big-endian)
        data.extend(struct.pack('>I', pic_type))
        
        # MIME type length and string
        data.extend(struct.pack('>I', len(mime_bytes)))
        data.extend(mime_bytes)
        
        # Description length and string
        data.extend(struct.pack('>I', len(desc_bytes)))
        data.extend(desc_bytes)
        
        # Width, Height, Color depth, Colors used (all 0)
        data.extend(struct.pack('>IIII', 0, 0, 0, 0))
        
        # Picture data length and data
        data.extend(struct.pack('>I', len(image_data)))
        data.extend(image_data)
        
        return bytes(data)
    
    def _parse_flac_picture_block(self, data: bytes) -> Tuple[int, str, bytes]:
        """Parse FLAC METADATA_BLOCK_PICTURE structure"""
        import struct
        
        if len(data) < 32:
            raise ValueError("Invalid picture block: too short")
        
        offset = 0
        
        # Picture type
        pic_type = struct.unpack('>I', data[offset:offset+4])[0]
        offset += 4
        
        # MIME type length and string
        mime_len = struct.unpack('>I', data[offset:offset+4])[0]
        offset += 4
        mime_type = data[offset:offset+mime_len].decode('utf-8', errors='replace')
        offset += mime_len
        
        # Description length and string
        desc_len = struct.unpack('>I', data[offset:offset+4])[0]
        offset += 4
        offset += desc_len  # Skip description
        
        # Skip dimensions (4 x 4 bytes)
        offset += 16
        
        # Picture data length and data
        pic_len = struct.unpack('>I', data[offset:offset+4])[0]
        offset += 4
        pic_data = data[offset:offset+pic_len]
        
        return pic_type, mime_type, pic_data
    
    def discover_all_metadata(self, filepath: str) -> Dict[str, Dict[str, Any]]:
        """
        Discover ALL metadata fields from an audio file.
        
        Returns a dictionary with field information including:
        - field_name: The metadata field identifier
        - display_name: Human-readable field name
        - value: The field value (or indicator for unmanageable content)
        - is_editable: Whether the field can be edited
        - field_type: 'text', 'binary', 'oversized'
        """
        try:
            audio_file, format_type = self.detect_format(filepath)
            if audio_file is None:
                logger.error(f"Could not read file: {filepath}")
                return {}
            
            discovered_fields = {}
            
            # Handle different format types
            if isinstance(audio_file, MP3):
                if hasattr(audio_file, 'tags') and audio_file.tags:
                    discovered_fields = self._discover_id3_fields(audio_file.tags)
            elif isinstance(audio_file, (FLAC, OggVorbis, OggOpus)):
                discovered_fields = self._discover_vorbis_fields(audio_file)
            elif isinstance(audio_file, MP4):
                discovered_fields = self._discover_mp4_fields(audio_file)
            elif isinstance(audio_file, ASF):
                discovered_fields = self._discover_asf_fields(audio_file)
            elif isinstance(audio_file, WavPack):
                discovered_fields = self._discover_apev2_fields(audio_file)
            elif isinstance(audio_file, WAVE):
                if hasattr(audio_file, 'tags') and audio_file.tags:
                    discovered_fields = self._discover_id3_fields(audio_file.tags)
            
            return discovered_fields
            
        except Exception as e:
            logger.error(f"Error discovering metadata for {filepath}: {e}")
            return {}
    
    def _discover_id3_fields(self, tags) -> Dict[str, Dict[str, Any]]:
        """Discover all ID3 frames"""
        fields = {}
        
        # Define standard ID3 frame IDs that should be excluded
        standard_frame_ids = {'TIT2', 'TPE1', 'TALB', 'TPE2', 'TDRC', 'TCON', 'TRCK', 'TPOS', 'TCOM'}
        
        for frame_id, frame in tags.items():
            # Skip standard fields to avoid duplicates
            if frame_id in standard_frame_ids:
                continue
            
            # Skip APIC frames (album art) since they're handled separately
            if frame_id.startswith('APIC'):
                continue
                
            field_info = {
                'field_name': frame_id,
                'display_name': self._get_id3_display_name(frame_id),
                'is_editable': True,
                'field_type': 'text'
            }
            
            # Handle different frame types
            if hasattr(frame, 'text'):
                text_value = str(frame.text[0]) if frame.text else ''
                if len(text_value) > 200:
                    field_info['value'] = 'Unsupported Content type'
                    field_info['is_editable'] = False
                    field_info['field_type'] = 'oversized'
                else:
                    field_info['value'] = text_value
            elif frame_id.startswith('APIC') or hasattr(frame, 'data'):
                field_info['value'] = 'Unsupported Content type'
                field_info['is_editable'] = False
                field_info['field_type'] = 'binary'
            elif frame_id.startswith('TXXX:'):
                # Handle TXXX frames specially
                if hasattr(frame, 'text'):
                    text_value = str(frame.text[0]) if frame.text else ''
                    if len(text_value) > 200:
                        field_info['value'] = 'Unsupported Content type'
                        field_info['is_editable'] = False
                        field_info['field_type'] = 'oversized'
                    else:
                        field_info['value'] = text_value
                else:
                    field_info['value'] = str(frame)
            else:
                field_info['value'] = str(frame)
            
            # Validate before adding
            if not self._is_valid_field(frame_id, field_info.get('value', '')):
                continue
                
            fields[frame_id] = field_info
        
        return fields
    
    def _discover_vorbis_fields(self, audio_file) -> Dict[str, Dict[str, Any]]:
        """Discover all Vorbis comment fields"""
        fields = {}
        
        # Define standard Vorbis field names that should be excluded (case-insensitive)
        standard_field_names = {
            'title', 'artist', 'album', 'albumartist', 'date', 'genre', 
            'tracknumber', 'discnumber', 'composer',
            # Also check uppercase versions
            'TITLE', 'ARTIST', 'ALBUM', 'ALBUMARTIST', 'DATE', 'GENRE',
            'TRACKNUMBER', 'DISCNUMBER', 'COMPOSER'
        }
        
        for field_name, value in audio_file.items():
            # Debug logging
            logger.debug(f"Processing Vorbis field: {field_name!r} (type: {type(field_name).__name__})")
            
            # Skip standard fields to avoid duplicates
            if field_name in standard_field_names:
                logger.debug(f"  -> Skipping standard field: {field_name}")
                continue
            
            # Skip album art field
            if field_name == 'METADATA_BLOCK_PICTURE':
                logger.debug(f"  -> Skipping METADATA_BLOCK_PICTURE field")
                continue
            
            # Additional check for case variations
            if field_name.upper() == 'METADATA_BLOCK_PICTURE':
                logger.debug(f"  -> Skipping field {field_name} (case variation of METADATA_BLOCK_PICTURE)")
                continue
                
            field_info = {
                'field_name': field_name,
                'display_name': field_name.title().replace('_', ' '),
                'is_editable': True,
                'field_type': 'text'
            }
            
            # Vorbis comments can be lists
            if isinstance(value, list):
                text_value = str(value[0]) if value else ''
            else:
                text_value = str(value)
            
            if len(text_value) > 200:
                field_info['value'] = 'Unsupported Content type'
                field_info['is_editable'] = False
                field_info['field_type'] = 'oversized'
            else:
                field_info['value'] = text_value
            
            # Validate before adding
            if not self._is_valid_field(field_name, field_info.get('value', '')):
                continue
            
            fields[field_name] = field_info
            logger.debug(f"  -> Added field {field_name} to extended fields")
        
        logger.debug(f"Total Vorbis extended fields discovered: {list(fields.keys())}")
        return fields
    
    def _discover_mp4_fields(self, audio_file) -> Dict[str, Dict[str, Any]]:
        """Discover all MP4 atom fields"""
        fields = {}
        
        # Define standard MP4 atoms that should be excluded
        standard_atoms = {'\xa9nam', '\xa9ART', '\xa9alb', 'aART', '\xa9day', '\xa9gen', 'trkn', 'disk', '\xa9wrt'}
        
        for atom, value in audio_file.items():
            # Skip standard fields to avoid duplicates
            if atom in standard_atoms:
                continue
            
            # Skip album art atom
            if atom == 'covr':
                continue
                
            field_info = {
                'field_name': atom,
                'display_name': self._get_mp4_display_name(atom),
                'is_editable': True,
                'field_type': 'text'
            }
            
            # Handle different value types
            if isinstance(value, list) and value:
                if isinstance(value[0], tuple):
                    # Track/disc numbers
                    field_info['value'] = str(value[0][0]) if value[0][0] else ''
                elif isinstance(value[0], bytes):
                    # Binary data or text
                    try:
                        text_value = value[0].decode('utf-8')
                        if len(text_value) > 200:
                            field_info['value'] = 'Unsupported Content type'
                            field_info['is_editable'] = False
                            field_info['field_type'] = 'oversized'
                        else:
                            field_info['value'] = text_value
                    except:
                        field_info['value'] = 'Unsupported Content type'
                        field_info['is_editable'] = False
                        field_info['field_type'] = 'binary'
                else:
                    text_value = str(value[0])
                    if len(text_value) > 200:
                        field_info['value'] = 'Unsupported Content type'
                        field_info['is_editable'] = False
                        field_info['field_type'] = 'oversized'
                    else:
                        field_info['value'] = text_value
            else:
                field_info['value'] = str(value)
            
            # Validate before adding
            if not self._is_valid_field(atom, field_info.get('value', '')):
                continue
            
            fields[atom] = field_info
        
        return fields
    
    def _discover_asf_fields(self, audio_file) -> Dict[str, Dict[str, Any]]:
        """Discover all ASF/WMA fields"""
        fields = {}
        
        # Define standard ASF field names that should be excluded
        standard_field_names = {
            'Title', 'Author', 'WM/AlbumTitle', 'WM/AlbumArtist', 
            'WM/Year', 'WM/Genre', 'WM/TrackNumber', 'WM/PartOfSet', 'WM/Composer'
        }
        
        for field_name, value in audio_file.items():
            # Skip standard fields to avoid duplicates
            if field_name in standard_field_names:
                continue
            
            # Skip album art fields
            if 'Picture' in field_name:
                continue
                
            field_info = {
                'field_name': field_name,
                'display_name': field_name.replace('WM/', '').replace('_', ' ').title(),
                'is_editable': True,
                'field_type': 'text'
            }
            
            # Handle ASF value types
            if isinstance(value, list) and value:
                text_value = str(value[0].value) if hasattr(value[0], 'value') else str(value[0])
            else:
                text_value = str(value.value) if hasattr(value, 'value') else str(value)
            
            if len(text_value) > 200:
                field_info['value'] = 'Unsupported Content type'
                field_info['is_editable'] = False
                field_info['field_type'] = 'oversized'
            else:
                field_info['value'] = text_value
            
            # Validate before adding
            if not self._is_valid_field(field_name, field_info.get('value', '')):
                continue
            
            fields[field_name] = field_info
        
        return fields
    
    def _discover_apev2_fields(self, audio_file) -> Dict[str, Dict[str, Any]]:
        """Discover all APEv2 fields"""
        fields = {}
        
        # Define standard APEv2 field names that should be excluded
        standard_field_names = {
            'Title', 'Artist', 'Album', 'AlbumArtist', 'Date', 
            'Year', 'Genre', 'Track', 'Disc', 'Composer'
        }
        
        for field_name, value in audio_file.items():
            # Skip standard fields to avoid duplicates
            if field_name in standard_field_names:
                continue
                
            field_info = {
                'field_name': field_name,
                'display_name': field_name.title().replace('_', ' '),
                'is_editable': True,
                'field_type': 'text'
            }
            
            # APEv2 tags can be lists
            if isinstance(value, list):
                text_value = str(value[0]) if value else ''
            else:
                text_value = str(value)
            
            if len(text_value) > 200:
                field_info['value'] = 'Unsupported Content type'
                field_info['is_editable'] = False
                field_info['field_type'] = 'oversized'
            else:
                field_info['value'] = text_value
            
            # Validate before adding
            if not self._is_valid_field(field_name, field_info.get('value', '')):
                continue
            
            fields[field_name] = field_info
        
        return fields
    
    def _get_id3_display_name(self, frame_id: str) -> str:
        """Convert ID3 frame IDs to human-readable names"""
        # Map common ID3 frames to display names
        id3_display_names = {
            'TIT2': 'Title',
            'TPE1': 'Artist',
            'TALB': 'Album',
            'TPE2': 'Album Artist',
            'TCOM': 'Composer',
            'TCON': 'Genre',
            'TDRC': 'Year',
            'TRCK': 'Track #',
            'TPOS': 'Disc #',
            'TBPM': 'BPM',
            'TKEY': 'Key',
            'TMOO': 'Mood',
            'TMED': 'Media Type',
            'TCOP': 'Copyright',
            'TPUB': 'Publisher',
            'TENC': 'Encoded By',
            'TEXT': 'Lyricist',
            'TOLY': 'Original Lyricist',
            'TOPE': 'Original Artist',
            'TOAL': 'Original Album',
            'TSRC': 'ISRC',
            'TIT1': 'Content Group',
            'TIT3': 'Subtitle',
            'TLAN': 'Language',
            'TCMP': 'Compilation',
            'TSOA': 'Album Sort Order',
            'TSOP': 'Performer Sort Order',
            'TSOT': 'Title Sort Order',
            'TSST': 'Set Subtitle',
            'TSSE': 'Encoding Software',
            'APIC': 'Album Art',
            'COMM': 'Comment',
            'USLT': 'Lyrics',
            'POPM': 'Popularimeter',
            'PCNT': 'Play Count',
            'WOAR': 'Artist URL',
            'WOAS': 'Source URL',
            'WORS': 'Internet Radio URL',
            'WPAY': 'Payment URL',
            'WPUB': 'Publisher URL'
        }
        
        # For TXXX frames, extract description
        if frame_id.startswith('TXXX:'):
            return frame_id[5:]  # Remove 'TXXX:' prefix
        
        return id3_display_names.get(frame_id, frame_id)
    
    def _get_mp4_display_name(self, atom: str) -> str:
        """Convert MP4 atoms to human-readable names"""
        mp4_display_names = {
            '\xa9nam': 'Title',
            '\xa9ART': 'Artist',
            '\xa9alb': 'Album',
            'aART': 'Album Artist',
            '\xa9wrt': 'Composer',
            '\xa9gen': 'Genre',
            '\xa9day': 'Year',
            'trkn': 'Track #',
            'disk': 'Disc #',
            '\xa9cmt': 'Comment',
            '\xa9too': 'Encoding Tool',
            'cprt': 'Copyright',
            '\xa9grp': 'Grouping',
            'tmpo': 'BPM',
            '\xa9lyr': 'Lyrics',
            'covr': 'Album Art',
            'cpil': 'Compilation',
            'pgap': 'Gapless Playback',
            'pcst': 'Podcast',
            'desc': 'Description',
            'ldes': 'Long Description',
            'tvsh': 'TV Show',
            'tven': 'TV Episode ID',
            'tves': 'TV Episode',
            'tvsn': 'TV Season',
            'purd': 'Purchase Date',
            'rtng': 'Rating'
        }
        
        # Handle freeform atoms
        if atom.startswith('----:'):
            parts = atom.split(':')
            if len(parts) >= 3:
                return parts[2]  # Return the actual field name
        
        return mp4_display_names.get(atom, atom)
    
    def write_custom_field(self, filepath: str, field_name: str, field_value: str) -> bool:
        """
        Write a custom field to an audio file using appropriate format-specific method.
        
        Args:
            filepath: Path to the audio file
            field_name: Name of the custom field
            field_value: Value to write
            
        Returns:
            True if successful, False otherwise
        """
        try:
            audio_file, format_type = self.detect_format(filepath)
            if audio_file is None:
                raise ValueError("Unsupported file format")
            
            # Determine format and use appropriate method
            if isinstance(audio_file, MP3):
                return self._write_custom_id3_field(filepath, field_name, field_value)
            elif isinstance(audio_file, (FLAC, OggVorbis, OggOpus)):
                return self._write_custom_vorbis_field(audio_file, field_name, field_value)
            elif isinstance(audio_file, MP4):
                return self._write_custom_mp4_field(audio_file, field_name, field_value)
            elif isinstance(audio_file, ASF):
                return self._write_custom_asf_field(audio_file, field_name, field_value)
            elif isinstance(audio_file, WavPack):
                return self._write_custom_apev2_field(audio_file, field_name, field_value)
            elif isinstance(audio_file, WAVE):
                return self._write_custom_id3_field(filepath, field_name, field_value)
            else:
                logger.error(f"Unsupported format for custom fields: {type(audio_file)}")
                return False
                
        except Exception as e:
            logger.error(f"Error writing custom field to {filepath}: {e}")
            return False
    
    def _write_custom_id3_field(self, filepath: str, field_name: str, field_value: str) -> bool:
        """Write custom TXXX frame to MP3/WAV"""
        try:
            # Try to load existing tags
            try:
                tags = ID3(filepath)
            except ID3NoHeaderError:
                # Create new ID3 tags if none exist
                tags = ID3()
            
            # Create TXXX frame key
            txxx_key = f'TXXX:{field_name}'
            
            if field_value:
                # Add or update TXXX frame for custom fields
                tags[txxx_key] = TXXX(
                    encoding=3,  # UTF-8
                    desc=field_name,
                    text=[field_value]
                )
            else:
                # Remove field if empty value
                if txxx_key in tags:
                    del tags[txxx_key]
            
            tags.save(filepath)
            return True
            
        except Exception as e:
            logger.error(f"Error writing custom ID3 field: {e}")
            return False
    
    def _write_custom_vorbis_field(self, audio_file, field_name: str, field_value: str) -> bool:
        """Write custom field to FLAC/OGG"""
        try:
            # Vorbis comments are flexible - just add the field
            # Use uppercase for consistency
            field_key = field_name.upper()
            
            if field_value:
                audio_file[field_key] = field_value
            else:
                # Remove field if empty value
                if field_key in audio_file:
                    del audio_file[field_key]
            
            audio_file.save()
            return True
            
        except Exception as e:
            logger.error(f"Error writing custom Vorbis field: {e}")
            return False
    
    def _write_custom_mp4_field(self, audio_file, field_name: str, field_value: str) -> bool:
        """Write custom freeform atom to MP4"""
        try:
            # Use freeform atoms for custom fields
            # Format: ----:mean:name where mean is usually com.apple.iTunes
            key = f"----:com.apple.iTunes:{field_name}"
            
            if field_value:
                # MP4 freeform atoms store bytes
                audio_file[key] = [field_value.encode('utf-8')]
            else:
                # Remove field if empty value
                if key in audio_file:
                    del audio_file[key]
            
            audio_file.save()
            return True
            
        except Exception as e:
            logger.error(f"Error writing custom MP4 field: {e}")
            return False
    
    def _write_custom_asf_field(self, audio_file, field_name: str, field_value: str) -> bool:
        """Write custom field to ASF/WMA"""
        try:
            # ASF uses WM/ prefix for extended attributes
            field_key = f"WM/{field_name}" if not field_name.startswith('WM/') else field_name
            
            if field_value:
                audio_file[field_key] = field_value
            else:
                # Remove field if empty value
                if field_key in audio_file:
                    del audio_file[field_key]
            
            audio_file.save()
            return True
            
        except Exception as e:
            logger.error(f"Error writing custom ASF field: {e}")
            return False
    
    def _write_custom_apev2_field(self, audio_file, field_name: str, field_value: str) -> bool:
        """Write custom field to APEv2 (WavPack)"""
        try:
            # APEv2 tags are straightforward
            if field_value:
                audio_file[field_name] = field_value
            else:
                # Remove field if empty value
                if field_name in audio_file:
                    del audio_file[field_name]
            
            audio_file.save()
            return True
            
        except Exception as e:
            logger.error(f"Error writing custom APEv2 field: {e}")
            return False
    
    def delete_field(self, filepath: str, field_id: str) -> bool:
        """
        Delete a metadata field from an audio file
        
        Args:
            filepath: Path to audio file
            field_id: Field ID to delete (e.g., 'title', 'TXXX:RATING', etc.)
        
        Returns:
            bool: True if successful
        """
        try:
            audio_file, format_type = self.detect_format(filepath)
            if audio_file is None:
                logger.error("Could not open file with Mutagen")
                return False
            
            # Get the appropriate tag mapping for standard fields
            tag_map = self.tag_mappings.get(format_type, {})
            
            # Check if it's a standard field
            if field_id in tag_map:
                tag_name = tag_map[field_id]
                
                if isinstance(audio_file, MP3):
                    if tag_name in audio_file.tags:
                        del audio_file.tags[tag_name]
                elif isinstance(audio_file, (OggVorbis, OggOpus, FLAC)):
                    # For Vorbis comments
                    if format_type == 'flac':
                        tag_name = tag_name.lower()
                    if tag_name in audio_file:
                        del audio_file[tag_name]
                elif isinstance(audio_file, MP4):
                    if tag_name in audio_file:
                        del audio_file[tag_name]
                elif isinstance(audio_file, ASF):
                    if tag_name in audio_file:
                        del audio_file[tag_name]
                elif isinstance(audio_file, WAVE):
                    if hasattr(audio_file, 'tags') and audio_file.tags and tag_name in audio_file.tags:
                        del audio_file.tags[tag_name]
                elif isinstance(audio_file, WavPack):
                    if tag_name in audio_file:
                        del audio_file[tag_name]
            else:
                # Custom field - use the field_id directly
                if isinstance(audio_file, MP3):
                    if field_id in audio_file.tags:
                        del audio_file.tags[field_id]
                elif isinstance(audio_file, (OggVorbis, OggOpus, FLAC, WavPack)):
                    if field_id in audio_file:
                        del audio_file[field_id]
                elif isinstance(audio_file, MP4):
                    if field_id in audio_file:
                        del audio_file[field_id]
                elif isinstance(audio_file, ASF):
                    if field_id in audio_file:
                        del audio_file[field_id]
                elif isinstance(audio_file, WAVE):
                    if hasattr(audio_file, 'tags') and audio_file.tags and field_id in audio_file.tags:
                        del audio_file.tags[field_id]
            
            # Save the file
            audio_file.save()
            return True
            
        except Exception as e:
            logger.error(f"Error deleting field {field_id}: {e}")
            return False
    
    def get_all_fields(self, filepath: str) -> Dict[str, Dict[str, Any]]:
        """Alias for discover_all_metadata for backward compatibility"""
        return self.discover_all_metadata(filepath)


# Global instance
mutagen_handler = MutagenHandler()
