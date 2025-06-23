"""
FFmpeg wrapper and operations for Metadata Remote
Handles low-level FFmpeg/FFprobe operations
"""
import subprocess
import json
import logging

from config import logger

def run_ffprobe(filepath):
    """Run ffprobe and return parsed JSON data"""
    cmd = ['ffprobe', '-v', 'quiet', '-print_format', 'json', '-show_format', filepath]
    result = subprocess.run(cmd, capture_output=True, text=True)
    
    if result.returncode != 0:
        logger.error(f"FFprobe error: {result.stderr}")
        raise Exception('Failed to read metadata')
    
    return json.loads(result.stdout)
