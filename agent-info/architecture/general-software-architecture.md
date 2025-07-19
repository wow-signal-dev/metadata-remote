# General Software Architecture - Metadata Remote

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Overall Application Structure](#overall-application-structure)
3. [Backend Architecture](#backend-architecture)
   - [Flask Application Core](#flask-application-core)
   - [RESTful API Design](#restful-api-design)
   - [Core Module Organization](#core-module-organization)
4. [Frontend Architecture](#frontend-architecture)
   - [Namespace Architecture](#namespace-architecture)
   - [Module Communication](#module-communication)
   - [State Management](#state-management)
5. [Data Flow Patterns](#data-flow-patterns)
6. [Configuration Management](#configuration-management)
7. [Docker Containerization](#docker-containerization)
8. [Separation of Concerns](#separation-of-concerns)
9. [Key Design Patterns](#key-design-patterns)
10. [Component Diagrams](#component-diagrams)
11. [Key Findings and Recommendations](#key-findings-and-recommendations)

## Executive Summary

Metadata Remote is a web-based audio metadata editor built with a Flask backend and vanilla JavaScript frontend. The architecture follows a clean separation of concerns with a RESTful API, modular namespace-based frontend organization, audio streaming capabilities with format-specific transcoding, containerized deployment, and a comprehensive theme system. The application demonstrates modern web development practices while maintaining simplicity through the use of vanilla JavaScript without framework dependencies.

Key architectural highlights:
- **Backend**: Flask-based RESTful API with modular core functionality (`/core/`)
- **Frontend**: Namespace-organized vanilla JavaScript (`window.MetadataRemote.*`)
- **State Management**: Centralized state object with clear ownership
- **Audio Streaming**: HTTP range request support with WavPack transcoding capabilities
- **Theme System**: CSS variable-based dark/light themes with session persistence
- **Oversized Field Handling**: Frontend-only detection displaying fields ≥100 characters as buttons with automatic transitions between inline and modal editing
- **Deployment**: Docker containerization with Alpine Linux and wavpack utilities
- **Communication**: Clean API layer with centralized error handling

## Overall Application Structure

The application follows a traditional client-server architecture:

```
┌─────────────────────────────────────┐
│         Frontend (Browser)          │
│  ┌─────────────────────────────┐   │
│  │  Vanilla JS Modules         │   │
│  │  (window.MetadataRemote.*)  │   │
│  └──────────┬──────────────────┘   │
│             │ HTTP/REST             │
└─────────────┼───────────────────────┘
              │
┌─────────────┼───────────────────────┐
│             ▼                       │
│  ┌─────────────────────────────┐   │
│  │    Flask Application        │   │
│  │      (app.py:68)            │   │
│  └──────────┬──────────────────┘   │
│             │                       │
│  ┌──────────▼──────────────────┐   │
│  │    Core Modules (/core/)    │   │
│  │  - metadata/                │   │
│  │  - album_art/               │   │
│  │  - batch/                   │   │
│  └─────────────────────────────┘   │
│         Backend (Python)            │
└─────────────────────────────────────┘
```

## Backend Architecture

### Flask Application Core

The main application entry point is `app.py`, which initializes a Flask application:

```python
# app.py:68
app = Flask(__name__)
```

Key architectural decisions in the Flask setup:

1. **Cache Control Headers** (app.py:71-78):
```python
@app.after_request
def add_cache_headers(response):
    """Add cache-control headers to prevent reverse proxy caching of dynamic content"""
    if response.mimetype == 'application/json':
        response.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, private'
        response.headers['Pragma'] = 'no-cache'
        response.headers['Expires'] = '0'
    return response
```

2. **Template Auto-reloading** (app.py:1121):
```python
app.config['TEMPLATES_AUTO_RELOAD'] = True
```

### RESTful API Design

The API follows RESTful principles with clear resource-based routing:

#### Core Routes (app.py:102-1119):

1. **File System Navigation**:
   - `GET /tree/` - Root folder tree (app.py:214)
   - `GET /tree/<path:subpath>` - Subfolder tree (app.py:215)
   - `GET /files/<path:folder_path>` - List audio files (app.py:233)
   - `POST /rename-folder` - Rename folder (app.py:320)

2. **Audio Streaming**:
   - `GET /stream/<path:filepath>` - Stream audio file with range support (app.py:107)
   - `GET /stream/wav/<path:filepath>` - Stream WavPack files transcoded to WAV (app.py:176)

3. **Metadata Operations**:
   - `GET /metadata/<path:filename>` - Read metadata (app.py:321)
   - `POST /metadata/<path:filename>` - Write metadata (app.py:371)
   - `DELETE /metadata/<path:filename>/<field_id>` - Delete field (app.py:427)
   - `POST /metadata/create-field` - Create custom field (app.py:486)
   - `GET /infer/<path:filename>/<field>` - Get metadata suggestions (app.py:1151)

4. **Batch Operations**:
   - `POST /apply-art-to-folder` - Batch album art (app.py:692)
   - `POST /apply-field-to-folder` - Batch metadata with field creation/update detection (app.py:841)
   - `POST /delete-field-from-folder` - Batch field deletion (app.py:880)

5. **History Management**:
   - `GET /history` - Get all history (app.py:772)
   - `GET /history/<action_id>` - Get specific action (app.py:777)
   - `POST /history/<action_id>/undo` - Undo action (app.py:786)
   - `POST /history/<action_id>/redo` - Redo action (app.py:921)

### Core Module Organization

The `/core/` directory contains domain-specific modules:

```
core/
├── __init__.py
├── metadata/
│   ├── __init__.py
│   ├── reader.py         # Metadata extraction (core/metadata/reader.py:13)
│   ├── writer.py         # Metadata persistence
│   ├── normalizer.py     # Tag normalization
│   └── mutagen_handler.py # Mutagen library wrapper (core/metadata/mutagen_handler.py:31)
├── album_art/
│   ├── __init__.py
│   ├── extractor.py      # Album art extraction
│   ├── processor.py      # Image processing
│   ├── manager.py        # Art management logic
│   └── ogg.py           # OGG-specific handling
├── batch/
│   ├── __init__.py
│   └── processor.py      # Batch operation logic
├── history.py            # Action history tracking (core/history.py:83)
├── inference.py          # Metadata inference engine (pattern-based suggestions)
└── file_utils.py         # File system utilities
```

Key module responsibilities:

1. **FieldNameMapper** (core/metadata/mutagen_handler.py:31-61):
```python
class FieldNameMapper:
    """Maps between semantic field names and format-specific representations"""
    
    @staticmethod
    def semantic_to_format(field_name: str, format_type: str) -> str:
        """Convert semantic name to format-specific representation"""
        # Handles: TXXX:fieldname (MP3/WAV), WM/fieldname (WMA), 
        # ----:com.apple.iTunes:fieldname (MP4), fieldname (FLAC/OGG/WavPack)
    
    @staticmethod
    def format_to_semantic(field_id: str, format_type: str) -> str:
        """Extract semantic name from format-specific representation"""
        # Removes format-specific prefixes to get semantic field name
```

2. **MutagenHandler** (core/metadata/mutagen_handler.py:64-121):
```python
class MutagenHandler:
    """Centralized handler for all Mutagen operations"""
    
    def __init__(self):
        # Tag mapping for different formats
        self.tag_mappings = {
            'mp3': {
                'title': 'TIT2',
                'artist': 'TPE1',
                'album': 'TALB',
                # ...
            },
            'ogg': {  # Vorbis comments
                'title': 'TITLE',
                'artist': 'ARTIST',
                # ...
            }
        }
```

The MutagenHandler now includes enhanced field deletion capabilities:
- **Cross-format field deletion**: Automatically translates field names between formats
- **Format detection**: `_guess_source_format()` method identifies field ID patterns
- **Multiple representation attempts**: Tries various field name formats for robust deletion

3. **EditingHistory** (core/history.py:83-94):
```python
class EditingHistory:
    """Manages the editing history for the application"""
    
    def __init__(self):
        self.actions: List[HistoryAction] = []
        self.lock = threading.Lock()
        
        # Create temp directory for storing album art
        self.temp_dir = tempfile.mkdtemp(prefix='metadata_remote_history_')
```

The history system now intelligently tracks batch operations:
- **BATCH_CREATE_FIELD**: Used when adding new fields to files that don't have them
- **BATCH_METADATA**: Used when updating existing field values
- The `/apply-field-to-folder` endpoint automatically detects and categorizes each file's operation

4. **MetadataInferenceEngine** (core/inference.py):
```python
class MetadataInferenceEngine:
    """Pattern-based metadata suggestion engine"""
    
    def __init__(self):
        self.logger = logging.getLogger(__name__)
        self.mb_client = MusicBrainzClient()
        self.config = {
            'max_filename_length': 255,
            'default_confidence_threshold': 50,
            'candidate_limit': 10,
            'final_limit': 5
        }
        self._cache = {}  # Thread-safe caching
        self._cache_lock = threading.Lock()
```

The inference engine provides:
- **Multi-phase Algorithm**: Local pattern matching → External API queries → Synthesis → Scoring
- **Field-specific Logic**: Specialized inference for 9 metadata types (title, artist, album, etc.)
- **MusicBrainz Integration**: Enhanced suggestions from external music database
- **Caching System**: Thread-safe in-memory cache with 1-hour duration
- **Evidence-based Suggestions**: Each suggestion includes confidence score and evidence trail

For complete details, see [Inference System Backend Documentation](./architecture/inference-system-backend.md)

## Frontend Architecture

### Namespace Architecture

The frontend uses a hierarchical namespace structure under `window.MetadataRemote`:

```javascript
// static/js/app.js:11
window.MetadataRemote = window.MetadataRemote || {};
```

Module organization (static/js/app.js:16-28):
```javascript
const State = window.MetadataRemote.State;
const API = window.MetadataRemote.API;
const ButtonStatus = window.MetadataRemote.UI.ButtonStatus;
const UIUtils = window.MetadataRemote.UI.Utilities;
const AudioPlayer = window.MetadataRemote.Audio.Player;
const PaneResize = window.MetadataRemote.UI.PaneResize;
const TreeNav = window.MetadataRemote.Navigation.Tree;
const KeyboardNav = window.MetadataRemote.Navigation.Keyboard;
const FilesManager = window.MetadataRemote.Files.Manager;
const MetadataEditor = window.MetadataRemote.Metadata.Editor;
const AlbumArt = window.MetadataRemote.Metadata.AlbumArt;
const InferenceUI = window.MetadataRemote.Metadata.Inference;
const HistoryManager = window.MetadataRemote.History.Manager;
const ThemeToggle = window.MetadataRemote.UI.ThemeToggle;
// Additional modules:
// TransitionController = window.MetadataRemote.Metadata.TransitionController;
// FieldEditModal = window.MetadataRemote.Metadata.FieldEditModal;
```

The `AudioPlayer` module provides audio playback functionality with play/pause controls, visual feedback states, format-specific routing (WavPack transcoding, WMA blocking), and integration with the file list UI.

The `ThemeToggle` module manages the application's theme system, providing dark/light mode switching with session persistence, smooth CSS transitions, keyboard shortcuts (Alt+T on Windows/Linux, Option+T on Mac), and dynamic logo switching.

### Module Communication

The application uses a callback-based architecture for module communication:

1. **Module Initialization with Callbacks** (static/js/app.js:58-105):
```javascript
initializeModules() {
    // Navigation modules
    TreeNav.init(
        this.selectTreeItem.bind(this), 
        this.loadFiles.bind(this)
    );
    
    KeyboardNav.init({
        selectTreeItem: this.selectTreeItem.bind(this),
        selectFileItem: this.selectFileItem.bind(this),
        loadFile: this.loadFile.bind(this),
        loadFiles: this.loadFiles.bind(this)
    });
    
    // Audio player
    AudioPlayer.init(document.getElementById('audio-player'));
    
    // Metadata modules
    MetadataEditor.init({
        loadHistory: () => HistoryManager.loadHistory(),
        hideInferenceSuggestions: (field) => InferenceUI.hideInferenceSuggestions(field)
    });
    
    // Field edit modal and transition controller
    if (window.MetadataRemote.Metadata.FieldEditModal) {
        window.MetadataRemote.Metadata.FieldEditModal.init();
    }
    
    if (window.MetadataRemote.Metadata.TransitionController) {
        window.MetadataRemote.Metadata.TransitionController.init();
    }
}
```

2. **Global Function Bindings for HTML handlers** (static/js/app.js:324-397):
```javascript
// Navigation
function setSortMethod(method) {
    TreeNav.setSortMethod(method);
}

// File operations
function saveFilename() {
    AudioMetadataEditor.saveFilename();
}

// Album art operations
function handleArtUpload(event) {
    AlbumArt.handleArtUpload(event);
}
```

### State Management

Centralized state management in `state.js` (static/js/state.js:10-142):

```javascript
window.MetadataRemote.State = {
    // Current file and metadata
    currentFile: null,
    currentPath: '',
    selectedListItem: null,
    selectedTreeItem: null,
    originalFilename: '',
    currentAlbumArt: null,
    pendingAlbumArt: null,
    originalMetadata: {},  // Carefully populated to prevent false change detection
    currentFiles: [],
    
    // Audio playback state
    currentlyPlayingFile: null,  // Path of currently playing audio file
    
    // Tree and folder state
    treeData: {},
    expandedFolders: new Set(),
    
    // Separate sort state for folders and files
    foldersSort: {
        method: 'name',      // 'name', 'date', 'size'
        direction: 'asc'     // 'asc', 'desc'
    },
    filesSort: {
        method: 'name',      // 'name', 'date', 'type', 'size'
        direction: 'asc'     // 'asc', 'desc'
    },
    
    // Theme state
    currentTheme: 'dark',  // 'dark' or 'light', persisted in sessionStorage
    
    // Focus management
    focusedPane: 'folders'  // Tracks which pane has focus: 'folders', 'files', 'metadata'
}
```

**Note on Metadata State Management**: The `originalMetadata` object is populated with special care during file loading (`files/manager.js:436-447`) to handle edge cases with certain audio formats (particularly WMA) that may return duplicate field representations. Standard fields are populated from root-level API data, while only non-standard fields are added from the `all_fields` object, ensuring accurate change detection throughout the application.

**Focus Preservation**: The `focusedPane` state is now preserved during batch operations to prevent unwanted focus jumps. The direct UI manipulation pattern ensures focus remains in the metadata pane during single-file field operations.

## Data Flow Patterns

### 1. File Selection Flow

```
User clicks file → FilesManager.loadFile() → API.getMetadata() 
    → MetadataEditor.displayMetadata() → State.currentFile updated
    → AudioPlayer.stopPlayback() (if playing)
```

### 2. Metadata Save Flow

```
User edits field → MetadataEditor.save() → API.setMetadata()
    → History.add_action() → UI updates → ButtonStatus.showButtonStatus()
```

### 3. History Undo/Redo Flow

```
User clicks undo → HistoryManager.undoAction() → API.undoAction()
    → apply_metadata_to_file() → History state updated → UI refresh
```

### 4. Audio Playback Flow

```
User clicks play button → AudioPlayer.togglePlayback() → Stop any current playback
    → Set audio.src to /stream/filepath → audio.play() → Update visual state
    → Handle ended/error events
```

## Configuration Management

Configuration is centralized in `config.py` (config.py:1-79):

```python
# Directory configuration
MUSIC_DIR = os.environ.get('MUSIC_DIR', '/music')

# User/Group IDs for file ownership
OWNER_UID = int(os.environ.get('PUID', '1000'))
OWNER_GID = int(os.environ.get('PGID', '1000'))

# Server configuration
PORT = 8338
HOST = '0.0.0.0'

# Supported audio formats
AUDIO_EXTENSIONS = (
    '.mp3', '.flac', '.wav', '.m4a', '.wma', '.wv', '.ogg', '.opus'
)

# MIME types for audio streaming
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
```

Key configuration categories:
1. **Environment Variables**: `MUSIC_DIR`, `PUID`, `PGID` (config.py:7-11)
2. **Format Metadata Config**: Format-specific handling (config.py:35-48)
3. **Application Constants**: History size, cache duration (config.py:51-69)

## Docker Containerization

The application uses a multi-stage Docker build (Dockerfile:1-36):

```dockerfile
# Alpine-based ultra-lightweight version
FROM python:3.11-alpine as builder

# Install build dependencies
RUN apk add --no-cache gcc musl-dev linux-headers

WORKDIR /app
COPY requirements.txt .
RUN pip install --user --no-cache-dir -r requirements.txt

# Final stage
FROM python:3.11-alpine

# Install runtime dependencies
RUN apk add --no-cache wavpack  # For WavPack transcoding

# Copy Python dependencies from builder
COPY --from=builder /root/.local /root/.local
```

Key containerization decisions:
1. **Alpine Linux**: Minimal base image for small footprint
2. **Multi-stage Build**: Separates build and runtime dependencies
3. **User Installation**: Uses `pip install --user` for cleaner dependency management
4. **Runtime Dependencies**: Includes wavpack for WavPack audio transcoding (~300KB)
5. **Environment Configuration**: Via docker-compose.yml (docker-compose.yml:14-16)

## Separation of Concerns

The architecture demonstrates clear separation of concerns:

### 1. **Backend Responsibilities**:
- File system operations (app.py:175-276)
- Metadata reading/writing via Mutagen (core/metadata/*)
- Business logic and validation (app.py:84-97)
- History tracking (core/history.py)
- API response formatting

### 2. **Frontend Responsibilities**:
- User interaction handling
- DOM manipulation
- State management (static/js/state.js)
- API communication (static/js/api.js)
- UI feedback and animations

### 3. **Shared Responsibilities**:
- Data validation (both client and server-side)
- Error handling
- Status messages

## Key Design Patterns

### 1. **Module Pattern** (Frontend)
All JavaScript modules use IIFE with namespace attachment:
```javascript
// static/js/ui/button-status.js:6-10
(function() {
    window.MetadataRemote = window.MetadataRemote || {};
    window.MetadataRemote.UI = window.MetadataRemote.UI || {};
    
    window.MetadataRemote.UI.ButtonStatus = {
        // module implementation
    };
})();
```

### 2. **Singleton Pattern** (Backend)
History and inference engine use singleton instances:
```python
# app.py:38 - Standard library imports
import subprocess

# app.py:53-54 - Core module imports
from core.inference import inference_engine
from core.metadata.mutagen_handler import mutagen_handler
```

### 3. **Strategy Pattern** (Router)
Keyboard navigation uses route-based strategy selection:
```javascript
// static/js/navigation/router.js:26-48
register(pattern, handler, options = {}) {
    const priority = options.priority || this.defaultPriority;
    const preventDefault = options.preventDefault !== false;
    
    const route = {
        pattern,
        handler,
        priority,
        preventDefault
    };
}
```

### 4. **Observer Pattern** (State Management)
While not explicitly implemented, the state management follows observer-like patterns through callbacks.

### 5. **Direct UI Manipulation Pattern** (Frontend Performance)
Recent enhancements introduce direct DOM manipulation for single-file operations to eliminate unnecessary server round-trips:

```javascript
// static/js/metadata/editor.js:1568-1690 - deleteFromFile method
// Instead of reloading the entire file after deletion:
if (isStandardField) {
    // Hide standard fields by setting display: none and disabling
    fieldElement.style.display = 'none';
    input.disabled = true;
    input.value = '';
} else {
    // Remove dynamic fields from DOM entirely
    fieldElement.remove();
}

// Immediately update state without server round-trip
State.originalMetadata[fieldId] = isStandardField ? '' : undefined;
dynamicFields.delete(fieldId);  // For dynamic fields
```

This pattern provides:
- **Instant Visual Feedback**: UI updates happen immediately without waiting for server response
- **Preserved User Context**: Focus remains in the metadata pane instead of jumping to files pane
- **Reduced Server Load**: Eliminates unnecessary GET requests after mutations
- **Consistent State**: Local state is synchronized immediately with UI changes

The Editor module now also exposes data for inter-module communication:
```javascript
// static/js/metadata/editor.js:110-119 - Module data exposure
window.MetadataRemote.Metadata.Editor = {
    // ... existing methods ...
    dynamicFields: dynamicFields,  // Set of dynamic field IDs
    standardFieldsInfo: standardFieldsInfo,  // Standard field definitions
    isStandardField: (fieldId) => {
        return Object.keys(standardFieldsInfo).includes(fieldId);
    }
};
```

### 6. **CSS Variable Architecture Pattern** (Theme System)
The theme system uses CSS custom properties for efficient theme switching:

```css
/* static/css/main.css:13-42 - Dark theme variables */
:root {
    --bg-primary: #0a0a0a;
    --text-primary: #f0f0f0;
    --accent-primary: #4a7fff;
    /* ... additional variables ... */
}

/* static/css/main.css:44-108 - Light theme variables */
:root[data-theme="light"] {
    --bg-primary: #f4f1de;
    --text-primary: #3a3222;
    --accent-primary: #d08c60;
    /* ... additional variables ... */
}
```

This pattern enables:
- **Instant Theme Switching**: No page reload required
- **Maintainable Theming**: All colors defined in one place
- **Performance**: CSS transitions handle visual updates
- **Accessibility**: Enhanced focus indicators in light mode

The CSS also includes specific styling for oversized field buttons:
```css
/* static/css/main.css:2954-2986 - Oversized field button styling */
.oversized-field-button {
    width: 100%;
    padding: 12px 16px;
    text-align: center;  /* Centered "Click to view/edit" text */
    background: linear-gradient(135deg, var(--bg-secondary), var(--bg-hover));
    border: 1px solid var(--accent-primary);
    /* Hover effects with transform and shadow */
    /* Focus state with outline */
    /* Smooth transitions for all effects */
}
```

### 7. **Automatic Transition Pattern** (TransitionController)
The TransitionController implements automatic UI mode switching based on content characteristics:

```javascript
// static/js/metadata/transition-controller.js:16-20
window.MetadataRemote.Metadata.TransitionController = {
    INLINE_TO_MODAL_THRESHOLD: 100,
    MODAL_TO_INLINE_THRESHOLD: 80,
    DEBOUNCE_DELAY: 300,
    // ...
}
```

This pattern provides:
- **Seamless User Experience**: Automatic mode switching without manual intervention
- **Performance Optimization**: Debounced input monitoring prevents excessive checks
- **Hysteresis Prevention**: Different thresholds for transitions prevent UI bouncing
- **State Preservation**: Cursor position and text selection maintained across transitions
- **Resource Management**: Proper cleanup of event listeners and timeouts

## Component Diagrams

### Backend Component Structure

```
┌─────────────────────────────────────────────────┐
│                   app.py                         │
│  ┌───────────────────────────────────────────┐  │
│  │          Flask Application                 │  │
│  │  - Route handlers                         │  │
│  │  - Request validation                     │  │
│  │  - Response formatting                    │  │
│  │  - Audio streaming endpoint               │  │
│  └─────────────┬─────────────────────────────┘  │
│                │                                 │
│  ┌─────────────▼──────────┬─────────────────┐  │
│  │    Metadata Module     │  Album Art Module│  │
│  │  - reader.py           │  - extractor.py  │  │
│  │  - writer.py           │  - processor.py  │  │
│  │  - normalizer.py       │  - manager.py    │  │
│  │  - mutagen_handler.py  │  - ogg.py       │  │
│  └────────────────────────┴─────────────────┘  │
│                                                 │
│  ┌─────────────────────┬──────────────────┐   │
│  │   History Module    │  Batch Module    │   │
│  │  - EditingHistory   │  - processor.py  │   │
│  │  - ActionTypes      │                  │   │
│  │  - Undo/Redo        │                  │   │
│  └─────────────────────┴──────────────────┘   │
└─────────────────────────────────────────────────┘
```

### Frontend Component Structure

```
┌─────────────────────────────────────────────────┐
│              window.MetadataRemote               │
│  ┌───────────────────────────────────────────┐  │
│  │                State                       │  │
│  │  - Current file/metadata                  │  │
│  │  - UI state                               │  │
│  │  - Navigation state                       │  │
│  └───────────────────────────────────────────┘  │
│                                                 │
│  ┌──────────┬──────────┬───────────┬────────┐  │
│  │   API    │    UI    │Navigation │Metadata│  │
│  │ - call() │- Button  │- Tree     │- Editor│  │
│  │ - REST   │  Status  │- Keyboard │- Album │  │
│  │   ops    │- Utils   │- Router   │  Art   │  │
│  │          │- Theme   │           │        │  │
│  │          │  Toggle  │           │        │  │
│  └──────────┴──────────┴───────────┴────────┘  │
│                                                 │
│  ┌──────────────┬─────────────┬──────────────┐  │
│  │    Files     │   History   │    Audio     │  │
│  │  - Manager   │  - Manager  │  - Player    │  │
│  │              │             │  - Playback  │  │
│  │              │             │    controls  │  │
│  └──────────────┴─────────────┴──────────────┘  │
└─────────────────────────────────────────────────┘
```

## Key Findings and Recommendations

### Strengths

1. **Clean Architecture**: Clear separation between frontend and backend with well-defined boundaries
2. **Modular Design**: Both frontend and backend follow modular principles
3. **No Framework Dependencies**: Vanilla JavaScript keeps the frontend lightweight and maintainable
4. **Comprehensive API**: RESTful design covers all necessary operations including audio streaming and transcoding
5. **State Management**: Centralized state prevents inconsistencies
6. **Error Handling**: Consistent error handling patterns throughout
7. **Audio Integration**: Seamless audio playback with format-specific handling
8. **Streaming Efficiency**: HTTP range requests and on-the-fly transcoding for broader format support
9. **Theme System**: Professional dark/light mode implementation with accessibility features
10. **Modal Interface**: Dedicated editing interface for oversized metadata fields with full content preservation
11. **Automatic UI Transitions**: Intelligent character count monitoring with seamless inline-to-modal transitions
12. **Frontend-Only Field Detection**: Eliminated backend preprocessing for oversized fields, improving separation of concerns

### Areas for Improvement

1. **TypeScript Migration**: The frontend would benefit from TypeScript for better type safety
2. **API Documentation**: Consider adding OpenAPI/Swagger documentation
3. **WebSocket Support**: Real-time updates for collaborative editing
4. **Service Layer**: Extract business logic from route handlers into service classes
5. **Event Bus**: Implement proper event system instead of callback chains
6. **Testing Infrastructure**: Add unit and integration tests

### Architectural Recommendations

1. **Backend Services Layer**:
```python
# Suggested structure
services/
├── metadata_service.py
├── history_service.py
├── file_service.py
└── batch_service.py
```

2. **Frontend State Management**:
Consider implementing a proper state management pattern:
```javascript
// Suggested observer pattern
State.subscribe('currentFile', (newFile) => {
    // React to file changes
});
```

3. **API Versioning**:
```python
# Add API versioning
@app.route('/api/v1/metadata/<path:filename>')
```

4. **Dependency Injection**:
Replace direct imports with dependency injection for better testability.

5. **Caching Layer**:
Implement Redis or similar for metadata caching to improve performance.

The architecture is well-designed for its purpose, providing a solid foundation for an audio metadata editor while maintaining simplicity and clarity. The modular structure allows for easy extension and maintenance.