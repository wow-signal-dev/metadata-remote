
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
from mutagen.id3 import ID3, APIC, TPE1, TPE2, TIT2, TALB, TDRC, TCON, TRCK, TPOS, TCOM
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
            'composer': ''
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
    
    def write_metadata(self, filepath: str, metadata: Dict[str, str], 
                      preserve_other_tags: bool = True) -> None:
        """
        Write metadata to audio file using Mutagen
        
        Args:
            filepath: Path to audio file
            metadata: Dictionary of metadata to write
            preserve_other_tags: Whether to preserve existing tags not in metadata dict
        """
        audio_file, format_type = self.detect_format(filepath)
        if audio_file is None:
            raise Exception("Could not open file with Mutagen")
        
        # Get the appropriate tag mapping
        tag_map = self.tag_mappings.get(format_type, {})
        
        # Special handling for different formats
        if isinstance(audio_file, MP3):
            # Initialize ID3 tags if needed
            if audio_file.tags is None:
                audio_file.add_tags()
            
            # Update tags
            for field, value in metadata.items():
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
                
                # Create appropriate ID3 frames
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
        
        elif isinstance(audio_file, (OggVorbis, OggOpus, FLAC)):
            # Vorbis comments
            for field, value in metadata.items():
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
        
        elif isinstance(audio_file, MP4):
            # MP4 atoms
            for field, value in metadata.items():
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
        
        elif isinstance(audio_file, ASF):
            # WMA/ASF
            for field, value in metadata.items():
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
        
        elif isinstance(audio_file, WAVE):
            # WAV uses ID3 tags in Mutagen
            if audio_file.tags is None:
                audio_file.add_tags()
            
            # WAV files use ID3 tags, so handle them like MP3
            for field, value in metadata.items():
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
        
        elif isinstance(audio_file, WavPack):
            # WavPack uses APEv2 tags
            for field, value in metadata.items():
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
        
        # Save the file
        audio_file.save()
    
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


# Global instance
mutagen_handler = MutagenHandler()
