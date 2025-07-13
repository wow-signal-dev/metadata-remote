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
            // Overlay click to close
            this.overlay.addEventListener('click', () => this.close());
            
            // Prevent box clicks from closing
            this.box.addEventListener('click', (e) => e.stopPropagation());
            
            // Textarea changes - debounced to improve performance
            this.textarea.addEventListener('input', () => {
                clearTimeout(this.updateButtonStatesTimeout);
                this.updateButtonStatesTimeout = setTimeout(() => this.updateButtonStates(), 300);
            });
            
            // Button clicks
            this.applyFileBtn.addEventListener('click', () => this.applyToFile());
            this.applyFolderBtn.addEventListener('click', () => this.applyToFolder());
            this.resetBtn.addEventListener('click', () => this.reset());
            this.cancelBtn.addEventListener('click', () => this.close());
            
            // Escape key to close
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && this.isOpen()) {
                    e.preventDefault();
                    this.close();
                }
            });
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
            this.originalContent = fieldInfo.original_value || '';
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
            this.filenameEl.textContent = State.currentFile || 'Unknown file';
            this.fieldnameEl.textContent = fieldInfo.display_name || fieldId;
            
            // Warn for very large content
            if (this.originalContent.length > 10 * 1024 * 1024) { // 10MB
                console.warn(`Field ${fieldId} contains ${(this.originalContent.length / 1024 / 1024).toFixed(2)}MB of data`);
            }
            
            // Load content
            this.textarea.value = this.originalContent;
            
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
         */
        close() {
            this.overlay.classList.remove('active');
            this.box.classList.remove('active');
            
            // Clear any pending timeout
            clearTimeout(this.updateButtonStatesTimeout);
            
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
                        fieldInfo.original_value = value;
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
                        fieldInfo.original_value = value;
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