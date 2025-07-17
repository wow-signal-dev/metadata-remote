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
    '.mp3', '.flac', '.wav', '.m4a', '.wma', '.wv', '.ogg', '.opus'
)

# MIME type mapping for streaming
MIME_TYPES = {
    '.mp3': 'audio/mpeg',
    '.flac': 'audio/flac',
    '.wav': 'audio/wav',
    '.m4a': 'audio/mp4',
    '.wma': 'audio/x-ms-wma',
    '.wv': 'audio/x-wavpack',
    '.ogg': 'audio/ogg',
    '.opus': 'audio/opus'
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
    'no_embedded_art': ['wav', 'wv'],  # WAV and WavPack don't support embedded art
    # Formats that store metadata at stream level
    'stream_level_metadata': ['opus']
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
