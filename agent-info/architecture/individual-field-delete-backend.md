# Deleting Metadata Field from Individual File Backend Architecture

## Table of Contents
1. [Executive Summary](#executive-summary)
2. [Deletion Pipeline Architecture](#deletion-pipeline-architecture)
3. [Format-Specific Field Removal](#format-specific-field-removal)
4. [Tag Structure Updates](#tag-structure-updates)
5. [Required Field Protection](#required-field-protection)
6. [Atomic Operation Details](#atomic-operation-details)
7. [History Action Creation](#history-action-creation)
8. [File Integrity Checks](#file-integrity-checks)
9. [Error Recovery Strategies](#error-recovery-strategies)
10. [Code References](#code-references)

## Executive Summary

The individual field deletion backend in Metadata Remote provides a sophisticated system for safely removing metadata fields from audio files while maintaining data integrity and providing comprehensive rollback capabilities. The architecture implements format-specific deletion logic, atomic operations, and extensive validation to ensure field removal operations are both safe and reversible.

Key architectural components include:
- **Format-aware deletion logic** across 8 different audio formats (MP3, FLAC, OGG, MP4, ASF, WAV, WavPack)
- **Atomic operation guarantees** through Mutagen's transactional file writing
- **Comprehensive history tracking** for all deletion operations
- **Path validation and security** preventing unauthorized file access
- **Error recovery mechanisms** with detailed logging and rollback support

## Deletion Pipeline Architecture

### Request Flow Overview

The field deletion process follows a structured pipeline:

```
HTTP DELETE Request → Path Validation → Field Existence Check → 
Backup Current Value → Format Detection → Field Deletion → 
File Save → History Recording → Response
```

### 1. Request Entry Point

**File**: `/home/will/deleteme/metadata-remote/app.py` (lines 427-484)

The deletion pipeline begins at the Flask endpoint:

```python
@app.route('/metadata/<path:filename>/<field_id>', methods=['DELETE'])
def delete_metadata_field(filename, field_id):
```

Key validation steps:
- **Field ID normalization**: Restores forward slashes replaced by frontend (`field_id.replace('__', '/')`)
- **Path validation**: Uses `validate_path()` to ensure file access is within `MUSIC_DIR`
- **File existence check**: Verifies target file exists before proceeding

### 2. Field Validation Logic

**File**: `/home/will/deleteme/metadata-remote/app.py` (lines 446-452)

The system implements sophisticated field validation:

```python
# Define standard fields that are always valid for deletion
standard_fields = ['title', 'artist', 'album', 'albumartist', 'date', 'genre', 'composer', 'track', 'disc']
is_standard = field_id.lower() in standard_fields

# Check if field exists (skip check for standard fields as they're excluded from all_fields)
if field_id.lower() not in standard_fields and field_id not in all_fields:
    return jsonify({'error': 'Field not found'}), 404
```

This dual validation approach:
- **Standard fields**: Always allow deletion of 9 core metadata fields
- **Extended fields**: Verify existence before attempting deletion

### 3. Value Backup for History

**File**: `/home/will/deleteme/metadata-remote/app.py` (lines 455-460)

Before deletion, the system captures the current field value:

```python
# Store previous value for history
if field_id in all_fields:
    previous_value = all_fields[field_id].get('value', '')
else:
    # For standard fields, get the value from current_metadata
    previous_value = current_metadata.get(field_id, '')
```

This ensures complete rollback capability through the history system.

## Format-Specific Field Removal

### Core Deletion Engine

**File**: `/home/will/deleteme/metadata-remote/core/metadata/mutagen_handler.py` (lines 2084-2212)

The `delete_field()` method implements format-specific deletion logic with cross-format field name support:

```python
def delete_field(self, filepath: str, field_id: str) -> bool:
    """
    Delete a metadata field from an audio file with format-aware field name handling
    
    Args:
        filepath: Path to audio file
        field_id: Field ID to delete (e.g., 'title', 'TXXX:RATING', etc.)
    
    Returns:
        bool: True if successful
    """
```

The method now includes sophisticated field name mapping to handle cross-format deletion scenarios.

### Cross-Format Field Name Mapping

**File**: `/home/will/deleteme/metadata-remote/core/metadata/mutagen_handler.py` (lines 31-61)

The `FieldNameMapper` class provides bidirectional mapping between semantic field names and format-specific representations:

```python
class FieldNameMapper:
    """Maps between semantic field names and format-specific representations"""
    
    @staticmethod
    def semantic_to_format(field_name: str, format_type: str) -> str:
        """Convert semantic name to format-specific representation"""
        # MP3/WAV: TXXX:fieldname
        # WMA: WM/fieldname  
        # MP4: ----:com.apple.iTunes:fieldname
        # FLAC/OGG/WavPack: fieldname (unchanged)
    
    @staticmethod
    def format_to_semantic(field_id: str, format_type: str) -> str:
        """Extract semantic name from format-specific representation"""
        # Removes format-specific prefixes to get semantic name
```

### Format Detection and Mapping

**File**: `/home/will/deleteme/metadata-remote/core/metadata/mutagen_handler.py` (lines 2101-2114)

The enhanced system now performs intelligent field name translation:

```python
# Extract semantic name from field_id
source_format = self._guess_source_format(field_id)
semantic_name = FieldNameMapper.format_to_semantic(field_id, source_format)

# Get format-specific field name for this file
format_field_id = FieldNameMapper.semantic_to_format(semantic_name, format_type)

# Try both the provided field_id and the format-specific version
fields_to_try = [field_id, format_field_id, semantic_name]
```

This ensures that a field like `TXXX:testfield` can be deleted from files of any format by automatically translating to the appropriate format-specific representation.

### Format-Specific Deletion Implementations

The deletion process now iterates through multiple field representations (`fields_to_try`) to ensure cross-format compatibility:

#### 1. MP3 Format Deletion

**File**: `/home/will/deleteme/metadata-remote/core/metadata/mutagen_handler.py` (lines 2133-2136, 2169-2172)

```python
# Standard fields
if isinstance(audio_file, MP3):
    if tag_name in audio_file.tags:
        del audio_file.tags[tag_name]
        field_deleted = True

# Custom fields (e.g., TXXX:fieldname)
if try_field_id in audio_file.tags:
    del audio_file.tags[try_field_id]
    field_deleted = True
```

MP3 files use ID3v2 tags with support for both standard frames and TXXX custom frames.

#### 2. Vorbis Comments (FLAC/OGG) Deletion

**File**: `/home/will/deleteme/metadata-remote/core/metadata/mutagen_handler.py` (lines 2084-2089)

```python
elif isinstance(audio_file, (OggVorbis, OggOpus, FLAC)):
    # For Vorbis comments
    if format_type == 'flac':
        tag_name = tag_name.lower()
    if tag_name in audio_file:
        del audio_file[tag_name]
```

Handles case sensitivity differences between FLAC (lowercase) and OGG (uppercase).

#### 3. MP4 Atom Deletion

**File**: `/home/will/deleteme/metadata-remote/core/metadata/mutagen_handler.py` (lines 2090-2092)

```python
elif isinstance(audio_file, MP4):
    if tag_name in audio_file:
        del audio_file[tag_name]
```

Removes MP4 atoms directly from the file structure.

#### 4. ASF/WMA Field Deletion

**File**: `/home/will/deleteme/metadata-remote/core/metadata/mutagen_handler.py` (lines 2151-2155, 2188-2199)

```python
# Standard fields
elif isinstance(audio_file, ASF):
    if tag_name in audio_file:
        del audio_file[tag_name]
        field_deleted = True

# Custom fields with WM/ prefix handling
if try_field_id in audio_file:
    del audio_file[try_field_id]
    field_deleted = True
else:
    # Check with WM/ prefix if not already present
    wm_field_id = f"WM/{try_field_id}" if not try_field_id.startswith('WM/') else try_field_id
    if wm_field_id in audio_file:
        del audio_file[wm_field_id]
        field_deleted = True
```

Handles Windows Media Audio extended attributes with automatic WM/ prefix management for custom fields.

#### 5. WAV File Deletion

**File**: `/home/will/deleteme/metadata-remote/core/metadata/mutagen_handler.py` (lines 2096-2098)

```python
elif isinstance(audio_file, WAVE):
    if hasattr(audio_file, 'tags') and audio_file.tags and tag_name in audio_file.tags:
        del audio_file.tags[tag_name]
```

WAV files use embedded ID3 tags with additional existence checks.

#### 6. WavPack Field Deletion

**File**: `/home/will/deleteme/metadata-remote/core/metadata/mutagen_handler.py` (lines 2099-2101)

```python
elif isinstance(audio_file, WavPack):
    if tag_name in audio_file:
        del audio_file[tag_name]
```

WavPack uses APEv2 tags with direct field deletion.

### Custom Field Deletion

**File**: `/home/will/deleteme/metadata-remote/core/metadata/mutagen_handler.py` (lines 2166-2204)

For non-standard fields, the enhanced system uses format-aware custom field deletion:

```python
# The system tries multiple field representations from fields_to_try
for try_field_id in fields_to_try:
    # MP3: Direct TXXX frame access
    if isinstance(audio_file, MP3):
        if try_field_id in audio_file.tags:
            del audio_file.tags[try_field_id]
            field_deleted = True
            break
    
    # Vorbis formats: Also try uppercase variants
    elif isinstance(audio_file, (OggVorbis, OggOpus, FLAC, WavPack)):
        if try_field_id in audio_file:
            del audio_file[try_field_id]
            field_deleted = True
            break
        elif try_field_id.upper() in audio_file:
            del audio_file[try_field_id.upper()]
            field_deleted = True
            break
```

This enhanced logic handles:
- TXXX frames in ID3 (MP3/WAV)
- WM/ prefixed fields in ASF (WMA)
- Freeform atoms in MP4 (----:com.apple.iTunes:fieldname)
- Custom Vorbis comments with case sensitivity handling
- Direct field names in FLAC/OGG/WavPack

## Tag Structure Updates

### ID3v2 Frame Management

**File**: `/home/will/deleteme/metadata-remote/core/metadata/mutagen_handler.py` (lines 124-335)

The system maintains comprehensive ID3v2 frame mappings for proper deletion:

```python
self.id3_text_frames = {
    # Essential/Core Fields
    "TIT2": {
        "primary_name": "title",
        "display_name": "Title",
        "variations": ["title", "song", "track", "name"],
        "versions": ["2.3", "2.4"],
        "category": "essential"
    },
    # ... additional frames
}
```

### Frame Normalization

**File**: `/home/will/deleteme/metadata-remote/core/metadata/mutagen_handler.py` (lines 419-461)

The `normalize_field_name()` method ensures proper field identification:

```python
def normalize_field_name(self, user_input: str) -> Optional[str]:
    """Normalize user input to find matching ID3v2 frame"""
    # Check if it's already a frame ID
    if user_input.upper() in self.id3_text_frames:
        return user_input.upper()
    
    # Check primary names and variations
    for primary, variations in self.field_variations.items():
        if normalized in variations:
            return self.field_to_frame[primary]
```

This ensures fields are correctly identified across different naming conventions.

### Tag Structure Integrity

The deletion process maintains tag structure integrity by:
- **Preserving tag headers**: Only removing specific fields, not entire tag structures
- **Maintaining tag versions**: Respecting ID3v2.3 vs ID3v2.4 differences
- **Handling dependencies**: Ensuring no orphaned references remain

## Required Field Protection

### Standard Field Categories

**File**: `/home/will/deleteme/metadata-remote/core/metadata/mutagen_handler.py** (lines 131-181)

The system categorizes fields by importance:

```python
"category": "essential"    # Core playback fields
"category": "date"         # Time-related fields  
"category": "extended"     # Additional metadata
"category": "technical"    # Technical information
"category": "rights"       # Copyright/ownership
"category": "sorting"      # Sort order fields
```

### Protection Logic

**File**: `/home/will/deleteme/metadata-remote/app.py** (lines 446-452)

While the system doesn't prevent deletion of essential fields, it provides clear categorization:

```python
# Define standard fields that are always valid for deletion
standard_fields = ['title', 'artist', 'album', 'albumartist', 'date', 'genre', 'composer', 'track', 'disc']
```

This allows users to delete any field while maintaining awareness of field importance through the categorization system.

### Validation Approach

The architecture takes a permissive approach to field deletion:
- **No hard restrictions**: Users can delete any metadata field
- **Clear categorization**: Essential fields are marked but not protected
- **History preservation**: All deletions are reversible through history
- **Warning systems**: Frontend can warn about essential field deletion

## Atomic Operation Details

### Mutagen Transaction Handling

**File**: `/home/will/deleteme/metadata-remote/core/metadata/mutagen_handler.py** (lines 2120-2121)

The atomic operation is guaranteed by Mutagen's file handling:

```python
# Save the file
audio_file.save()
return True
```

### Transaction Characteristics

1. **Atomicity**: File writes are atomic at the OS level
2. **Consistency**: Tag structures remain valid after deletion
3. **Isolation**: No partial states visible during operation
4. **Durability**: Changes are immediately written to disk

### Error Handling in Atomic Operations

**File**: `/home/will/deleteme/metadata-remote/core/metadata/mutagen_handler.py** (lines 2123-2126)

```python
except Exception as e:
    logger.error(f"Error deleting field {field_id}: {e}")
    return False
```

Failed operations return `False` without partial modifications, ensuring atomic behavior.

### File System Considerations

**File**: `/home/will/deleteme/metadata-remote/core/file_utils.py** (lines 18-24)

Post-deletion file ownership correction:

```python
def fix_file_ownership(filepath):
    """Fix file ownership to match Jellyfin's expected user"""
    try:
        os.chown(filepath, OWNER_UID, OWNER_GID)
        logger.info(f"Fixed ownership of {filepath} to {OWNER_UID}:{OWNER_GID}")
    except Exception as e:
        logger.warning(f"Could not fix ownership of {filepath}: {e}")
```

This ensures proper file permissions after metadata operations.

## History Action Creation

### Delete Field Action Factory

**File**: `/home/will/deleteme/metadata-remote/core/history.py** (lines 266-282)

```python
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
```

### History Integration

**File**: `/home/will/deleteme/metadata-remote/app.py** (lines 467-468)

History recording occurs immediately after successful deletion:

```python
action = create_delete_field_action(file_path, field_id, previous_value)
history.add_action(action)
```

### History Action Types

**File**: `/home/will/deleteme/metadata-remote/core/history.py** (lines 22-32)

The system supports multiple action types:

```python
class ActionType(Enum):
    METADATA_CHANGE = "metadata_change"
    CLEAR_FIELD = "clear_field"
    DELETE_FIELD = "delete_field"        # Field deletion
    CREATE_FIELD = "create_field"
    BATCH_CREATE_FIELD = "batch_create_field"
```

### Rollback Support

**File**: `/home/will/deleteme/metadata-remote/app.py** (lines 870-880)

History actions enable complete rollback:

```python
elif action.action_type == ActionType.DELETE_FIELD:
    # Undo field deletion by recreating the field
    filepath = action.files[0]
    field = action.field
    old_value = action.old_values[filepath]
    
    try:
        success = mutagen_handler.write_metadata(filepath, {field: old_value})
        if success:
            files_updated += 1
```

## File Integrity Checks

### Path Validation Security

**File**: `/home/will/deleteme/metadata-remote/core/file_utils.py** (lines 11-16)

```python
def validate_path(filepath):
    """Validate that a path is within MUSIC_DIR"""
    abs_path = os.path.abspath(filepath)
    if not abs_path.startswith(os.path.abspath(MUSIC_DIR)):
        raise ValueError("Invalid path")
    return abs_path
```

This prevents directory traversal attacks and ensures operations stay within authorized boundaries.

### Format Detection Validation

**File**: `/home/will/deleteme/metadata-remote/core/metadata/mutagen_handler.py** (lines 474-508)

```python
def detect_format(self, filepath: str) -> Tuple[Optional[File], str]:
    """Detect file format and return Mutagen file object"""
    try:
        audio_file = File(filepath)
        if audio_file is None:
            raise Exception("Unsupported file format")
        
        # Determine format type with comprehensive mapping
        format_map = {
            MP3: 'mp3', OggVorbis: 'ogg', OggOpus: 'ogg',
            FLAC: 'flac', MP4: 'mp4', ASF: 'asf',
            WavPack: 'wavpack', WAVE: 'wav'
        }
```

### Field Validation Checks

**File**: `/home/will/deleteme/metadata-remote/core/metadata/mutagen_handler.py** (lines 340-366)

```python
def _is_valid_field(self, field_id: str, field_value: Any) -> bool:
    """Check if field should be sent to frontend"""
    
    # Field ID validation
    if len(field_id) > 50:
        logger.warning(f"Skipping field with excessive ID length")
        return False
    
    if '\x00' in str(field_id):
        logger.warning(f"Skipping field with null byte in ID")
        return False
```

This prevents malformed field data from corrupting the metadata structure.

### File Existence Verification

**File**: `/home/will/deleteme/metadata-remote/app.py** (lines 437-438)

```python
if not os.path.exists(file_path):
    return jsonify({'error': 'File not found'}), 404
```

Basic existence check before attempting any operations.

## Error Recovery Strategies

### Exception Handling Hierarchy

The system implements multiple layers of error handling:

1. **Format-level exceptions**: Caught in `detect_format()`
2. **Field-level exceptions**: Caught in `delete_field()`
3. **Request-level exceptions**: Caught in the Flask endpoint
4. **History-level exceptions**: Caught during rollback operations

### Detailed Error Logging

**File**: `/home/will/deleteme/metadata-remote/core/metadata/mutagen_handler.py` (lines 2210-2212)

```python
except Exception as e:
    logger.error(f"Error deleting field {field_id}: {e}")
    return False
```

### Format Detection Helper

**File**: `/home/will/deleteme/metadata-remote/core/metadata/mutagen_handler.py` (lines 2214-2223)

The `_guess_source_format` method helps identify the source format based on field ID patterns:

```python
def _guess_source_format(self, field_id: str) -> str:
    """Guess the source format based on field ID pattern"""
    if field_id.startswith('TXXX:'):
        return 'mp3'
    elif field_id.startswith('WM/'):
        return 'asf'
    elif field_id.startswith('----:'):
        return 'mp4'
    else:
        return 'flac'  # Default for plain field names
```

### Request-Level Error Handling

**File**: `/home/will/deleteme/metadata-remote/app.py** (lines 480-484)

```python
except ValueError:
    return jsonify({'error': 'Invalid path'}), 403
except Exception as e:
    logger.error(f"Error deleting metadata field: {e}")
    return jsonify({'error': str(e)}), 500
```

### Recovery Through History System

The history system provides comprehensive recovery capabilities:

- **Immediate rollback**: Undo individual field deletions
- **Batch rollback**: Undo multiple operations
- **Selective recovery**: Restore specific fields without affecting others

### File State Recovery

In case of file corruption or partial operations:

1. **Mutagen validation**: Automatic file format validation
2. **Backup through history**: Previous values stored for restoration
3. **Ownership restoration**: Automatic file permission correction
4. **Format-specific recovery**: Tailored recovery for each audio format

## Code References

### Core Implementation Files

1. **Main deletion endpoint**: `/home/will/deleteme/metadata-remote/app.py` lines 427-484
2. **Core deletion engine**: `/home/will/deleteme/metadata-remote/core/metadata/mutagen_handler.py` lines 2084-2212
3. **FieldNameMapper class**: `/home/will/deleteme/metadata-remote/core/metadata/mutagen_handler.py` lines 31-61
4. **Format guessing helper**: `/home/will/deleteme/metadata-remote/core/metadata/mutagen_handler.py` lines 2214-2223
5. **History action creation**: `/home/will/deleteme/metadata-remote/core/history.py` lines 266-282
6. **Path validation**: `/home/will/deleteme/metadata-remote/core/file_utils.py` lines 11-16
7. **Format detection**: `/home/will/deleteme/metadata-remote/core/metadata/mutagen_handler.py` lines 474-508

### Key Data Structures

8. **Tag mappings**: `/home/will/deleteme/metadata-remote/core/metadata/mutagen_handler.py` lines 69-121
9. **ID3 frame definitions**: `/home/will/deleteme/metadata-remote/core/metadata/mutagen_handler.py` lines 124-335
10. **Action type enumeration**: `/home/will/deleteme/metadata-remote/core/history.py` lines 22-32
11. **History action dataclass**: `/home/will/deleteme/metadata-remote/core/history.py` lines 34-81
12. **Format configuration**: `/home/will/deleteme/metadata-remote/config.py` lines 34-48

### Validation and Security

13. **Field validation logic**: `/home/will/deleteme/metadata-remote/core/metadata/mutagen_handler.py` lines 340-366
14. **Field normalization**: `/home/will/deleteme/metadata-remote/core/metadata/mutagen_handler.py` lines 419-461
15. **Standard field definitions**: `/home/will/deleteme/metadata-remote/app.py` lines 447-448
16. **File ownership handling**: `/home/will/deleteme/metadata-remote/core/file_utils.py` lines 18-24
17. **Request validation**: `/home/will/deleteme/metadata-remote/app.py` lines 433-438

### Error Handling and Recovery

18. **Exception handling in deletion**: `/home/will/deleteme/metadata-remote/core/metadata/mutagen_handler.py` lines 2210-2212
19. **Request error handling**: `/home/will/deleteme/metadata-remote/app.py` lines 480-484
20. **History rollback logic**: `/home/will/deleteme/metadata-remote/app.py` lines 870-880
21. **Format detection errors**: `/home/will/deleteme/metadata-remote/core/metadata/mutagen_handler.py` lines 506-508
22. **Field existence validation**: `/home/will/deleteme/metadata-remote/app.py` lines 450-452

### History and Auditing

23. **History action creation**: `/home/will/deleteme/metadata-remote/core/history.py` lines 266-282
24. **History integration**: `/home/will/deleteme/metadata-remote/app.py` lines 467-468
25. **Undo/redo functionality**: `/home/will/deleteme/metadata-remote/app.py` lines 870-891
26. **History action details**: `/home/will/deleteme/metadata-remote/core/history.py` lines 60-81
27. **Action type enumeration**: `/home/will/deleteme/metadata-remote/core/history.py` lines 22-32

The individual field deletion backend demonstrates a sophisticated approach to metadata management that prioritizes data integrity, user control, and comprehensive auditing while supporting the diverse requirements of multiple audio formats.