"""
Album art CRUD operations manager for Metadata Remote
Handles high-level album art save, update, and delete operations
"""
import logging

from config import logger
from core.history import (
    history, create_album_art_action, create_batch_album_art_action
)
from core.album_art.extractor import extract_album_art
from core.metadata.writer import apply_metadata_to_file

def save_album_art_to_file(filepath, art_data=None, remove_art=False, track_history=True):
    """
    Save or remove album art for a single file with optional history tracking
    
    Args:
        filepath: Path to the audio file
        art_data: Base64 encoded album art data (optional)
        remove_art: Whether to remove existing album art
        track_history: Whether to track this change in history
        
    Returns:
        tuple: (success: bool, old_art_path: str, new_art_path: str)
    """
    try:
        # Get current album art if we need to track history
        old_art_path = ''
        new_art_path = ''
        
        if track_history:
            current_art = extract_album_art(filepath)
            # Save to history's temporary storage
            old_art_path = history.save_album_art(current_art) if current_art else ''
            new_art_path = history.save_album_art(art_data) if art_data else ''
            
            # Create and add history action
            if remove_art:
                action = create_album_art_action(filepath, current_art, None, is_delete=True)
            else:
                action = create_album_art_action(filepath, current_art, art_data)
            
            # Update the action with the saved paths
            action.old_values[filepath] = old_art_path
            action.new_values[filepath] = new_art_path
            
            history.add_action(action)
        
        # Apply the change
        apply_metadata_to_file(filepath, {}, art_data, remove_art)
        
        logger.info(f"Successfully {'removed' if remove_art else 'updated'} album art for {filepath}")
        return True, old_art_path, new_art_path
        
    except Exception as e:
        logger.error(f"Error saving album art to {filepath}: {e}")
        raise

def process_album_art_change(filepath, data, current_metadata):
    """
    Process album art changes from request data
    
    Args:
        filepath: Path to the audio file
        data: Request data containing art/removeArt fields
        current_metadata: Current metadata including album art
        
    Returns:
        tuple: (has_art_change: bool, art_data: str or None, remove_art: bool)
    """
    art_data = data.get('art')
    remove_art = data.get('removeArt', False)
    
    # Determine if there's an actual album art change
    has_art_change = bool(art_data or remove_art)
    
    return has_art_change, art_data, remove_art

def prepare_batch_album_art_change(folder_path, art_data, audio_files):
    """
    Prepare for batch album art changes by collecting current state
    
    Args:
        folder_path: Path to the folder
        art_data: New album art to apply
        audio_files: List of audio file paths
        
    Returns:
        list: List of tuples (filepath, current_art) for history tracking
    """
    file_changes = []
    
    for file_path in audio_files:
        try:
            current_art = extract_album_art(file_path)
            file_changes.append((file_path, current_art))
        except Exception as e:
            logger.warning(f"Could not extract current art from {file_path}: {e}")
            # Still include the file with None for current art
            file_changes.append((file_path, None))
    
    return file_changes

def record_batch_album_art_history(folder_path, art_data, file_changes):
    """
    Record batch album art changes in history
    
    Args:
        folder_path: Path to the folder
        art_data: Album art that was applied
        file_changes: List of tuples (filepath, old_art) from prepare_batch_album_art_change
    """
    # Save the new album art to history's temporary storage
    new_art_path = history.save_album_art(art_data)
    
    # Create batch action
    action = create_batch_album_art_action(folder_path, art_data, file_changes)
    
    # Update the action with saved art paths
    for filepath, old_art in file_changes:
        old_art_path = history.save_album_art(old_art) if old_art else ''
        action.old_values[filepath] = old_art_path
        action.new_values[filepath] = new_art_path
    
    history.add_action(action)
