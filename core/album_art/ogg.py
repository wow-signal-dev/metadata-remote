"""
OGG/Opus Album Art Handler for Metadata Remote
Handles METADATA_BLOCK_PICTURE format for OGG and OPUS files
"""
import subprocess
import base64
import struct
import os
import tempfile
import logging
from typing import Optional, Tuple

from config import logger
from core.file_utils import get_file_format, fix_file_ownership
from core.metadata.ffmpeg import run_ffprobe

class OggAlbumArtHandler:
    """Handles album art for OGG/Opus files using METADATA_BLOCK_PICTURE format"""
    
    def __init__(self):
        # Pre-compiled struct formats for performance
        self._struct_formats = {
            'uint32': struct.Struct('>I'),  # Big-endian unsigned int
        }
    
    def detect_codec(self, filepath: str) -> str:
        """
        Detect whether OGG file uses Vorbis or Opus codec
        
        Args:
            filepath: Path to the OGG file
            
        Returns:
            str: 'vorbis' or 'opus'
        """
        try:
            probe_data = run_ffprobe(filepath)
            streams = probe_data.get('streams', [])
            
            for stream in streams:
                if stream.get('codec_type') == 'audio':
                    codec_name = stream.get('codec_name', '').lower()
                    if codec_name in ['vorbis', 'opus']:
                        return codec_name
            
            # Default to vorbis if not detected
            return 'vorbis'
        except:
            return 'vorbis'
    
    def extract_album_art(self, filepath: str) -> Optional[str]:
        """
        Extract album art from OGG/Opus file
        
        Args:
            filepath: Path to the OGG file
            
        Returns:
            Base64-encoded image data or None
        """
        try:
            probe_data = run_ffprobe(filepath)
            
            # Check both format and stream levels for METADATA_BLOCK_PICTURE
            # First check format level
            format_tags = probe_data.get('format', {}).get('tags', {})
            for key, value in format_tags.items():
                if key.upper() == 'METADATA_BLOCK_PICTURE':
                    try:
                        binary_data = base64.b64decode(value)
                        pic_type, mime_type, pic_data = self._parse_picture_block(binary_data)
                        return base64.b64encode(pic_data).decode('utf-8')
                    except Exception as e:
                        logger.warning(f"Failed to parse METADATA_BLOCK_PICTURE from format tags: {e}")
            
            # Then check stream level
            for stream in probe_data.get('streams', []):
                if stream.get('codec_type') == 'audio':
                    stream_tags = stream.get('tags', {})
                    for key, value in stream_tags.items():
                        if key.upper() == 'METADATA_BLOCK_PICTURE':
                            try:
                                binary_data = base64.b64decode(value)
                                pic_type, mime_type, pic_data = self._parse_picture_block(binary_data)
                                return base64.b64encode(pic_data).decode('utf-8')
                            except Exception as e:
                                logger.warning(f"Failed to parse METADATA_BLOCK_PICTURE from stream tags: {e}")
            
            # Fallback: Try to extract from video streams (legacy OGG files with MJPEG)
            for stream in probe_data.get('streams', []):
                if stream.get('codec_type') == 'video':
                    try:
                        return self._extract_from_video_stream(filepath)
                    except Exception as e:
                        logger.warning(f"Failed to extract from video stream: {e}")
            
            return None
            
        except Exception as e:
            logger.error(f"Error extracting album art from OGG file: {e}")
            return None
    
    def _parse_picture_block(self, data: bytes) -> Tuple[int, str, bytes]:
        """
        Parse METADATA_BLOCK_PICTURE binary data
        
        Args:
            data: Binary picture block data
            
        Returns:
            Tuple of (picture_type, mime_type, picture_data)
        """
        if len(data) < 32:
            raise ValueError("Invalid picture block: too short")
        
        offset = 0
        
        # Picture type (4 bytes, big-endian)
        pic_type = self._struct_formats['uint32'].unpack_from(data, offset)[0]
        offset += 4
        
        # MIME type length (4 bytes, big-endian)
        mime_len = self._struct_formats['uint32'].unpack_from(data, offset)[0]
        offset += 4
        
        # MIME type string
        mime_end = offset + mime_len
        if mime_end > len(data):
            raise ValueError("Invalid picture block: MIME length exceeds data")
        
        mime_type = data[offset:mime_end].decode('utf-8', errors='replace')
        offset = mime_end
        
        # Description length (4 bytes, big-endian)
        desc_len = self._struct_formats['uint32'].unpack_from(data, offset)[0]
        offset += 4
        
        # Skip description
        offset += desc_len
        
        # Skip dimensions (4 x 4 bytes: width, height, color depth, colors used)
        offset += 16
        
        # Picture data length (4 bytes, big-endian)
        pic_len = self._struct_formats['uint32'].unpack_from(data, offset)[0]
        offset += 4
        
        # Picture data
        pic_end = offset + pic_len
        if pic_end > len(data):
            raise ValueError("Invalid picture block: picture length exceeds data")
        
        pic_data = data[offset:pic_end]
        
        return pic_type, mime_type, pic_data
    
    def _create_picture_block(self, image_data: bytes, mime_type: str, 
                             pic_type: int = 3, description: str = "") -> bytes:
        """
        Create METADATA_BLOCK_PICTURE binary data
        
        Args:
            image_data: Raw image bytes
            mime_type: MIME type (e.g., 'image/jpeg')
            pic_type: Picture type (3 = front cover)
            description: Description text
            
        Returns:
            Binary picture block data
        """
        # Encode strings
        mime_bytes = mime_type.encode('utf-8')
        desc_bytes = description.encode('utf-8')
        
        # Calculate total size
        total_size = (
            4 +  # picture type
            4 + len(mime_bytes) +  # MIME type length + data
            4 + len(desc_bytes) +  # description length + data
            16 +  # dimensions (4 x 4 bytes)
            4 + len(image_data)  # picture data length + data
        )
        
        # Create buffer
        data = bytearray(total_size)
        offset = 0
        
        # Picture type (4 bytes, big-endian)
        self._struct_formats['uint32'].pack_into(data, offset, pic_type)
        offset += 4
        
        # MIME type length and data
        self._struct_formats['uint32'].pack_into(data, offset, len(mime_bytes))
        offset += 4
        data[offset:offset + len(mime_bytes)] = mime_bytes
        offset += len(mime_bytes)
        
        # Description length and data
        self._struct_formats['uint32'].pack_into(data, offset, len(desc_bytes))
        offset += 4
        data[offset:offset + len(desc_bytes)] = desc_bytes
        offset += len(desc_bytes)
        
        # Dimensions (width, height, color depth, colors used)
        # Use 0 for all as we don't have this info
        for _ in range(4):
            self._struct_formats['uint32'].pack_into(data, offset, 0)
            offset += 4
        
        # Picture data length and data
        self._struct_formats['uint32'].pack_into(data, offset, len(image_data))
        offset += 4
        data[offset:offset + len(image_data)] = image_data
        
        return bytes(data)
    
    def _extract_from_video_stream(self, filepath: str) -> Optional[str]:
        """
        Extract album art from video stream in OGG file (legacy support)
        
        Args:
            filepath: Path to the OGG file
            
        Returns:
            Base64-encoded image data or None
        """
        try:
            # Use ffmpeg to extract the video stream as image data
            cmd = [
                'ffmpeg', '-i', filepath, '-an', '-vcodec', 'copy', 
                '-f', 'image2pipe', '-'
            ]
            
            result = subprocess.run(cmd, capture_output=True, timeout=10)
            
            if result.returncode == 0 and result.stdout:
                # Return base64-encoded image data
                return base64.b64encode(result.stdout).decode('utf-8')
            else:
                logger.debug(f"Failed to extract video stream from {filepath}: {result.stderr.decode('utf-8', errors='ignore')}")
                return None
                
        except subprocess.TimeoutExpired:
            logger.warning(f"Timeout extracting video stream from {filepath}")
            return None
        except Exception as e:
            logger.warning(f"Error extracting video stream from {filepath}: {e}")
            return None
    
    def embed_album_art(self, filepath: str, art_data: str, remove_art: bool = False) -> bool:
        """
        Embed or remove album art in OGG/Opus file
        
        Args:
            filepath: Path to the OGG file
            art_data: Base64-encoded image data (with or without data URI prefix)
            remove_art: Whether to remove album art instead
            
        Returns:
            bool: Success status
        """
        if remove_art:
            # Simply copy without album art metadata
            return self._remove_album_art(filepath)
        
        if not art_data:
            return False
        
        try:
            # Detect codec
            codec = self.detect_codec(filepath)
            
            # Decode image data
            if ',' in art_data:
                # Remove data URI prefix if present
                image_data = base64.b64decode(art_data.split(',')[1])
            else:
                image_data = base64.b64decode(art_data)
            
            # Detect MIME type from image data
            mime_type = self._detect_mime_type(image_data)
            
            # Create METADATA_BLOCK_PICTURE
            picture_block = self._create_picture_block(image_data, mime_type)
            picture_b64 = base64.b64encode(picture_block).decode('ascii')
            
            # Create temp file
            output_format, _, _ = get_file_format(filepath)
            ext = os.path.splitext(filepath)[1]
            fd, temp_file = tempfile.mkstemp(suffix=ext, dir=os.path.dirname(filepath))
            os.close(fd)
            
            try:
                # Build ffmpeg command
                cmd = [
                    'ffmpeg', '-i', filepath, '-y',
                    '-c', 'copy',  # No re-encoding
                    '-map', '0',   # Copy all streams
                ]
                
                # Add metadata based on codec
                if codec == 'opus':
                    cmd.extend(['-metadata:s:a:0', f'METADATA_BLOCK_PICTURE={picture_b64}'])
                else:
                    cmd.extend(['-metadata', f'METADATA_BLOCK_PICTURE={picture_b64}'])
                
                cmd.extend(['-f', output_format, temp_file])
                
                # Execute
                result = subprocess.run(cmd, capture_output=True, timeout=30)
                
                if result.returncode == 0:
                    # Replace original file
                    os.replace(temp_file, filepath)
                    fix_file_ownership(filepath)
                    return True
                else:
                    logger.error(f"FFmpeg failed: {result.stderr.decode('utf-8', errors='ignore')}")
                    return False
                    
            finally:
                # Cleanup
                if os.path.exists(temp_file):
                    os.remove(temp_file)
                    
        except Exception as e:
            logger.error(f"Error embedding album art in OGG file: {e}")
            return False
    
    def _remove_album_art(self, filepath: str) -> bool:
        """Remove album art from OGG/Opus file"""
        try:
            codec = self.detect_codec(filepath)
            output_format, _, _ = get_file_format(filepath)
            ext = os.path.splitext(filepath)[1]
            fd, temp_file = tempfile.mkstemp(suffix=ext, dir=os.path.dirname(filepath))
            os.close(fd)
            
            try:
                # Copy without METADATA_BLOCK_PICTURE
                cmd = [
                    'ffmpeg', '-i', filepath, '-y',
                    '-c', 'copy',
                    '-map', '0',
                ]
                
                # Must handle both codec types for removal
                if codec == 'opus':
                    cmd.extend(['-metadata:s:a:0', 'METADATA_BLOCK_PICTURE='])
                else:
                    cmd.extend(['-metadata', 'METADATA_BLOCK_PICTURE='])
                
                cmd.extend(['-f', output_format, temp_file])
                
                result = subprocess.run(cmd, capture_output=True, timeout=30)
                
                if result.returncode == 0:
                    os.replace(temp_file, filepath)
                    fix_file_ownership(filepath)
                    return True
                else:
                    return False
                    
            finally:
                if os.path.exists(temp_file):
                    os.remove(temp_file)
                    
        except Exception as e:
            logger.error(f"Error removing album art from OGG file: {e}")
            return False
    
    def _detect_mime_type(self, image_data: bytes) -> str:
        """Detect MIME type from image data"""
        # Check magic bytes
        if image_data[:2] == b'\xff\xd8':
            return 'image/jpeg'
        elif image_data[:8] == b'\x89PNG\r\n\x1a\n':
            return 'image/png'
        elif image_data[:4] == b'GIF8':
            return 'image/gif'
        elif image_data[:4] == b'RIFF' and image_data[8:12] == b'WEBP':
            return 'image/webp'
        else:
            # Default to JPEG
            return 'image/jpeg'
    
    def has_album_art(self, filepath: str) -> bool:
        """
        Check if OGG/Opus file has album art (for corruption detection)
        
        Returns:
            bool: True if album art exists
        """
        try:
            probe_data = run_ffprobe(filepath)
            
            # Check for METADATA_BLOCK_PICTURE in tags
            for location in ['format', 'streams']:
                if location == 'format' and 'format' in probe_data:
                    tags = probe_data['format'].get('tags', {})
                elif location == 'streams':
                    for stream in probe_data.get('streams', []):
                        if stream.get('codec_type') == 'audio':
                            tags = stream.get('tags', {})
                            break
                        else:
                            continue
                else:
                    continue
                
                for key in tags.keys():
                    if key.upper() == 'METADATA_BLOCK_PICTURE':
                        return True
            
            # Also check for video streams (though this is less reliable for OGG)
            for stream in probe_data.get('streams', []):
                if stream.get('codec_type') == 'video':
                    return True
            
            return False
            
        except:
            return False

# Global instance for reuse
ogg_album_art_handler = OggAlbumArtHandler()