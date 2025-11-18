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

import threading
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler

from config import MUSIC_DIR, logger, AUDIO_EXTENSIONS
from core.scanner import index_file, remove_file_from_index

class MusicLibraryEventHandler(FileSystemEventHandler):
    """Handles filesystem events for the music library."""
    def on_created(self, event):
        if not event.is_directory and event.src_path.lower().endswith(AUDIO_EXTENSIONS):
            logger.info(f"File created: {event.src_path}, indexing...")
            index_file(event.src_path)

    def on_modified(self, event):
        if not event.is_directory and event.src_path.lower().endswith(AUDIO_EXTENSIONS):
            logger.info(f"File modified: {event.src_path}, re-indexing...")
            index_file(event.src_path)

    def on_deleted(self, event):
        if not event.is_directory and event.src_path.lower().endswith(AUDIO_EXTENSIONS):
            logger.info(f"File deleted: {event.src_path}, removing from index...")
            remove_file_from_index(event.src_path)

    def on_moved(self, event):
        if not event.is_directory:
            if event.src_path.lower().endswith(AUDIO_EXTENSIONS):
                remove_file_from_index(event.src_path)
            if event.dest_path.lower().endswith(AUDIO_EXTENSIONS):
                index_file(event.dest_path)

def start_watcher():
    """Starts the filesystem watcher in a background thread."""
    observer = Observer()
    observer.schedule(MusicLibraryEventHandler(), MUSIC_DIR, recursive=True)
    thread = threading.Thread(target=observer.start, daemon=True)
    thread.start()
    logger.info(f"Started filesystem watcher for {MUSIC_DIR}")
