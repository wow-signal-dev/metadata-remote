# Metadata Remote Architecture Guide

## Table of Contents
- [Overview](#overview)
- [Project Structure](#project-structure)
- [Backend Architecture](#backend-architecture)
- [Frontend Architecture](#frontend-architecture)
- [Key Design Patterns](#key-design-patterns)
- [Module Communication](#module-communication)
- [Data Flow](#data-flow)
- [Extension Points](#extension-points)
- [Contributing Guidelines](#contributing-guidelines)

## Overview

Metadata Remote is a web-based audio metadata editor designed with a highly modular architecture. The application follows a client-server model with a Python Flask backend and vanilla JavaScript frontend, emphasizing clean separation of concerns and maintainability.

### Core Principles
- **Modularity First**: Every component has a single, well-defined responsibility
- **Loose Coupling**: Modules communicate through callbacks and events, not direct dependencies
- **Vanilla JavaScript**: No framework dependencies for maximum flexibility and minimal bloat
- **Progressive Enhancement**: Core functionality works without JavaScript where possible
- **Accessibility**: Keyboard navigation and screen reader support throughout

## Project Structure

```
metadata-remote/
├── app.py                    # Flask application entry point
├── config.py                 # Configuration and constants
├── core/                     # Backend core modules
│   ├── album_art/           # Album artwork handling
│   ├── batch/               # Bulk operations
│   ├── metadata/            # Metadata reading/writing
│   ├── file_utils.py        # File system utilities
│   ├── history.py           # Edit history tracking
│   └── inference.py         # Smart metadata suggestions
├── static/
│   ├── css/                 # Stylesheets
│   └── js/                  # Frontend modules
│       ├── core/            # Core infrastructure
│       ├── ui/              # UI components
│       ├── navigation/      # Navigation systems
│       ├── files/           # File management
│       ├── metadata/        # Metadata operations
│       ├── history/         # History UI
│       └── app.js           # Main coordinator
└── templates/               # HTML templates
```

## Backend Architecture

### Flask Application Structure

The backend follows a modular Flask pattern with clear separation between routes, business logic, and utilities.

#### Core Components

1. **app.py** - Main Flask application
   - Route definitions
   - HTTP request/response handling
   - Delegates business logic to core modules

2. **config.py** - Centralized configuration
   - Environment variables
   - Constants (file extensions, MIME types)
   - Feature flags and thresholds

3. **Core Modules** - Business logic organized by domain
   ```
   core/
   ├── album_art/
   │   ├── extractor.py    # Extract album art from files
   │   ├── processor.py    # Detect/fix corrupted images
   │   └── manager.py      # High-level CRUD operations
   ├── metadata/
   │   ├── ffmpeg.py       # FFmpeg wrapper
   │   ├── normalizer.py   # Format-specific tag normalization
   │   ├── reader.py       # Read metadata from files
   │   └── writer.py       # Write metadata to files
   └── batch/
       └── processor.py    # Bulk file operations
   ```

### Key Backend Services

#### Metadata Processing Pipeline
```python
# 1. Read file metadata
probe_data = run_ffprobe(filepath)
tags = probe_data.get('format', {}).get('tags', {})

# 2. Normalize for format
metadata = normalize_metadata_tags(tags, format_type)

# 3. Apply changes
apply_metadata_to_file(filepath, new_tags, art_data)
```

#### History Tracking System
- In-memory storage with action objects
- Supports undo/redo for all operations
- Tracks file renames and maintains references
- Temporary storage for album art changes

#### Inference Engine
- Multi-source analysis (filename, folder, siblings)
- MusicBrainz API integration
- Confidence scoring system
- Caching layer for performance

## Frontend Architecture

### Module Organization

The frontend uses a namespace-based modular pattern with 13 specialized modules:

```javascript
window.MetadataRemote = {
    State: {},        // Centralized state management
    API: {},          // HTTP communication layer
    UI: {
        ButtonStatus: {},  // Button state animations
        Utilities: {},     // General UI helpers
        PaneResize: {}     // Resizable panels
    },
    Audio: {
        Player: {}         // Audio playback control
    },
    Navigation: {
        Tree: {},          // Folder tree management
        Keyboard: {}       // Keyboard navigation
    },
    Files: {
        Manager: {}        // File listing and selection
    },
    Metadata: {
        Editor: {},        // Core editing operations
        AlbumArt: {},      // Album art management
        Inference: {}      // Smart suggestions UI
    },
    History: {
        Manager: {}        // History panel and undo/redo
    }
}
```

### Module Responsibilities

#### Core Infrastructure (2 modules)
- **state.js**: Single source of truth for application state
- **api.js**: Centralized API communication with error handling

#### UI Components (3 modules)
- **button-status.js**: Animated button feedback (processing → success/error)
- **utilities.js**: Format detection, status messages, form management
- **pane-resize.js**: Draggable dividers between panels

#### Feature Modules (7 modules)
- **tree.js**: Folder tree loading, sorting, expansion
- **keyboard.js**: Arrow keys, Enter, Tab navigation
- **files/manager.js**: File listing, filtering, metadata loading
- **metadata/editor.js**: Field editing, batch operations
- **album-art.js**: Image upload, deletion, batch application
- **inference.js**: Click-empty-field suggestions
- **history/manager.js**: History panel, undo/redo operations

#### Coordinator (1 module)
- **app.js**: Initializes modules, provides global functions, manages communication

## Key Design Patterns

### 1. IIFE (Immediately Invoked Function Expression)
Every module is wrapped to prevent global namespace pollution:
```javascript
(function() {
    // Module code isolated here
    window.MetadataRemote.Module.Name = {
        init(callbacks) { },
        publicMethod() { }
    };
})();
```

### 2. Dependency Injection via Callbacks
Modules receive dependencies during initialization:
```javascript
TreeNav.init(
    this.selectTreeItem.bind(this),  // Callback 1
    this.loadFiles.bind(this)         // Callback 2
);
```

Benefits:
- Loose coupling between modules
- Easy unit testing with mocks
- Clear dependency graph

### 3. Centralized State Management
All application state lives in `state.js`:
```javascript
window.MetadataRemote.State = {
    currentFile: null,
    selectedTreeItem: null,
    originalMetadata: {},
    // ... more state
}
```

### 4. Module Communication Pattern
```
User Action → Global Function → Module Method → State Update → UI Update
     ↓              ↓                 ↓              ↓            ↓
  onclick()    app.js wrapper   Module logic   state.js    DOM updates
```

## Module Communication

### Communication Flow Example
```javascript
// 1. HTML triggers global function
<button onclick="save()">

// 2. app.js delegates to module
function save() {
    MetadataEditor.save(ButtonStatus.showButtonStatus);
}

// 3. Module uses injected callbacks
MetadataEditor.save = async function(showButtonStatus) {
    showButtonStatus(button, 'Saving...', 'processing');
    // ... perform save ...
    loadHistoryCallback(); // Trigger history reload
}
```

### Cross-Module Dependencies
Modules communicate through:
1. **Callbacks** - Passed during initialization
2. **Shared State** - Via state.js
3. **Events** - DOM events for some UI interactions
4. **Global Functions** - Bridge between HTML and modules

## Data Flow

### Metadata Edit Flow
```
1. User selects file in tree
   ↓
2. TreeNav triggers loadFiles callback
   ↓
3. FilesManager loads file list
   ↓
4. User clicks file
   ↓
5. FilesManager triggers loadFile
   ↓
6. API fetches metadata
   ↓
7. UI populates form fields
   ↓
8. User edits and saves
   ↓
9. API sends changes to backend
   ↓
10. History tracks the change
```

### Inference Flow
```
1. User clicks empty field
   ↓
2. Inference module activated
   ↓
3. API calls inference endpoint
   ↓
4. Backend analyzes context
   ↓
5. Suggestions displayed
   ↓
6. User selects suggestion
   ↓
7. Field populated
```

## Extension Points

### Adding a New Feature

1. **Create Module File**
   ```javascript
   // static/js/feature/new-feature.js
   (function() {
       window.MetadataRemote.Feature = window.MetadataRemote.Feature || {};
       
       window.MetadataRemote.Feature.NewFeature = {
           init(callbacks) {
               // Store callbacks
           },
           
           // Public methods
       };
   })();
   ```

2. **Initialize in app.js**
   ```javascript
   NewFeature.init({
       requiredCallback: this.someMethod.bind(this)
   });
   ```

3. **Add Global Functions** (if needed for HTML)
   ```javascript
   function myNewFeature() {
       NewFeature.myMethod();
   }
   ```

4. **Include Script** in index.html
   ```html
   <script src="{{ url_for('static', filename='js/feature/new-feature.js') }}"></script>
   ```

### Adding Backend Functionality

1. **Create Core Module**
   ```python
   # core/feature/processor.py
   def process_feature(filepath, options):
       # Implementation
   ```

2. **Add Route** in app.py
   ```python
   @app.route('/feature/<path:filepath>')
   def handle_feature(filepath):
       return process_feature(filepath, request.args)
   ```

3. **Update API Module**
   ```javascript
   async processFeature(filepath, options) {
       return this.call(`/feature/${filepath}`, options);
   }
   ```

## Contributing Guidelines

### Code Style

#### Python
- Follow PEP 8
- Use type hints where beneficial
- Document functions with docstrings
- Handle errors gracefully

#### JavaScript
- Use const/let, never var
- Async/await over promises
- Descriptive variable names
- Comment complex logic

### Testing Strategy

1. **Backend Testing**
   - Unit tests for core modules
   - Integration tests for routes
   - Mock FFmpeg for metadata tests

2. **Frontend Testing**
   - Mock API responses
   - Test modules in isolation
   - Verify callback invocations

### Performance Considerations

1. **Debouncing** - File/folder selection has 300ms debounce
2. **Request Cancellation** - Inference requests are cancellable
3. **Lazy Loading** - Tree children load on demand
4. **Efficient Scrolling** - Custom keyboard repeat implementation

### Security Guidelines

1. **Path Validation** - All file paths validated against MUSIC_DIR
2. **Input Sanitization** - Metadata fields sanitized before FFmpeg
3. **No Direct Execution** - FFmpeg commands built safely
4. **Rate Limiting** - MusicBrainz API calls throttled

### Debugging Tips

1. **State Inspection**
   ```javascript
   console.log(MetadataRemote.State.getSnapshot());
   ```

2. **Module Testing**
   ```javascript
   // Test a module in isolation
   MetadataRemote.API.getMetadata('test.mp3').then(console.log);
   ```

3. **Event Flow Tracing**
   - Add console.logs at module boundaries
   - Check browser Network tab for API calls
   - Use breakpoints in callback chains

## Common Patterns

### Button Status Animation
```javascript
ButtonStatus.showButtonStatus(button, 'Saving...', 'processing');
// After operation
ButtonStatus.showButtonStatus(button, 'Saved!', 'success', 3000);
```

### Module Initialization
```javascript
ModuleName.init({
    callback1: this.method1.bind(this),
    callback2: () => this.method2()
});
```

### API Error Handling
```javascript
try {
    const result = await API.someMethod();
    // Handle success
} catch (error) {
    console.error('Operation failed:', error);
    showStatus('Error: ' + error.message, 'error');
}
```

---

For questions about the architecture or contribution process, please open an issue on GitHub.
