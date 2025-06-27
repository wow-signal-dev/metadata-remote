# Metadata Remote (mdrm) - Architecture Guide

## Table of Contents
1. [Overview](#overview)
2. [Technology Stack](#technology-stack)
3. [System Architecture](#system-architecture)
4. [Backend Architecture](#backend-architecture)
5. [Frontend Architecture](#frontend-architecture)
6. [API Design](#api-design)
7. [Key Features](#key-features)
8. [Data Flow](#data-flow)
9. [Development Setup](#development-setup)
10. [Contributing Guidelines](#contributing-guidelines)

## Overview

Metadata Remote (mdrm) is a web-based audio metadata editor that provides intelligent metadata management capabilities. It allows users to browse their music library, edit metadata fields, manage album artwork, and apply changes in batch operations.

### Core Features
- **Web-based interface** for remote metadata editing
- **Intelligent metadata inference** using filename/folder analysis and MusicBrainz API
- **Batch operations** for applying changes to multiple files
- **Album art management** with corruption detection and repair
- **Undo/redo functionality** with comprehensive history tracking
- **Multi-format support** (MP3, FLAC, M4A, WAV, WMA, WV, OGG, OPUS)
- **Real-time audio streaming** for preview

## Technology Stack

### Backend
- **Language**: Python 3.11
- **Framework**: Flask
- **Media Processing**: FFmpeg, FFprobe
- **Container**: Alpine Linux (for minimal footprint)
- **License**: GNU Affero General Public License v3.0

### Frontend
- **Language**: Vanilla JavaScript (ES6+)
- **Architecture**: Modular namespace-based design
- **Styling**: Custom CSS with glassmorphism effects
- **Dependencies**: None (zero framework approach)

### Deployment
- **Containerization**: Docker with multi-architecture support (amd64, arm64, arm/v7)
- **CI/CD**: GitHub Actions for automated builds
- **Registry**: GitHub Container Registry (ghcr.io)

## System Architecture

```
┌───────────────────────────────────────────────────────────┐
│                    Web Browser (Client)                   │
│  ┌────────────────────────────────────────────────────┐   │
│  │                  Frontend (HTML/JS/CSS)            │   │
│  │  • Modular JavaScript architecture                 │   │
│  │  • Real-time UI updates                            │   │
│  │  • Keyboard navigation                             │   │
│  └────────────────────────────────────────────────────┘   │
└───────────────────────────────────────────────────────────┘
                              │
                              │ HTTP/REST API
                              ▼
┌───────────────────────────────────────────────────────────┐
│                    Flask Backend (Python)                 │
│  ┌────────────────────────────────────────────────────┐   │
│  │                    app.py (Main)                   │   │
│  │  • Route handlers                                  │   │
│  │  • Request/response processing                     │   │
│  └────────────────────────────────────────────────────┘   │
│                              │                            │
│  ┌───────────────┬───────────┴───────────┬────────────┐   │
│  │  Core Modules │   Metadata Modules    │  Utilities │   │
│  │  • history    │   • reader            │  • ffmpeg  │   │
│  │  • inference  │   • writer            │  • file    │   │
│  │  • batch      │   • normalizer        │            │   │
│  └───────────────┴───────────────────────┴────────────┘   │
└───────────────────────────────────────────────────────────┘
                              │
                              │ File System / FFmpeg
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      Music Library                          │
│                   (/music directory)                        │
└─────────────────────────────────────────────────────────────┘
```

## Backend Architecture

### Directory Structure
```
├── app.py                 # Main Flask application
├── config.py             # Configuration and constants
├── core/                 # Core functionality modules
│   ├── __init__.py
│   ├── history.py        # Undo/redo system
│   ├── inference.py      # Metadata inference engine
│   ├── file_utils.py     # File system utilities
│   ├── album_art/        # Album art handling
│   │   ├── extractor.py  # Extract album art
│   │   ├── processor.py  # Corruption detection/repair
│   │   ├── manager.py    # CRUD operations
│   │   └── ogg.py        # OGG/Opus specific handling
│   ├── batch/            # Batch operations
│   │   └── processor.py  # Bulk file processing
│   └── metadata/         # Metadata operations
│       ├── ffmpeg.py     # FFmpeg wrapper
│       ├── normalizer.py # Format-specific normalization
│       ├── reader.py     # Read metadata
│       └── writer.py     # Write metadata
```

### Key Components

#### 1. Main Application (app.py)
- Flask route definitions
- Request handling and validation
- Response formatting
- Cache control headers

#### 2. Configuration (config.py)
- Environment variables (PUID, PGID, MUSIC_DIR)
- Supported audio formats
- Format-specific metadata configurations
- MIME type mappings

#### 3. Core Modules

**History System (core/history.py)**
- Implements undo/redo functionality
- Tracks all metadata changes
- Manages temporary storage for album art history
- Action types: metadata changes, album art changes, batch operations

**Inference Engine (core/inference.py)**
- Analyzes filenames and folder structures
- Queries MusicBrainz API for additional data
- Provides confidence-scored suggestions
- Implements caching and rate limiting

**File Utilities (core/file_utils.py)**
- Path validation (security)
- File ownership management
- Format detection

#### 4. Album Art Management

**Extractor (core/album_art/extractor.py)**
- Extracts embedded album art using FFmpeg
- Special handling for OGG/Opus files

**Processor (core/album_art/processor.py)**
- Detects corrupted album art
- Attempts to repair corrupted images
- Re-embeds cleaned artwork

**OGG Handler (core/album_art/ogg.py)**
- Implements METADATA_BLOCK_PICTURE format
- Handles Vorbis and Opus codecs
- Binary data parsing and creation

#### 5. Metadata Operations

**Reader (core/metadata/reader.py)**
- Uses FFprobe for metadata extraction
- Normalizes tags across formats
- Detects format limitations

**Writer (core/metadata/writer.py)**
- Applies metadata changes using FFmpeg
- Format-specific tag mapping
- Unicode normalization for compatibility

**Normalizer (core/metadata/normalizer.py)**
- Handles format-specific tag naming
- Maps between different tag systems (ID3, Vorbis, iTunes)

### Security Considerations
- Path traversal prevention via `validate_path()`
- File ownership management (PUID/PGID)
- No user authentication (designed for local/trusted networks)
- Input sanitization for metadata fields

## Frontend Architecture

### Directory Structure
```
static/
├── js/
│   ├── app.js              # Main coordinator
│   ├── state.js            # Centralized state management
│   ├── api.js              # API communication layer
│   ├── audio/
│   │   └── player.js       # Audio playback
│   ├── ui/
│   │   ├── button-status.js    # Button state animations
│   │   ├── utilities.js        # UI helpers
│   │   └── pane-resize.js      # Resizable panels
│   ├── navigation/
│   │   ├── tree.js         # Folder tree navigation
│   │   └── keyboard.js     # Keyboard shortcuts
│   ├── files/
│   │   └── manager.js      # File listing and selection
│   ├── metadata/
│   │   ├── editor.js       # Metadata editing
│   │   ├── album-art.js    # Album art management
│   │   └── inference.js    # Suggestion UI
│   └── history/
│       └── manager.js      # History panel
├── css/
│   └── main.css            # All styles
└── architecture-README.md  # Frontend documentation
```

### Design Patterns

#### 1. IIFE (Immediately Invoked Function Expression)
Each module is wrapped to prevent global namespace pollution:
```javascript
(function() {
    // Module code
})();
```

#### 2. Namespace Pattern
All modules organized under `window.MetadataRemote`:
```javascript
window.MetadataRemote = window.MetadataRemote || {};
window.MetadataRemote.Category = window.MetadataRemote.Category || {};
```

#### 3. Module Pattern with Public API
```javascript
window.MetadataRemote.Module.Name = {
    init(callbacks) { },
    publicMethod() { }
};
```

#### 4. Dependency Injection via Callbacks
Modules communicate through callbacks provided during initialization:
```javascript
ModuleName.init({
    callback1: otherModule.method,
    callback2: () => anotherModule.action()
});
```

#### 5. Centralized State Management
All application state managed in `state.js`:
- Current file and metadata
- UI state (focused pane, panel sizes)
- Navigation state (selected items, expanded folders)
- Temporary state (timers, loading indicators)

### Key Frontend Components

#### State Management (state.js)
- Single source of truth for application state
- Methods for state reset and snapshots
- No external state in other modules

#### API Layer (api.js)
- Centralized HTTP communication
- Promise-based interface
- Consistent error handling

#### UI Components
- **Button Status**: Animated feedback for user actions
- **Pane Resize**: Draggable dividers between panels
- **Utilities**: Format detection, status messages

#### Navigation
- **Tree Navigation**: Folder browsing with sorting/filtering
- **Keyboard Navigation**: Arrow keys, Tab, Enter, shortcuts

#### Metadata Management
- **Editor**: Field editing with batch operations
- **Album Art**: Upload, delete, batch apply
- **Inference**: Smart suggestions with confidence scores

## API Design

### RESTful Endpoints

#### File System Operations
```
GET  /tree/                   # Get root folder structure
GET  /tree/<path>             # Get subfolder contents
GET  /files/<folder_path>     # Get all audio files in folder
POST /rename                  # Rename a file
GET  /stream/<filepath>       # Stream audio file
```

#### Metadata Operations
```
GET  /metadata/<filename>     # Get file metadata
POST /metadata/<filename>     # Update file metadata
POST /apply-art-to-folder     # Apply album art to all files
POST /apply-field-to-folder   # Apply field value to all files
```

#### Inference
```
GET  /infer/<filename>/<field>  # Get suggestions for a field
```

#### History
```
GET  /history                  # Get all history
GET  /history/<action_id>      # Get action details
POST /history/<action_id>/undo # Undo an action
POST /history/<action_id>/redo # Redo an action
POST /history/clear            # Clear all history
```

### Request/Response Format

All API responses use JSON format:
```json
{
    "status": "success|error|partial",
    "data": { ... },
    "error": "Error message if applicable",
    "errors": ["Array of errors for partial success"]
}
```

## Key Features

### 1. Intelligent Metadata Inference
- **Filename Analysis**: Extracts metadata from filename patterns
- **Folder Structure**: Uses folder names for album/artist inference
- **Sibling Files**: Analyzes other files in folder for patterns
- **MusicBrainz Integration**: Queries external database for verification
- **Confidence Scoring**: Provides confidence percentages for suggestions

### 2. Album Art Management
- **Format Support**: All formats except WAV/WV
- **Corruption Detection**: Identifies corrupted embedded images
- **Automatic Repair**: Attempts to fix corrupted artwork
- **Batch Operations**: Apply art to entire folders
- **OGG/Opus Support**: Special handling for METADATA_BLOCK_PICTURE

### 3. History System
- **Comprehensive Tracking**: All changes recorded with timestamps
- **Undo/Redo**: Revert or reapply any change
- **Batch Operations**: Track and undo bulk changes
- **Persistent Storage**: History survives page refreshes
- **Visual Timeline**: See all changes in chronological order

### 4. Format-Specific Handling
- **Tag Normalization**: Maps between different tag systems
- **Format Limitations**: Handles formats with limited metadata support
- **Unicode Support**: Proper handling of international characters
- **Case Sensitivity**: Respects format-specific tag casing

## Data Flow

### Metadata Edit Flow
```
1. User selects file in UI
2. Frontend calls GET /metadata/<filename>
3. Backend reads file with FFprobe
4. Tags normalized based on format
5. Data returned to frontend
6. User edits fields
7. Frontend calls POST /metadata/<filename>
8. Backend applies changes with FFmpeg
9. History entry created
10. Success response to frontend
```

### Inference Flow
```
1. User clicks empty field
2. Frontend calls GET /infer/<filename>/<field>
3. Backend analyzes:
   - Filename patterns
   - Folder structure
   - Sibling files
   - Existing metadata
4. Optional: Query MusicBrainz API
5. Generate suggestions with confidence scores
6. Return sorted suggestions
7. Frontend displays dropdown
```

## Development Setup

### Prerequisites
- Docker and Docker Compose
- OR Python 3.11+ and FFmpeg

### Docker Setup
```bash
# Clone repository
git clone https://github.com/wow-signal-dev/metadata-remote
cd metadata-remote

# Configure docker-compose.yml
# - Set music directory path
# - Adjust PUID/PGID if needed

# Run
docker-compose up -d
```

### Local Development
```bash
# Install dependencies
pip install -r requirements.txt

# Set environment variables
export MUSIC_DIR=/path/to/music
export PUID=1000
export PGID=1000

# Run
python app.py
```

### Frontend Development
- No build process required
- Edit JavaScript/CSS files directly
- Changes reflected on page refresh
- Browser DevTools for debugging

## Contributing Guidelines

### Code Style

#### Python
- Follow PEP 8
- Use type hints where beneficial
- Document complex functions
- Handle exceptions appropriately

#### JavaScript
- Use ES6+ features
- Follow existing module pattern
- Maintain namespace organization
- Document public APIs

### Adding Features

#### Backend Feature
1. Create module in appropriate `core/` subdirectory
2. Import and use in `app.py`
3. Add configuration to `config.py` if needed
4. Update API documentation

#### Frontend Feature
1. Create module in appropriate `static/js/` subdirectory
2. Follow IIFE and namespace patterns
3. Initialize in `app.js` with required callbacks
4. Add script tag to `index.html`
5. Update `state.js` if new state needed

### Testing
- Test with multiple audio formats
- Verify undo/redo functionality
- Check error handling
- Test on different browsers
- Verify Docker deployment

### Pull Request Process
1. Fork repository
2. Create feature branch
3. Make changes following guidelines
4. Test thoroughly
5. Update documentation
6. Submit PR with clear description

### Security Considerations
- Validate all file paths
- Sanitize user input
- Handle file permissions properly
- Consider rate limiting for API endpoints
- Document any security implications

## Performance Considerations

### Backend
- FFmpeg operations are CPU-intensive
- Batch operations process files sequentially
- MusicBrainz API has rate limiting (1 req/sec)
- Large music libraries may impact tree loading

### Frontend
- Keyboard navigation uses custom repeat implementation
- File lists virtualization not implemented (may impact with 1000s of files)
- Debouncing used for file/folder selection
- No framework overhead (vanilla JS)

## Future Enhancements

### Potential Features
- Read/write all existing metadata fields
- Create custom metadata fields
- User authentication system
- Multiple library support
- Playlist management
- Advanced search functionality
- Mobile-responsive design
- WebSocket for real-time updates
- Plugin system for extensibility

### Technical Improvements
- Implement file list virtualization
- Add comprehensive test suite
- Optimize batch operations
- Implement progress indicators
- Add request caching layer
- Support more audio formats
