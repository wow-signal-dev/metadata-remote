/*
 * Metadata Remote - Intelligent audio metadata editor
 * Copyright (C) 2025 Dr. William Nelson Leonard
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

(function() {
    'use strict';
    
    // Ensure namespace exists
    window.MetadataRemote = window.MetadataRemote || {};
    window.MetadataRemote.Metadata = window.MetadataRemote.Metadata || {};
    
    // Import dependencies
    const State = window.MetadataRemote.State;
    // Note: FieldEditModal is loaded after this script, so we'll access it dynamically
    
    /**
     * Transition Controller Module
     * Handles automatic transitions between inline and modal editing based on character count
     */
    
    const newInstanceId = Math.random().toString(36).substr(2, 9);
    
    window.MetadataRemote.Metadata.TransitionController = {
        // Instance ID
        instanceId: newInstanceId,
        
        // Configuration
        INLINE_TO_MODAL_THRESHOLD: 100,
        MODAL_TO_INLINE_THRESHOLD: 80,
        DEBOUNCE_DELAY: 300,
        
        // State tracking
        activeMonitors: new Map(), // field id -> monitor data
        charCountTimeouts: new Map(), // field id -> timeout id
        pendingInlineTransition: null, // Track pending inline transitions
        
        /**
         * Initialize the controller
         */
        init() {
            // Listen for modal character count events
            const FieldEditModal = window.MetadataRemote.Metadata.FieldEditModal;
            if (FieldEditModal) {
                FieldEditModal.onCharacterCountChange = this.handleModalCharacterCount.bind(this);
            }
            
            // Set up global paste handler for immediate transitions
            this.pasteHandler = this.handlePaste.bind(this);
            document.addEventListener('paste', this.pasteHandler, true);
            
            // Clean up on page unload
            window.addEventListener('beforeunload', () => this.cleanup());
        },
        
        /**
         * Start monitoring a field for character count changes
         */
        monitorField(input) {
            if (!input || input.disabled) {
                return;
            }
            
            const fieldId = input.getAttribute('data-field') || input.id;
            
            // Skip if already monitoring
            if (this.activeMonitors.has(fieldId)) {
                return;
            }
            
            // Create bound handler for cleanup
            const inputHandler = this.handleInputChange.bind(this);
            
            // Store monitor data with handler reference
            this.activeMonitors.set(fieldId, {
                input: input,
                isMonitoring: true,
                inputHandler: inputHandler
            });
            
            
            // Add input listener
            input.addEventListener('input', inputHandler);
            
        },
        
        /**
         * Stop monitoring a field
         */
        stopMonitoring(fieldId) {
            const monitorData = this.activeMonitors.get(fieldId);
            if (monitorData) {
                // Remove event listener
                if (monitorData.input && monitorData.inputHandler) {
                    monitorData.input.removeEventListener('input', monitorData.inputHandler);
                }
                this.activeMonitors.delete(fieldId);
            }
            
            // Clear any pending timeout
            if (this.charCountTimeouts.has(fieldId)) {
                clearTimeout(this.charCountTimeouts.get(fieldId));
                this.charCountTimeouts.delete(fieldId);
            }
        },
        
        /**
         * Stop monitoring all fields
         */
        stopAllMonitoring() {
            // Stop monitoring each field
            const fieldIds = Array.from(this.activeMonitors.keys());
            fieldIds.forEach(fieldId => this.stopMonitoring(fieldId));
        },
        
        /**
         * Handle input changes with debouncing
         */
        handleInputChange(event) {
            const input = event.target;
            const fieldId = input.getAttribute('data-field') || input.id;
            const charCount = input.value.length;

            // Skip if not actively monitoring or field is not in edit mode
            if (!this.activeMonitors.has(fieldId) || input.dataset.editing !== 'true') {
                return;
            }
            
            // Clear existing timeout
            if (this.charCountTimeouts.has(fieldId)) {
                clearTimeout(this.charCountTimeouts.get(fieldId));
            }
            
            // Set new debounced check
            const timeoutId = setTimeout(() => {
                this.checkThreshold(input);
            }, this.DEBOUNCE_DELAY);
            
            this.charCountTimeouts.set(fieldId, timeoutId);
        },
        
        /**
         * Handle paste events for immediate transition
         */
        handlePaste(event) {
            const input = event.target;
            
            // Check if it's a monitored metadata field
            if (input.tagName !== 'INPUT' || !input.closest('.metadata') || 
                input.dataset.editing !== 'true' || input.disabled) {
                return;
            }
            
            // Get pasted text
            const paste = (event.clipboardData || window.clipboardData).getData('text');
            
            // Calculate new length after paste
            const selectionStart = input.selectionStart;
            const selectionEnd = input.selectionEnd;
            const currentValue = input.value;
            const newValue = currentValue.substring(0, selectionStart) + paste + currentValue.substring(selectionEnd);
            
            // Check if it exceeds threshold
            if (newValue.length > this.INLINE_TO_MODAL_THRESHOLD) {
                // Prevent default paste to control the timing
                event.preventDefault();
                
                // Apply the paste manually
                input.value = newValue;
                
                // Trigger transition after value is set
                this.transitionToModal(input);
            }
        },
        
        /**
         * Check if field should transition based on character count
         */
        checkThreshold(input) {
            const charCount = input.value.length;
            const fieldId = input.getAttribute('data-field') || input.id;
            
            // Only transition if actively editing (not for programmatic changes)
            const isActivelyEditing = input.dataset.editing === 'true';
            
            
            // Check if we should transition to modal
            if (charCount > this.INLINE_TO_MODAL_THRESHOLD && 
                !input.classList.contains('oversized-field-input') && 
                isActivelyEditing) {
                this.transitionToModal(input);
            }
        },
        
        /**
         * Transition from inline to modal editing
         */
        transitionToModal(input) {
            const fieldId = input.getAttribute('data-field') || input.id;
            
            // Hide inference suggestions if active
            const suggestionsEl = document.getElementById(`${fieldId}-suggestions`);
            if (suggestionsEl && suggestionsEl.classList.contains('active') && 
                window.MetadataRemote.Metadata.Inference) {
                window.MetadataRemote.Metadata.Inference.hideInferenceSuggestions(fieldId);
            }
            
            // Save cursor position and value
            const cursorPosition = input.selectionEnd;
            const currentValue = input.value;
            
            // Get field info from editor's dynamic fields or create minimal info
            let fieldInfo = null;
            if (window.MetadataRemote.Metadata.Editor && window.MetadataRemote.Metadata.Editor.dynamicFields) {
                fieldInfo = window.MetadataRemote.Metadata.Editor.dynamicFields.get(fieldId);
            }
            
            if (!fieldInfo) {
                // Create minimal field info for standard fields
                const labelElement = input.closest('.form-group-wrapper')?.querySelector('label');
                fieldInfo = {
                    field_name: fieldId,
                    display_name: labelElement?.textContent || fieldId,
                    value: currentValue,
                    is_editable: true
                };
            } else {
                // Update field info with current value
                fieldInfo.value = currentValue;
            }
            
            // Create button element
            const button = document.createElement('button');
            button.type = 'button';
            button.id = input.id;
            button.className = 'oversized-field-button';
            button.setAttribute('data-field', fieldId);
            button.setAttribute('data-value', currentValue);
            button.textContent = 'Click to view/edit';
            
            // Add click handler to button
            button.addEventListener('click', (e) => {
                e.preventDefault();
                if (window.MetadataRemote.Metadata.FieldEditModal) {
                    window.MetadataRemote.Metadata.FieldEditModal.open(fieldId, fieldInfo, button);
                }
            });
            
            // Hide apply controls before replacing input
            if (window.MetadataRemote.Metadata.Editor) {
                window.MetadataRemote.Metadata.Editor.hideFieldControls(fieldId);
            }
            
            // Replace input with button
            input.parentNode.replaceChild(button, input);
            
            // Stop monitoring the old input
            this.stopMonitoring(fieldId);
            
            // Open modal with cursor position
            const FieldEditModal = window.MetadataRemote.Metadata.FieldEditModal;
            if (FieldEditModal && FieldEditModal.open) {
                FieldEditModal.open(fieldId, fieldInfo, button);
                
                // Restore cursor position after modal opens
                setTimeout(() => {
                    const modal = window.MetadataRemote.Metadata.FieldEditModal;
                    if (modal && modal.textarea) {
                        modal.textarea.setSelectionRange(cursorPosition, cursorPosition);
                        modal.textarea.focus();
                    }
                }, 100);
            }
        },
        
        /**
         * Handle character count changes from modal
         */
        handleModalCharacterCount(fieldId, charCount) {
            // Check if we should transition back to inline
            const FieldEditModal = window.MetadataRemote.Metadata.FieldEditModal;
            if (charCount < this.MODAL_TO_INLINE_THRESHOLD && FieldEditModal && FieldEditModal.isOpen()) {
                this.transitionToInline(fieldId);
            }
        },
        
        /**
         * Transition from modal back to inline editing
         */
        transitionToInline(fieldId) {
            // Get the button element - look for button with data-field matching fieldId
            const button = document.querySelector(`button[data-field="${fieldId}"]`);
            
            if (!button) {
                console.error('[TransitionController] Button not found for field:', fieldId);
                return;
            }
            
            const FieldEditModal = window.MetadataRemote.Metadata.FieldEditModal;
            const currentValue = FieldEditModal.textarea.value;
            const cursorPosition = FieldEditModal.textarea.selectionEnd;
            
            
            // Get field info for placeholder
            let placeholder = '';
            let isDynamic = false;
            if (window.MetadataRemote.Metadata.Editor) {
                const standardFieldsInfo = window.MetadataRemote.Metadata.Editor.standardFieldsInfo;
                const fieldInfo = standardFieldsInfo[fieldId];
                if (fieldInfo) {
                    placeholder = fieldInfo.placeholder;
                } else {
                    // Dynamic field
                    isDynamic = true;
                    const dynamicFieldInfo = window.MetadataRemote.Metadata.Editor.dynamicFields.get(fieldId);
                    if (dynamicFieldInfo) {
                        placeholder = `Enter ${dynamicFieldInfo.display_name}`;
                    }
                }
            }
            
            // Create input element
            const input = document.createElement('input');
            input.type = 'text';
            input.id = button.id;
            input.value = currentValue;
            input.setAttribute('data-field', fieldId);
            input.setAttribute('readonly', '');
            input.setAttribute('data-editing', 'true');
            input.placeholder = placeholder;
            
            if (isDynamic) {
                input.setAttribute('data-dynamic', 'true');
            }
            
            // Replace button with input
            button.parentNode.replaceChild(input, button);
            
            // Attach event listeners
            if (window.MetadataRemote.Metadata.Editor) {
                window.MetadataRemote.Metadata.Editor.attachFieldEventListeners(input, fieldId);
            }
            
            // Make sure the input is in editing mode
            input.readOnly = false;
            
            // Monitor the new input
            this.monitorField(input);
            
            // Update the dynamicFields map with the new value
            if (window.MetadataRemote.Metadata.Editor && window.MetadataRemote.Metadata.Editor.dynamicFields) {
                const dynamicFields = window.MetadataRemote.Metadata.Editor.dynamicFields;
                if (dynamicFields.has(fieldId)) {
                    const fieldInfo = dynamicFields.get(fieldId);
                    fieldInfo.value = currentValue;
                    dynamicFields.set(fieldId, fieldInfo);
                }
            }
            
            // Trigger input event to update apply controls visibility
            const inputEvent = new Event('input', { bubbles: true });
            input.dispatchEvent(inputEvent);
            
            // Close modal
            FieldEditModal.close();
            
            // Restore focus and cursor position
            input.focus();
            input.setSelectionRange(cursorPosition, cursorPosition);
            
            // Ensure we're in form edit state
            if (window.MetadataRemote.Navigation.StateMachine) {
                window.MetadataRemote.Navigation.StateMachine.transition(
                    window.MetadataRemote.Navigation.StateMachine.States.FORM_EDIT
                );
            }
        },
        
        /**
         * Clean up when field is removed or page unloads
         */
        cleanup() {
            // Stop all field monitoring
            this.stopAllMonitoring();
            
            // Clear all timeouts (redundant but ensures cleanup)
            this.charCountTimeouts.forEach(timeout => clearTimeout(timeout));
            this.charCountTimeouts.clear();
            
            // Remove global paste handler
            if (this.pasteHandler) {
                document.removeEventListener('paste', this.pasteHandler, true);
            }
        }
    };
})();