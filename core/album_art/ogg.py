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
OGG/Opus Album Art Handler for Metadata Remote
Handles METADATA_BLOCK_PICTURE format for OGG and OPUS files using Mutagen
"""
import base64
import logging
from typing import Optional, Tuple

from config import logger
from core.metadata.mutagen_handler import mutagen_handler


class OggAlbumArtHandler:
    """Handles album art for OGG/Opus files using Mutagen"""
    
    def detect_codec(self, filepath: str) -> str:
        """
        Detect whether OGG file uses Vorbis or Opus codec
        
        Args:
            filepath: Path to the OGG file
            
        Returns:
            str: 'vorbis' or 'opus'
        """
        try:
            from mutagen import File
            from mutagen.oggvorbis import OggVorbis
            from mutagen.oggopus import OggOpus
            
            audio_file = File(filepath)
            if isinstance(audio_file, OggOpus):
                return 'opus'
            elif isinstance(audio_file, OggVorbis):
                return 'vorbis'
            else:
                # Default to vorbis if not detected
                return 'vorbis'
        except:
            return 'vorbis'
    
    def extract_album_art(self, filepath: str) -> Optional[str]:
        """
        Extract album art from OGG/Opus file using Mutagen
        
        Args:
            filepath: Path to the OGG file
            
        Returns:
            Base64-encoded image data or None
        """
        try:
            # Use the mutagen handler to get album art
            return mutagen_handler.get_album_art(filepath)
        except Exception as e:
            logger.error(f"Error extracting album art from OGG file: {e}")
            return None
    
    def embed_album_art(self, filepath: str, art_data: str, remove_art: bool = False) -> bool:
        """
        Embed or remove album art in OGG/Opus file using Mutagen
        
        Args:
            filepath: Path to the OGG file
            art_data: Base64-encoded image data (with or without data URI prefix)
            remove_art: Whether to remove album art instead
            
        Returns:
            bool: Success status
        """
        if remove_art:
            try:
                mutagen_handler.remove_album_art(filepath)
                return True
            except Exception as e:
                logger.error(f"Error removing album art from OGG file: {e}")
                return False
        
        if not art_data:
            return False
        
        try:
            mutagen_handler.write_album_art(filepath, art_data)
            return True
        except Exception as e:
            logger.error(f"Error embedding album art in OGG file: {e}")
            return False
    
    def has_album_art(self, filepath: str) -> bool:
        """
        Check if OGG/Opus file has album art
        
        Returns:
            bool: True if album art exists
        """
        try:
            art = mutagen_handler.get_album_art(filepath)
            return art is not None
        except:
            return False
    
    def _detect_mime_type(self, image_data: bytes) -> str:
        """Detect MIME type from image data"""
        return mutagen_handler._detect_mime_type(image_data)


# Global instance for reuse
ogg_album_art_handler = OggAlbumArtHandler()