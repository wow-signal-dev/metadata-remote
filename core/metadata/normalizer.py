"""
Metadata tag normalization for Metadata Remote
Handles format-specific tag naming and normalization
"""
from config import FORMAT_METADATA_CONFIG

def normalize_metadata_tags(tags, format_type=''):
    """Normalize common tag names from various formats"""
    # Handle iTunes/MP4 specific tags
    if format_type in FORMAT_METADATA_CONFIG.get('itunes', []):
        return {
            'title': tags.get('title', tags.get('TITLE', tags.get('©nam', ''))),
            'artist': tags.get('artist', tags.get('ARTIST', tags.get('©ART', ''))),
            'album': tags.get('album', tags.get('ALBUM', tags.get('©alb', ''))),
            'albumartist': tags.get('albumartist', tags.get('ALBUMARTIST', 
                           tags.get('album_artist', tags.get('ALBUM_ARTIST', 
                           tags.get('aART', ''))))),
            'date': tags.get('date', tags.get('DATE', tags.get('©day', 
                    tags.get('year', tags.get('YEAR', ''))))),
            'genre': tags.get('genre', tags.get('GENRE', tags.get('©gen', ''))),
            'track': tags.get('track', tags.get('TRACK', tags.get('trkn', ''))),
            'disc': tags.get('disc', tags.get('DISC', tags.get('disk', 
                    tags.get('discnumber', tags.get('DISCNUMBER', ''))))),
            'composer': tags.get('composer', tags.get('©wrt', ''))
        }
    
    # Handle OGG/Opus specific normalization
    elif format_type in ['ogg', 'opus']:
        # OGG uses specific field names
        return {
            'title': tags.get('TITLE', tags.get('title', '')),
            'artist': tags.get('ARTIST', tags.get('artist', '')),
            'album': tags.get('ALBUM', tags.get('album', '')),
            'albumartist': tags.get('ALBUMARTIST', tags.get('albumartist', tags.get('album_artist', ''))),
            'date': tags.get('DATE', tags.get('date', tags.get('YEAR', tags.get('year', '')))),
            'genre': tags.get('GENRE', tags.get('genre', '')),
            'track': tags.get('TRACKNUMBER', tags.get('tracknumber', tags.get('TRACK', tags.get('track', '')))),
            'disc': tags.get('DISCNUMBER', tags.get('discnumber', tags.get('DISC', tags.get('disc', '')))),
            'composer': tags.get('COMPOSER', tags.get('composer', ''))
        }
    
    # Standard normalization for other formats
    return {
        'title': tags.get('title', tags.get('TITLE', tags.get('Title', ''))),
        'artist': tags.get('artist', tags.get('ARTIST', tags.get('Artist', ''))),
        'album': tags.get('album', tags.get('ALBUM', tags.get('Album', ''))),
        'albumartist': tags.get('albumartist', tags.get('ALBUMARTIST', 
                       tags.get('album_artist', tags.get('ALBUM_ARTIST', 
                       tags.get('AlbumArtist', ''))))),
        'date': tags.get('year', tags.get('YEAR', tags.get('Year',
                tags.get('date', tags.get('DATE', tags.get('Date', '')))))),
        'genre': tags.get('genre', tags.get('GENRE', tags.get('Genre', ''))),
        'track': tags.get('track', tags.get('TRACK', tags.get('Track', 
                 tags.get('tracknumber', tags.get('TRACKNUMBER', ''))))),
        'disc': tags.get('disc', tags.get('DISC', tags.get('Disc',
                tags.get('discnumber', tags.get('DISCNUMBER', 
                tags.get('disk', tags.get('DISK', ''))))))),
        'composer': tags.get('composer', tags.get('COMPOSER', tags.get('Composer',
            tags.get('WM/Composer', tags.get('TCOM', '')))))
    }

def get_metadata_field_mapping(use_uppercase, format_type=''):
    """Get proper metadata field names based on format"""
    # Special handling for iTunes/MP4 formats
    if format_type in FORMAT_METADATA_CONFIG.get('itunes', []):
        return {
            'title': 'title',
            'artist': 'artist',
            'album': 'album',
            'albumartist': 'albumartist',
            'date': 'date',
            'year': 'date',
            'genre': 'genre',
            'track': 'track',
            'disc': 'disc',
            'composer': 'composer'
        }
    
    base_mapping = {
        'title': 'title',
        'artist': 'artist',
        'album': 'album',
        'albumartist': 'albumartist',
        'date': 'date',
        'year': 'date',
        'genre': 'genre',
        'track': 'track',
        'disc': 'disc',
        'composer': 'composer'
    }
    
    if use_uppercase:
        return {k: v.upper() for k, v in base_mapping.items()}
    return base_mapping
    
def parse_multi_value_field(value, format_type=''):
    """
    Parse multi-value fields based on format-specific separators
    Returns a list of values
    """
    if not value:
        return []
    
    # ID3v2.4 uses null bytes
    if '\x00' in value:
        return [v.strip() for v in value.split('\x00') if v.strip()]
    
    # Most formats use semicolon
    if ';' in value:
        return [v.strip() for v in value.split(';') if v.strip()]
    
    # Single value
    return [value.strip()] if value.strip() else []

def join_multi_value_field(values, format_type=''):
    """
    Join multiple values based on format preferences
    """
    if not values:
        return ''
    
    if isinstance(values, str):
        return values
    
    # Use semicolon as the standard separator
    return '; '.join(str(v).strip() for v in values if v)
