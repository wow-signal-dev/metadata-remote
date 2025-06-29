"""
Metadata writing operations for Metadata Remote
Handles applying metadata changes to audio files using Mutagen
"""
import os
import subprocess
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
            logger.debug(f"Removing album art from {os.path.basename(filepath)}")
            mutagen_handler.remove_album_art(filepath)
        elif art_data:
            logger.debug(f"Adding album art to {os.path.basename(filepath)}")
            mutagen_handler.write_album_art(filepath, art_data)
        else:
            # For OGG/Opus files, we need to preserve existing album art
            # when only updating text metadata
            if base_format in ['ogg', 'opus']:
                existing_art = mutagen_handler.get_album_art(filepath)
                if existing_art:
                    logger.debug(f"Preserving existing album art for {os.path.basename(filepath)}")
                    # We'll re-write it after updating metadata
                    art_data = existing_art
        
        # Prepare metadata for writing (exclude art-related fields)
        metadata_to_write = {}
        for field, value in new_tags.items():
            if field not in ['art', 'removeArt']:
                metadata_to_write[field] = value
        
        # Write metadata
        if metadata_to_write:
            logger.debug(f"Applying metadata changes to {os.path.basename(filepath)}")
            logger.debug(f"Changed fields: {', '.join(metadata_to_write.keys())}")
            mutagen_handler.write_metadata(filepath, metadata_to_write)
        
        # For OGG/Opus, re-write preserved album art if needed
        if base_format in ['ogg', 'opus'] and art_data and not remove_art and 'art' not in new_tags:
            mutagen_handler.write_album_art(filepath, art_data)
        
        # Fix file ownership
        fix_file_ownership(filepath)
        
        logger.info(f"Successfully updated {os.path.basename(filepath)}")
    
    except Exception as e:
        # If Mutagen fails, fall back to FFmpeg for unsupported formats
        logger.warning(f"Mutagen failed for {filepath}: {e}")
        logger.info("Falling back to FFmpeg...")
        _apply_metadata_with_ffmpeg(filepath, new_tags, art_data, remove_art)


def _apply_metadata_with_ffmpeg(filepath, new_tags, art_data=None, remove_art=False):
    """
    Fallback method using FFmpeg for formats not supported by Mutagen
    
    This is the original implementation kept as a fallback
    """
    import tempfile
    import base64
    from core.metadata.normalizer import get_metadata_field_mapping
    
    # Get file format
    output_format, use_uppercase, base_format = get_file_format(filepath)
    ext = os.path.splitext(filepath)[1]
    
    # Special handling for OGG/Opus files - ALL metadata operations must use this path
    if base_format in ['ogg', 'opus']:
        from core.album_art.ogg import ogg_album_art_handler
        
        # CRITICAL: We need to apply metadata and album art in ONE operation
        # to avoid multiple file rewrites and preserve existing album art
        
        # Create temp file
        fd, temp_file = tempfile.mkstemp(suffix=ext, dir=os.path.dirname(filepath))
        os.close(fd)
        
        try:
            # Detect codec
            codec = 'opus' if base_format == 'opus' else ogg_album_art_handler.detect_codec(filepath)
            
            # Build command - map only audio stream for OGG to avoid codec issues
            cmd = ['ffmpeg', '-i', filepath, '-y', '-c', 'copy', '-map', '0:a']
            
            # Add metadata
            ogg_tag_mapping = {
                'title': 'TITLE',
                'artist': 'ARTIST', 
                'album': 'ALBUM',
                'albumartist': 'album_artist',  # CRITICAL: ffmpeg uses album_artist not ALBUMARTIST
                'date': 'DATE',
                'year': 'DATE',
                'genre': 'GENRE',
                'track': 'TRACKNUMBER',
                'disc': 'DISCNUMBER',
                'composer': 'COMPOSER'
            }
            
            # Fields that need format-level metadata (like Date/Track/Disc)
            format_level_fields = {'date', 'year', 'track', 'disc'}
            
            for field, value in new_tags.items():
                if field in ['art', 'removeArt']:
                    continue
                
                ogg_field = ogg_tag_mapping.get(field, field.upper())
                
                # Use format-level metadata for albumartist, date, track, disc
                # Use stream-level metadata for title, artist, album, genre, composer
                if field in format_level_fields:
                    if value:
                        cmd.extend(['-metadata', f'{ogg_field}={value}'])
                    else:
                        cmd.extend(['-metadata', f'{ogg_field}='])
                else:
                    if value:
                        cmd.extend(['-metadata:s:a:0', f'{ogg_field}={value}'])
                    else:
                        cmd.extend(['-metadata:s:a:0', f'{ogg_field}='])
            
            # Handle album art
            if remove_art:
                # Use stream-specific metadata for both OPUS and OGG Vorbis
                cmd.extend(['-metadata:s:a:0', 'METADATA_BLOCK_PICTURE='])
            elif art_data:
                # Create METADATA_BLOCK_PICTURE
                if ',' in art_data:
                    image_data = base64.b64decode(art_data.split(',')[1])
                else:
                    image_data = base64.b64decode(art_data)
                
                mime_type = ogg_album_art_handler._detect_mime_type(image_data)
                picture_block = ogg_album_art_handler._create_picture_block(image_data, mime_type)
                picture_b64 = base64.b64encode(picture_block).decode('ascii')
                
                # Use stream-specific metadata for both OPUS and OGG Vorbis
                cmd.extend(['-metadata:s:a:0', f'METADATA_BLOCK_PICTURE={picture_b64}'])
            else:
                # CRITICAL FIX: Preserve existing album art when only updating text metadata
                existing_art = ogg_album_art_handler.extract_album_art(filepath)
                if existing_art:
                    # Convert existing art back to METADATA_BLOCK_PICTURE format
                    image_data = base64.b64decode(existing_art)
                    mime_type = ogg_album_art_handler._detect_mime_type(image_data)
                    picture_block = ogg_album_art_handler._create_picture_block(image_data, mime_type)
                    picture_b64 = base64.b64encode(picture_block).decode('ascii')
                    
                    # Use stream-specific metadata for both OPUS and OGG Vorbis
                    cmd.extend(['-metadata:s:a:0', f'METADATA_BLOCK_PICTURE={picture_b64}'])
            
            cmd.extend(['-f', output_format, temp_file])
            
            # Execute
            result = subprocess.run(cmd, capture_output=True, timeout=30)
            
            if result.returncode == 0:
                os.replace(temp_file, filepath)
                fix_file_ownership(filepath)
                logger.info(f"Successfully updated {os.path.basename(filepath)} with FFmpeg")
            else:
                raise Exception(f"FFmpeg failed: {result.stderr}")
                
        finally:
            if os.path.exists(temp_file):
                os.remove(temp_file)
        
        return  # Don't continue to the rest of the function
    
    # Create temp file
    fd, temp_file = tempfile.mkstemp(suffix=ext, dir=os.path.dirname(filepath))
    os.close(fd)
    
    try:
        # Build ffmpeg command
        if art_data:
            # Decode and save art to temp file
            art_bytes = base64.b64decode(art_data.split(',')[1] if ',' in art_data else art_data)
            fd2, temp_art_file = tempfile.mkstemp(suffix='.jpg')
            with os.fdopen(fd2, 'wb') as f:
                f.write(art_bytes)
            
            # Map only audio streams from original file, then add new art
            cmd = [
                'ffmpeg', '-i', filepath, '-i', temp_art_file, '-y',
                '-map', '0:a', '-map', '1', '-c:v', 'mjpeg',
                '-disposition:v', 'attached_pic', '-codec:a', 'copy',
                '-f', output_format
            ]
        elif remove_art:
            cmd = [
                'ffmpeg', '-i', filepath, '-y',
                '-map', '0:a', '-codec', 'copy', '-f', output_format
            ]
        else:
            # For OGG/Opus files, map only audio streams to avoid MJPEG incompatibility
            if base_format in ['ogg', 'opus']:
                cmd = [
                    'ffmpeg', '-i', filepath, '-y',
                    '-map', '0:a', '-codec', 'copy', '-f', output_format
                ]
            else:
                cmd = [
                    'ffmpeg', '-i', filepath, '-y',
                    '-map', '0', '-codec', 'copy', '-f', output_format
                ]
        
        # Add only the metadata fields we're changing
        # Get proper field names based on format
        field_mapping = get_metadata_field_mapping(use_uppercase, base_format)
        
        # Special handling for WAV format
        if base_format == 'wav':
            # WAV uses INFO tags with specific names
            wav_tag_mapping = {
                'title': 'INAM',
                'artist': 'IART',
                'album': 'IPRD',
                'albumartist': 'IART',  # WAV doesn't have separate albumartist
                'date': 'ICRD',
                'year': 'ICRD',
                'genre': 'IGNR',
                'comment': 'ICMT',
                'copyright': 'ICOP',
                'track': 'ITRK',
                # NOTE: WAV has no standard composer field - mdrm uses ICMS (Commissioned) as workaround
                'composer': 'ICMS'
            }
            
            for field, value in new_tags.items():
                if field in ['art', 'removeArt']:
                    continue
                
                # Get the WAV-specific tag name
                wav_field = wav_tag_mapping.get(field, field.upper())
                
                if value:
                    cmd.extend(['-metadata', f'{wav_field}={value}'])
                else:
                    # Clear the field
                    cmd.extend(['-metadata', f'{wav_field}='])
                    
            # Warn about limited support
            if base_format in FORMAT_METADATA_CONFIG.get('limited', []):
                logger.info(f"Note: {base_format} format has limited metadata support. Some fields may not be saved.")
                # Special warning for composer in WAV
                # Note: This warning is no longer needed for WAV since Mutagen uses ID3
                pass
        
        # Special handling for WavPack format
        elif base_format == 'wv':
            # WavPack uses APEv2 tags with specific case-sensitive names
            wavpack_tag_mapping = {
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
            
            for field, value in new_tags.items():
                if field in ['art', 'removeArt']:
                    continue
                
                # Get the WavPack-specific tag name
                wv_field = wavpack_tag_mapping.get(field, field.title())
                
                # Normalize composer text
                if field == 'composer' and value:
                    value = mutagen_handler.normalize_composer_text(value)
                
                if value:
                    cmd.extend(['-metadata', f'{wv_field}={value}'])
                else:
                    # Clear the field
                    cmd.extend(['-metadata', f'{wv_field}='])
        
        # Standard handling for other formats (MP3, FLAC, M4A, WMA)
        else:
            for field, value in new_tags.items():
                if field in ['art', 'removeArt']:
                    continue
                
                # Get proper tag name for this format
                proper_tag_name = field_mapping.get(field, field.upper() if use_uppercase else field)
                
                # Special case: some formats use different names for certain fields
                if base_format == 'mp3' and use_uppercase:
                    # MP3 ID3v2 uses specific uppercase tags
                    mp3_special_mapping = {
                        'albumartist': 'TPE2',
                        'track': 'TRCK',
                        'disc': 'TPOS',
                        'year': 'TDRC',
                        'date': 'TDRC',
                        'composer': 'TCOM'
                    }
                    proper_tag_name = mp3_special_mapping.get(field, proper_tag_name)

                # Special handling for WMA composer field
                elif base_format == 'wma' and field == 'composer':
                    proper_tag_name = 'WM/Composer'

                # Special handling for composer field to ensure Unicode compatibility
                if field == 'composer' and value:
                    value = mutagen_handler.normalize_composer_text(value)
                             
                if value:
                    cmd.extend(['-metadata', f'{proper_tag_name}={value}'])
                else:
                    # Clear the field by setting it to empty
                    cmd.extend(['-metadata', f'{proper_tag_name}='])
        
        # Add output file
        cmd.append(temp_file)
        
        # Log command for debugging (but not the full command to avoid clutter)
        logger.debug(f"Applying metadata changes to {os.path.basename(filepath)} with FFmpeg fallback")
        logger.debug(f"Changed fields: {', '.join(k for k in new_tags.keys() if k not in ['art', 'removeArt'])}")
        if art_data:
            logger.debug("Adding album art")
        elif remove_art:
            logger.debug("Removing album art")
        
        # Execute ffmpeg
        result = subprocess.run(cmd, capture_output=True, text=True)
        
        if result.returncode != 0:
            logger.error(f"FFmpeg stderr: {result.stderr}")
            # Check for specific errors
            if "Unsupported codec id in stream" in result.stderr and base_format in FORMAT_METADATA_CONFIG.get('no_embedded_art', []):
                raise Exception(f"Album art is not supported for {base_format.upper()} files")
            raise Exception(f"FFmpeg failed: {result.stderr}")
        
        # Replace original file
        os.replace(temp_file, filepath)
        fix_file_ownership(filepath)
        
        # Clean up temp art file if exists
        if art_data and 'temp_art_file' in locals():
            os.remove(temp_art_file)
        
        logger.info(f"Successfully updated {os.path.basename(filepath)} with FFmpeg")
            
    except Exception as e:
        # Clean up on error
        if os.path.exists(temp_file):
            os.remove(temp_file)
        if art_data and 'temp_art_file' in locals() and os.path.exists(temp_art_file):
            os.remove(temp_art_file)
        raise