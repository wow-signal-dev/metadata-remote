"""
Configuration and constants for Metadata Remote
"""
import os

# Directory configuration
MUSIC_DIR = os.environ.get('MUSIC_DIR', '/music')

# User/Group IDs for file ownership
OWNER_UID = int(os.environ.get('PUID', '1000'))
OWNER_GID = int(os.environ.get('PGID', '1000'))

# Server configuration
PORT = 8338
HOST = '0.0.0.0'

# Supported audio formats
AUDIO_EXTENSIONS = (
    '.mp3', '.flac', '.wav', '.m4a', '.wma', '.wv'
)

# MIME type mapping for streaming
MIME_TYPES = {
    '.mp3': 'audio/mpeg',
    '.flac': 'audio/flac',
    '.wav': 'audio/wav',
    '.m4a': 'audio/mp4',
    '.wma': 'audio/x-ms-wma',
    '.wv': 'audio/x-wavpack'
}

# Format-specific metadata handling
FORMAT_METADATA_CONFIG = {
    # Formats that typically use uppercase tags
    'uppercase': ['mp3'],
    # Formats that typically use lowercase tags
    'lowercase': ['flac'],
    # Formats that use specific tag systems
    'itunes': ['m4a'],
    # Formats with limited metadata support
    'limited': ['wav'],
    # Formats that don't support embedded album art
    'no_embedded_art': ['wav', 'wv']
}

# History configuration
MAX_HISTORY_ITEMS = 1000

# Inference engine configuration
INFERENCE_CACHE_DURATION = 3600  # 1 hour
MUSICBRAINZ_RATE_LIMIT = 1.0  # 1 request per second
MUSICBRAINZ_USER_AGENT = 'Metadata-Remote/1.0 (https://github.com/wow-signal-dev/metadata-remote)'

# Field confidence thresholds for inference
FIELD_THRESHOLDS = {
    'artist': 70,
    'album': 65,
    'title': 75,
    'track': 80,
    'date': 60,
    'genre': 55,
    'albumartist': 65,
    'disc': 75,
    'composer': 70
}

# Logging configuration
import logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Log startup configuration
logger.info(f"Starting with PUID={OWNER_UID}, PGID={OWNER_GID}")
logger.info(f"Supporting {len(AUDIO_EXTENSIONS)} audio formats: {', '.join(AUDIO_EXTENSIONS)}")
