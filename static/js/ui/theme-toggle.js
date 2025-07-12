/**
 * Theme Toggle Module
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
        
        // State
        currentTheme: null,
        toggleElement: null,
        checkboxElement: null,
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
            
            // Apply theme
            this.applyTheme();
        },
        
        /**
         * Load theme from session storage
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
         * Save theme to session storage
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
         * Apply the current theme to the document
         */
        applyTheme() {
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
            
            // Update logo
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
         * Toggle between dark and light themes
         */
        toggleTheme() {
            
            // Switch theme
            this.currentTheme = this.currentTheme === this.DARK_THEME ? 
                              this.LIGHT_THEME : this.DARK_THEME;
            
            // Save and apply
            this.saveTheme();
            this.applyTheme();
            
            // Emit custom event
            const event = new CustomEvent('themeChanged', {
                detail: { theme: this.currentTheme }
            });
            document.dispatchEvent(event);
        },
        
        /**
         * Set up event listeners
         */
        setupEventListeners() {
            // Checkbox change event
            this.checkboxElement.addEventListener('change', () => {
                this.toggleTheme();
            });
            
            // Debug logging removed - issue was identified as Mac using metaKey instead of altKey
            
            // Keyboard shortcut (Alt+T / Option+T on Mac)
            document.addEventListener('keydown', (e) => {
                // On some systems (particularly Mac), the Option/Alt key might be reported as metaKey
                const isAltT = (e.altKey || e.metaKey) && e.key.toLowerCase() === 't' && 
                              !e.ctrlKey && !e.shiftKey;
                
                if (isAltT) {
                    e.preventDefault();
                    this.toggleTheme();
                }
            });
            
            // Handle theme change in other tabs/windows
            window.addEventListener('storage', (e) => {
                if (e.key === this.STORAGE_KEY && e.newValue) {
                    this.currentTheme = e.newValue;
                    this.applyTheme();
                }
            });
        }
    };
    
    // Export to namespace
    window.MetadataRemote.UI.ThemeToggle = ThemeToggle;
    
    // Remove self-initialization - let app.js handle it
    // This was causing double initialization
})();