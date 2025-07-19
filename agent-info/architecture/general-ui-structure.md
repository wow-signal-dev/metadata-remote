# General UI Structure and Functionality Analysis

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Layout Architecture](#layout-architecture)
   - [Three-Pane Design](#three-pane-design)
   - [Layout Diagrams](#layout-diagrams)
3. [Component Hierarchy](#component-hierarchy)
4. [CSS Architecture](#css-architecture)
   - [CSS Variables](#css-variables)
   - [Dark Theme Implementation](#dark-theme-implementation)
   - [Glassmorphism Effects](#glassmorphism-effects)
5. [UI Utility Functions](#ui-utility-functions)
6. [Button Status Animation System](#button-status-animation-system)
7. [Modal Systems](#modal-systems)
   - [Help Box Modal](#help-box-modal)
   - [Field Edit Modal](#field-edit-modal)
8. [Notification Systems](#notification-systems)
9. [Responsive Design](#responsive-design)
   - [Pane Resizing System](#pane-resizing-system)
   - [Media Queries](#media-queries)
10. [Accessibility Features](#accessibility-features)
11. [UI/UX Recommendations](#uiux-recommendations)

## Executive Summary

The Metadata Remote application features a sophisticated UI with both dark and light themes, utilizing a three-pane layout optimized for audio file metadata editing. The interface leverages modern CSS techniques including glassmorphism effects, CSS variables for dynamic theming, and a comprehensive keyboard navigation system. The architecture emphasizes performance with smooth theme transitions and progressive disclosure patterns for complex features. Audio playback controls are seamlessly integrated into the file list for convenient file preview, with format-specific handling for browser compatibility.

Key architectural highlights:
- **Three-pane resizable layout** with folders, files, and metadata sections
- **Dark and light themes** with carefully chosen contrast ratios for accessibility
- **Comprehensive keyboard navigation** supporting all major operations including audio playback
- **Progressive disclosure** for advanced features (extended metadata, new fields)
- **Real-time feedback** through button status animations and playback states
- **Modular JavaScript architecture** with namespace-based organization
- **Integrated audio playback** with visual play/pause/loading/disabled states in file list
- **Theme toggle** with session persistence and smooth transitions
- **Modal interfaces** for help documentation and button-based oversized field editing (≥100 chars) with automatic transitions

## Layout Architecture

### Three-Pane Design

The application uses a flexible three-pane layout with theme-aware styling defined in `templates/index.html`:

```html
<div class="container">
    <div class="folders" tabindex="0" id="folders-pane">
        <!-- Folder tree navigation -->
    </div>
    
    <div class="divider" id="divider1"></div>
    
    <div class="files" tabindex="0" id="files-pane">
        <!-- File list -->
    </div>
    
    <div class="divider" id="divider2"></div>
    
    <div class="metadata">
        <!-- Metadata editor -->
    </div>
</div>
```

Each pane has specific characteristics:
- **Folders Pane** (25% default width, min: 200px)
- **Files Pane** (35% default width, min: 250px)
- **Metadata Pane** (flexible, fills remaining space)

### Layout Diagrams

```
┌─────────────────────────────────────────────────────────────┐
│                         Header                              │
│  ☽/☀ Logo                                          Help (?) │
├────────────┬─┬──────────────────┬─┬────────────────────────┤
│            │D│                  │D│                         │
│   Folders  │I│      Files       │I│      Metadata          │
│    Tree    │V│       List       │V│       Editor           │
│            │1│                  │2│                         │
│            │ │                  │ │                         │
│            │ │                  │ │   ┌─────────────────┐  │
│            │ │                  │ │   │   Album Art     │  │
│            │ │                  │ │   └─────────────────┘  │
│            │ │  [file.mp3] ▶   │ │                         │
│            │ │  [file.flac] ❚❚ │ │   Standard Fields      │
│            │ │  [file.wav] ⟳   │ │   Extended Fields      │
│            │ │                  │ │   New Field Creator    │
│            │ │                  │ │   [Inference Dropdowns] │
├────────────┴─┴──────────────────┴─┴────────────────────────┤
│                    History Panel (Collapsible)              │
└─────────────────────────────────────────────────────────────┘

Note: File list shows play buttons (▶), pause indicators (❚❚), and loading spinners (⟳)
```

## Component Hierarchy

The UI is structured with clear component hierarchy:

1. **Root Container** (`body`)
   - Theme Toggle (`.theme-toggle-wrapper`)
   - Header
     - Logo (`h1` with image)
     - Help Button
   - Main Container (`.container`)
     - Folders Pane
       - Pane Header (with filter/sort controls)
       - Filter Container
       - Sort Dropdown
       - Folders Scroll Area
         - Tree Structure
     - Divider 1
     - Files Pane
       - Pane Header (with filter/sort controls)
       - Filter Container
       - Sort Dropdown
       - Files Scroll Area
         - File List
           - File Item
             - File Info (name, format badge, metadata)
             - Play Button (with visual states)
     - Divider 2
     - Metadata Pane
       - Metadata Content
         - No File Message
         - Metadata Loading Indicator
         - Metadata Section
           - Filename Editor
           - Album Art Section
           - Metadata Form
             - Input Fields with Inference
               - Input Wrapper
                 - Text Input
                 - Loading Spinner (hidden)
                 - Suggestions Dropdown (hidden)
           - Extended Fields Toggle
           - New Field Creator
           - Action Buttons
       - History Panel
   - Hidden Audio Element (`<audio id="audio-player"></audio>`)

## CSS Architecture

### CSS Variables

The application uses CSS custom properties for dynamic theming with both dark and light modes:

#### Dark Theme (Default) (`main.css:13-42`):
```css
:root {
    --bg-primary: #0a0a0a;
    --bg-secondary: #0f0f0f;
    --bg-tertiary: #141414;
    --bg-card: #181818;
    --bg-hover: #1f1f1f;
    --bg-input: #0f0f0f;
    --border-color: #252525;
    --border-light: #333;
    --text-primary: #f0f0f0;
    --text-secondary: #b0b0b0;
    --text-muted: #666;
    --accent-primary: #4a7fff;
    --accent-hover: #5a8fff;
    --accent-glow: rgba(74, 127, 255, 0.3);
    --success: #4ade80;
    --error: #ff6b6b;
    --warning: #ffa94d;
}
```

#### Light Theme (`main.css:44-108`):
```css
:root[data-theme="light"] {
    --bg-primary: #f4f1de;
    --bg-secondary: #e8e2c5;
    --bg-tertiary: #ddd0a3;
    --bg-card: #f9f6e7;
    --bg-hover: #d4be81;
    --bg-input: #e5d8ac;
    --border-color: #c1a55f;
    --border-light: #d4be81;
    --text-primary: #3a3222;
    --text-secondary: #574a33;
    --text-muted: #7a6a4f;
    --accent-primary: #d08c60;
    --accent-hover: #b87347;
    --accent-glow: rgba(208, 140, 96, 0.2);
    /* Additional theme-specific variables */
}
```

### Theme System Implementation

The theme system supports both dark and light modes with:

#### Theme Toggle Component (`main.css:208-318`):
- Visual switch in header with moon/sun icons
- Smooth transitions using CSS custom properties
- Session persistence via sessionStorage
- Keyboard shortcut support (Alt+T)

#### Dark Theme Features:
- **Background gradients** for depth perception
- **Subtle borders** using rgba values for transparency
- **Hover states** with increased brightness
- **Focus indicators** with accent color outlines

#### Light Theme Features:
- **Warm color palette** optimized for readability
- **Enhanced focus indicators** (2px outlines)
- **Adjusted opacity** for better contrast
- **Theme-specific UI overrides** (`main.css:2761-3334`)

### Glassmorphism Effects

Glassmorphism is achieved through:
- `backdrop-filter: blur()` for background blurring
- Semi-transparent backgrounds with gradients
- Subtle borders with low opacity

Example from album art container (`main.css:1256-1265`):
```css
.album-art-container {
    background: linear-gradient(135deg, rgba(255,255,255,0.02) 0%, rgba(255,255,255,0.04) 100%);
    border: 1px solid rgba(255, 255, 255, 0.05);
    backdrop-filter: blur(5px);
}
```

### Album Art Metadata Overlay

The album art display includes a metadata overlay that shows image information on hover (`main.css:1366-1410`):

```css
/* Adjust metadata position when album art is scaled */
.album-art:hover ~ .album-art-metadata {
    /* When image scales 2x from center, the bottom-right corner moves 60px outward
       To maintain 8px offset from scaled edge: 8px - 60px = -52px */
    bottom: -52px;
    right: -52px;
}

/* Album art metadata overlay */
.album-art-metadata {
    position: absolute;
    bottom: 8px;
    right: 8px;
    padding: 4px 8px;
    background: rgba(0, 0, 0, 0.56);
    backdrop-filter: blur(4px);
    border-radius: 4px;
    font-size: 8px;
    font-family: monospace;
    color: rgba(255, 255, 255, 0.9);
    white-space: nowrap;
    pointer-events: none;
    z-index: 951; /* Above hovered album art (950) */
    opacity: 0;
    transition: opacity 0.2s ease;
    max-width: 200px;
    overflow: hidden;
    text-overflow: ellipsis;
}

/* Ensure art-display has relative positioning for absolute child */
#art-display {
    position: relative;
}

/* Show metadata on album art hover */
.album-art:hover ~ .album-art-metadata,
#art-display:hover .album-art-metadata {
    opacity: 1;
}

/* Mobile touch support */
@media (hover: none) {
    .album-art-metadata {
        opacity: 1;
    }
}
```

Key features:
- **Semi-transparent overlay**: Dark background with 56% opacity and blur effect
- **Positioning**: Absolute positioning at bottom-right of album art container
- **Typography**: Monospace font at 8px for subtle display
- **Responsive**: Always visible on touch devices
- **Smooth transitions**: 0.2s opacity transition for hover effect
- **Z-index management**: Positioned above the scaled album art on hover
- **Hover scaling adjustment**: Metadata repositions to stay at bottom-right corner when album art scales 2x

## UI Utility Functions

The UI utilities include both the core helper functions in `ui/utilities.js` and the theme toggle system in `ui/theme-toggle.js`:

### Audio Playback UI Components

The application includes integrated audio playback controls within the file list:

1. **Play Button States** (`static/css/main.css:1089-1180`):
   - Default state: Circular button with play icon (▶)
   - Playing state: Shows pause icon (❚❚) with accent color
   - Loading state: Animated spinner while buffering
   - Hover state: Scaled transform with color highlight
   - Disabled state: 40% opacity with not-allowed cursor for WMA files

2. **Visual Feedback**:
   - Smooth transitions between states
   - Hardware-accelerated CSS transforms
   - Clear visual indicators for current playback status
   - Disabled state styling for unsupported formats (WMA)

3. **Integration**:
   - Play buttons appear inline with each audio file
   - Single-track playback enforced at UI level
   - Keyboard control via Space bar
   - Format-specific handling (WMA disabled, WavPack transcoded)

### Theme Toggle Module (`theme-toggle.js`)

The theme toggle module manages the application's theming system:

1. **Initialization** (`theme-toggle.js:289-307`)
   - Loads saved theme from sessionStorage
   - Sets up event listeners for toggle and keyboard shortcut
   - Applies theme without transition on initial load

2. **Theme Switching** (`theme-toggle.js:370-387`)
   - Toggles between 'dark' and 'light' themes
   - Updates DOM attribute `data-theme` on root element
   - Dynamically switches logo image based on theme
   - Emits custom 'themeChanged' event

3. **Persistence** (`theme-toggle.js:312-332`)
   - Saves theme preference to sessionStorage
   - Synchronizes across browser tabs/windows
   - Graceful fallback if storage is unavailable

4. **Keyboard Support** (`theme-toggle.js:168-178`)
   - Alt+T shortcut for quick theme switching (Option+T on Mac)
   - Prevents default browser behavior
   - Works globally throughout the application

### Core UI Functions (`utilities.js`)

1. **showStatus/hideStatus** (`utilities.js:17-31`)
   - Legacy functions maintained for compatibility
   - Hidden by CSS but kept in codebase

2. **setFormEnabled** (`utilities.js:37-56`)
   - Enables/disables all form inputs and buttons
   - Respects format-specific restrictions (e.g., WAV files don't support album art)

3. **getFormatEmoji** (`utilities.js:63-76`)
   - Returns format-specific emoji icons
   - Maps: MP3→🎵, FLAC→💿, M4A→🎶, WAV→🌊, etc.

4. **getFormatBadge** (`utilities.js:83-123`)
   - Creates visual format indicators
   - Shows lossless/lossy status
   - Displays format limitations

## Loading Indicator System

### Audio Loading States

The play button includes a dedicated loading state with an animated spinner:

```css
.play-spinner {
    width: 12px;
    height: 12px;
    border: 2px solid rgba(255,255,255,.2);
    border-top-color: rgba(255,255,255,.8);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
}
```

### Metadata Loading Indicator

The metadata pane includes a dedicated loading indicator that provides visual feedback during file metadata fetching:

#### Structure (`templates/index.html:120-125`)
```html
<div id="metadata-loading-indicator" class="metadata-loading-indicator" style="display: none;">
    <div class="loading-spinner-container">
        <div class="loading-spinner"></div>
        <div class="loading-text">Loading metadata...</div>
    </div>
</div>
```

#### Styling (`main.css:2589-2616`)
```css
.metadata-loading-indicator {
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 200px;
    padding: 2rem;
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

#### Implementation
- Shows automatically when a file is selected
- Displays spinning animation with "Loading metadata..." text
- Hides when metadata loads successfully or on error
- Managed by the Files Manager module (`files/manager.js`)

## Button Status Animation System

The button status system (`ui/button-status.js`) provides real-time feedback:

### Implementation Details

1. **Status Types**:
   - `processing` - Shows spinner animation with CSS animation
   - `success` - Green checkmark with glow
   - `error` - Red X with error glow
   - `warning` - Orange warning icon

2. **Animation Flow** (`button-status.js:19-109`):
   ```javascript
   showButtonStatus(button, message, type, duration) {
       // Store original width
       // Remove existing status classes
       // Add new status class
       // Update message content
       // Auto-clear after duration
   }
   ```

3. **Progressive Enhancement**:
   - Buttons expand to show status messages
   - Apply-field buttons show only icons to save space
   - Reset button shows only icons (no text) for all states
   - Tooltips provide full messages when truncated

4. **Spinner Animation** (`main.css:2190-2198`):
   ```css
   .spinner {
       width: 16px;
       height: 16px;
       border: 2px solid rgba(255,255,255,.2);
       border-radius: 50%;
       border-top-color: white;
       animation: spin 1s linear infinite;
   }
   ```
   The spinner class now includes the animation property directly, ensuring all spinner elements rotate smoothly when displayed.

## Modal Systems

### Help Box Modal

The help modal (`app.js:128-200`) provides keyboard shortcuts reference:

1. **Structure** (`index.html:254-349`):
   - Overlay with backdrop blur
   - Centered modal box with glassmorphism
   - Grid layout for shortcut sections
   - GitHub link in footer

2. **Interaction**:
   - Opens via `?` button or keyboard shortcut
   - Closes on Escape, overlay click, or close button
   - Prevents accidental closure when just opened

3. **Styling** (`main.css:2127-2350`):
   ```css
   .help-overlay {
       backdrop-filter: blur(5px);
       z-index: 999;
   }
   .help-box {
       background: linear-gradient(135deg, rgba(26, 26, 26, 0.95) 0%, rgba(20, 20, 20, 0.95) 100%);
       backdrop-filter: blur(10px);
       z-index: 1000;
   }
   ```

### Field Edit Modal

The field edit modal (`field-edit-modal.js`) provides a dedicated interface for editing oversized metadata fields (≥100 characters) with automatic transition capabilities. The frontend automatically detects field length and displays oversized fields as interactive buttons:

1. **Structure** (`index.html:395-428`):
   - Overlay with backdrop blur effect
   - Modal box with glassmorphism styling and compact vertical spacing
   - Header showing "[filename]: [fieldname]" format (centered text)
   - Large non-resizable textarea for content editing (resize: none, min-height: 250px)
   - Action buttons (centered): Apply to file, Apply to folder, Reset, Cancel
   - Reduced padding throughout: header (0.75rem 1.5rem), content (0.75rem), actions (0.75rem 1.5rem)

2. **Activation Methods**:
   - **Manual**: Click on oversized field button (button displays centered "Click to view/edit" text)
   - **Manual**: Enter key on focused oversized field button
   - **Automatic**: TransitionController triggers when typing exceeds 100 characters in inline field
   - Modal opens with full field content loaded and cursor position preserved

3. **Visual Design**:
   - Compact vertical spacing with reduced padding throughout (0.75rem vs 1.5rem)
   - Modal header format: "[filename]: [fieldname]" with centered text
   - Non-resizable textarea (resize: none) with min-height of 250px
   - Centered action buttons with RESET button matching metadata pane styling
   - Light mode oversized buttons have darker, bolder text (#3a3222, font-weight: 600)

3. **Features**:
   - **Full Content Editing**: Large textarea shows complete field value
   - **Change Detection**: Buttons enabled only when content modified
   - **Dual Save Options**: Apply to current file or entire folder
   - **Reset Functionality**: Restore original content
   - **Character Count Monitoring**: Reports character count back to TransitionController
   - **Automatic Return**: Returns to inline editing when content falls below 80 characters

4. **Automatic Transition System** (`transition-controller.js`):
   - **Real-time Monitoring**: Tracks character count during typing with 300ms debouncing
   - **Seamless Transitions**: Automatically opens modal when exceeding 100 characters
   - **Hysteresis Prevention**: Different thresholds (100/80) prevent UI bouncing
   - **Paste Optimization**: Immediate transitions for large paste operations
   - **State Preservation**: Maintains cursor position and selection across transitions
   - **Resource Management**: Proper cleanup of event listeners and timeouts
   - **Loading States**: Visual feedback during save operations
   - **Keyboard Support**: Escape to close, tab navigation

4. **Styling** (`main.css:2803-3050`):
   ```css
   .field-edit-overlay {
       backdrop-filter: blur(5px);
       z-index: 999;
   }
   .field-edit-box {
       background: linear-gradient(135deg, rgba(26, 26, 26, 0.95) 0%, rgba(20, 20, 20, 0.95) 100%);
       backdrop-filter: blur(10px);
       max-width: 90vw;
       max-height: 90vh;
   }
   .field-edit-textarea {
       min-height: 300px;
       resize: vertical;
   }
   ```

5. **Integration**:
   - Triggers from `editor.js` when frontend detects fields ≥100 characters
   - Frontend replaces input elements with styled buttons for oversized fields
   - Updates `State.originalMetadata` on successful save
   - Refreshes history panel after changes
   - Maintains focus state in metadata pane

## Notification Systems

The application uses inline status indicators rather than toast notifications:

1. **Button Status Messages** - Real-time feedback on actions
2. **Field Change Indicators** - Visual cues for modified fields
3. **Inline Validation** - Error states on invalid input
4. **History Panel** - Persistent record of all changes
5. **Loading Indicators** - Visual feedback during async operations (metadata loading)
6. **Audio Playback Feedback** - Status messages for playback errors
7. **Format Compatibility** - Warnings for unsupported audio formats

## Inline Confirmation Patterns

The application uses inline confirmation UI for destructive or batch operations:

### Delete Field Confirmation

For field deletion, an inline file/folder choice appears replacing the delete button, with click-outside dismissal:

```css
.delete-confirmation {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-left: auto;
    margin-right: 0;
}

/* Inline confirmation buttons */
.delete-confirmation .inline-choice-btn {
    padding: 0.1rem 0.4rem;
    font-size: 0.65rem;
    font-weight: 400;
    border-radius: 3px;
    border: 1px solid transparent;
    background: linear-gradient(135deg, #2a2a2a 0%, #3a3a3a 100%);
    color: var(--text-primary);
    transition: all 0.15s ease;
    cursor: pointer;
    height: auto;
    line-height: 1.2;
}

.delete-confirmation .inline-choice-btn:hover {
    background: linear-gradient(135deg, #3a3a3a 0%, #4a4a4a 100%);
    transform: translateY(-1px);
}

.delete-confirmation .inline-choice-btn:focus {
    background: linear-gradient(135deg, #2a2a2a 0%, #3a3a3a 100%);
    outline: 1px solid var(--accent-primary);
    outline-offset: -1px;
}
```

#### Delete Confirmation Flow:
1. User clicks delete button (⊖)
2. Delete button becomes invisible (maintains layout space)
3. Inline UI shows: "Delete field from: [file] [folder]" (no cancel button)
4. Click outside or press Escape to cancel
5. "file" deletes from current file only
6. "folder" shows secondary Yes/No confirmation

### Folder Apply Confirmation

For metadata field folder operations, an inline confirmation pattern replaces popup dialogs:

```css
.folder-confirmation {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-left: 0.5rem;
}
```

#### Confirmation Flow:
1. User clicks "Folder" button
2. Apply controls hide, confirmation UI shows: "Apply to folder? [Yes] [No]"
3. Focus moves to "No" button for safety
4. "No" returns to original state
5. "Yes" executes the batch operation

This pattern provides:
- **Less Intrusive** - No modal overlay blocking the interface
- **Contextual** - Confirmation appears where the action was initiated
- **Safe Defaults** - Focus on "No" button prevents accidental confirmation
- **Consistent** - Same visual pattern across all confirmations
- **Click-Outside Dismissal** - Natural cancellation by clicking elsewhere
- **Layout Stability** - Uses visibility instead of display to prevent shifts

### Grouped Fields Apply Controls

Track #, Disc #, and Year fields share a special grouped apply controls container that appears when any of these fields are modified. This container:
- Shows all changed grouped fields together
- Uses the same File/Folder button pattern
- Properly hides after operations (fixed bug where container persisted)
- Maintains popup confirmation for folder operations (unlike other fields)

## Inference UI Components

The metadata inference system adds intelligent UI components to empty metadata fields:

### Component Structure

Each metadata field with inference support includes:

```html
<div class="input-wrapper">
    <input type="text" id="title" name="title" value="">
    <div class="inference-loading" id="title-loading">
        <div class="inference-spinner"></div>
    </div>
    <div class="inference-suggestions" id="title-suggestions">
        <!-- Dynamically populated suggestions -->
    </div>
</div>
```

### Interaction Flow

1. **Trigger**: Click on empty field → Show loading spinner
2. **Loading**: Spinner animates while fetching suggestions
3. **Display**: Dropdown appears with top 5 suggestions
4. **Selection**: Click suggestion → Fill field and hide dropdown
5. **Dismissal**: Type in field or click outside → Hide suggestions

### Visual Design

1. **Loading Spinner** (`main.css:2167-2182`):
   - Positioned absolutely within input wrapper
   - Animated rotation with primary accent color
   - 16x16px size for minimal intrusion

2. **Suggestions Dropdown** (`main.css:2185-2207`):
   - Glassmorphism styling matching app theme
   - Positioned below input field
   - Max height of 300px with scroll
   - Shadow and glow effects for depth
   - Theme-aware styling with light theme overrides (`main.css:3313-3334`)

3. **Suggestion Items**:
   - Value text with primary color
   - Confidence percentage and visual bar
   - Evidence text in muted color
   - Hover state with background highlight
   - Light theme specific styling for proper contrast

### Interaction Flow

1. **Trigger**: Click on empty field → Show loading spinner
2. **Loading**: Spinner animates while fetching suggestions
3. **Display**: Dropdown appears with top 5 suggestions
4. **Selection**: Click suggestion → Fill field and hide dropdown
5. **Dismissal**: Type in field or click outside → Hide suggestions

### Supported Fields

The inference system supports 9 metadata field types:
- Title, Artist, Album, AlbumArtist
- Date, Genre, Track, Disc, Composer

For complete implementation details, see:
- [Inference System Frontend Documentation](./architecture/inference-system-frontend.md)
- [Inference System Backend Documentation](./architecture/inference-system-backend.md)

## Responsive Design

### Pane Resizing System

The pane resize system (`ui/pane-resize.js`) enables flexible layouts:

1. **Horizontal Resizing** (`pane-resize.js:40-120`):
   - Draggable dividers between panes
   - Minimum/maximum width constraints
   - Visual feedback during drag
   - Persisted sizes in application state

2. **History Panel Resizing** (`pane-resize.js:192-307`):
   - Vertical resize for history panel
   - Maximum 60% viewport height
   - Resize handle in panel header

3. **Resize Constraints**:
   - Folders: 15-40% width
   - Files: 20-50% width
   - Metadata: Minimum 30% width

### Media Queries

Limited responsive design with focus on desktop experience:

```css
@media (max-width: 500px) {
    .help-sections-grid {
        grid-template-columns: 1fr; /* Single column on mobile */
    }
    .help-box {
        width: 95%;
    }
}
```

## Accessibility Features

### Semantic HTML

1. **ARIA Attributes** (`index.html`):
   - `role="button"` for clickable elements
   - `aria-expanded` for toggleable sections
   - `aria-controls` for associated content
   - `aria-hidden` for filtered items

2. **Tabindex Management**:
   - Panes are focusable with `tabindex="0"`
   - Logical tab order through interface
   - Skip non-interactive elements

### Keyboard Navigation

Comprehensive keyboard support (`navigation/keyboard.js`):

1. **Navigation**:
   - Arrow keys for list navigation
   - Tab for pane switching
   - Enter for selection/activation
   - Page Up/Down for pagination

2. **Shortcuts**:
   - `/` or `Ctrl+F` for filtering
   - `Ctrl+Shift+S` for sort reversal
   - `?` for help
   - `Alt+T` for theme toggle
   - `Escape` for cancel/close

### Visual Indicators

1. **Focus States** (`main.css:1769-1804`):
   ```css
   .metadata input:focus {
       outline: 1px solid var(--accent-primary);
       outline-offset: -2px;
       background: rgba(74, 127, 255, 0.15);
   }
   ```

2. **Keyboard Focus Classes**:
   - `.keyboard-focus` for navigation items
   - Different styling than hover states
   - Clear visual feedback
   - Enhanced 2px outlines in light theme for better visibility

### Color Contrast

- Text colors chosen for WCAG compliance in both themes
- Dark theme: `#f0f0f0` text on `#0a0a0a` background
- Light theme: `#3a3222` text on `#f4f1de` background
- Secondary text maintains appropriate contrast ratios
- Error/success states use distinct, accessible colors

## UI/UX Recommendations

### Strengths

1. **Consistent Design Language** - Unified visual elements across both themes
2. **Theme System** - Professional dark/light themes with smooth transitions
3. **Progressive Disclosure** - Complex features hidden until needed
4. **Keyboard Accessibility** - Full keyboard navigation support including theme toggle
5. **Visual Feedback** - Clear status indicators and transitions
6. **Flexible Layout** - Resizable panes adapt to user preferences

### Areas for Improvement

1. **Mobile Responsiveness**:
   - Currently desktop-focused
   - Add responsive breakpoints for tablet/mobile
   - Consider collapsible panes on small screens

2. **Loading States**:
   - ✅ Metadata loading indicator implemented
   - Add skeleton screens for initial load
   - Progress indicators for bulk operations
   - Smoother transitions during data updates

3. **Error Handling**:
   - More descriptive error messages
   - Inline validation feedback
   - Recovery suggestions for common errors

4. **Accessibility Enhancements**:
   - Add screen reader announcements
   - Implement skip navigation links
   - ✅ Enhanced focus indicators in light theme

5. **Performance Optimizations**:
   - Virtualize long lists
   - Lazy load album artwork
   - Debounce resize calculations

6. **User Preferences**:
   - Persist UI state (pane sizes, sort preferences)
   - ✅ Theme preference persisted in sessionStorage
   - Allow further theme customization
   - Configurable keyboard shortcuts

### Implementation Priority

1. **High Priority**:
   - Virtual scrolling for large file lists
   - Better error messaging
   - Persist user preferences

2. **Medium Priority**:
   - Mobile responsive design
   - Loading state improvements
   - Screen reader support

3. **Low Priority**:
   - Theme customization
   - Additional animations
   - Advanced keyboard shortcut configuration