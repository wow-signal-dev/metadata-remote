# Light/Dark Theme Implementation Documentation

## Overview
The Metadata Remote application features a comprehensive theming system that allows users to toggle between dark and light modes. The implementation includes:
- A visual toggle switch in the header
- Session-based theme persistence
- Smooth transitions between themes
- Complete styling coverage for all UI elements
- Keyboard shortcut support (Alt+T on Windows/Linux, Option+T on Mac)
- Dynamic logo switching based on theme

## Files Modified

### 1. `/static/css/main.css`
The main stylesheet contains all theme-related CSS variables and styling rules.

#### CSS Variables (Lines 13-42 & 44-108)
```css
/* Dark theme variables (default) - Lines 13-42 */
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
    /* ... additional variables ... */
}

/* Light theme variables - Lines 44-108 */
:root[data-theme="light"] {
    /* Core Theme Variables */
    --bg-primary: #f4f1de;
    --bg-secondary: #e8e2c5;
    --bg-tertiary: #ddd0a3;
    --bg-card: #f9f6e7;
    --bg-hover: #d4be81;
    --bg-input: #e5d8ac;              /* Slightly lighter than metadata pane */
    --border-color: #c1a55f;
    --border-light: #d4be81;
    --text-primary: #3a3222;
    --text-secondary: #574a33;
    --text-muted: #7a6a4f;
    --accent-primary: #d08c60;
    --accent-hover: #b87347;
    --accent-glow: rgba(208, 140, 96, 0.2);
    
    /* Additional UI Component Variables */
    --header-gradient: linear-gradient(180deg, #e8e2c5 0%, #ddd0a3 100%);
    --divider-bg: #cdb079;
    --divider-hover-bg: #c3a66f;
    --divider-dragging-bg: #b89a63;
    --divider-grip-color: rgba(58, 50, 34, 0.4);
    --divider-grip-hover-color: rgba(58, 50, 34, 0.6);
    --divider-grip-dragging-color: rgba(58, 50, 34, 0.8);
    --history-divider-bg: #cdb079;
    --scrollbar-track: #e8e2c5;
    --scrollbar-thumb: #c1a55f;
    --scrollbar-thumb-hover: #b08d57;
    
    /* Pane header gradients */
    --pane-header-gradient: linear-gradient(180deg, #ddd0a3 0%, #d4be81 100%);
    --pane-header-hover-gradient: linear-gradient(180deg, #e3d6ac 0%, #dac48a 100%);
    
    /* Input-specific colors */
    --bg-input: #e5d8ac;              /* Slightly lighter than metadata pane */
    --bg-input-hover: #fffefa;
    --bg-input-focus: #ffffff;
    --bg-input-readonly: rgba(249, 246, 231, 0.5);
    --input-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.05);
    --input-shadow-focus: 0 0 0 3px rgba(208, 140, 96, 0.2), inset 0 1px 2px rgba(0, 0, 0, 0.05);
    
    /* Dropdown specific colors */
    --dropdown-bg: #f4f1de;
    --dropdown-border: #c1a55f;
    --dropdown-shadow: 0 8px 24px rgba(58, 50, 34, 0.15);
    --dropdown-item-hover: #e8e2c5;
    --dropdown-item-active-bg: rgba(208, 140, 96, 0.1);
    --dropdown-item-active-hover-bg: rgba(208, 140, 96, 0.2);
    --dropdown-item-focus-bg: rgba(208, 140, 96, 0.15);
}
```

#### Theme Toggle Styles (Lines 208-318)
```css
/* Theme toggle wrapper and positioning - Lines 208-213 */
.theme-toggle-wrapper {
    position: absolute;
    left: 1.5rem;
    top: 50%;
    transform: translateY(-50%);
}

/* Theme toggle switch styling - Lines 215-318 */
.theme-toggle {
    position: relative;
    display: inline-block;
    width: 50px;
    height: 24px;
    cursor: pointer;
}

/* Switch slider with sun/moon icons */
.theme-switch-slider {
    position: absolute;
    cursor: pointer;
    background: linear-gradient(135deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.05) 100%);
    border: 1px solid rgba(255,255,255,0.2);
    /* ... additional styling ... */
}

/* Theme icons styling - Lines 236-280 */
.theme-icon {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    font-size: 15px;
    font-weight: 900;
    text-shadow: 0 0 1px currentColor;
    transition: opacity 0.3s ease;
}

.theme-icon.moon {
    left: 7px;
    color: #a0a0a0;
}

.theme-icon.sun {
    left: 29px;
    color: #666;
}

/* Theme transition class - Lines 321-327 */
.theme-transition,
.theme-transition *,
.theme-transition *::before,
.theme-transition *::after {
    transition: all 0.3s ease !important;
}
```

#### Light Theme Specific Overrides (Lines 2761-3334)
The file contains extensive light theme overrides for various components:

```css
/* Additional scrollbar color variables - Lines 2761-2766 */
:root[data-theme="light"] {
    /* Scrollbar colors */
    --scrollbar-track-bg: rgba(232, 226, 197, 0.5);
    --scrollbar-thumb-bg: linear-gradient(180deg, rgba(193, 165, 95, 0.6) 0%, rgba(176, 141, 87, 0.6) 100%);
    --scrollbar-thumb-hover-bg: linear-gradient(180deg, rgba(176, 141, 87, 0.8) 0%, rgba(153, 122, 74, 0.8) 100%);
}

/* Scrollbar styling for light theme - Lines 2768-2811 */
:root[data-theme="light"] ::-webkit-scrollbar {
    width: 12px;
}

:root[data-theme="light"] ::-webkit-scrollbar-track {
    background: var(--scrollbar-track-bg);
    border-radius: 6px;
}

:root[data-theme="light"] ::-webkit-scrollbar-thumb {
    background: var(--scrollbar-thumb-bg);
    border-radius: 6px;
    border: 2px solid transparent;
    background-clip: padding-box;
}

/* Button overrides for light theme - Lines 2792-2934 */
:root[data-theme="light"] .save-btn {
    background: linear-gradient(135deg, #7fb069 0%, #6fa059 100%);
    color: white;
}

/* Divider styling for light theme - Lines 3000-3090 */
:root[data-theme="light"] .divider,
:root[data-theme="light"] .history-divider {
    background: var(--divider-bg);
}

/* Input styling for light theme - Lines 3100-3146 */
:root[data-theme="light"] .filter-input {
    background: var(--bg-input);
    border: 1px solid var(--border-color);
    box-shadow: var(--input-shadow);
}

/* Metadata fields in light theme - Lines 3118-3146 */
:root[data-theme="light"] .metadata input[data-editing="true"] {
    outline: 1px solid var(--accent-primary);
    outline-offset: -2px;
    background: var(--bg-secondary);
    box-shadow: var(--input-shadow);
}

:root[data-theme="light"] .metadata input[readonly] {
    background: var(--bg-input);
    cursor: pointer;
}

/* File type badges in light theme - Lines 3157-3166 */
:root[data-theme="light"] #file-list span[style*="rgba(74, 222, 128, 0.2)"] {
    background: rgba(74, 176, 105, 0.35) !important;
    color: #3d8b5f !important;
    font-weight: 600 !important;
}

:root[data-theme="light"] #file-list span[style*="rgba(255, 169, 77, 0.2)"] {
    background: rgba(208, 140, 96, 0.35) !important;
    color: #a8734a !important;
    font-weight: 600 !important;
}

/* Extended metadata fields toggle - Lines 2969-2975 */
:root[data-theme="light"] .extended-fields-toggle {
    background: linear-gradient(135deg, #b08d57 0%, #a07d47 100%);
    color: white;
}

/* New field header - Lines 2984-2992 */
:root[data-theme="light"] .new-field-header {
    background: linear-gradient(135deg, #b08d57 0%, #a07d47 100%);
    color: white;
}

:root[data-theme="light"] .new-field-header:hover {
    background: linear-gradient(135deg, #a07d47 0%, #906d37 100%);
    box-shadow: 0 4px 12px rgba(176, 141, 87, 0.4);
}

/* Field deletion confirmation buttons - Lines 3241-3261 */
:root[data-theme="light"] .delete-confirmation .inline-choice-btn {
    background: linear-gradient(135deg, #b08d57 0%, #a07d47 100%);
    color: white;
    border: 1px solid #906d37;
}

/* Enhanced focus outlines for light theme - Lines 3263-3268 */
:root[data-theme="light"] *:focus,
:root[data-theme="light"] *:focus-visible,
:root[data-theme="light"] *.keyboard-focus {
    outline-width: 2px !important;
}

/* Oversized field buttons in light theme */
:root[data-theme="light"] .oversized-field-button {
    color: #3a3222;
    font-weight: 600;
    /* Darker, bolder text for better readability */
}

/* Inference suggestions dropdown - Lines 3310-3334 */
:root[data-theme="light"] .inference-suggestions {
    background: var(--dropdown-bg);
    border: 1px solid var(--dropdown-border);
    box-shadow: 0 0 0 3px rgba(208, 140, 96, 0.1), var(--dropdown-shadow);
}

:root[data-theme="light"] .suggestion-item {
    border-bottom: 1px solid rgba(193, 165, 95, 0.1);
}

:root[data-theme="light"] .suggestion-item:hover {
    background: var(--dropdown-item-hover);
}

:root[data-theme="light"] .suggestion-item:focus,
:root[data-theme="light"] .suggestion-item.keyboard-focus {
    background: var(--dropdown-item-focus-bg);
}

:root[data-theme="light"] .confidence-bar {
    background: rgba(193, 165, 95, 0.2);
}
```

### 2. `/static/js/ui/theme-toggle.js` (NEW FILE)
This is the main JavaScript module that handles theme switching functionality.

```javascript
/**
 * Theme Toggle Module - Complete file
 * Manages dark/light theme switching with session persistence
 */

(function() {
    'use strict';
    
    // Create namespace
    window.MetadataRemote = window.MetadataRemote || {};
    window.MetadataRemote.UI = window.MetadataRemote.UI || {};
    
    const ThemeToggle = {
        // Constants
        STORAGE_KEY: 'metadataRemote.theme',
        DARK_THEME: 'dark',
        LIGHT_THEME: 'light',
        TRANSITION_CLASS: 'theme-transition',
        TRANSITION_DURATION: 300,
        
        // State
        currentTheme: null,
        toggleElement: null,
        checkboxElement: null,
        isTransitioning: false,
        isInitialized: false,
        
        /**
         * Initialize the theme toggle module
         */
        init() {
            // Prevent double initialization
            if (this.isInitialized) {
                return;
            }
            
            this.isInitialized = true;
            
            // Get DOM elements
            this.toggleElement = document.querySelector('.theme-toggle');
            this.checkboxElement = document.getElementById('theme-switch');
            
            if (!this.checkboxElement) {
                console.error('Theme toggle checkbox not found');
                return;
            }
            
            // Load saved theme or default to dark
            this.loadTheme();
            
            // Set up event listeners
            this.setupEventListeners();
            
            // Apply theme without transition on initial load
            this.applyTheme(false);
        },
        
        /**
         * Load theme from session storage - Line 53
         */
        loadTheme() {
            try {
                const savedTheme = sessionStorage.getItem(this.STORAGE_KEY);
                this.currentTheme = savedTheme || this.DARK_THEME;
            } catch (e) {
                // Fallback if sessionStorage is not available
                this.currentTheme = this.DARK_THEME;
            }
        },
        
        /**
         * Save theme to session storage - Lines 66-73
         */
        saveTheme() {
            try {
                sessionStorage.setItem(this.STORAGE_KEY, this.currentTheme);
            } catch (e) {
                // Fail silently if sessionStorage is not available
                console.warn('Unable to save theme preference:', e);
            }
        },
        
        /**
         * Apply the current theme to the document - Lines 79-123
         * @param {boolean} withTransition - Whether to apply with transition effect
         */
        applyTheme(withTransition = true) {
            const root = document.documentElement;
            
            // Apply theme
            if (this.currentTheme === this.LIGHT_THEME) {
                root.setAttribute('data-theme', 'light');
                this.checkboxElement.checked = true;
                this.checkboxElement.setAttribute('aria-checked', 'true');
            } else {
                root.removeAttribute('data-theme');
                this.checkboxElement.checked = false;
                this.checkboxElement.setAttribute('aria-checked', 'false');
            }
            
            // Update logo - Lines 103-109
            const logo = document.getElementById('app-logo');
            if (logo) {
                const logoPath = this.currentTheme === this.LIGHT_THEME ? 
                    '/static/mdrm-logo-light-theme.png' : 
                    '/static/mdrm-logo-dark-theme.png';
                logo.src = logoPath;
            }
            
            // Update state
            if (window.MetadataRemote.State) {
                window.MetadataRemote.State.currentTheme = this.currentTheme;
            }
        },
        
        /**
         * Toggle between dark and light themes - Lines 128-145
         */
        toggleTheme() {
            // Debounce rapid toggling
            if (this.isTransitioning) return;
            
            // Switch theme
            this.currentTheme = this.currentTheme === this.DARK_THEME ? 
                              this.LIGHT_THEME : this.DARK_THEME;
            
            // Save and apply
            this.saveTheme();
            this.applyTheme(true);
            
            // Emit custom event
            const event = new CustomEvent('themeChanged', {
                detail: { theme: this.currentTheme }
            });
            document.dispatchEvent(event);
        },
        
        /**
         * Set up event listeners - Lines 150-172
         */
        setupEventListeners() {
            // Checkbox change event
            this.checkboxElement.addEventListener('change', () => {
                this.toggleTheme();
            });
            
            // Keyboard shortcut (Alt+T / Option+T on Mac) - Lines 168-178
            document.addEventListener('keydown', (e) => {
                // On some systems (particularly Mac), the Option/Alt key might be reported as metaKey
                const isAltT = (e.altKey || e.metaKey) && e.key.toLowerCase() === 't' && 
                              !e.ctrlKey && !e.shiftKey;
                
                if (isAltT) {
                    e.preventDefault();
                    this.toggleTheme();
                }
            });
            
            // Handle theme change in other tabs/windows - Lines 166-171
            window.addEventListener('storage', (e) => {
                if (e.key === this.STORAGE_KEY && e.newValue) {
                    this.currentTheme = e.newValue;
                    this.applyTheme(true);
                }
            });
        }
    };
    
    // Export to namespace
    window.MetadataRemote.UI.ThemeToggle = ThemeToggle;
    
    // Remove self-initialization - let app.js handle it
    // This was causing double initialization
})();
```

### 3. `/templates/index.html`
The HTML template includes the theme toggle component and updated help modal.

#### Theme Toggle Component (Lines 29-37)
```html
<div class="theme-toggle-wrapper">
    <label class="theme-toggle" for="theme-switch" title="Toggle theme (Alt+T)" aria-label="Theme toggle" aria-keyshortcuts="Alt+T">
        <input type="checkbox" id="theme-switch" class="theme-switch-checkbox" aria-checked="false">
        <span class="theme-switch-slider">
            <span class="theme-icon moon">☽</span>
            <span class="theme-icon sun">☀</span>
        </span>
    </label>
</div>
```

#### Logo with ID for Dynamic Switching (Line 39)
```html
<img id="app-logo" src="{{ url_for('static', filename='mdrm-logo-dark-theme.png') }}" alt="metadata remote" style="height: 1rem; width: auto;">
```

#### Help Button with Bold Question Mark (Line 41)
```html
<button class="help-button" id="help-button" title="Show keyboard shortcuts" tabindex="0"><b>?</b></button>
```

#### Help Modal Update (Lines 363-367)
```html
<div class="help-shortcut-item">
    <span class="help-description">Toggle theme</span>
    <span class="help-keys"><span class="help-key">Alt</span><span class="help-key-plus">+</span><span class="help-key">T</span></span>
</div>
```

#### Script Include (Line 387)
```html
<script src="{{ url_for('static', filename='js/ui/theme-toggle.js') }}"></script>
```

### 4. `/static/js/state.js`
Added theme state property to the global state object.

#### Theme State Property (Lines 22-23)
```javascript
// Theme state
currentTheme: 'dark',
```

### 5. `/static/js/app.js`
Added initialization call for the theme toggle module.

#### Theme Toggle Initialization (Lines 53-57)
```javascript
// Initialize theme toggle
if (window.MetadataRemote.UI.ThemeToggle) {
    // ThemeToggle self-initializes, but we can ensure it's ready
    window.MetadataRemote.UI.ThemeToggle.init();
}
```

## Key Features

### 1. Theme Persistence
- Uses `sessionStorage` to persist theme choice during the session
- Automatically applies saved theme on page load
- Synchronizes theme across browser tabs/windows

### 2. Visual Design
- **Toggle Switch**: Located in top-left corner of header
- **Icons**: Moon (☽) for dark mode, Sun (☀) for light mode
- **Transitions**: Smooth 300ms transitions between themes
- **Logo Switching**: Automatically switches between dark and light logos

### 3. Accessibility
- Full keyboard support with Alt+T shortcut (Option+T on Mac)
- ARIA labels and attributes for screen readers
- Focus indicators with enhanced visibility in light mode (2px outlines)
- Proper contrast ratios in both themes

### 4. Component Coverage
The theming system covers all UI components:
- Headers and pane backgrounds
- Input fields and form elements
- Buttons and interactive controls
- Scrollbars and dividers
- Dropdowns and overlays
- Inference suggestion dropdowns
- File type badges
- History panel
- Help modal
- Metadata fields with special edit-mode styling
- Oversized field buttons with enhanced light mode text styling

### 5. Color Schemes

#### Dark Theme (Default)
- Primary background: `#0a0a0a`
- Secondary background: `#0f0f0f`
- Tertiary background: `#141414`
- Primary text: `#f0f0f0`
- Accent: `#4a7fff` (blue)

#### Light Theme
- Primary background: `#f4f1de`
- Secondary background: `#e8e2c5`
- Tertiary background: `#ddd0a3`
- Primary text: `#3a3222`
- Accent: `#d08c60` (warm orange)

## Implementation Notes

1. **CSS Variable Architecture**: All colors are defined as CSS custom properties, making theme switching efficient and maintainable.

2. **Progressive Enhancement**: The theme toggle gracefully degrades if JavaScript is disabled (defaults to dark theme).

3. **Performance**: Theme switching uses CSS transitions for smooth visual updates while avoiding layout reflows.

4. **File Organization**: Theme-specific code is organized into dedicated modules and clearly separated in CSS with light theme overrides.

5. **Special Behaviors**:
   - Metadata input fields only change background when in edit mode
   - File/folder pane backgrounds are swapped in the implementation (files use --bg-secondary, metadata uses --bg-tertiary)
   - Focus outlines are thicker (2px) in light mode for better visibility
   - File type badges have adjusted opacity and colors for each theme
   - Inference suggestion dropdowns use theme-aware CSS variables for consistent appearance
   - Confidence bars in inference suggestions adapt their background color based on theme

6. **Mac Keyboard Compatibility**: The Alt+T shortcut works on Mac as Option+T by checking for both `altKey` and `metaKey` in the keyboard event handler, since Mac reports the Option key as `metaKey`.

7. **Initialization Safety**: The module includes an `isInitialized` flag to prevent double initialization, ensuring event listeners are only registered once.