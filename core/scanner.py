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

import os
import threading
import time
from typing import Dict, Any

from config import MUSIC_DIR, AUDIO_EXTENSIONS, logger
import core.database as db
from core.metadata.mutagen_handler import mutagen_handler

scanner_status: Dict[str, Any] = {
    "status": "idle", # idle, scanning, finished
    "progress": 0,
    "total_files": 0,
    "processed_files": 0,
    "start_time": None,
    "end_time": None,
    "errors": []
}

def scan_directory_in_background():
    """Starts a full library scan in a background thread."""
    if scanner_status["status"] == "scanning":
        logger.warning("Scan is already in progress.")
        return
    
    thread = threading.Thread(target=scan_directory, daemon=True)
    thread.start()

def scan_directory():
    """Scans the entire music directory and indexes files."""
    logger.info("Starting full library scan...")
    scanner_status.update({ "status": "scanning", "progress": 0, "total_files": 0, "processed_files": 0, "start_time": time.time(), "errors": [] })

    try:
        audio_files = [os.path.join(root, file) for root, _, files in os.walk(MUSIC_DIR) for file in files if file.lower().endswith(AUDIO_EXTENSIONS)]
        scanner_status["total_files"] = len(audio_files)
        
        for i, filepath in enumerate(audio_files):
            try:
                index_file(filepath)
            except Exception as e:
                error_msg = f"Failed to index {filepath}: {e}"
                logger.error(error_msg)
                scanner_status["errors"].append(error_msg)
            
            scanner_status["processed_files"] = i + 1
            scanner_status["progress"] = (i + 1) / scanner_status["total_files"] * 100 if scanner_status["total_files"] > 0 else 100
    
    except Exception as e:
        logger.error(f"Fatal error during scan: {e}")
        scanner_status["errors"].append(f"Fatal error: {e}")
    
    finally:
        scanner_status.update({ "status": "finished", "end_time": time.time(), "progress": 100 })
        duration = scanner_status["end_time"] - scanner_status["start_time"]
        logger.info(f"Library scan finished in {duration:.2f} seconds.")

def index_file(filepath: str):
    """Reads metadata and indexes a single file."""
    try:
        rel_path = os.path.relpath(filepath, MUSIC_DIR)
        stat = os.stat(filepath)
        tags_to_index = mutagen_handler.read_existing_metadata(filepath)
        standard_tags = {k: v for k, v in tags_to_index.items() if k != 'format' and v}
        db.index_file(path=rel_path, name=os.path.basename(filepath), folder=os.path.dirname(rel_path), size=stat.st_size, date=int(stat.st_mtime), tags=standard_tags)
    except Exception as e:
        logger.error(f"Error indexing file {filepath}: {e}")
        raise

def remove_file_from_index(filepath: str):
    """Removes a file from the database index."""
    try:
        rel_path = os.path.relpath(filepath, MUSIC_DIR)
        db.remove_file(rel_path)
        logger.info(f"Removed {rel_path} from index.")
    except Exception as e:
        logger.error(f"Error removing file {filepath} from index: {e}")
