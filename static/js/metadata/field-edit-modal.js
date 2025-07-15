(function() {
    'use strict';
    
    // Ensure namespace exists
    window.MetadataRemote = window.MetadataRemote || {};
    window.MetadataRemote.Metadata = window.MetadataRemote.Metadata || {};
    
    // Import dependencies
    const State = window.MetadataRemote.State;
    const API = window.MetadataRemote.API;
    const ButtonStatus = window.MetadataRemote.UI.ButtonStatus;
    
    // HTML escape function (needed since the one in editor.js is not exposed)
    function escapeHtml(unsafe) {
        if (unsafe === null || unsafe === undefined) return '';
        return String(unsafe)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }
    
    /**
     * Field Edit Modal Module
     * Handles modal-based editing for oversized metadata fields
     */
    window.MetadataRemote.Metadata.FieldEditModal = {
        // Current field being edited
        currentField: null,
        currentFieldInfo: null,
        originalContent: '',
        triggerElement: null,
        updateButtonStatesTimeout: null,
        charCountTimeout: null,
        onCharacterCountChange: null, // Callback for character count changes
        
        /**
         * Initialize the module
         */
        init() {
            // Get DOM elements
            this.overlay = document.getElementById('field-edit-overlay');
            this.box = document.getElementById('field-edit-box');
            this.textarea = document.getElementById('field-edit-textarea');
            this.filenameEl = document.getElementById('field-edit-filename');
            this.fieldnameEl = document.getElementById('field-edit-fieldname');
            
            // Get buttons
            this.applyFileBtn = document.getElementById('field-edit-apply-file');
            this.applyFolderBtn = document.getElementById('field-edit-apply-folder');
            this.resetBtn = document.getElementById('field-edit-reset');
            this.cancelBtn = document.getElementById('field-edit-cancel');
            
            // Set up event listeners
            this.setupEventListeners();
        },
        
        /**
         * Set up event listeners
         */
        setupEventListeners() {
            // Overlay click to close (counts as cancel)
            this.overlay.addEventListener('click', () => this.close(true));
            
            // Prevent box clicks from closing
            this.box.addEventListener('click', (e) => e.stopPropagation());
            
            // Textarea changes - debounced to improve performance
            this.textarea.addEventListener('input', () => {
                clearTimeout(this.updateButtonStatesTimeout);
                this.updateButtonStatesTimeout = setTimeout(() => this.updateButtonStates(), 300);
                
                // Check character count for auto-closing
                clearTimeout(this.charCountTimeout);
                this.charCountTimeout = setTimeout(() => {
                    const charCount = this.textarea.value.length;
                    if (this.onCharacterCountChange && this.currentField) {
                        this.onCharacterCountChange(this.currentField, charCount);
                    }
                }, 300);
            });
            
            // Button clicks
            this.applyFileBtn.addEventListener('click', () => this.applyToFile());
            this.applyFolderBtn.addEventListener('click', () => this.applyToFolder());
            this.resetBtn.addEventListener('click', () => this.reset());
            this.cancelBtn.addEventListener('click', () => this.close(true));
            
            // Comprehensive keyboard handler in capture phase
            document.addEventListener('keydown', (e) => {
                if (!this.isOpen()) return;
                
                // CRITICAL: Check if we're actually in the modal context
                // This prevents any keyboard events from leaking to the main app
                if (!this.box.contains(document.activeElement)) {
                    return; // Focus is outside modal, don't intercept
                }
                
                // Check what element has focus
                const activeElement = document.activeElement;
                const isTextarea = activeElement.tagName === 'TEXTAREA' || activeElement.id === 'field-edit-textarea';
                const isButton = activeElement.tagName === 'BUTTON';
                
                // Define keys that should ALWAYS be intercepted
                const alwaysInterceptKeys = [
                    'Tab', 'Escape'
                ];
                
                // Define keys that should be intercepted CONDITIONALLY
                const conditionalKeys = [
                    'Enter' // Only intercept on buttons
                ];
                
                // Arrow keys and navigation keys - ALWAYS intercept when modal is open
                // to prevent main app navigation, but handle differently based on focus
                const navigationKeys = [
                    'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
                    'Home', 'End', 'PageUp', 'PageDown'
                ];
                
                // Keys that might trigger app shortcuts
                const shortcutKeys = [
                    '/', '?', // Filter/Help shortcuts
                    's', 'S'  // Potential save shortcuts when combined with Ctrl
                ];
                
                // Determine if we should intercept this key
                let shouldIntercept = false;
                
                if (alwaysInterceptKeys.includes(e.key)) {
                    // Always intercept these keys
                    shouldIntercept = true;
                } else if (navigationKeys.includes(e.key)) {
                    // ALWAYS intercept navigation keys to prevent main app from processing them
                    shouldIntercept = true;
                } else if (conditionalKeys.includes(e.key) && !isTextarea) {
                    // Intercept these keys only when NOT in textarea
                    shouldIntercept = true;
                } else if (shortcutKeys.includes(e.key) && (e.ctrlKey || e.metaKey)) {
                    // Intercept keyboard shortcuts
                    shouldIntercept = true;
                }
                
                if (shouldIntercept) {
                    // ALWAYS stop propagation to prevent main app from seeing the event
                    e.stopPropagation();
                    e.stopImmediatePropagation();
                    
                    // For navigation keys in textarea, we stop propagation but NOT preventDefault
                    // This allows cursor movement while preventing file navigation
                    const inTextarea = activeElement.tagName === 'TEXTAREA' || activeElement.id === 'field-edit-textarea';
                    if (navigationKeys.includes(e.key) && inTextarea) {
                        // Don't call preventDefault - let cursor move naturally
                        // Don't call handleModalKeyboard - no special handling needed
                    } else {
                        // For all other intercepted keys, prevent default and handle
                        e.preventDefault();
                        this.handleModalKeyboard(e);
                    }
                }
            }, true); // true = use capture phase
            
            // Note: Escape key is handled by the comprehensive keyboard handler above
        },
        
        /**
         * Open the modal for a field
         */
        open(fieldId, fieldInfo, triggerElement) {
            // Prevent multiple modals
            if (this.isOpen()) {
                return;
            }
            
            this.currentField = fieldId;
            this.currentFieldInfo = fieldInfo;
            // Get the TRUE original content from State.originalMetadata
            this.originalContent = State.originalMetadata[fieldId] || '';
            this.triggerElement = triggerElement;
            
            // Start performance monitoring
            if (this.performanceObserver) {
                try {
                    this.performanceObserver.observe({ entryTypes: ['longtask'] });
                } catch (e) {
                    console.log('Long task monitoring not supported');
                }
            }
            
            // Update modal header with proper escaping
            // Extract just the filename from the full path
            const filename = State.currentFile ? State.currentFile.split('/').pop() : 'Unknown file';
            this.filenameEl.textContent = filename;
            this.fieldnameEl.textContent = fieldInfo.display_name || fieldId;
            
            // Warn for very large content
            if (this.originalContent.length > 10 * 1024 * 1024) { // 10MB
                console.warn(`Field ${fieldId} contains ${(this.originalContent.length / 1024 / 1024).toFixed(2)}MB of data`);
            }
            
            // Load content - use the current value (which may have been modified)
            // fieldInfo.value contains what the user typed before modal opened
            this.textarea.value = fieldInfo.value || '';
            
            // Reset button states
            this.updateButtonStates();
            
            // Show modal with animation
            this.overlay.classList.add('active');
            this.box.classList.add('active');
            
            // Focus textarea after animation
            setTimeout(() => {
                this.textarea.focus();
                this.textarea.setSelectionRange(0, 0);
            }, 50);
        },
        
        /**
         * Close the modal
         * @param {boolean} isCancel - Whether this is a cancel action (vs apply)
         */
        close(isCancel = false) {
            this.overlay.classList.remove('active');
            this.box.classList.remove('active');
            
            // Clear any pending timeout
            clearTimeout(this.updateButtonStatesTimeout);
            clearTimeout(this.charCountTimeout);
            
            // If canceling, restore original value
            if (isCancel && this.currentField) {
                const button = document.querySelector(`button[data-field="${this.currentField}"]`);
                
                if (button) {
                    // originalContent already contains State.originalMetadata value
                    const shouldBeInput = this.originalContent.length <= 100;
                    
                    if (shouldBeInput) {
                        // Original value is NOT oversized - convert back to input
                        const input = document.createElement('input');
                        input.type = 'text';
                        input.id = button.id;
                        input.value = this.originalContent;
                        input.setAttribute('data-field', this.currentField);
                        input.setAttribute('readonly', '');
                        input.setAttribute('data-editing', 'false');
                        
                        // Check if it's a dynamic field
                        const isDynamic = button.id.startsWith('dynamic-');
                        if (isDynamic) {
                            input.setAttribute('data-dynamic', 'true');
                        }
                        
                        // Get placeholder
                        let placeholder = '';
                        if (window.MetadataRemote.Metadata.Editor) {
                            const standardFieldsInfo = window.MetadataRemote.Metadata.Editor.standardFieldsInfo;
                            const fieldInfo = standardFieldsInfo[this.currentField];
                            if (fieldInfo) {
                                placeholder = fieldInfo.placeholder;
                            } else if (this.currentFieldInfo) {
                                // Dynamic field
                                placeholder = `Enter ${this.currentFieldInfo.display_name || this.currentField}`;
                            }
                        }
                        input.placeholder = placeholder;
                        
                        // Replace button with input
                        button.parentNode.replaceChild(input, button);
                        
                        // Attach event listeners
                        if (window.MetadataRemote.Metadata.Editor) {
                            window.MetadataRemote.Metadata.Editor.attachFieldEventListeners(input, this.currentField);
                        }
                        
                        // Store element for focus
                        this.triggerElement = input;
                    } else {
                        // Original value WAS oversized - keep button but restore value
                        button.setAttribute('data-value', this.originalContent);
                    }
                    
                    // Update the dynamicFields map with original value
                    const dynamicFields = window.MetadataRemote.Metadata.Editor.dynamicFields;
                    if (dynamicFields && dynamicFields.has(this.currentField)) {
                        const fieldInfo = dynamicFields.get(this.currentField);
                        fieldInfo.value = this.originalContent;
                        dynamicFields.set(this.currentField, fieldInfo);
                    }
                }
            }
            
            // Clear state
            this.currentField = null;
            this.currentFieldInfo = null;
            this.originalContent = '';
            
            // Return focus to trigger element
            if (this.triggerElement) {
                setTimeout(() => {
                    this.triggerElement.focus();
                    this.triggerElement = null;
                }, 200);
            }
        },
        
        /**
         * Check if modal is open
         */
        isOpen() {
            return this.overlay.classList.contains('active');
        },
        
        /**
         * Handle keyboard events within the modal
         */
        handleModalKeyboard(e) {
            // Check if we're in the textarea
            const inTextarea = document.activeElement.tagName === 'TEXTAREA' || 
                              document.activeElement.id === 'field-edit-textarea';
            
            switch(e.key) {
                case 'Tab':
                    this.handleTabNavigation(e);
                    break;
                    
                case 'Enter':
                    // If focus is on a button, activate it
                    if (document.activeElement.tagName === 'BUTTON') {
                        document.activeElement.click();
                    }
                    break;
                    
                case 'Escape':
                    this.close(true);
                    break;
                    
                // Navigation keys - handle based on context
                case 'ArrowLeft':
                case 'ArrowRight':
                case 'ArrowUp':
                case 'ArrowDown':
                case 'Home':
                case 'End':
                case 'PageUp':
                case 'PageDown':
                    if (inTextarea) {
                        // In textarea: We intercepted the event to prevent main app navigation,
                        // but we DON'T call preventDefault so cursor can move naturally
                        console.log('[Modal] Navigation key in textarea - letting default behavior happen');
                        return; // Important: return without preventDefault!
                    } else if (document.activeElement.tagName === 'BUTTON') {
                        // On buttons: Navigate between buttons
                        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                            this.navigateButtons(e.key === 'ArrowLeft' ? -1 : 1);
                        }
                    }
                    break;
            }
        },
        
        /**
         * Handle Tab navigation within modal
         */
        handleTabNavigation(e) {
            // Get all focusable elements within the modal
            const focusableElements = this.box.querySelectorAll(
                'textarea, button:not([disabled]), [tabindex]:not([tabindex="-1"])'
            );
            
            if (focusableElements.length === 0) return;
            
            const firstElement = focusableElements[0];
            const lastElement = focusableElements[focusableElements.length - 1];
            const activeElement = document.activeElement;
            
            if (e.shiftKey) {
                // Shift+Tab: Move backwards
                if (activeElement === firstElement) {
                    // Wrap to last element
                    lastElement.focus();
                } else {
                    // Find previous element
                    const currentIndex = Array.from(focusableElements).indexOf(activeElement);
                    if (currentIndex > 0) {
                        focusableElements[currentIndex - 1].focus();
                    }
                }
            } else {
                // Tab: Move forwards
                if (activeElement === lastElement) {
                    // Wrap to first element
                    firstElement.focus();
                } else {
                    // Find next element
                    const currentIndex = Array.from(focusableElements).indexOf(activeElement);
                    if (currentIndex < focusableElements.length - 1) {
                        focusableElements[currentIndex + 1].focus();
                    }
                }
            }
        },
        
        /**
         * Navigate between action buttons with arrow keys
         */
        navigateButtons(direction) {
            const buttons = this.box.querySelectorAll('.field-edit-actions button:not([disabled])');
            if (buttons.length === 0) return;
            
            const currentButton = document.activeElement;
            const currentIndex = Array.from(buttons).indexOf(currentButton);
            
            let nextIndex;
            if (currentIndex === -1) {
                // No button focused, focus first
                nextIndex = 0;
            } else {
                // Calculate next index with wrapping
                nextIndex = currentIndex + direction;
                if (nextIndex < 0) nextIndex = buttons.length - 1;
                if (nextIndex >= buttons.length) nextIndex = 0;
            }
            
            buttons[nextIndex].focus();
        },
        
        /**
         * Update button states based on changes
         */
        updateButtonStates() {
            const hasChanges = this.textarea.value !== this.originalContent;
            this.applyFileBtn.disabled = !hasChanges;
            this.applyFolderBtn.disabled = !hasChanges;
        },
        
        /**
         * Reset to original content
         */
        reset() {
            this.textarea.value = this.originalContent;
            this.updateButtonStates();
            this.textarea.focus();
        },
        
        /**
         * Apply changes to file
         */
        async applyToFile() {
            const button = this.applyFileBtn;
            const field = this.currentField;
            const value = this.textarea.value;
            
            // Disable buttons
            button.disabled = true;
            this.applyFolderBtn.disabled = true;
            
            // Show processing state
            ButtonStatus.showButtonStatus(button, 'Saving...', 'processing');
            
            try {
                // Create metadata object
                const data = {};
                data[field] = value;
                
                // Call API
                const result = await API.setMetadata(State.currentFile, data);
                
                if (result.status === 'success') {
                    // Update state
                    State.originalMetadata[field] = value;
                    
                    // Update the field in the main UI
                    const input = document.querySelector(`[data-field="${field}"]`);
                    if (input) {
                        // Keep showing "Click to view/edit"
                        input.value = 'Click to view/edit';
                        // Update the stored original value
                        input.dataset.originalValue = value;
                    }
                    
                    // Update dynamic fields map if needed
                    const dynamicFields = window.MetadataRemote.Metadata.Editor.dynamicFields;
                    if (dynamicFields && dynamicFields.has(field)) {
                        const fieldInfo = dynamicFields.get(field);
                        fieldInfo.value = value;
                        dynamicFields.set(field, fieldInfo);
                    }
                    
                    // Show success
                    ButtonStatus.showButtonStatus(button, 'Saved!', 'success', 2000);
                    
                    // Close modal after delay
                    setTimeout(() => this.close(), 1500);
                    
                    // Refresh history
                    if (window.MetadataRemote.History && window.MetadataRemote.History.Manager) {
                        window.MetadataRemote.History.Manager.loadHistory();
                    }
                } else {
                    throw new Error(result.error || 'Failed to save');
                }
            } catch (err) {
                console.error('Error saving field:', err);
                ButtonStatus.showButtonStatus(button, 'Error', 'error');
                
                // Re-enable buttons
                button.disabled = false;
                this.applyFolderBtn.disabled = false;
            }
        },
        
        /**
         * Apply changes to folder
         */
        async applyToFolder() {
            if (!confirm(`Apply this value to all files in the folder? This will update the "${this.currentFieldInfo.display_name}" field for all audio files.`)) {
                return;
            }
            
            const button = this.applyFolderBtn;
            const field = this.currentField;
            const value = this.textarea.value;
            const folderPath = State.currentPath || '';
            
            // Disable buttons and form
            button.disabled = true;
            this.applyFileBtn.disabled = true;
            this.textarea.disabled = true;
            
            // Show processing state
            ButtonStatus.showButtonStatus(button, 'Applying to folder...', 'processing');
            
            try {
                const result = await API.applyFieldToFolder(folderPath, field, value);
                
                if (result.status === 'success') {
                    // Update state
                    State.originalMetadata[field] = value;
                    
                    // Update the field in the main UI
                    const input = document.querySelector(`[data-field="${field}"]`);
                    if (input) {
                        input.value = 'Click to view/edit';
                        input.dataset.originalValue = value;
                    }
                    
                    // Update dynamic fields map
                    const dynamicFields = window.MetadataRemote.Metadata.Editor.dynamicFields;
                    if (dynamicFields && dynamicFields.has(field)) {
                        const fieldInfo = dynamicFields.get(field);
                        fieldInfo.value = value;
                        dynamicFields.set(field, fieldInfo);
                    }
                    
                    // Show success
                    ButtonStatus.showButtonStatus(button, `Applied to ${result.filesUpdated} files!`, 'success', 3000);
                    
                    // Close modal after delay
                    setTimeout(() => this.close(), 2000);
                    
                    // Refresh history
                    if (window.MetadataRemote.History && window.MetadataRemote.History.Manager) {
                        window.MetadataRemote.History.Manager.loadHistory();
                    }
                } else {
                    throw new Error(result.error || 'Failed to apply to folder');
                }
            } catch (err) {
                console.error('Error applying to folder:', err);
                ButtonStatus.showButtonStatus(button, 'Error', 'error');
            } finally {
                // Re-enable controls
                button.disabled = false;
                this.applyFileBtn.disabled = false;
                this.textarea.disabled = false;
            }
        }
    };
})();