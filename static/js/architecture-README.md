# Metadata Remote - JavaScript Architecture Documentation

## Overview

Metadata Remote is a web-based audio metadata editor built with a modular JavaScript architecture. The application consists of 12 specialized modules coordinated by a central application controller, providing clean separation of concerns and maintainability.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                        index.html                           │
│                    (Entry Point & UI)                       │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                        app.js                               │
│                  (Main Coordinator)                         │
│  • Initializes all modules with callbacks                   │
│  • Provides global functions for HTML handlers              │
│  • Manages cross-module communication                       │
└─────────────────────────┬───────────────────────────────────┘
                          │
        ┌─────────────────┴─────────────────┐
        │                                   │
        ▼                                   ▼
┌──────────────────┐              ┌──────────────────┐
│   Core Modules   │              │   UI Modules     │
├──────────────────┤              ├──────────────────┤
│ • state.js       │              │ • button-status  │
│ • api.js         │              │ • utilities      │
└──────────────────┘              │ • pane-resize    │
                                  └──────────────────┘
                                           │
    ┌──────────────┬───────────────┬───────┴────────┬─────────────┐
    ▼              ▼               ▼                ▼             ▼
┌─────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐  ┌─────────┐
│ Audio   │  │Navigation│  │  Files   │  │  Metadata    │  │ History │
├─────────┤  ├──────────┤  ├──────────┤  ├──────────────┤  ├─────────┤
│ player  │  │ • tree   │  │ manager  │  │ • editor     │  │ manager │
└─────────┘  │ •keyboard│  └──────────┘  │ • album-art  │  └─────────┘
             └──────────┘                │ • inference  │
                                         └──────────────┘
```

## Module Structure

### Core Infrastructure (2 modules)
1. **state.js** - Centralized state management for the entire application
2. **api.js** - HTTP communication layer for all backend interactions

### UI Components (3 modules)
3. **ui/button-status.js** - Button state transitions and visual feedback
4. **ui/utilities.js** - General UI helpers and formatting utilities
5. **ui/pane-resize.js** - Resizable panel functionality

### Feature Modules (7 modules)
6. **audio/player.js** - Audio playback controls and streaming
7. **navigation/tree.js** - Folder tree structure and navigation
8. **navigation/keyboard.js** - Keyboard shortcuts and navigation
9. **files/manager.js** - File listing, filtering, and selection
10. **metadata/editor.js** - Core metadata editing operations
11. **metadata/album-art.js** - Album art upload and management
12. **metadata/inference.js** - Intelligent metadata suggestions
13. **history/manager.js** - Undo/redo functionality

## Design Patterns

### 1. IIFE (Immediately Invoked Function Expression)
Every module is wrapped to prevent global namespace pollution:
```javascript
(function() {
    // Module code
})();
```

### 2. Namespace Pattern
All modules are organized under `window.MetadataRemote`:
```javascript
window.MetadataRemote = window.MetadataRemote || {};
window.MetadataRemote.Category = window.MetadataRemote.Category || {};
```

### 3. Module Pattern with Public API
Each module exposes only necessary methods:
```javascript
window.MetadataRemote.Module.Name = {
    init(callbacks) { },
    publicMethod() { }
};
```

### 4. Dependency Injection via Callbacks
Modules communicate through callbacks provided during initialization:
```javascript
ModuleName.init({
    callback1: otherModule.method,
    callback2: () => anotherModule.action()
});
```

### 5. Centralized State Management
All application state is managed in `state.js` with proper encapsulation and access methods.

## Module Responsibilities

### state.js
- Maintains all application state (current file, metadata, UI state)
- Provides state reset and snapshot capabilities
- Manages timers and debouncing

### api.js
- Centralizes all HTTP requests
- Handles error responses consistently
- Provides promise-based interface for all backend operations

### UI Modules
- **button-status.js**: Animated button state feedback (processing, success, error)
- **utilities.js**: Format detection, status messages, form management
- **pane-resize.js**: Draggable dividers for resizing panels

### Navigation Modules
- **tree.js**: Folder tree loading, sorting, and expansion state
- **keyboard.js**: Arrow key navigation, Enter/Tab handling, focus management

### File Management
- **files/manager.js**: File listing, metadata loading, filename editing, filtering

### Metadata Modules
- **editor.js**: Field editing, batch operations, save/reset functionality
- **album-art.js**: Image upload, deletion, batch application
- **inference.js**: Smart suggestions based on filename/folder analysis

### History Management
- **history/manager.js**: Action tracking, undo/redo operations, history panel UI

## Communication Flow

1. **User Interaction**: HTML elements trigger global functions via onclick handlers
2. **Global Functions**: Defined in app.js, delegate to appropriate modules
3. **Module Methods**: Execute business logic using injected callbacks for cross-module communication
4. **State Updates**: Modules read/write to centralized state
5. **API Calls**: Modules use the API module for all backend communication
6. **UI Updates**: Modules update their UI components and trigger callbacks

## Adding New Features

To add a new feature to the application:

1. **Create a new module file** in the appropriate directory:
   ```javascript
   (function() {
       window.MetadataRemote = window.MetadataRemote || {};
       window.MetadataRemote.Category = window.MetadataRemote.Category || {};
       
       window.MetadataRemote.Category.ModuleName = {
           init(callbacks) {
               // Store callbacks for later use
           },
           
           // Public methods
       };
   })();
   ```

2. **Add initialization** in app.js:
   ```javascript
   ModuleName.init({
       requiredCallback: this.someMethod.bind(this)
   });
   ```

3. **Create global functions** for HTML event handlers if needed:
   ```javascript
   function myNewFeature() {
       ModuleName.myMethod();
   }
   ```

4. **Add script tag** to index.html in the appropriate order

5. **Update state.js** if new state properties are needed

## File Organization

```
static/
├── js/
│   ├── app.js              # Main coordinator
│   ├── state.js            # State management
│   ├── api.js              # API communication
│   ├── audio/
│   │   └── player.js       # Audio playback
│   ├── ui/
│   │   ├── button-status.js    # Button feedback
│   │   ├── utilities.js        # UI helpers
│   │   └── pane-resize.js      # Panel resizing
│   ├── navigation/
│   │   ├── tree.js         # Tree navigation
│   │   └── keyboard.js     # Keyboard handling
│   ├── files/
│   │   └── manager.js      # File operations
│   ├── metadata/
│   │   ├── editor.js       # Metadata editing
│   │   ├── album-art.js    # Album art handling
│   │   └── inference.js    # Smart suggestions
│   └── history/
│       └── manager.js      # History management
```

## Key Concepts for Contributors

### State Management
- All persistent state lives in `state.js`
- Modules should not maintain their own state beyond temporary UI state
- Use `State.reset()` for cleanup operations

### Error Handling
- API errors are handled in `api.js` and bubble up as exceptions
- UI modules should show appropriate error feedback using button-status or utilities

### Callbacks vs Direct References
- Modules receive callbacks during initialization rather than directly importing other modules
- This maintains loose coupling and makes testing easier

### Global Functions
- Required for HTML onclick handlers
- Should be minimal wrappers that delegate to module methods
- Defined at the bottom of app.js

### Performance Considerations
- File loading is debounced (300ms) during keyboard navigation
- Keyboard repeat has custom implementation for smooth scrolling
- Inference requests are cancellable to prevent race conditions

## Testing Approach

Each module can be tested independently by:
1. Mocking the required callbacks
2. Initializing the module with mock callbacks
3. Testing public methods
4. Verifying callback invocations

## Browser Compatibility

The application uses vanilla JavaScript with no framework dependencies, requiring:
- ES6 support (const, let, arrow functions, template literals)
- Fetch API for HTTP requests
- CSS Grid and Flexbox for layout
- No polyfills are currently included
