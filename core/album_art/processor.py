"""
Album art processing and corruption handling for Metadata Remote
Handles detection and repair of corrupted album artwork
"""
import subprocess
import os
import tempfile
import logging

from config import logger
from core.file_utils import get_file_format, fix_file_ownership
from core.metadata.ffmpeg import run_ffprobe
from core.album_art.extractor import extract_album_art

def detect_corrupted_album_art(filepath):
    """Detect if album art in the file is corrupted"""
    try:
        # Get file format
        _, _, base_format = get_file_format(filepath)
        
        # Special handling for OGG/Opus files
        if base_format in ['ogg', 'opus']:
            from core.album_art.ogg import ogg_album_art_handler
            
            # Try to extract album art - if it fails, it's corrupted
            try:
                art_data = ogg_album_art_handler.extract_album_art(filepath)
                
                # Check if extraction was successful
                if art_data:
                    # Successfully extracted - not corrupted
                    return False
                
                # No art data extracted, but check if art exists
                has_art = ogg_album_art_handler.has_album_art(filepath)
                if not has_art:
                    # No art at all - not corrupted
                    return False
                
                # Art exists but couldn't be extracted - check if it's truly corrupted
                # by trying a more aggressive extraction method
                probe_data = run_ffprobe(filepath)
                for stream in probe_data.get('streams', []):
                    if stream.get('codec_type') == 'video':
                        # Try basic ffmpeg extraction to test if video stream is readable
                        try:
                            test_cmd = ['ffmpeg', '-i', filepath, '-an', '-f', 'null', '-']
                            result = subprocess.run(test_cmd, capture_output=True, timeout=5)
                            if result.returncode == 0:
                                # Video stream is readable - not corrupted
                                return False
                        except:
                            pass
                
                # If we get here, art exists but extraction failed - likely corrupted
                return True
                
            except Exception as e:
                logger.warning(f"Error checking OGG corruption for {filepath}: {e}")
                # If there's art but extraction fails, it might be corrupted
                return ogg_album_art_handler.has_album_art(filepath)
        
        # Rest of existing code for other formats...
        # First, try to run ffprobe normally
        probe_data = run_ffprobe(filepath)
        
        # Also try to extract art and see if FFmpeg complains
        art_cmd = ['ffmpeg', '-i', filepath, '-an', '-vcodec', 'copy', '-f', 'image2pipe', '-']
        # Remove text=True - we're dealing with binary data!
        result = subprocess.run(art_cmd, capture_output=True, timeout=5)
        
        # Check for various corruption indicators
        corruption_indicators = [
            "Invalid PNG signature",
            "Could not find codec parameters",
            "dimensions not set",
            "Invalid data found when processing input",
            "Error while decoding stream",
            "Invalid pixel format",
            "Invalid image size",
            "Truncated or corrupted",
        ]
        
        # Check stderr for corruption indicators - decode it properly
        if result.stderr:
            stderr_text = result.stderr.decode('utf-8', errors='ignore')
            for indicator in corruption_indicators:
                if indicator in stderr_text:
                    logger.info(f"Detected corruption indicator: {indicator}")
                    return True
        
        # Check if FFmpeg failed to extract art but there is a video stream
        streams = probe_data.get('streams', [])
        has_video_stream = any(s.get('codec_type') == 'video' for s in streams)
        
        if has_video_stream and result.returncode != 0:
            # There's supposed to be art but extraction failed
            return True
            
        # Check for specific metadata inconsistencies
        for stream in streams:
            if stream.get('codec_type') == 'video':
                width = stream.get('width', 0)
                height = stream.get('height', 0)
                codec_name = stream.get('codec_name', '')
                
                # Invalid dimensions
                if width == 0 or height == 0:
                    return True
                
                # Suspiciously large dimensions (probably corrupted)
                if width > 10000 or height > 10000:
                    return True
                    
        return False
        
    except subprocess.TimeoutExpired:
        # If ffmpeg hangs, that's also a sign of corruption
        logger.warning(f"FFmpeg timed out checking {filepath} - likely corrupted")
        return True
    except Exception as e:
        logger.error(f"Error checking for corrupted art: {e}")
        return False

def fix_corrupted_album_art(filepath):
    """Extract and re-embed album art to fix corruption"""
    try:
        # Get file format
        _, _, base_format = get_file_format(filepath)
        
        # Special handling for OGG/Opus files
        if base_format in ['ogg', 'opus']:
            from core.album_art.ogg import ogg_album_art_handler
            
            # Try to extract existing art
            try:
                existing_art = ogg_album_art_handler.extract_album_art(filepath)
                if existing_art:
                    # Remove and re-embed the art using proper OGG handling
                    if ogg_album_art_handler.embed_album_art(filepath, existing_art, remove_art=True):
                        if ogg_album_art_handler.embed_album_art(filepath, existing_art):
                            logger.info(f"Successfully fixed corrupted album art in OGG file {filepath}")
                            return True
                else:
                    # No extractable art, just remove any corrupted art
                    if ogg_album_art_handler.embed_album_art(filepath, None, remove_art=True):
                        logger.info(f"Removed corrupted album art from OGG file {filepath}")
                        return True
            except Exception as e:
                logger.error(f"Error fixing OGG album art: {e}")
                # Try to remove any corrupted art as fallback
                try:
                    if ogg_album_art_handler.embed_album_art(filepath, None, remove_art=True):
                        logger.info(f"Removed corrupted album art from OGG file {filepath}")
                        return True
                except:
                    pass
            return False
        
        # Original code for other formats follows...
        # Step 1: Try multiple methods to extract the image data
        image_data = None
        image_format = None
        
        # Method 1: Try to extract as-is (might work despite corruption)
        art_cmd = ['ffmpeg', '-i', filepath, '-an', '-vcodec', 'copy', '-f', 'image2pipe', '-']
        result = subprocess.run(art_cmd, capture_output=True, timeout=5)
        
        if result.returncode == 0 and result.stdout:
            image_data = result.stdout
            # Try to detect format from magic bytes
            if image_data[:2] == b'\xff\xd8':
                image_format = 'jpeg'
            elif image_data[:8] == b'\x89PNG\r\n\x1a\n':
                image_format = 'png'
            elif image_data[:4] == b'RIFF' and image_data[8:12] == b'WEBP':
                image_format = 'webp'
            else:
                # Default to JPEG if we can't determine
                image_format = 'jpeg'
        
        # Method 2: If that failed, try to decode and re-encode
        if not image_data:
            decode_cmd = [
                'ffmpeg', '-i', filepath, '-an', '-vframes', '1',
                '-f', 'image2pipe', '-vcodec', 'mjpeg', '-'
            ]
            result = subprocess.run(decode_cmd, capture_output=True, timeout=5)
            
            if result.returncode == 0 and result.stdout:
                image_data = result.stdout
                image_format = 'jpeg'
        
        # Method 3: If still no luck, try to extract with error concealment
        if not image_data:
            concealment_cmd = [
                'ffmpeg', '-err_detect', 'ignore_err', '-i', filepath,
                '-an', '-vframes', '1', '-f', 'image2pipe', '-vcodec', 'mjpeg', '-'
            ]
            result = subprocess.run(concealment_cmd, capture_output=True, timeout=5)
            
            if result.returncode == 0 and result.stdout:
                image_data = result.stdout
                image_format = 'jpeg'
        
        # If we couldn't extract any image data, we'll need to remove the art
        if not image_data:
            logger.warning(f"Could not extract any valid image data from {filepath}")
            # Strip the corrupted art stream
            output_format, _, _ = get_file_format(filepath)
            ext = os.path.splitext(filepath)[1]
            fd, temp_file = tempfile.mkstemp(suffix=ext, dir=os.path.dirname(filepath))
            os.close(fd)
            
            strip_cmd = [
                'ffmpeg', '-i', filepath, '-y',
                '-map', '0:a', '-codec', 'copy', '-f', output_format,
                temp_file
            ]
            
            result = subprocess.run(strip_cmd, capture_output=True, text=True)
            if result.returncode == 0:
                os.replace(temp_file, filepath)
                fix_file_ownership(filepath)
                return True
            else:
                if os.path.exists(temp_file):
                    os.remove(temp_file)
                return False
        
        # Step 2: Create a clean file without album art
        output_format, _, _ = get_file_format(filepath)
        ext = os.path.splitext(filepath)[1]
        fd, temp_file = tempfile.mkstemp(suffix=ext, dir=os.path.dirname(filepath))
        os.close(fd)
        
        try:
            # Strip all video streams
            strip_cmd = [
                'ffmpeg', '-i', filepath, '-y',
                '-map', '0:a', '-codec', 'copy', '-f', output_format,
                temp_file
            ]
            
            result = subprocess.run(strip_cmd, capture_output=True, text=True)
            if result.returncode != 0:
                raise Exception(f"Failed to strip art: {result.stderr}")
            
            # Step 3: Save the extracted image to a temp file
            image_ext = '.jpg' if image_format == 'jpeg' else f'.{image_format}'
            fd2, temp_art_file = tempfile.mkstemp(suffix=image_ext)
            with os.fdopen(fd2, 'wb') as f:
                f.write(image_data)
            
            # Step 4: Re-embed the art properly
            fd3, final_file = tempfile.mkstemp(suffix=ext, dir=os.path.dirname(filepath))
            os.close(fd3)
            
            # Use appropriate codec based on detected format
            video_codec = 'mjpeg' if image_format == 'jpeg' else 'png'
            
            embed_cmd = [
                'ffmpeg', '-i', temp_file, '-i', temp_art_file, '-y',
                '-map', '0:a', '-map', '1', '-c:v', video_codec,
                '-disposition:v', 'attached_pic', '-codec:a', 'copy',
                '-f', output_format, final_file
            ]
            
            result = subprocess.run(embed_cmd, capture_output=True, text=True)
            if result.returncode != 0:
                raise Exception(f"Failed to embed art: {result.stderr}")
            
            # Replace original file
            os.replace(final_file, filepath)
            fix_file_ownership(filepath)
            
            # Cleanup
            os.remove(temp_file)
            os.remove(temp_art_file)
            
            logger.info(f"Successfully fixed corrupted album art in {filepath} (format: {image_format})")
            return True
            
        except Exception as e:
            # Cleanup on error
            if os.path.exists(temp_file):
                os.remove(temp_file)
            if 'temp_art_file' in locals() and os.path.exists(temp_art_file):
                os.remove(temp_art_file)
            if 'final_file' in locals() and os.path.exists(final_file):
                os.remove(final_file)
            raise
            
    except subprocess.TimeoutExpired:
        logger.error(f"Timeout while fixing corrupted album art in {filepath}")
        return False
    except Exception as e:
        logger.error(f"Error fixing corrupted album art: {e}")
        return False
