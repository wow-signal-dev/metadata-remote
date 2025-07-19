# Files Pane Codebase Structure and Functionality

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [File Listing Architecture](#file-listing-architecture)
3. [Selection State Management](#selection-state-management)
4. [Sorting Algorithm Analysis](#sorting-algorithm-analysis)
5. [Search Implementation Details](#search-implementation-details)
6. [File Type Detection and Icon Display](#file-type-detection-and-icon-display)
7. [User Interface Components](#user-interface-components)
8. [Event Handling and Interactions](#event-handling-and-interactions)
9. [Performance Considerations](#performance-considerations)
10. [Feature Enhancement Suggestions](#feature-enhancement-suggestions)

## Executive Summary

The Files Pane in Metadata Remote is a sophisticated file management component that provides audio file browsing, sorting, filtering, and selection capabilities. The implementation is centered around the `static/js/files/manager.js` module, which coordinates with various other modules for navigation, state management, and UI rendering.

Key architectural highlights:
- **Modular Design**: The files pane is implemented as a self-contained module with clear separation of concerns
- **State-Driven**: All file data and UI state is managed centrally through the State module
- **Performance-Optimized**: Features debouncing for file loading and efficient DOM manipulation
- **Keyboard-First**: Full keyboard navigation support with arrow keys, page up/down, Enter, Space, and focus management
- **Format-Aware**: Intelligent file type detection with visual indicators for audio formats
- **Audio Integration**: Built-in playback controls with visual state management
- **Browser Compatibility**: Special handling for WMA (disabled) and WavPack (transcoded) formats

## File Listing Architecture

### Core Module Structure

The file listing functionality is primarily implemented in `static/js/files/manager.js` (lines 1-605):

```javascript
window.MetadataRemote.Files.Manager = {
    init(callbacks) { ... },
    setupFileControls() { ... },
    loadFiles(folderPath) { ... },
    renderFileList() { ... },
    loadFile(filepath, listItem) { ... }  // Updated to handle WMA duplicate field issues
}
```

### File Data Model

Files are stored in the state as an array of objects (State.js, line 20):
```javascript
currentFiles: []  // Array of file objects with structure:
// {
//   name: string,
//   path: string,
//   folder: string,
//   date: number (timestamp),
//   size: number (bytes)
// }
```

### Rendering Pipeline

The file listing follows this rendering flow:

1. **Data Loading** (`manager.js`, lines 186-212):
   - API call to load files from a folder path
   - Store raw file data in `State.currentFiles`
   - Update file count display

2. **Filtering** (`manager.js`, lines 282-290):
   - Apply case-insensitive text filter
   - Filter is stored in `State.filesFilter`

3. **Sorting** (`manager.js`, lines 219-257):
   - Sort by name, date, type, or size
   - Direction can be ascending or descending

4. **DOM Generation** (`manager.js`, lines 299-357):
   - Create list items with file info, format badges, and play buttons
   - Add metadata display for sorted fields
   - Integrate audio playback controls with three visual states (default, loading, playing)

## Selection State Management

### Single Selection Model

The files pane implements a single-selection model managed through state:

**State Variables** (`state.js`, lines 14-15):
```javascript
selectedListItem: null,  // Currently selected file DOM element
currentFile: null,       // Currently loaded file path
```

### Selection Mechanisms

1. **Mouse Selection** (`manager.js`, lines 351-355):
```javascript
li.onclick = (e) => {
    if (\!e.target.closest('.play-button')) {
        this.loadFile(file.path, li);
    }
};
```

2. **Keyboard Selection** (`list-navigation.js`, lines 209-258):
```javascript
navigateFiles(direction) {
    // Find current index
    // Calculate new index based on direction
    // Update selection via callback
    callbacks.selectFileItem(fileItems[newIndex], true);
}
```

### Selection Visual Feedback

- Selected items receive the `selected` CSS class
- Keyboard navigation adds `keyboard-focus` class
- Visual indicators include background color change and border highlighting

## Sorting Algorithm Analysis

### Sort Configuration

Sort state is maintained per-pane (`state.js`, lines 31-34):
```javascript
filesSort: {
    method: 'name',      // 'name', 'date', 'type', 'size'
    direction: 'asc'     // 'asc', 'desc'
}
```

### Sort Implementation

The sorting algorithm (`manager.js`, lines 219-257) uses a comparator pattern:

```javascript
sortFiles(files) {
    return [...files].sort((a, b) => {
        let aVal, bVal;
        
        switch (State.filesSort.method) {
            case 'name':
                aVal = a.name.toLowerCase();
                bVal = b.name.toLowerCase();
                break;
            case 'type':
                const aExt = a.name.split('.').pop().toLowerCase();
                const bExt = b.name.split('.').pop().toLowerCase();
                aVal = aExt;
                bVal = bExt;
                break;
            // ... other cases
        }
        
        if (State.filesSort.direction === 'asc') {
            return aVal > bVal ? 1 : -1;
        } else {
            return aVal < bVal ? 1 : -1;
        }
    });
}
```

### Smart Defaults

The system applies intelligent defaults based on field type (`manager.js`, lines 107-109):
- Date and size fields default to descending (newest/largest first)
- Name and type fields default to ascending

## Search Implementation Details

### Filter Architecture

The search/filter system uses real-time filtering:

1. **UI Components** (`index.html`, lines 72-87):
```html
<button class="control-icon" id="files-filter-btn">🔍</button>
<div class="filter-container" id="files-filter">
    <input type="text" class="filter-input" id="files-filter-input">
</div>
```

2. **Event Handling** (`manager.js`, lines 64-68):
```javascript
filterInput.addEventListener('input', (e) => {
    State.filesFilter = e.target.value;
    this.renderFileList(); // Re-render with filter
});
```

3. **Filter Logic** (`manager.js`, lines 286-290):
```javascript
if (filterValue.length > 0) {
    filteredFiles = State.currentFiles.filter(file => 
        file.name.toLowerCase().includes(filterValue)
    );
}
```

### Filter State Management

- Filter text stored in `State.filesFilter`
- Filter UI state tracked in `State.activeFilterPane`
- Toggle behavior with keyboard shortcut (`/` key)

## File Type Detection and Icon Display

### Format Detection

File type detection is based on file extension (`utilities.js`, lines 63-76):

```javascript
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
}
```

### Format Badges

Visual format indicators with metadata support info (`utilities.js`, lines 83-123):

```javascript
getFormatBadge(filename) {
    const ext = filename.split('.').pop().toUpperCase();
    const lossless = ['FLAC', 'WAV', 'WV', 'OGG', 'OPUS'];
    const limitedMetadata = ['WAV', 'WV'];
    const noAlbumArt = ['WAV', 'WV'];
    
    // Generate badge HTML with color coding:
    // - Green for lossless formats
    // - Orange for lossy formats
    // - Red warning for limitations
}
```

## User Interface Components

### File List Item Structure

Each file item (`manager.js`, lines 299-357) contains:

```javascript
<li data-filepath="{file.path}">
    <div class="file-info">
        <div>{emoji} {filename} {format-badge}</div>
        <div class="file-meta">{date or size if sorted}</div>
        <div class="file-folder">{subfolder if not root}</div>
    </div>
    <div class="play-button" [class="disabled"] [disabled="true"] [title="WMA playback not supported..."]>
        <span class="play-icon">▶</span>        <!-- Default state -->
        <span class="pause-icon">❚❚</span>    <!-- Playing state -->
        <span class="play-spinner"></span>   <!-- Loading state -->
    </div>
</li>
```

Note: WMA files have the play button disabled with the `disabled` class, `disabled` attribute, and explanatory tooltip.

### Control Components

1. **Filter Button** - Toggle search input
2. **Sort Field Button** - Open sort options dropdown
3. **Sort Direction Button** - Toggle asc/desc
4. **File Count Display** - Shows total/filtered count

## Event Handling and Interactions

### Click Events

1. **File Selection** (`manager.js`, line 351):
   - Click on file item loads metadata
   - Delegates to `loadFile()` method

2. **Play Button** (`manager.js`, lines 342-358):
   - Click toggles audio playback via `AudioPlayer.togglePlayback()`
   - Prevents event bubbling to file selection
   - Visual states: play icon (▶), pause icon (❚❚), loading spinner (⟳)
   - Single-track playback enforced (stops previous track)
   - **WMA files**: Play button disabled with "WMA playback not supported in browsers" tooltip
   - **WV files**: Automatically routed to transcoding endpoint for browser compatibility

3. **Sort Controls** (`manager.js`, lines 78-116):
   - Dropdown for sort field selection
   - Direction toggle button

### Keyboard Navigation

Implemented in `list-navigation.js`:

1. **Arrow Keys** (lines 51-60):
   - Up/Down navigation with key repeat support
   - Seamless transition to header controls at boundaries

2. **Page Navigation** (lines 63-72):
   - PageUp/PageDown for rapid navigation
   - Calculates visible items per page dynamically

3. **Enter Key** (lines 75-82):
   - On folders: Expands/collapses folder
   - On files: Toggles audio playback (same as clicking play button)

4. **Space Key** (lines 65-74):
   - Toggles audio playback for selected file
   - Works only when file is selected and files pane has focus

### Focus Management

- Keyboard focus tracked with CSS classes
- Focus transitions between panes via Tab key
- Scroll-to-center behavior for keyboard navigation

## Performance Considerations

### 1. Debounced File Loading

File loading is debounced to prevent rapid API calls (`manager.js`, lines 381-384):
```javascript
if (State.loadFileDebounceTimer) {
    clearTimeout(State.loadFileDebounceTimer);
    State.loadFileDebounceTimer = null;
}
```

### 2. Request ID Tracking

Prevents race conditions with concurrent requests (`manager.js`, lines 367-368, 416-419):
```javascript
const requestId = ++State.loadFileRequestId;
// ... later in response:
if (requestId \!== State.loadFileRequestId) {
    return; // Discard outdated response
}
```

### 3. Efficient DOM Updates

- Complete list re-render on filter/sort changes
- Single DOM operation using innerHTML
- Event delegation for click handlers

### 4. Memory Management

- Limited file data stored in memory
- No caching of rendered DOM elements
- Clean state reset on folder changes

### 5. Metadata State Handling

The file loading process includes special handling for metadata to prevent false positive change detection (`manager.js`, lines 436-447):

```javascript
// Store all fields data if available, but don't overwrite standard fields
if (data.all_fields) {
    const standardFields = ['title', 'artist', 'album', 'albumartist', 'date', 'genre', 'composer', 'track', 'disc'];
    Object.entries(data.all_fields).forEach(([fieldId, fieldInfo]) => {
        if (fieldInfo.value !== undefined && fieldInfo.value !== null) {
            // Only store non-standard fields to avoid overwriting standard field values
            if (!standardFields.includes(fieldId)) {
                State.originalMetadata[fieldId] = fieldInfo.value;
            }
        }
    });
}
```

This approach prevents issues with file formats (particularly WMA) that may return duplicate field representations in both root-level data and the `all_fields` object, ensuring consistent change detection behavior.

### 6. Scroll Performance

- Uses CSS-based scrolling containers
- No virtual scrolling implemented (potential optimization)
- Immediate scroll for keyboard navigation

## Feature Enhancement Suggestions

### 1. Multi-Select Functionality
Currently missing but infrastructure exists for implementation:
- Add `selectedFiles: Set()` to State
- Implement Ctrl/Cmd+Click selection
- Add Shift+Click range selection
- Create batch operation UI

### 2. Drag and Drop Support
No drag-and-drop functionality currently implemented:
- Add dragstart/dragover/drop event handlers
- Support file reordering
- Enable drag to external applications
- Implement visual feedback during drag

### 3. Context Menu Integration
Right-click functionality not implemented:
- Add contextmenu event handler
- Create menu with file operations
- Support keyboard-accessible context menu
- Integrate with batch operations

### 4. Virtual Scrolling
For large file lists (1000+ items):
- Implement windowing/virtualization
- Render only visible items
- Maintain scroll position accuracy
- Preserve keyboard navigation

### 5. Enhanced Search
Current search is basic substring matching:
- Add regex support
- Implement fuzzy matching
- Search across metadata fields
- Add search history

### 6. File Preview
- Add hover preview for audio files
- Show waveform visualization
- Display embedded album art
- Quick metadata tooltip
- Enhanced playback controls (seek bar, volume)
- Playback queue management
- Improve WMA support (consider server-side transcoding)
- Add seek support for transcoded WavPack streams

### 7. Batch Operations UI
Leverage existing API endpoints:
- Visual selection indicator
- Batch operation toolbar
- Progress indicators
- Undo/redo for batch changes

### 8. Performance Monitoring
- Add rendering time metrics
- Track filter/sort performance
- Monitor memory usage
- Implement performance budgets

### 9. Accessibility Enhancements
- Add ARIA labels for screen readers
- Implement proper focus management
- Support high contrast themes
- Add keyboard shortcut customization

### 10. Advanced Sorting
- Multi-column sorting
- Custom sort expressions
- Sort presets/profiles
- Natural number sorting for track numbers
ENDOFFILE < /dev/null
