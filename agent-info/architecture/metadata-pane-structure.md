# Metadata Pane Architecture Analysis

## Table of Contents
1. [Executive Summary](#executive-summary)
2. [Editor Component Architecture](#editor-component-architecture)
3. [Field Type Matrix](#field-type-matrix)
4. [Form Generation Logic](#form-generation-logic)
5. [Field Type Handlers](#field-type-handlers)
6. [Validation System Analysis](#validation-system-analysis)
7. [Save/Cancel Workflows](#save-cancel-workflows)
8. [Album Art Integration](#album-art-integration)
9. [Inference System Integration](#inference-system-integration)
10. [Batch Editing Implementation](#batch-editing-implementation)
11. [Custom Field Creation UI](#custom-field-creation-ui)
12. [Workflow Diagrams](#workflow-diagrams)
13. [Code References](#code-references)

## Executive Summary

The Metadata Pane in Metadata Remote is a sophisticated editor component that provides comprehensive metadata management capabilities for audio files. The architecture follows a modular design pattern with clear separation between UI components, validation logic, and backend operations.

Key architectural highlights:
- **Dynamic Field Management**: Supports both standard 9 fields and unlimited custom fields
- **Real-time Validation**: Field-level validation with format-aware warnings
- **Batch Operations**: Apply changes to individual files or entire folders
- **Album Art Integration**: Full support for embedded artwork with format limitations
- **Inference System**: AI-powered field suggestions for empty fields with seamless keyboard navigation
- **Field Deletion**: SHIFT+DELETE keyboard shortcut for quick field removal with navigable confirmation
  - Enhanced confirmation UI positioning for grouped fields (Track #, Disc #, Year) to prevent overlap
  - Synchronized input field alignment during confirmation display
- **History Tracking**: Complete undo/redo functionality for all operations
- **Loading States**: Clean loading indicator with content wrapper to prevent visual artifacts

## Editor Component Architecture

### Core Module Structure
The metadata editor is implemented as a JavaScript module at `/static/js/metadata/editor.js` with the following structure.

**Architecture Note**: Oversized field detection (≥100 characters) is handled entirely by the frontend, eliminating backend preprocessing and improving separation of concerns. The backend now sends all field values regardless of length, and the frontend determines the appropriate display format.

```javascript
window.MetadataRemote.Metadata.Editor = {
    // Initialization
    init(callbacks) { ... },
    
    // Field Rendering
    renderMetadataFields(metadata) { ... },
    renderStandardFields(metadata) { ... },
    renderDynamicField(fieldId, fieldInfo, container) { ... },
    
    // Field Operations
    save(showButtonStatus) { ... },
    resetForm(showButtonStatus) { ... },
    saveFieldToFile(field, showButtonStatus) { ... },
    applyFieldToFolder(field, showButtonStatus, setFormEnabled) { ... },
    
    // Field Management with Direct UI Manipulation
    createNewField(applyToFolder) { ... },  // Now uses direct UI updates for single file operations
    deleteField(fieldId) { ... },
    confirmDelete(fieldId) { ... },  // Enhanced with grouped field positioning logic
    deleteFromFile(fieldId) { ... },  // Enhanced with direct UI manipulation, no file reload
    triggerFieldDeletion(fieldId) { ... },  // Keyboard-triggered deletion with confirmation UI
    
    // UI State Management
    hideFieldControls(field) { ... },    // Fixed: Now properly hides grouped controls with style.display = 'none'
    hideAllApplyControls() { ... },
    updateNavigableElements() { ... },  // Updates keyboard navigation after DOM changes
    cleanupFieldMonitoring(fieldId) { ... },  // Cleans up TransitionController monitoring when fields are removed
    
    // Exposed Data for Inter-module Communication
    dynamicFields: dynamicFields,  // Set of dynamic field IDs
    standardFieldsInfo: standardFieldsInfo,  // Standard field definitions
    isStandardField: (fieldId) => { ... }  // Helper to check if field is standard
}
```

### Component Dependencies
1. **State Module** (`/static/js/state.js`): Manages application state including current file metadata
2. **API Module** (`/static/js/api.js`): Handles all backend communication
3. **UI Utilities** (`/static/js/ui/utilities.js`): Common UI functions
4. **Button Status** (`/static/js/ui/button-status.js`): Visual feedback for operations
5. **TransitionController** (`/static/js/metadata/transition-controller.js`): Manages automatic inline/modal transitions
6. **FieldEditModal** (`/static/js/metadata/field-edit-modal.js`): Modal interface for oversized fields

**Note**: For comprehensive documentation on the modal editing feature for oversized fields, see **[Modal Editing Feature Analysis](./modal-editing.md)**.

### Field Storage Architecture
The editor maintains two types of fields:
- **Standard Fields**: 9 predefined fields stored in `standardFields` array (line 23)
- **Dynamic Fields**: Custom fields tracked in `dynamicFields` Map (line 22)

### Direct UI Manipulation for Field Operations

Recent enhancements have introduced direct UI manipulation for single file field operations, eliminating unnecessary server round-trips:

1. **Field Deletion Without Reload** (`deleteFromFile`, lines 1568-1690)
   - Standard fields: Hidden using `display: none` and disabled to prevent save collection
   - Dynamic fields: Removed from DOM completely
   - State immediately updated in `State.originalMetadata` and `dynamicFields` Map
   - Extended fields toggle visibility updated based on remaining dynamic fields
   - Focus management occurs immediately without delay
   - **Grouped Field Enhancement**: Special handling for Track #, Disc #, Year fields:
     - Confirmation UI positioned between label and input to prevent overlap
     - `has-confirmation-ui` class synchronizes all three input fields' positions
     - Shorter confirmation text ("Delete from:" vs "Delete field from:") for space efficiency

2. **Field Creation Without Reload** (`createNewField`, lines 1129-1201)
   - Standard fields: Unhidden by setting `display` to empty string and enabling input
   - Dynamic fields: Rendered directly and added to `dynamicFields` Map
   - Event listeners attached to new fields immediately
   - State synchronized with `State.originalMetadata` update
   - New field automatically focused in edit mode

3. **Benefits of Direct Manipulation**
   - Instant visual feedback without server round-trip
   - Preserved focus context in metadata pane
   - Improved performance for common operations
   - Seamless user experience with immediate UI updates

## Field Type Matrix

### Standard Fields (9 Core Fields)

| Field ID | Display Name | Type | Group | Placeholder | Line Reference |
|----------|--------------|------|-------|-------------|----------------|
| title | Title | text | regular | Enter title | 528 |
| artist | Artist | text | regular | Enter artist | 529 |
| album | Album | text | regular | Enter album | 530 |
| albumartist | Album Artist | text | regular | Enter album artist | 531 |
| composer | Composer | text | regular | Enter composer | 532 |
| genre | Genre | text | regular | Enter genre | 533 |
| track | Track # | text | numbers | Enter track number | 534 |
| disc | Disc # | text | numbers | Enter CD number | 535 |
| date | Year | text | numbers | Enter year | 536 |

### Dynamic Field Types

| Field Type | Display Behavior | Edit Capability | Line Reference |
|------------|------------------|-----------------|----------------|
| text (<100 chars) | Normal input field | Editable | 783-790 |
| text (≥100 chars) | Centered "Click to view/edit" button | Modal Editor | 846-868 |
| binary | "Unsupported Content type" | Disabled | 821-827 |
| custom | User-defined field | Editable | 767-819 |

## Form Generation Logic

### Field Rendering Pipeline

1. **Metadata Reception** (`renderMetadataFields`, line 730)
   - Receives metadata object with `all_fields` property
   - Clears existing dynamic fields container
   - Resets dynamic field tracking

2. **Standard Field Rendering** (`renderStandardFields`, line 517)
   - Processes existing standard fields from metadata
   - Groups number fields (track, disc, date) for special layout
   - Generates HTML with inference support elements

3. **Dynamic Field Discovery** (lines 729-747)
   - Iterates through `all_fields` object
   - Validates field IDs (max 50 chars, no null bytes)
   - Skips standard fields already rendered
   - Creates dynamic field entries

### HTML Generation Pattern

Standard field template (lines 584-625):
```html
<div class="form-group-with-button standard-field">
    <div class="form-group-wrapper">
        <div class="label-with-delete">
            <label for="{field}">{display}</label>
            <button type="button" class="delete-field-btn">⊖</button>
        </div>
        <div class="input-wrapper">
            <input type="text" id="{field}" data-field="{field}">
            <div class="inference-loading" id="{field}-loading"></div>
            <div class="inference-suggestions" id="{field}-suggestions"></div>
        </div>
    </div>
    <div class="apply-field-controls" data-field="{field}">
        <button class="apply-file-btn">File</button>
        <button class="apply-folder-btn-new" 
                onclick="window.MetadataRemote.Metadata.Editor.showFolderConfirmation('{field}');">Folder</button>
        <div class="folder-confirmation" data-field="{field}" style="display: none;">
            <span class="confirm-text">Apply to folder?</span>
            <button type="button" class="confirm-yes">Yes</button>
            <button type="button" class="confirm-no">No</button>
        </div>
    </div>
</div>
```

## Field Type Handlers

### Automatic Transition Controller

The TransitionController module (`/static/js/metadata/transition-controller.js`) manages automatic transitions between inline and modal editing modes:

1. **Configuration Constants** (lines 17-20)
   ```javascript
   INLINE_TO_MODAL_THRESHOLD: 100,    // Characters to trigger modal
   MODAL_TO_INLINE_THRESHOLD: 80,     // Characters to return to inline (hysteresis)
   DEBOUNCE_DELAY: 300               // Milliseconds to wait before checking
   ```

2. **Field Monitoring** (`monitorField`, lines 48-82)
   - Attaches input event listeners to track character count
   - Maintains active monitor registry in Map structure
   - Skips disabled or already monitored fields
   - Preserves handler references for proper cleanup

3. **Transition Logic** (`checkThreshold`, lines 184-207)
   - Only transitions during active editing (not programmatic changes)
   - Checks character count against thresholds
   - Prevents transitions if field already in oversized state
   - Ensures smooth user experience without interruption

4. **Paste Optimization** (`handlePaste`, lines 150-179)
   - Intercepts paste events for immediate transition
   - Calculates resulting text length before paste completes
   - Transitions to modal if threshold would be exceeded
   - Prevents UI lag on large content pastes

5. **Modal Integration** (lines 285-336)
   - Bidirectional communication with FieldEditModal
   - Character count callback triggers return transitions
   - Preserves focus and cursor position throughout
   - Maintains proper navigation state machine state

6. **Resource Management** (`cleanup`, lines 342-354)
   - Removes all event listeners on cleanup
   - Clears pending timeouts
   - Prevents memory leaks
   - Called on field removal or page unload

### Oversized Field Modal Editor with Automatic Transitions

Oversized fields (>100 characters) have dedicated modal editing functionality with automatic transition capabilities:

1. **Field Rendering** (`renderDynamicField`, lines 846-868)
   - Frontend detects fields with ≥100 characters and displays them as buttons
   - Button element gets `oversized-field-button` class
   - Button displays centered "Click to view/edit" text
   - Light mode: darker, bolder text (color: #3a3222, font-weight: 600)
   - Click handler opens modal with full field content

2. **Automatic Transition System** (`transition-controller.js`)
   The TransitionController module provides seamless automatic transitions between inline and modal editing:
   
   **Key Features:**
   - **Character Count Monitoring**: Actively monitors field input length during typing
   - **Threshold-based Transitions**: 
     - Transitions to modal when exceeding 100 characters
     - Returns to inline editing when falling below 80 characters (hysteresis prevents bouncing)
   - **Immediate Paste Handling**: Large pastes trigger instant modal transition
   - **Cursor Position Preservation**: Maintains cursor position during all transitions
   - **Performance Optimized**: 300ms debouncing for input changes
   
   **Integration Points:**
   - Monitors all text input fields in metadata pane
   - Cleanup on field removal or page navigation
   - Respects programmatic changes (undo/redo operations don't trigger transitions)
   
3. **Modal Activation**
   - Manual: Click handler opens modal with full field content
   - Manual: Enter key triggers modal open (intercepted by keyboard navigation)
   - Automatic: TransitionController opens modal when threshold exceeded
   - Modal receives fieldId, fieldInfo, and trigger element reference

4. **Modal Features** (`field-edit-modal.js`)
   - Large textarea for comfortable editing (min-height: 300px)
   - Real-time change detection enables/disables save buttons
   - Character count monitoring with callback to TransitionController
   - Dual save options: Apply to current file or entire folder
   - Reset button restores original content
   - Keyboard shortcuts: Escape to close, Tab for navigation
   - Loading states with visual feedback during save operations

5. **State Management**
   - Modal updates `State.originalMetadata` on successful save
   - Trigger element value updated to show save state
   - History panel automatically refreshed
   - No full file reload required - uses direct UI updates
   - TransitionController maintains active monitor state

6. **Styling and Theme Support**
   - Glassmorphism effects with backdrop blur
   - Full dark/light theme support
   - Mobile responsive design
   - Smooth open/close animations

### Input Event Handling (`attachFieldEventListeners`, line 872)

The system attaches comprehensive event listeners to each field:

1. **Change Detection** (lines 876-925)
   - Monitors input events for value changes
   - Compares against `State.originalMetadata`
   - Shows/hides apply controls based on changes

2. **Grouped Field Handling** (lines 880-903)
   - Special handling for track, disc, date fields
   - Manages grouped apply controls visibility
   - Coordinates multi-field changes

3. **Transition Monitoring** (lines 946-954)
   - Adds TransitionController monitoring for all editable text fields
   - Enables automatic inline-to-modal transitions based on character count
   - Monitors both standard and dynamic fields

### Field Value Processing

1. **Empty String Handling** (lines 223, 233, 397-400)
   - Single space treated as empty string
   - Ensures consistent cross-format behavior
   - Special handling for different audio formats

2. **Dynamic Field Values** (lines 228-234)
   - Collects values from enabled, editable fields
   - Applies same empty string normalization
   - Preserves field state for disabled fields

## Validation System Analysis

### Field Name Validation (`validateCustomFieldName`, line 959)

The validation system provides format-aware field name checking:

1. **Basic Validation** (lines 964-972)
   - Required field check
   - Forbidden characters (= and ~)
   - Maximum length enforcement (50 chars)

2. **Space Handling** (lines 975-999)
   - Detects spaces in field names
   - Format-specific compatibility warnings
   - Suggests underscore alternatives

3. **Format Compatibility** (lines 978-997)
   ```javascript
   const spaceFriendlyFormats = ['flac', 'ogg'];
   ```
   - FLAC/OGG handle spaces well
   - Other formats receive stronger warnings

### Character Set Validation (lines 1002-1007)
- Enforces alphanumeric + underscore pattern
- Provides clear error messages
- Prevents invalid field creation

## Save/Cancel Workflows

### Save All Fields Workflow (`save`, line 208)

1. **Pre-save State** (lines 212-217)
   - Stores currently focused element
   - Collects all field values
   - Normalizes empty strings

2. **Data Collection** (lines 218-239)
   - Standard fields: lines 219-225
   - Dynamic fields: lines 228-234
   - Album art: lines 236-238
   - **Enhanced to handle oversized field buttons**: Retrieves values from fieldInfo objects when field is displayed as button

3. **API Interaction** (lines 245-276)
   - Calls `API.setMetadata` with collected data
   - Updates `State.originalMetadata` on success
   - Hides all apply controls

4. **Post-save Actions** (lines 249-274)
   - Updates original metadata state
   - Refreshes history via callback
   - Restores focus to previous element
   - Calls hideAllApplyControls() to clean up UI

### Reset Form Workflow (`resetForm`, line 306)

1. **State Preservation** (line 310)
   - Stores focused element for restoration

2. **Visual Feedback** (lines 313, 371, 384)
   - Shows processing spinner icon (no text) during reset
   - Shows success checkmark icon (no text) on completion
   - Shows error X icon (no text) on failure
   - Uses empty string for button status messages to display icons only

3. **Data Refresh** (lines 316-341)
   - Fetches fresh metadata from backend
   - Updates `State.originalMetadata` for standard fields
   - **Important**: Also restores dynamic field values to `State.originalMetadata` (lines 330-341)
   - Re-renders all fields

4. **UI Reset** (lines 346-369)
   - Clears pending album art
   - Restores album art display
   - Hides all apply controls

### Individual Field Save (`saveFieldToFile`, line 378)

1. **Field Resolution** (lines 383-388)
   - Finds input by data-field attribute
   - Works for both standard and dynamic fields

2. **Single Field Update** (lines 395-401)
   - Creates minimal metadata object
   - Applies empty string normalization

3. **Success Handling** (lines 402-423)
   - Updates original metadata for field
   - Hides field controls after delay
   - Maintains focus on field

## Loading Indicator System

### Loading Indicator Component (`/templates/index.html:120-125`)

The metadata pane includes a dedicated loading indicator that displays while file metadata is being fetched:

```html
<div id="metadata-loading-indicator" class="metadata-loading-indicator" style="display: none;">
    <div class="loading-spinner-container">
        <div class="loading-spinner"></div>
        <div class="loading-text">Loading metadata...</div>
    </div>
</div>
```

### Content Wrapper Structure (`/templates/index.html:127-233`)

All metadata content is wrapped in a single container div that can be hidden/shown as a unit during loading operations:

```html
<div id="metadata-content-wrapper">
    <!-- Album art section -->
    <!-- Metadata form -->
    <!-- Extended fields toggle and container -->
    <!-- New field creation form -->
    <!-- Save/Reset buttons -->
    <!-- Status div -->
</div>
```

This wrapper approach eliminates visual artifacts where individual UI elements would appear beneath the loading spinner during the loading process.

### Loading State Management

The loading indicator is controlled by the Files Manager module during the file loading process. The implementation uses a content wrapper approach to hide all metadata elements as a single unit:

1. **Show Loading State** (`/static/js/files/manager.js:402-404`):
   ```javascript
   // Show loading indicator
   document.getElementById('metadata-loading-indicator').style.display = 'flex';
   document.getElementById('metadata-content-wrapper').style.display = 'none';
   ```

2. **Hide Loading State - Success** (`/static/js/files/manager.js:467-469`):
   ```javascript
   // Hide loading indicator and show content
   document.getElementById('metadata-loading-indicator').style.display = 'none';
   document.getElementById('metadata-content-wrapper').style.display = '';
   ```

3. **Hide Loading State - Error** (`/static/js/files/manager.js:566-568`):
   ```javascript
   // Hide loading indicator on error
   document.getElementById('metadata-loading-indicator').style.display = 'none';
   document.getElementById('metadata-content-wrapper').style.display = '';
   ```

### Loading Indicator Styling (`/static/css/main.css:2589-2616`)

The loading indicator uses a centered layout with spinning animation:

```css
/* Metadata loading indicator */
.metadata-loading-indicator {
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 200px;
    padding: 2rem;
}

.loading-spinner-container {
    text-align: center;
}

.loading-spinner {
    width: 40px;
    height: 40px;
    margin: 0 auto 1rem;
    border: 3px solid rgba(74, 127, 255, 0.2);
    border-radius: 50%;
    border-top-color: var(--accent-primary);
    animation: spin 1s linear infinite;
}

.loading-text {
    color: var(--text-secondary);
    font-size: 0.9rem;
    margin-top: 0.5rem;
}
```

### Loading Flow Integration

1. User selects a file from the files pane
2. Files Manager shows the loading indicator and hides the entire metadata content wrapper
3. API request is made to fetch metadata
4. On successful response, metadata is rendered and content wrapper is shown with loading indicator hidden
5. On error, loading indicator is hidden and content wrapper is shown (allowing manual retry)

This approach provides a cleaner loading experience by ensuring no metadata UI elements are visible beneath the loading spinner during the loading process.

## Album Art Integration

**Note**: While the metadata inference system supports 9 different text-based fields, album art inference is not currently implemented. The album art functionality is limited to manual upload, deletion, and batch application.

### Album Art Module (`/static/js/metadata/album-art.js`)

The album art system provides comprehensive image management with metadata display capabilities:

1. **Metadata Display Functions** (lines 33-102)
   - `calculateImageMetadata` (line 38): Analyzes image data URLs to extract resolution, file size, and format
   - `formatFileSize` (line 75): Converts bytes to human-readable format (B/KB/MB)
   - `displayAlbumArtWithMetadata` (line 88): Renders album art with metadata overlay

2. **Upload Handling** (`handleArtUpload`, line 108)
   - FileReader API for local file processing
   - Base64 encoding for data URLs
   - Updates UI with preview using `displayAlbumArtWithMetadata`
   - Shows metadata overlay on hover (resolution, size, format)

3. **Deletion Process** (`deleteAlbumArt`, line 132)
   - Immediate deletion from file
   - Sets `removeArt: true` flag
   - Updates UI state

4. **Save Operations** (`saveAlbumArt`, line 172)
   - Saves only album art to current file
   - Updates state tracking
   - Provides visual feedback

5. **Batch Application** (`applyArtToFolder`, line 211)
   - Confirms operation with user
   - Applies to all files in folder
   - Handles format limitations

### Album Art Metadata Display

The system now displays album art metadata as a semi-transparent overlay when hovering over artwork:

1. **Metadata Calculation**
   - Extracts image dimensions using browser's native Image API
   - Calculates file size from base64 string (accounting for padding)
   - Detects image format from data URL MIME type

2. **Display Format**
   - Shows: "{width}x{height}, {size}, {format}"
   - Example: "600x600, 45KB, JPEG"
   - Overlay appears on hover with smooth opacity transition

3. **Integration Points**
   - Album art upload: Automatically displays metadata for newly uploaded images
   - File loading: Files Manager calls `displayAlbumArtWithMetadata` for existing album art
   - Fallback support: Gracefully handles missing module or errors

### Format Limitations (Backend)

From `/core/metadata/writer.py` (lines 38-41):
```python
if art_data and base_format in FORMAT_METADATA_CONFIG.get('no_embedded_art', []):
    logger.warning(f"Format {base_format} does not support embedded album art")
    art_data = None
```

## Inference System Integration

The metadata pane integrates a sophisticated inference system that provides intelligent suggestions for empty metadata fields. The system combines local pattern matching with external API queries to deliver accurate, confidence-scored suggestions.

### Frontend Integration (`/static/js/metadata/inference.js`)

The inference system provides a non-intrusive UI for metadata suggestions:

1. **Trigger Mechanism** (lines 46-50)
   - Activates on click for empty fields only
   - Requires current file context
   - Prevents duplicate requests with active request tracking

2. **API Communication** (lines 82-84)
   ```javascript
   const response = await fetch(`/infer/${encodeURIComponent(State.currentFile)}/${field}`)
   ```
   - Supports 9 field types: title, artist, album, albumartist, date, genre, track, disc, composer
   - Uses AbortController for request cancellation
   - Implements proper error handling for network failures

3. **Suggestion Display** (lines 122-174)
   - Shows top 5 suggestions with confidence percentages
   - Visual confidence bars with animated fills
   - Evidence-based explanations for each suggestion
   - Click to apply suggestion with immediate field update

4. **Performance Optimizations** (lines 69-75)
   - Cancels previous requests before new ones
   - Prevents overlapping calls
   - Manages loading states with spinner animation
   - Implements request debouncing capability

### Backend Architecture

The inference system uses a multi-phase algorithm implemented in `core/inference.py`:

1. **Evidence Collection Phase**
   - Analyzes filename patterns and segments
   - Examines folder structure (parent/grandparent)
   - Detects sibling file patterns
   - Reads existing metadata for context

2. **Local Inference Phase**
   - Field-specific pattern matching
   - Composer detection for classical music
   - Track number pattern recognition
   - Date extraction from multiple sources

3. **External Enhancement Phase**
   - MusicBrainz API integration
   - Rate-limited queries (1 request/second)
   - Conditional queries based on local confidence

4. **Synthesis and Scoring Phase**
   - Combines local and external candidates
   - Applies consensus boosting
   - Returns confidence-scored suggestions

### Integration Points

1. **Field Creation** (`renderStandardField`, lines 627-630)
   - Attaches inference handlers during field rendering
   - Adds loading spinner and suggestion containers
   - Maintains proper DOM structure for positioning

2. **State Management**
   - Tracks active inference requests in global state
   - Manages abort controllers for cancellation
   - Caches last results per field

3. **User Interaction Flow**
   - Click empty field → Show loading → Display suggestions
   - Type in field → Hide suggestions (unless field becomes empty, then show suggestions)
   - Delete/backspace to empty field → Automatically show suggestions
   - Click outside → Hide suggestions with delay
   - Select suggestion → Fill field and mark as modified
   - ArrowDown from input → Navigate into suggestions (when present)
   - ArrowUp from input → Hide suggestions and navigate to previous field
   - Escape in suggestions → Return focus to input field

4. **Visual Design**
   - Glassmorphism-styled dropdown
   - Smooth animations and transitions
   - Confidence bars with primary color
   - Responsive positioning below fields
   - Theme-aware styling with optimized colors for both dark and light themes

### Supported Field Types

Each field type has specialized inference logic:

- **Title**: Removes track numbers, cleans artifacts
- **Artist**: Prioritizes folder structure analysis
- **Album**: Extracts from folder names
- **Track**: Multiple regex patterns, sibling consistency
- **Date**: Year extraction with validation
- **Genre**: MusicBrainz genre mapping
- **Composer**: Classical music pattern detection
- **Disc**: CD/Disc number patterns
- **AlbumArtist**: Falls back to artist inference

### Performance Characteristics

- Local inference: 5-20ms
- MusicBrainz query: 200-500ms
- Cached response: <1ms
- Full inference: 50-600ms typical

For complete implementation details, see:
- [Inference System Backend Documentation](./inference-system-backend.md)
- [Inference System Frontend Documentation](./inference-system-frontend.md)

## Batch Editing Implementation

### Folder-Level Operations

1. **Field Application** (`applyFieldToFolder`, line 441)
   - Validates field and value
   - No longer shows popup confirmation (removed in recent update)
   - Disables form during operation
   - Confirmation now handled by inline UI before this function is called

2. **Backend Processing** (`/app.py`, lines 841-905)
   ```python
   def apply_field_to_folder():
       # Check field existence for each file
       # Categorize files: updates vs. creations
       # Process each file in folder
       # Create appropriate history actions:
       #   - BATCH_METADATA for field updates
       #   - BATCH_CREATE_FIELD for new fields
   ```

3. **History Tracking** (lines 894-903)
   - Captures before values for each file
   - Creates appropriate batch history entry based on operation type
   - Enables mass undo operations

### Album Art Batch Processing

1. **Frontend Initiation** (`applyArtToFolder`, line 140)
   - Uses current or pending album art
   - Confirms replacement warning
   - Shows file count in success message

2. **Backend Handler** (`/app.py`, lines 692-726)
   - Validates art data presence
   - Processes all audio files
   - Records batch history

## Custom Field Creation UI

### UI Structure (`/templates/index.html`, lines 173-210)

```html
<div class="new-field-creator">
    <div class="new-field-header" onclick="toggleNewFieldForm()">
        <span class="expand-icon">▶</span>
        <span>Create New Field</span>
    </div>
    <div id="new-field-form" style="display: none;">
        <input type="text" id="new-field-name" placeholder="Field name">
        <textarea id="new-field-value" placeholder="Field value"></textarea>
        <div class="new-field-buttons">
            <button onclick="createNewField(false)">Save to File</button>
            <button onclick="createNewField(true)">Save to Folder</button>
            <button onclick="cancelNewField()">Cancel</button>
        </div>
    </div>
</div>
```

### Creation Process (`createNewField`, line 1017)

1. **Input Validation** (lines 1018-1037)
   - Field name required check
   - Length validation (50 char max)
   - Null byte detection

2. **Field Normalization** (lines 1040-1067)
   - Checks against standard field variations
   - Uses normalized field IDs
   - Shows format warnings for spaces

3. **Duplicate Detection** (lines 1069-1081)
   - Checks existing standard fields
   - Verifies against dynamic fields
   - Case-insensitive comparison

4. **API Submission** (lines 1083-1118)
   - Single file: `API.createField`
   - Folder: `API.applyFieldToFolder`
   - Reloads file on success

### Field Name Normalization Map (lines 36-91)

The system maintains comprehensive field name mappings:
```javascript
const fieldNameNormalizations = {
    'title': 'title',
    'song': 'title',
    'song title': 'title',
    'artist': 'artist',
    'performer': 'artist',
    // ... 50+ variations
}
```

## Workflow Diagrams

### Field Edit Workflow
```
User clicks field → Enter edit mode
                 ↓
            Type new value
                 ↓
        Change detected (input event)
                 ↓
        Show apply controls
                 ↓
    User selects File or Folder
                 ↓
    Apply changes via API
                 ↓
    Update state & hide controls
```

### Batch Operation Workflow
```
User changes field value
           ↓
    Clicks "Folder" button
           ↓
    Inline confirmation UI appears
    ("Apply to folder? [Yes] [No]")
           ↓
    User clicks "Yes"
           ↓
    Disable form & show progress
           ↓
    Process each file in folder
           ↓
    Create batch history entry
           ↓
    Show results & re-enable form
```

### Custom Field Creation Workflow
```
User clicks "Create New Field"
           ↓
    Form expands
           ↓
    Enter field name & value
           ↓
    Validation checks:
    - Length < 50
    - No forbidden chars
    - Format compatibility
           ↓
    Submit to backend
           ↓
    Field added to file/folder
           ↓
    Reload metadata display
```

## Code References

### Key File Locations

1. **Frontend Components**
   - Main Editor: `/static/js/metadata/editor.js` (1275 lines)
   - Album Art: `/static/js/metadata/album-art.js` (193 lines)
   - Inference: `/static/js/metadata/inference.js` (201 lines)
   - TransitionController: `/static/js/metadata/transition-controller.js` (356 lines)
   - Field Edit Modal: `/static/js/metadata/field-edit-modal.js` (~300 lines)

2. **Backend Handlers**
   - Metadata Reading: `/core/metadata/reader.py` (69 lines)
   - Metadata Writing: `/core/metadata/writer.py` (84 lines)
   - Batch Processing: `/core/batch/processor.py` (77 lines)
   - Mutagen Integration: `/core/metadata/mutagen_handler.py` (1000+ lines)

3. **API Endpoints**
   - Get Metadata: `/app.py:321` - `GET /metadata/<path:filename>`
   - Set Metadata: `/app.py:371` - `POST /metadata/<path:filename>`
   - Delete Field: `/app.py:427` - `DELETE /metadata/<path:filename>/<field_id>`
   - Create Field: `/app.py:486` - `POST /metadata/create-field`
   - Apply to Folder: `/app.py:728` - `POST /apply-field-to-folder`
   - Apply Art to Folder: `/app.py:692` - `POST /apply-art-to-folder`

### Critical Functions

1. **Field Rendering**
   - `renderMetadataFields`: Line 730
   - `renderStandardFields`: Line 517
   - `renderDynamicField`: Line 767

2. **Save Operations**
   - `save`: Line 208
   - `saveFieldToFile`: Line 378
   - `applyFieldToFolder`: Line 441
   - `showFolderConfirmation`: Line 1826
   - `cancelFolderApply`: Line 1845
   - `confirmFolderApply`: Line 1865

3. **Field Management with Direct UI Updates**
   - `confirmDelete`: Lines 1455-1557 (grouped field positioning logic)
   - `deleteFromFile`: Lines 1568-1690 (direct UI manipulation)
   - `createNewField`: Lines 1017-1209 (enhanced with direct UI for single files)
   - `updateNavigableElements`: Called after DOM changes

4. **Validation**
   - `validateCustomFieldName`: Line 959
   - `_is_valid_field`: `/core/metadata/mutagen_handler.py:340`

5. **Event Handling**
   - `attachFieldEventListeners`: Line 872
   - `updateControlsVisibility`: Line 876

6. **Album Art**
   - `handleArtUpload`: `/static/js/metadata/album-art.js:37`
   - `deleteAlbumArt`: `/static/js/metadata/album-art.js:61`
   - `applyArtToFolder`: `/static/js/metadata/album-art.js:140`

7. **Inference Integration**
   - `showInferenceSuggestions`: `/static/js/metadata/inference.js:62`
   - `displaySuggestions`: `/static/js/metadata/inference.js:122`

8. **Batch Processing**
   - `process_folder_files`: `/core/batch/processor.py:12`
   - `apply_field_to_folder`: `/app.py:728`

9. **History Management**
   - `create_metadata_action`: Referenced in `/app.py:404`
   - `create_batch_metadata_action`: Referenced in `/app.py:763`

### State Management References

1. **Original Metadata Storage**: Lines 250-254, 317-327
2. **Pending Album Art**: Lines 236-238, 267-271
3. **Dynamic Fields Map**: Line 22, usage throughout
4. **Inference State**: `/static/js/state.js` - `inferenceActive`, `inferenceAbortControllers`

### UI State Synchronization

1. **Focus Management**: Lines 212, 290-298, 309, 358-366
2. **Button Status Updates**: Multiple calls to `showButtonStatus`
3. **Apply Controls Visibility**: `hideFieldControls` (146-178), `hideAllApplyControls` (182-197)
   - **Bug Fix**: `hideFieldControls` now properly sets `style.display = 'none'` on grouped controls (line 168)
   - This fixes an issue where grouped apply controls (Track #, Disc #, Year) would persist in the UI after folder apply operations
   - The fix ensures inline styles are cleared, allowing CSS defaults to take effect
   
4. **Grouped Field Delete Confirmation Positioning**:
   - CSS rules in `main.css:1904-1963` provide special positioning for Track #, Disc #, Year fields
   - Confirmation UI placed between label and input instead of in label area
   - Year field confirmation is right-aligned using flexbox
   - All three input fields move down together when any shows confirmation UI
   
5. **Form Enable/Disable**: Via `UIUtils.setFormEnabled`

This comprehensive analysis covers all aspects of the metadata pane functionality, from the frontend UI components through validation and backend processing, providing a complete picture of the system's architecture and implementation.