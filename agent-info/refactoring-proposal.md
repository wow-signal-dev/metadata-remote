# Complete Verbatim Code Replacement Guide for M4B Audiobook Support

This guide provides complete, verbatim code replacements for adding M4B audiobook support to Metadata Remote. Each section shows the ENTIRE code block that needs to be replaced, with complete context for copy-paste implementation.

## Change 1: Add M4B to Supported Extensions

**File:** `/home/will/deleteme/metadata-remote/config.py`

**BEFORE:**
```python
# Server configuration
PORT = 8338
HOST = '0.0.0.0'

# Supported audio formats
AUDIO_EXTENSIONS = (
    '.mp3', '.flac', '.wav', '.m4a', '.wma', '.wv', '.ogg', '.opus'
)

# MIME type mapping for streaming
MIME_TYPES = {
```

**AFTER:**
```python
# Server configuration
PORT = 8338
HOST = '0.0.0.0'

# Supported audio formats
AUDIO_EXTENSIONS = (
    '.mp3', '.flac', '.wav', '.m4a', '.m4b', '.wma', '.wv', '.ogg', '.opus'  # MODIFIED: Added M4B to array
)

# MIME type mapping for streaming
MIME_TYPES = {
```

## Change 2: Add M4B MIME Type

**File:** `/home/will/deleteme/metadata-remote/config.py`

**BEFORE:**
```python
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
```

**AFTER:**
```python
# MIME type mapping for streaming
MIME_TYPES = {
    '.mp3': 'audio/mpeg',
    '.flac': 'audio/flac',
    '.wav': 'audio/wav',
    '.m4a': 'audio/mp4',
    '.m4b': 'audio/mp4',
    '.wma': 'audio/x-ms-wma',
    '.wv': 'audio/x-wavpack',
    '.ogg': 'audio/ogg',
    '.opus': 'audio/opus'
}

# Format-specific metadata handling
FORMAT_METADATA_CONFIG = {
```

## Change 3: Update Format Metadata Configuration

**File:** `/home/will/deleteme/metadata-remote/config.py`

**BEFORE:**
```python
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
```

**AFTER:**
```python
# Format-specific metadata handling
FORMAT_METADATA_CONFIG = {
    # Formats that typically use uppercase tags
    'uppercase': ['mp3'],
    # Formats that typically use lowercase tags
    'lowercase': ['flac'],
    # Formats that use specific tag systems
    'itunes': ['m4a', 'm4b'],
    # Formats with limited metadata support
    'limited': ['wav'],
    # Formats that don't support embedded album art
    'no_embedded_art': ['wav', 'wv'],  # WAV and WavPack don't support embedded art
    # Formats that store metadata at stream level
    'stream_level_metadata': ['opus']
}

# History configuration
MAX_HISTORY_ITEMS = 1000
```

## Change 4: Add M4B Format Detection

**File:** `/home/will/deleteme/metadata-remote/core/file_utils.py`

**BEFORE:**
```python
def get_file_format(filepath):
    """Get file format and metadata tag case preference"""
    ext = os.path.splitext(filepath.lower())[1]
    base_format = ext[1:]  # Remove the dot
    
    # Determine the container format for output
    if ext == '.m4a':
        output_format = 'mp4'
    elif ext == '.wav':
        output_format = 'wav'
    elif ext == '.wma':
        output_format = 'asf'  # WMA uses ASF container
    elif ext == '.wv':
        output_format = 'wv'
    elif ext in ['.ogg', '.opus']:
        output_format = 'ogg'
    else:
        output_format = base_format
    
    # Determine tag case preference
    use_uppercase = base_format in FORMAT_METADATA_CONFIG.get('uppercase', [])
    
    return output_format, use_uppercase, base_format
```

**AFTER:**
```python
def get_file_format(filepath):
    """Get file format and metadata tag case preference"""
    ext = os.path.splitext(filepath.lower())[1]
    base_format = ext[1:]  # Remove the dot
    
    # Determine the container format for output
    if ext == '.m4a':
        output_format = 'mp4'
    elif ext == '.m4b':
        output_format = 'mp4'
    elif ext == '.wav':
        output_format = 'wav'
    elif ext == '.wma':
        output_format = 'asf'  # WMA uses ASF container
    elif ext == '.wv':
        output_format = 'wv'
    elif ext in ['.ogg', '.opus']:
        output_format = 'ogg'
    else:
        output_format = base_format
    
    # Determine tag case preference
    use_uppercase = base_format in FORMAT_METADATA_CONFIG.get('uppercase', [])
    
    return output_format, use_uppercase, base_format
```

## Change 5: Add M4B File Icon

**File:** `/home/will/deleteme/metadata-remote/static/js/ui/utilities.js`

**BEFORE:**
```javascript
        /**
         * Get format-specific emoji for file display
         * @param {string} filename - The filename
         * @returns {string} Emoji character
         */
        getFormatEmoji(filename) {
            const ext = filename.split('.').pop().toLowerCase();
            const FORMAT_EMOJIS = {
                'mp3': '🎵',
                'flac': '💿',
                'm4a': '🎶',
                'wav': '🌊',
                'wma': '🪟',
                'wv': '📦',
                'ogg': '🎼',
                'opus': '🎹'
            };
            return FORMAT_EMOJIS[ext] || '🎵';
        },
```

**AFTER:**
```javascript
        /**
         * Get format-specific emoji for file display
         * @param {string} filename - The filename
         * @returns {string} Emoji character
         */
        getFormatEmoji(filename) {
            const ext = filename.split('.').pop().toLowerCase();
            const FORMAT_EMOJIS = {
                'mp3': '🎵',
                'flac': '💿',
                'm4a': '🎶',
                'm4b': '📚',
                'wav': '🌊',
                'wma': '🪟',
                'wv': '📦',
                'ogg': '🎼',
                'opus': '🎹'
            };
            return FORMAT_EMOJIS[ext] || '🎵';
        },
```

## Change 6: Update Format Badge Display

**File:** `/home/will/deleteme/metadata-remote/static/js/ui/utilities.js`

**BEFORE:**
```javascript
        /**
         * Get format badge HTML with visual indicators
         * @param {string} filename - The filename
         * @returns {string} HTML string for format badge
         */
        getFormatBadge(filename) {
            const ext = filename.split('.').pop().toUpperCase();
            const lossless = ['FLAC', 'WAV', 'WV', 'OGG', 'OPUS'];
            const limitedMetadata = ['WAV', 'WV'];
            const noAlbumArt = ['WAV', 'WV'];
            
            const isLossless = lossless.includes(ext);
            const hasLimitations = limitedMetadata.includes(ext) || noAlbumArt.includes(ext);
            
            let badgeHtml = `<span style="
                font-size: 0.7rem;
                padding: 0.2rem 0.4rem;
                border-radius: 4px;
                background: ${isLossless ? 'rgba(74, 222, 128, 0.2)' : 'rgba(255, 169, 77, 0.2)'};
                color: ${isLossless ? '#4ade80' : '#ffa94d'};
                margin-left: 0.5rem;
                font-weight: 500;
            ">${ext}</span>`;
            
            if (hasLimitations) {
                const limitations = [];
                if (limitedMetadata.includes(ext)) {
                    limitations.push('limited metadata');
                }
                if (noAlbumArt.includes(ext)) {
                    limitations.push('no album art');
                }
                
                badgeHtml += `<span style="
                    font-size: 0.65rem;
                    padding: 0.15rem 0.3rem;
                    border-radius: 4px;
                    background: rgba(255, 107, 107, 0.2);
                    color: #ff6b6b;
                    margin-left: 0.3rem;
                    font-weight: 400;
                " title="${limitations.join(', ')}">⚠</span>`;
            }
            
            return badgeHtml;
        },
```

**AFTER:**
```javascript
        /**
         * Get format badge HTML with visual indicators
         * @param {string} filename - The filename
         * @returns {string} HTML string for format badge
         */
        getFormatBadge(filename) {
            const ext = filename.split('.').pop().toUpperCase();
            const lossless = ['FLAC', 'WAV', 'WV', 'OGG', 'OPUS'];
            const limitedMetadata = ['WAV', 'WV'];
            const noAlbumArt = ['WAV', 'WV'];
            
            const isLossless = lossless.includes(ext);
            const hasLimitations = limitedMetadata.includes(ext) || noAlbumArt.includes(ext);
            
            // Check for audiobook format
            const isAudiobook = ext === 'M4B';
            
            let badgeHtml = `<span style="
                font-size: 0.7rem;
                padding: 0.2rem 0.4rem;
                border-radius: 4px;
                background: ${isAudiobook ? 'rgba(139, 92, 246, 0.2)' : (isLossless ? 'rgba(74, 222, 128, 0.2)' : 'rgba(255, 169, 77, 0.2)')};
                color: ${isAudiobook ? '#8b5cf6' : (isLossless ? '#4ade80' : '#ffa94d')};
                margin-left: 0.5rem;
                font-weight: 500;
            ">${ext}</span>`;
            
            if (hasLimitations) {
                const limitations = [];
                if (limitedMetadata.includes(ext)) {
                    limitations.push('limited metadata');
                }
                if (noAlbumArt.includes(ext)) {
                    limitations.push('no album art');
                }
                
                badgeHtml += `<span style="
                    font-size: 0.65rem;
                    padding: 0.15rem 0.3rem;
                    border-radius: 4px;
                    background: rgba(255, 107, 107, 0.2);
                    color: #ff6b6b;
                    margin-left: 0.3rem;
                    font-weight: 400;
                " title="${limitations.join(', ')}">⚠</span>`;
            }
            
            return badgeHtml;
        },
```

## Change 7: Ensure Audiobook Properties for M4B Files

**File:** `/home/will/deleteme/metadata-remote/core/metadata/mutagen_handler.py`

**BEFORE:**
```python
                for field, value in custom_fields.items():
                    if field in ['art', 'removeArt']:
                        continue
                    
                    if not value:
                        value = ' '
                    
                    audio_file[field] = value
            
            # Save the file
            audio_file.save()
            return True
        except Exception as e:
            logger.error(f"Error writing metadata to {filepath}: {e}")
            return False
```

**AFTER:**
```python
                for field, value in custom_fields.items():
                    if field in ['art', 'removeArt']:
                        continue
                    
                    if not value:
                        value = ' '
                    
                    audio_file[field] = value
            
            # M4B Audiobook Format Handling
            # M4B files require special treatment:
            # - stik=2 identifies the file as an audiobook (required for iTunes/Apple Books)
            # - pgap=True enables gapless playback (important for continuous narration)
            # - aART field is conventionally used for narrator (not album artist)
            # - TV show atoms (tvsh, tves, tvnn) are repurposed for book series metadata
            if isinstance(audio_file, MP4) and filepath.lower().endswith('.m4b'):
                try:
                    changes_made = []
                    current_stik = audio_file.get('stik', [0])[0]
                    if current_stik != 2:
                        audio_file['stik'] = [2]  # Media type: Audiobook
                        changes_made.append(f'set stik=2 (was {current_stik})')
                    if not audio_file.get('pgap'):
                        audio_file['pgap'] = True  # Enable gapless playback
                        changes_made.append('enabled gapless playback')
                    if changes_made:
                        logger.info(f"M4B audiobook adjustments for {filepath}: {', '.join(changes_made)}")
                except Exception as e:
                    logger.warning(f"Failed to set audiobook properties: {e}")
                    # Continue with save anyway
            
            # Save the file
            audio_file.save()
            return True
        except Exception as e:
            logger.error(f"Error writing metadata to {filepath}: {e}")
            return False
```

## Change 8: Add Dynamic Narrator Label for M4B Files

**File:** `/home/will/deleteme/metadata-remote/static/js/metadata/editor.js`

**BEFORE:**
```javascript
        /**
         * Render all metadata fields (standard and dynamic)
         * @param {Object} metadata - Metadata object with all_fields property
         */
        renderStandardFields(metadata) {
            const container = document.getElementById('standard-fields-container');
            if (!container) {
                return;
            }
            
            // Clear existing standard fields
            container.innerHTML = '';
            
            // Get existing standard fields from the metadata
            const existingFields = metadata.existing_standard_fields || {};
            
            // Check standard_fields property
            const standardFields = metadata.standard_fields || {};
            
            // Group fields for special rendering
            const numberFields = [];
            const regularFields = [];
            
            // Render fields in the defined order, but only if they exist
            Object.entries(standardFieldsInfo).forEach(([field, info]) => {
                // Check if field exists (either has a value or is in existing_standard_fields)
                const hasValue = existingFields.hasOwnProperty(field) || 
                               (standardFields[field] !== undefined && standardFields[field] !== '');
                
                if (hasValue || this.shouldAlwaysShowField(field)) {
                    const fieldValue = standardFields[field] || existingFields[field] || '';
                    
                    if (info.group === 'numbers') {
                        numberFields.push({ field, info, value: fieldValue });
                    } else {
                        regularFields.push({ field, info, value: fieldValue });
                    }
                }
            });
            
            // Render regular fields
            regularFields.forEach(({ field, info, value }) => {
                this.renderStandardField(container, field, info, value);
            });
```

**AFTER:**
```javascript
        /**
         * Render all metadata fields (standard and dynamic)
         * @param {Object} metadata - Metadata object with all_fields property
         */
        renderStandardFields(metadata) {
            // Check if this is an M4B file for narrator label
            const isM4B = State.currentFile && State.currentFile.toLowerCase().endsWith('.m4b');
            const albumArtistLabel = isM4B ? 'Narrator' : 'Album Artist';
            
            const container = document.getElementById('standard-fields-container');
            if (!container) {
                return;
            }
            
            // Clear existing standard fields
            container.innerHTML = '';
            
            // Get existing standard fields from the metadata
            const existingFields = metadata.existing_standard_fields || {};
            
            // Check standard_fields property
            const standardFields = metadata.standard_fields || {};
            
            // Group fields for special rendering
            const numberFields = [];
            const regularFields = [];
            
            // Render fields in the defined order, but only if they exist
            Object.entries(standardFieldsInfo).forEach(([field, info]) => {
                // Override display name for albumartist field in M4B files
                if (field === 'albumartist' && isM4B) {
                    info = { ...info, display: albumArtistLabel };
                }
                
                // Check if field exists (either has a value or is in existing_standard_fields)
                const hasValue = existingFields.hasOwnProperty(field) || 
                               (standardFields[field] !== undefined && standardFields[field] !== '');
                
                if (hasValue || this.shouldAlwaysShowField(field)) {
                    const fieldValue = standardFields[field] || existingFields[field] || '';
                    
                    if (info.group === 'numbers') {
                        numberFields.push({ field, info, value: fieldValue });
                    } else {
                        regularFields.push({ field, info, value: fieldValue });
                    }
                }
            });
            
            // Render regular fields
            regularFields.forEach(({ field, info, value }) => {
                this.renderStandardField(container, field, info, value);
            });
```

## Summary

### Files Modified
- **Total files modified:** 5
  1. `/home/will/deleteme/metadata-remote/config.py` (3 changes)
  2. `/home/will/deleteme/metadata-remote/core/file_utils.py` (1 change)
  3. `/home/will/deleteme/metadata-remote/static/js/ui/utilities.js` (2 changes)
  4. `/home/will/deleteme/metadata-remote/core/metadata/mutagen_handler.py` (1 change)
  5. `/home/will/deleteme/metadata-remote/static/js/metadata/editor.js` (1 change)

### Lines Added/Changed
- **Total lines added:** ~40 lines
- **Total lines modified:** 8 lines

### Quick Verification Checklist

After implementing these changes, verify:

1. **File Recognition**
   - [ ] M4B files appear in file listings
   - [ ] M4B files show book emoji 📚
   - [ ] M4B files display purple format badge

2. **Metadata Handling**
   - [ ] M4B files can be opened and edited
   - [ ] Album Artist field shows as "Narrator" for M4B files
   - [ ] All standard metadata fields work correctly

3. **Audiobook Properties**
   - [ ] Save any M4B file and check logs for "M4B audiobook adjustments" message
   - [ ] Use `ffprobe file.m4b -show_entries format_tags=media_type` to verify stik=2
   - [ ] Use `ffprobe file.m4b -show_entries format_tags=gapless_playback` to verify pgap=1

4. **Audio Playback**
   - [ ] M4B files play correctly in browser
   - [ ] Playback controls function normally

5. **Import Test**
   - [ ] Import M4B into iTunes/Apple Books
   - [ ] Verify file appears in Audiobooks section (not Music)
   - [ ] Verify bookmark/resume features work

### Implementation Notes

- All code blocks are complete and ready for direct copy-paste
- Changes are marked with comments (ADDED/MODIFIED) for clarity
- No interpretation needed - just replace the BEFORE sections with the AFTER sections
- The implementation leverages existing MP4 infrastructure
- All changes maintain backward compatibility