"""
Editing history system for tracking and reverting changes
"""
import os
import time
import uuid
import base64
import hashlib
import logging
import tempfile
import threading
from dataclasses import dataclass
from enum import Enum
from typing import Dict, List, Tuple, Optional, Any

from config import MAX_HISTORY_ITEMS, logger

# ======================
# EDITING HISTORY SYSTEM
# ======================

class ActionType(Enum):
    """Types of actions that can be performed"""
    METADATA_CHANGE = "metadata_change"
    CLEAR_FIELD = "clear_field"
    ALBUM_ART_CHANGE = "album_art_change"
    ALBUM_ART_DELETE = "album_art_delete"
    BATCH_METADATA = "batch_metadata"
    BATCH_ALBUM_ART = "batch_album_art"
    DELETE_FIELD = "delete_field"
    CREATE_FIELD = "create_field"
    BATCH_CREATE_FIELD = "batch_create_field"

@dataclass
class HistoryAction:
    """Represents a single action in the editing history"""
    id: str
    timestamp: float
    action_type: ActionType
    files: List[str]  # List of affected file paths
    field: Optional[str]  # For metadata changes
    old_values: Dict[str, Any]  # Map of filepath to old value
    new_values: Dict[str, Any]  # Map of filepath to new value
    description: str
    is_undone: bool = False
    
    def to_dict(self):
        """Convert to dictionary for JSON serialization"""
        return {
            'id': self.id,
            'timestamp': self.timestamp,
            'action_type': self.action_type.value,
            'files': self.files,
            'field': self.field,
            'description': self.description,
            'is_undone': self.is_undone,
            'file_count': len(self.files)
        }
    
    def get_details(self):
        """Get detailed information about the action"""
        details = self.to_dict()
        
        # Add specific details based on action type
        if self.action_type in [ActionType.METADATA_CHANGE, ActionType.BATCH_METADATA, ActionType.DELETE_FIELD]:
            # For metadata changes, include old and new values
            details['changes'] = []
            for filepath in self.files[:10]:  # Limit to first 10 files for UI
                change = {
                    'file': os.path.basename(filepath),
                    'old_value': self.old_values.get(filepath, ''),
                    'new_value': self.new_values.get(filepath, '')
                }
                details['changes'].append(change)
            if len(self.files) > 10:
                details['more_files'] = len(self.files) - 10
        elif self.action_type in [ActionType.ALBUM_ART_CHANGE, ActionType.ALBUM_ART_DELETE, ActionType.BATCH_ALBUM_ART]:
            details['has_old_art'] = any(self.old_values.values())
            details['has_new_art'] = any(self.new_values.values())
            
        return details

class EditingHistory:
    """Manages the editing history for the application"""
    
    def __init__(self):
        self.actions: List[HistoryAction] = []
        self.lock = threading.Lock()
        
        # Create temp directory for storing album art
        self.temp_dir = tempfile.mkdtemp(prefix='metadata_remote_history_')
        logger.info(f"Created temp directory for history: {self.temp_dir}")
    
    def add_action(self, action: HistoryAction):
        """Add a new action to the history"""
        with self.lock:
            self.actions.append(action)
            # Keep only last N actions to prevent memory issues
            if len(self.actions) > MAX_HISTORY_ITEMS:
                # Clean up old album art files if any
                old_action = self.actions.pop(0)
                self._cleanup_action_files(old_action)
    
    def get_all_actions(self):
        """Get all actions in reverse chronological order"""
        with self.lock:
            return [action.to_dict() for action in reversed(self.actions)]
    
    def get_action(self, action_id: str) -> Optional[HistoryAction]:
        """Get a specific action by ID"""
        with self.lock:
            for action in self.actions:
                if action.id == action_id:
                    return action
            return None
    
    def save_album_art(self, art_data: str) -> str:
        """Save album art to temp file and return the path"""
        if not art_data:
            return ''
        
        # Generate unique filename
        art_hash = hashlib.md5(art_data.encode()).hexdigest()
        art_path = os.path.join(self.temp_dir, f"{art_hash}.jpg")
        
        # Save only if not already exists
        if not os.path.exists(art_path):
            try:
                # Decode base64 data
                art_bytes = base64.b64decode(art_data.split(',')[1] if ',' in art_data else art_data)
                with open(art_path, 'wb') as f:
                    f.write(art_bytes)
            except Exception as e:
                logger.error(f"Error saving album art: {e}")
                return ''
        
        return art_path
    
    def load_album_art(self, art_path: str) -> Optional[str]:
        """Load album art from temp file"""
        if not art_path or not os.path.exists(art_path):
            return None
        
        try:
            with open(art_path, 'rb') as f:
                art_bytes = f.read()
            return f"data:image/jpeg;base64,{base64.b64encode(art_bytes).decode()}"
        except Exception as e:
            logger.error(f"Error loading album art: {e}")
            return None
    
    def _cleanup_action_files(self, action: HistoryAction):
        """Clean up any temporary files associated with an action"""
        if action.action_type in [ActionType.ALBUM_ART_CHANGE, ActionType.ALBUM_ART_DELETE, ActionType.BATCH_ALBUM_ART]:
            # Clean up old album art files
            for art_path in action.old_values.values():
                if art_path and os.path.exists(art_path):
                    try:
                        os.remove(art_path)
                    except:
                        pass
            for art_path in action.new_values.values():
                if art_path and os.path.exists(art_path):
                    try:
                        os.remove(art_path)
                    except:
                        pass
    
    def __del__(self):
        """Clean up temp directory on exit"""
        try:
            import shutil
            if hasattr(self, 'temp_dir') and os.path.exists(self.temp_dir):
                shutil.rmtree(self.temp_dir)
                logger.info(f"Cleaned up temp directory: {self.temp_dir}")
        except:
            pass
        
    def clear(self):
        """Clear all history and clean up associated files"""
        with self.lock:
            # Clean up all temporary files
            for action in self.actions:
                self._cleanup_action_files(action)
            
            # Clear the actions list
            self.actions.clear()
            
            logger.info("Cleared all editing history")

    def update_file_references(self, old_path: str, new_path: str):
        """Update all actions that reference a file when it gets renamed"""
        with self.lock:
            for action in self.actions:
                # Update files list
                updated_files = []
                for filepath in action.files:
                    if filepath == old_path:
                        updated_files.append(new_path)
                    else:
                        updated_files.append(filepath)
                action.files = updated_files
                
                # Update old_values keys (not values)
                updated_old_values = {}
                for filepath, value in action.old_values.items():
                    if filepath == old_path:
                        updated_old_values[new_path] = value
                    else:
                        updated_old_values[filepath] = value
                action.old_values = updated_old_values
                
                # Update new_values keys (not values)
                updated_new_values = {}
                for filepath, value in action.new_values.items():
                    if filepath == old_path:
                        updated_new_values[new_path] = value
                    else:
                        updated_new_values[filepath] = value
                action.new_values = updated_new_values
                
        logger.info(f"Updated file references from {old_path} to {new_path} in history")

# =====================================
# HELPER FUNCTIONS FOR HISTORY TRACKING
# =====================================

def create_metadata_action(filepath: str, field: str, old_value: str, new_value: str, action_type: str = 'metadata_change') -> HistoryAction:
    """Create a history action for a single metadata change"""
    filename = os.path.basename(filepath)
    
    # Normalize single spaces for display
    display_old = '' if old_value == ' ' else old_value
    display_new = '' if new_value == ' ' else new_value
    
    # Determine action type and description
    if action_type == 'clear_field':
        description = f"Cleared {field} in \"{filename}\""
        if display_old:
            description += f" (was \"{display_old}\")"
        action_type_enum = ActionType.CLEAR_FIELD
    elif action_type == 'delete_field':
        description = f"Deleted field {field} in \"{filename}\""
        action_type_enum = ActionType.DELETE_FIELD
    else:
        description = f"Changed {field} in \"{filename}\""
        if display_old and display_new:
            description += f" from \"{display_old}\" to \"{display_new}\""
        elif display_new:
            description += f" to \"{display_new}\""
        elif display_old:
            description += f" (cleared)"
        action_type_enum = ActionType.METADATA_CHANGE
    
    return HistoryAction(
        id=str(uuid.uuid4()),
        timestamp=time.time(),
        action_type=action_type_enum,
        files=[filepath],
        field=field,
        old_values={filepath: old_value},
        new_values={filepath: new_value},
        description=description
    )

def create_delete_field_action(filepath: str, field: str, old_value: str) -> HistoryAction:
    """Create a history action for deleting a metadata field"""
    filename = os.path.basename(filepath)
    description = f"Deleted {field} from \"{filename}\""
    if old_value:
        description += f" (was \"{old_value}\")"
    
    return HistoryAction(
        id=str(uuid.uuid4()),
        timestamp=time.time(),
        action_type=ActionType.DELETE_FIELD,
        files=[filepath],
        field=field,
        old_values={filepath: old_value},
        new_values={filepath: None},
        description=description
    )

def create_batch_metadata_action(folder_path: str, field: str, value: str, file_changes: List[Tuple[str, str, str]]) -> HistoryAction:
    """Create a history action for batch metadata changes"""
    folder_name = os.path.basename(folder_path) or "root"
    description = f"Changed {field} to \"{value}\" for {len(file_changes)} files in \"{folder_name}\""
    
    old_values = {}
    new_values = {}
    files = []
    
    for filepath, old_value, new_value in file_changes:
        files.append(filepath)
        old_values[filepath] = old_value
        new_values[filepath] = new_value
    
    return HistoryAction(
        id=str(uuid.uuid4()),
        timestamp=time.time(),
        action_type=ActionType.BATCH_METADATA,
        files=files,
        field=field,
        old_values=old_values,
        new_values=new_values,
        description=description
    )

def create_album_art_action(filepath: str, old_art: Optional[str], new_art: Optional[str], is_delete: bool = False) -> HistoryAction:
    """Create a history action for album art change"""
    filename = os.path.basename(filepath)
    
    # Note: The history instance needs to be passed in or accessed globally
    # This will be handled in the main app
    old_art_path = ''
    new_art_path = ''
    
    if is_delete:
        description = f"Deleted album art from \"{filename}\""
        action_type = ActionType.ALBUM_ART_DELETE
    else:
        description = f"Changed album art in \"{filename}\""
        action_type = ActionType.ALBUM_ART_CHANGE
    
    return HistoryAction(
        id=str(uuid.uuid4()),
        timestamp=time.time(),
        action_type=action_type,
        files=[filepath],
        field='art',
        old_values={filepath: old_art_path},
        new_values={filepath: new_art_path},
        description=description
    )

def create_batch_album_art_action(folder_path: str, art_data: str, file_changes: List[Tuple[str, Optional[str]]]) -> HistoryAction:
    """Create a history action for batch album art changes"""
    folder_name = os.path.basename(folder_path) or "root"
    description = f"Applied album art to {len(file_changes)} files in \"{folder_name}\""
    
    # Note: The history instance needs to be passed in or accessed globally
    new_art_path = ''
    
    old_values = {}
    new_values = {}
    files = []
    
    for filepath, old_art in file_changes:
        files.append(filepath)
        old_values[filepath] = ''
        new_values[filepath] = new_art_path
    
    return HistoryAction(
        id=str(uuid.uuid4()),
        timestamp=time.time(),
        action_type=ActionType.BATCH_ALBUM_ART,
        files=files,
        field='art',
        old_values=old_values,
        new_values=new_values,
        description=description
    )

def create_field_creation_action(filepath: str, field_name: str, field_value: str) -> HistoryAction:
    """Create a history action for new field creation"""
    filename = os.path.basename(filepath)
    
    # Normalize for display
    display_value = '' if field_value == ' ' else field_value
    
    description = f"Created field '{field_name}' in \"{filename}\""
    if display_value:
        description += f" with value \"{display_value}\""
    
    return HistoryAction(
        id=str(uuid.uuid4()),
        timestamp=time.time(),
        action_type=ActionType.CREATE_FIELD,
        files=[filepath],
        field=field_name,
        old_values={filepath: None},  # Field didn't exist
        new_values={filepath: field_value},
        description=description
    )

def create_batch_field_creation_action(filepaths: List[str], field_name: str, field_values: Dict[str, str]) -> HistoryAction:
    """Create a history action for batch field creation"""
    description = f"Created field '{field_name}' in {len(filepaths)} files"
    
    return HistoryAction(
        id=str(uuid.uuid4()),
        timestamp=time.time(),
        action_type=ActionType.BATCH_CREATE_FIELD,
        files=filepaths,
        field=field_name,
        old_values={fp: None for fp in filepaths},  # Fields didn't exist
        new_values=field_values,
        description=description
    )

# Global history instance
history = EditingHistory()
