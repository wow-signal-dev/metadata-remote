/**
 * Metadata Editor Module for Metadata Remote
 * Handles core metadata editing operations
 */

(function() {
    // Create namespace if it doesn't exist
    window.MetadataRemote = window.MetadataRemote || {};
    window.MetadataRemote.Metadata = window.MetadataRemote.Metadata || {};
    
    // Create shortcuts
    const State = window.MetadataRemote.State;
    const API = window.MetadataRemote.API;
    const UIUtils = window.MetadataRemote.UI.Utilities;
    const ButtonStatus = window.MetadataRemote.UI.ButtonStatus;
    
    // Store callbacks that will be set during initialization
    let loadHistoryCallback = null;
    let hideInferenceSuggestionsCallback = null;
    
    // Dynamic fields tracking
    let dynamicFields = new Map();
    const standardFields = ['title', 'artist', 'album', 'albumartist', 'date', 'genre', 'composer', 'track', 'disc'];
    
    // HTML escape function to prevent XSS and display issues
    function escapeHtml(unsafe) {
        if (unsafe === null || unsafe === undefined) return '';
        return String(unsafe)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }
    
    // Field name normalization map - maps various input forms to standard field IDs
    const fieldNameNormalizations = {
        // Title variations
        'title': 'title',
        'song': 'title',
        'song title': 'title',
        'track title': 'title',
        
        // Artist variations
        'artist': 'artist',
        'performer': 'artist',
        'track artist': 'artist',
        
        // Album variations
        'album': 'album',
        'album title': 'album',
        
        // Album Artist variations
        'albumartist': 'albumartist',
        'album artist': 'albumartist',
        'band': 'albumartist',
        'album-artist': 'albumartist',
        
        // Date/Year variations
        'date': 'date',
        'year': 'date',
        'release date': 'date',
        'release year': 'date',
        
        // Genre variations
        'genre': 'genre',
        'style': 'genre',
        
        // Composer variations
        'composer': 'composer',
        'writer': 'composer',
        'written by': 'composer',
        
        // Track number variations
        'track': 'track',
        'track number': 'track',
        'tracknumber': 'track',
        'track no': 'track',
        'trackno': 'track',
        '#': 'track',
        
        // Disc number variations
        'disc': 'disc',
        'disk': 'disc',
        'disc number': 'disc',
        'discnumber': 'disc',
        'disk number': 'disc',
        'disknumber': 'disc',
        'disc no': 'disc',
        'discno': 'disc'
    };
    
    window.MetadataRemote.Metadata.Editor = {
        /**
         * Initialize the metadata editor with required callbacks
         * @param {Object} callbacks - Object containing callback functions
         */
        init(callbacks) {
            loadHistoryCallback = callbacks.loadHistory;
            hideInferenceSuggestionsCallback = callbacks.hideInferenceSuggestions;
            
            // Add keyboard event listener for extended fields toggle
            const toggleButton = document.querySelector('.extended-fields-toggle');
            if (toggleButton) {
                toggleButton.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        this.toggleExtendedFields();
                    }
                });
            }
            
            // Add keyboard event listener for new field creator toggle
            const newFieldHeader = document.querySelector('.new-field-header');
            if (newFieldHeader) {
                newFieldHeader.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        this.toggleNewFieldForm();
                    }
                });
            }
            
            // Add real-time validation for new field name input
            const newFieldNameInput = document.getElementById('new-field-name');
            if (newFieldNameInput) {
                newFieldNameInput.addEventListener('input', (e) => {
                    if (e.target.value.length > 50) {
                        e.target.setCustomValidity('Field name must be 50 characters or less');
                        e.target.classList.add('invalid');
                    } else {
                        e.target.setCustomValidity('');
                        e.target.classList.remove('invalid');
                    }
                });
            }
        },
        
        /**
         * Setup metadata field change listeners
         */
        /**
         * Hide apply controls for a specific field
         * @param {string} field - Field name
         */
        hideFieldControls(field) {
            const groupedFields = ['track', 'disc', 'date'];
            
            if (groupedFields.includes(field)) {
                // Hide the specific grouped field item
                const fieldItem = document.querySelector(`.grouped-apply-item[data-field="${field}"]`);
                if (fieldItem) {
                    fieldItem.classList.remove('visible');
                    fieldItem.style.display = 'none';
                }
                
                // Check if any other grouped fields are still changed
                const anyGroupedFieldChanged = groupedFields.some(f => {
                    const inp = document.getElementById(f);
                    return inp.value !== (State.originalMetadata[f] || '');
                });
                
                // Hide entire grouped controls if no fields are changed
                if (!anyGroupedFieldChanged) {
                    const groupedControls = document.getElementById('grouped-apply-controls');
                    if (groupedControls) {
                        groupedControls.classList.remove('visible');
                    }
                }
            } else {
                // Hide individual field controls (works for both standard and dynamic fields)
                const controls = document.querySelector(`.apply-field-controls[data-field="${field}"]`);
                if (controls) {
                    controls.classList.remove('visible');
                }
            }
        },

        /**
         * Hide all apply field controls (both individual and grouped)
         */
        hideAllApplyControls() {
            // Hide individual field controls
            document.querySelectorAll('.apply-field-controls').forEach(controls => {
                controls.classList.remove('visible');
            });
            
            // Hide grouped controls
            const groupedControls = document.getElementById('grouped-apply-controls');
            if (groupedControls) {
                groupedControls.classList.remove('visible');
                document.querySelectorAll('.grouped-apply-item').forEach(item => {
                    item.classList.remove('visible');
                    item.style.display = 'none';
                });
            }
        },

        setupMetadataFieldListeners() {
            // This function is now deprecated since we attach listeners when creating fields
            // Keep it empty to avoid breaking existing calls
        },
        
        /**
         * Save all metadata fields to file
         * @param {Function} showButtonStatus - Callback to show button status
         */
        async save(showButtonStatus) {
            if (!State.currentFile) return;
            
            // Store the currently focused element
            const previouslyFocused = document.activeElement;
            
            const button = document.querySelector('.save-btn');
            const data = {};
            
            
            // Collect standard fields (only those that exist)
            standardFields.forEach(field => {
                const input = document.getElementById(field);
                if (input) {
                    data[field] = input.value;
                }
            });
            
            // Collect dynamic fields
            dynamicFields.forEach((fieldInfo, fieldId) => {
                const input = document.getElementById(`dynamic-${fieldId}`);
                if (input && !input.disabled && fieldInfo.is_editable) {
                    data[fieldId] = input.value;
                }
            });
            
            if (State.pendingAlbumArt) {
                data.art = State.pendingAlbumArt;
            }
            
            
            UIUtils.setFormEnabled(false);
            showButtonStatus(button, 'Saving...', 'processing');
            
            try {
                const result = await API.setMetadata(State.currentFile, data);
                
                if (result.status === 'success') {
                    showButtonStatus(button, 'Saved!', 'success', 3000);
                    
                    Object.keys(data).forEach(key => {
                        if (key !== 'art' && key !== 'removeArt') {
                            State.originalMetadata[key] = data[key];
                        }
                    });
                    
                    this.hideAllApplyControls();
                    
                    // Hide controls for dynamic fields too
                    dynamicFields.forEach((fieldInfo, fieldId) => {
                        const controls = document.querySelector(`.apply-field-controls[data-field="${fieldId}"]`);
                        if (controls) {
                            controls.classList.remove('visible');
                        }
                    });
                    
                    if (State.pendingAlbumArt) {
                        State.currentAlbumArt = State.pendingAlbumArt;
                        document.querySelector('.save-image-btn').style.display = 'none';
                        document.querySelector('.apply-folder-btn').style.display = 'none';
                    }
                    State.pendingAlbumArt = null;
                    
                    loadHistoryCallback();
                } else {
                    showButtonStatus(button, 'Error', 'error');
                }
            } catch (err) {
                console.error('Error saving metadata:', err);
                // Check for specific format-related errors
                const errorMessage = err.message || '';
                if (errorMessage.includes('Album art is not supported')) {
                    showButtonStatus(button, 'Album art not supported for this format', 'error', 5000);
                } else {
                    showButtonStatus(button, 'Error', 'error');
                }
            }
            
            UIUtils.setFormEnabled(true);
            
            // Restore focus to the previously focused element
            if (previouslyFocused && previouslyFocused.id && document.getElementById(previouslyFocused.id)) {
                const element = document.getElementById(previouslyFocused.id);
                element.focus();
                if (element.tagName === 'INPUT') {
                    element.dataset.editing = 'false';
                    element.readOnly = true;
                }
            }
        },
        
        /**
         * Reset form to original values
         * @param {Function} showButtonStatus - Callback to show button status
         */
        async resetForm(showButtonStatus) {
            if (!State.currentFile) return;
            
            // Store the currently focused element
            const previouslyFocused = document.activeElement;
            
            const button = document.querySelector('.clear-btn');
            showButtonStatus(button, 'Resetting...', 'processing');
            
            try {
                const data = await API.getMetadata(State.currentFile);
                
                State.originalMetadata = {
                    title: data.title || '',
                    artist: data.artist || '',
                    album: data.album || '',
                    albumartist: data.albumartist || '',
                    date: data.date || '',
                    genre: data.genre || '',
                    composer: data.composer || '',
                    track: data.track || '',
                    disc: data.disc || ''
                };
                
                // Re-render fields instead of just setting values
                State.metadata = data;
                this.renderMetadataFields(data);
                
                this.hideAllApplyControls();
                
                State.pendingAlbumArt = null;
                
                const artDisplay = document.getElementById('art-display');
                const deleteBtn = document.querySelector('.delete-art-btn');
                const saveImageBtn = document.querySelector('.save-image-btn');
                const applyFolderBtn = document.querySelector('.apply-folder-btn');
                
                if (data.hasArt && data.art) {
                    State.currentAlbumArt = data.art;
                    artDisplay.innerHTML = `<img src="data:image/jpeg;base64,${data.art}" class="album-art">`;
                    deleteBtn.style.display = 'block';
                    saveImageBtn.style.display = 'none';
                    applyFolderBtn.style.display = 'none';
                } else {
                    State.currentAlbumArt = null;
                    artDisplay.innerHTML = '<div class="album-art-placeholder">No album art</div>';
                    deleteBtn.style.display = 'none';
                    saveImageBtn.style.display = 'none';
                    applyFolderBtn.style.display = 'none';
                }
                
                showButtonStatus(button, 'Reset!', 'success', 2000);
                
                // Restore focus to the previously focused element
                if (previouslyFocused && previouslyFocused.id && document.getElementById(previouslyFocused.id)) {
                    const element = document.getElementById(previouslyFocused.id);
                    element.focus();
                    if (element.tagName === 'INPUT') {
                        element.dataset.editing = 'false';
                        element.readOnly = true;
                    }
                }
            } catch (err) {
                console.error('Error resetting form:', err);
                showButtonStatus(button, 'Error', 'error');
            }
        },
        
        /**
         * Save individual field to file
         * @param {string} field - Field name to save
         * @param {Function} showButtonStatus - Callback to show button status
         */
        async saveFieldToFile(field, showButtonStatus) {
            if (!State.currentFile) return;
            
            const button = document.querySelector(`.apply-file-btn[data-field="${field}"]`);
            
            // Find input by data-field attribute (works for both standard and dynamic fields)
            const input = document.querySelector(`input[data-field="${field}"]`);
            
            if (!input) return;
            
            const value = input.value.trim();
            if (!value && value !== '') return; // Allow empty string to clear field
            
            button.disabled = true;
            showButtonStatus(button, 'Saving to file...', 'processing');
            
            // Create metadata object with only this field
            const data = {};
            data[field] = value;
            
            try {
                const result = await API.setMetadata(State.currentFile, data);
                
                if (result.status === 'success') {
                    showButtonStatus(button, 'Saved to file!', 'success', 2000);
                    State.originalMetadata[field] = value;
                    
                    // Hide controls after successful save
                    setTimeout(() => {
                        this.hideFieldControls(field);
                    }, 1000);
                    
                    // Refresh history
                    loadHistoryCallback();
                    
                    // Maintain focus on the field
                    if (input) {
                        input.focus();
                        // Check if it's a dynamic field by looking for data-dynamic attribute
                        const isDynamic = input.dataset.dynamic === 'true';
                        if (!isDynamic) {
                            input.dataset.editing = 'false';
                            input.readOnly = true;
                        }
                    }
                } else {
                    showButtonStatus(button, 'Failed to save', 'error');
                }
            } catch (err) {
                console.error(`Error saving ${field} to file:`, err);
                showButtonStatus(button, 'Error saving field', 'error');
            }
            
            button.disabled = false;
        },
        
        /**
         * Apply field value to all files in folder
         * @param {string} field - Field name to apply
         * @param {Function} showButtonStatus - Callback to show button status
         * @param {Function} setFormEnabled - Callback to enable/disable form
         */
        async applyFieldToFolder(field, showButtonStatus, setFormEnabled) {
            if (!State.currentFile) return;
            
            const button = document.querySelector(`.apply-folder-btn-new[data-field="${field}"]`);
            
            // Find input by data-field attribute (works for both standard and dynamic fields)
            const input = document.querySelector(`input[data-field="${field}"]`);
            
            if (!input) return;
            
            const value = input.value.trim();
            if (!value && value !== '') return; // Allow empty string to clear field
            
            const folderPath = State.currentFile.substring(0, State.currentFile.lastIndexOf('/'));
            const labelElement = document.querySelector(`label[for="${input.id}"]`);
            const fieldLabel = labelElement ? labelElement.textContent : field;
            
            if (!confirm(`Apply "${fieldLabel}" value "${value}" to all files in the folder "${folderPath || 'root'}"?`)) {
                return;
            }
            
            button.disabled = true;
            setFormEnabled(false);
            showButtonStatus(button, 'Applying to folder...', 'processing');
            
            try {
                const result = await API.applyFieldToFolder(folderPath, field, value);
                
                if (result.status === 'success') {
                    showButtonStatus(button, `Applied to ${result.filesUpdated} files!`, 'success', 3000);
                    State.originalMetadata[field] = value;
                    setTimeout(() => {
                        this.hideFieldControls(field);
                    }, 1000);
                    
                    loadHistoryCallback();
                    
                    // Maintain focus on the field
                    if (input) {
                        input.focus();
                        // Check if it's a dynamic field by looking for data-dynamic attribute
                        const isDynamic = input.dataset.dynamic === 'true';
                        if (!isDynamic) {
                            input.dataset.editing = 'false';
                            input.readOnly = true;
                        }
                    }
                } else {
                    showButtonStatus(button, result.error || 'Failed to apply to folder', 'error');
                }
            } catch (err) {
                console.error(`Error applying ${fieldLabel} to folder:`, err);
                showButtonStatus(button, 'Error applying to folder', 'error');
            }
            
            button.disabled = false;
            setFormEnabled(true);
        },
        
        /**
         * Check if a field is one of the 9 standard fields
         * @param {string} fieldId - Field ID to check
         * @returns {boolean} True if standard field
         */
        isStandardField(fieldId) {
            return standardFields.includes(fieldId.toLowerCase());
        },
        
        /**
         * Render all metadata fields (standard and dynamic)
         * @param {Object} metadata - Metadata object with all_fields property
         */
        renderStandardFields(metadata) {
            const container = document.getElementById('standard-fields-container');
            if (!container) {
                return;
            }
            
            // Clear existing standard fields
            container.innerHTML = '';
            
            // Define standard fields order and display names
            const standardFieldsInfo = {
                'title': { display: 'Title', placeholder: 'Enter title' },
                'artist': { display: 'Artist', placeholder: 'Enter artist' },
                'album': { display: 'Album', placeholder: 'Enter album' },
                'albumartist': { display: 'Album Artist', placeholder: 'Enter album artist' },
                'composer': { display: 'Composer', placeholder: 'Enter composer' },
                'genre': { display: 'Genre', placeholder: 'Enter genre' },
                'track': { display: 'Track #', placeholder: 'Enter track number', group: 'numbers' },
                'disc': { display: 'Disc #', placeholder: 'Enter CD number', group: 'numbers' },
                'date': { display: 'Year', placeholder: 'Enter year', group: 'numbers' }
            };
            
            // Get existing standard fields from the metadata
            const existingFields = metadata.existing_standard_fields || {};
            
            // Also check standard_fields for backward compatibility
            const standardFields = metadata.standard_fields || {};
            
            // Group fields for special rendering
            const numberFields = [];
            const regularFields = [];
            
            // Render fields in the defined order, but only if they exist
            Object.entries(standardFieldsInfo).forEach(([field, info]) => {
                // Check if field exists (either has a value or is in existing_standard_fields)
                const hasValue = existingFields.hasOwnProperty(field) || 
                               (standardFields[field] !== undefined && standardFields[field] !== '');
                
                
                if (hasValue || this.shouldAlwaysShowField(field)) {
                    if (info.group === 'numbers') {
                        numberFields.push({ field, info, value: standardFields[field] || existingFields[field] || '' });
                    } else {
                        regularFields.push({ field, info, value: standardFields[field] || existingFields[field] || '' });
                    }
                }
            });
            
            
            // Render regular fields
            regularFields.forEach(({ field, info, value }) => {
                this.renderStandardField(container, field, info, value);
            });
            
            // Render grouped number fields if any exist
            if (numberFields.length > 0) {
                this.renderGroupedFields(container, numberFields);
            }
        },
        
        shouldAlwaysShowField(field) {
            // Optionally always show certain fields even if empty
            // For now, we'll only show fields that actually exist
            return false;
        },
        
        renderStandardField(container, field, info, value) {
            const fieldHtml = `
                <div class="form-group-with-button standard-field">
                    <div class="form-group-wrapper">
                        <div class="label-with-delete">
                            <label for="${field}">${info.display}</label>
                            <button type="button" class="delete-field-btn" 
                                    onclick="window.MetadataRemote.Metadata.Editor.deleteField('${field}')" 
                                    title="Delete ${field} metadata">
                                <span>⊖</span>
                            </button>
                        </div>
                        <div class="input-wrapper">
                            <input type="text" id="${field}" placeholder="${info.placeholder}" 
                                   data-field="${field}" value="${escapeHtml(value || '')}" readonly data-editing="false">
                            <div class="inference-loading" id="${field}-loading">
                                <div class="inference-spinner"></div>
                            </div>
                            <div class="inference-suggestions" id="${field}-suggestions"></div>
                        </div>
                    </div>
                    <div class="apply-field-controls" data-field="${field}">
                        <span class="apply-field-label">Apply to</span>
                        <button type="button" class="apply-field-btn apply-file-btn btn-status" 
                                data-field="${field}" onclick="saveFieldToFile('${field}')">
                            <span class="btn-status-content">File</span>
                            <span class="btn-status-message"></span>
                        </button>
                        <button type="button" class="apply-field-btn apply-folder-btn-new btn-status" 
                                data-field="${field}" onclick="applyFieldToFolder('${field}')">
                            <span class="btn-status-content">Folder</span>
                            <span class="btn-status-message"></span>
                        </button>
                    </div>
                </div>
            `;
            
            container.insertAdjacentHTML('beforeend', fieldHtml);
            
            // Attach event listeners
            const input = document.getElementById(field);
            if (input) {
                this.attachFieldEventListeners(input, field);
                // Also attach inference handlers
                if (window.MetadataRemote.Metadata.Inference) {
                    window.MetadataRemote.Metadata.Inference.attachInferenceHandlers(field);
                }
            }
        },
        
        renderGroupedFields(container, fields) {
            // Create the three-column layout for track, disc, date
            const groupHtml = `<div class="form-group-three-column">`;
            
            let groupContent = groupHtml;
            fields.forEach(({ field, info, value }) => {
                groupContent += `
                    <div class="form-group-wrapper">
                        <div class="label-with-delete">
                            <label for="${field}">${info.display}</label>
                            <button type="button" class="delete-field-btn" 
                                    onclick="window.MetadataRemote.Metadata.Editor.deleteField('${field}')" 
                                    title="Delete ${field} metadata">
                                <span>⊖</span>
                            </button>
                        </div>
                        <div class="input-wrapper">
                            <input type="text" id="${field}" placeholder="${info.placeholder}" 
                                   data-field="${field}" value="${escapeHtml(value || '')}" readonly data-editing="false">
                            <div class="inference-loading" id="${field}-loading">
                                <div class="inference-spinner"></div>
                            </div>
                            <div class="inference-suggestions" id="${field}-suggestions"></div>
                        </div>
                    </div>
                `;
            });
            groupContent += `</div>`;
            
            container.insertAdjacentHTML('beforeend', groupContent);
            
            // Attach event listeners for grouped fields
            fields.forEach(({ field }) => {
                const input = document.getElementById(field);
                if (input) {
                    this.attachFieldEventListeners(input, field);
                    // Also attach inference handlers
                    if (window.MetadataRemote.Metadata.Inference) {
                        window.MetadataRemote.Metadata.Inference.attachInferenceHandlers(field);
                    }
                }
            });
            
            // Update the grouped apply controls
            this.updateGroupedApplyControls(fields);
        },
        
        updateGroupedApplyControls(fields) {
            const groupedControls = document.getElementById('grouped-apply-controls');
            const itemsContainer = document.getElementById('grouped-apply-items');
            
            if (!groupedControls || !itemsContainer) return;
            
            // Clear existing items
            itemsContainer.innerHTML = '';
            
            // Add controls for each field
            fields.forEach(({ field, info }) => {
                const itemHtml = `
                    <div class="grouped-apply-item" data-field="${field}" style="display: none;">
                        <span class="field-change-indicator">${info.display}</span>
                        <div class="apply-field-controls" data-field="${field}">
                            <button type="button" class="apply-field-btn apply-file-btn btn-status" 
                                    data-field="${field}" onclick="saveFieldToFile('${field}')">
                                <span class="btn-status-content">File</span>
                                <span class="btn-status-message"></span>
                            </button>
                            <button type="button" class="apply-field-btn apply-folder-btn-new btn-status" 
                                    data-field="${field}" onclick="applyFieldToFolder('${field}')">
                                <span class="btn-status-content">Folder</span>
                                <span class="btn-status-message"></span>
                            </button>
                        </div>
                    </div>
                `;
                itemsContainer.insertAdjacentHTML('beforeend', itemHtml);
            });
        },
        
        renderMetadataFields(metadata) {
            
            // First render standard fields that exist
            this.renderStandardFields(metadata);
            
            const dynamicFieldsContainer = document.getElementById('dynamic-fields-container');
            
            // Clear existing dynamic fields
            if (dynamicFieldsContainer) {
                dynamicFieldsContainer.innerHTML = '';
            }
            
            // Clear dynamic fields tracking
            dynamicFields.clear();
            
            // Render all discovered fields
            if (metadata.all_fields) {
                Object.entries(metadata.all_fields).forEach(([fieldId, fieldInfo]) => {
                    // Validate field ID before rendering (defensive check)
                    if (!fieldId || fieldId.length > 50) {
                        return;
                    }
                    
                    // Skip if null bytes present (indicates corruption)
                    if (fieldId.includes('\x00')) {
                        return;
                    }
                    
                    // Skip standard fields (they're already rendered)
                    if (!this.isStandardField(fieldId)) {
                        this.renderDynamicField(fieldId, fieldInfo, dynamicFieldsContainer);
                        dynamicFields.set(fieldId, fieldInfo);
                    }
                });
            }
            
            // No longer need to render the new field creator since it's in the template
            
            // Show extended fields toggle if there are any extended fields
            const hasExtendedFields = dynamicFields.size > 0;
            const extendedToggle = document.querySelector('.extended-fields-toggle');
            if (extendedToggle) {
                extendedToggle.style.display = hasExtendedFields ? 'flex' : 'none';
            }
            
            // Update keyboard navigation
            this.updateNavigableElements();
        },
        
        /**
         * Render a single dynamic field
         * @param {string} fieldId - Field ID
         * @param {Object} fieldInfo - Field information
         * @param {HTMLElement} container - Container element
         */
        renderDynamicField(fieldId, fieldInfo, container) {
            // Create a unique safe ID for use in HTML id attributes
            const safeId = 'field_' + Math.random().toString(36).substr(2, 9);
            const fieldHtml = `
                <div class="form-group-with-button dynamic-field" data-field-id="${escapeHtml(fieldId)}" data-safe-id="${safeId}">
                    <div class="form-group-wrapper">
                        <div class="label-with-delete">
                            <label for="dynamic-${safeId}">${escapeHtml(fieldInfo.display_name)}</label>
                            <button type="button" class="delete-field-btn" 
                                    data-field-id="${escapeHtml(fieldId)}"
                                    onclick="window.MetadataRemote.Metadata.Editor.deleteField(this.getAttribute('data-field-id'))" 
                                    title="Delete this metadata field">
                                <span>⊖</span>
                            </button>
                        </div>
                        <div class="input-wrapper">
                            <input type="text" 
                                   id="dynamic-${safeId}" 
                                   placeholder="${fieldInfo.is_editable ? escapeHtml(`Enter ${fieldInfo.display_name}`) : ''}"
                                   data-field="${escapeHtml(fieldId)}"
                                   data-dynamic="true"
                                   data-editing="false"
                                   value="${escapeHtml(fieldInfo.value || '')}"
                                   ${!fieldInfo.is_editable ? 'readonly' : ''}
                                   ${fieldInfo.field_type === 'oversized' || fieldInfo.field_type === 'binary' ? 'disabled' : ''}>
                            <div class="inference-loading" id="dynamic-${safeId}-loading">
                                <div class="inference-spinner"></div>
                            </div>
                            <div class="inference-suggestions" id="dynamic-${safeId}-suggestions"></div>
                        </div>
                    </div>
                    ${fieldInfo.is_editable ? `
                        <div class="apply-field-controls" data-field="${escapeHtml(fieldId)}">
                            <span class="apply-field-label">Apply to</span>
                            <button type="button" class="apply-field-btn apply-file-btn btn-status" 
                                    data-field="${escapeHtml(fieldId)}" 
                                    onclick="saveFieldToFile(this.getAttribute('data-field'))">
                                <span class="btn-status-content">File</span>
                                <span class="btn-status-message"></span>
                            </button>
                            <button type="button" class="apply-field-btn apply-folder-btn-new btn-status" 
                                    data-field="${escapeHtml(fieldId)}" 
                                    onclick="applyFieldToFolder(this.getAttribute('data-field'))">
                                <span class="btn-status-content">Folder</span>
                                <span class="btn-status-message"></span>
                            </button>
                        </div>
                    ` : ''}
                </div>
            `;
            
            container.insertAdjacentHTML('beforeend', fieldHtml);
            
            // Handle oversized/binary content display
            if (fieldInfo.field_type === 'oversized' || fieldInfo.field_type === 'binary') {
                const input = document.getElementById(`dynamic-${safeId}`);
                if (input) {
                    input.value = 'Unsupported Content type';
                    input.style.color = '#999';
                    input.style.fontStyle = 'italic';
                }
            }
            
            // Attach event listeners
            const input = document.getElementById(`dynamic-${safeId}`);
            if (input && fieldInfo.is_editable && fieldInfo.field_type !== 'oversized' && fieldInfo.field_type !== 'binary') {
                this.attachFieldEventListeners(input, fieldId);
            }
        },
        
        // renderNewFieldCreator is no longer needed since the HTML is in the template
        
        /**
         * Attach event listeners to a dynamic field
         * @param {HTMLElement} input - Input element
         * @param {string} fieldId - Field ID
         */
        attachFieldEventListeners(input, fieldId) {
            
            const groupedFields = ['track', 'disc', 'date'];
            
            const updateControlsVisibility = () => {
                const originalValue = State.originalMetadata[fieldId] || '';
                const hasChanged = input.value !== originalValue;
                
                if (groupedFields.includes(fieldId)) {
                    // Handle grouped fields (track, disc, date)
                    const groupedControls = document.getElementById('grouped-apply-controls');
                    const fieldItem = document.querySelector(`.grouped-apply-item[data-field="${fieldId}"]`);
                    
                    if (fieldItem) {
                        if (hasChanged) {
                            fieldItem.classList.add('visible');
                            fieldItem.style.display = 'flex';
                        } else {
                            fieldItem.classList.remove('visible');
                            fieldItem.style.display = 'none';
                        }
                    }
                    
                    // Show/hide the entire grouped controls container
                    if (groupedControls) {
                        const anyGroupedFieldChanged = groupedFields.some(f => {
                            const inp = document.getElementById(f);
                            return inp && inp.value !== (State.originalMetadata[f] || '');
                        });
                        
                        if (anyGroupedFieldChanged) {
                            groupedControls.style.display = 'block';
                            groupedControls.classList.add('visible');
                        } else {
                            groupedControls.style.display = 'none';
                            groupedControls.classList.remove('visible');
                        }
                    }
                } else {
                    // Handle regular fields
                    const controls = document.querySelector(`.apply-field-controls[data-field="${fieldId}"]`);
                    if (controls) {
                        if (hasChanged) {
                            controls.classList.add('visible');
                        } else {
                            controls.classList.remove('visible');
                        }
                    }
                }
            };
            
            input.addEventListener('input', updateControlsVisibility);
            input.addEventListener('focus', updateControlsVisibility);
            
        },
        
        /**
         * Update navigable elements for keyboard navigation
         */
        updateNavigableElements() {
            // Update the keyboard navigation system with new dynamic fields
            const dynamicFieldIds = Array.from(dynamicFields.keys()).map(id => `dynamic-${id}`);
            if (window.MetadataRemote.Navigation && window.MetadataRemote.Navigation.Keyboard) {
                window.MetadataRemote.Navigation.Keyboard.updateDynamicFields(dynamicFieldIds);
            }
        },
        
        /**
         * Toggle the new field form
         */
        toggleNewFieldForm() {
            const form = document.getElementById('new-field-form');
            const header = document.querySelector('.new-field-header');
            const icon = document.querySelector('.new-field-header .expand-icon');
            
            if (form.style.display === 'none') {
                form.style.display = 'block';
                icon.textContent = '▼';
                header.setAttribute('aria-expanded', 'true');
                header.classList.add('expanded');
                document.getElementById('new-field-name').focus();
            } else {
                form.style.display = 'none';
                icon.textContent = '▶';
                header.setAttribute('aria-expanded', 'false');
                header.classList.remove('expanded');
            }
        },
        
        /**
         * Toggle extended fields visibility
         */
        toggleExtendedFields() {
            const wrapper = document.getElementById('extended-fields-wrapper');
            const toggle = document.querySelector('.extended-fields-toggle');
            const icon = toggle.querySelector('.expand-icon');
            
            if (wrapper.style.display === 'none') {
                wrapper.style.display = 'block';
                toggle.classList.add('expanded');
                toggle.setAttribute('aria-expanded', 'true');
                icon.textContent = '▼';
            } else {
                wrapper.style.display = 'none';
                toggle.classList.remove('expanded');
                toggle.setAttribute('aria-expanded', 'false');
                icon.textContent = '▶';
            }
        },
        
        /**
         * Validate custom field name with format awareness
         * @param {string} fieldName - The field name to validate
         * @returns {Object} Validation result with valid, error, warning, and suggestion
         */
        validateCustomFieldName(fieldName) {
            // Get current file format from State
            const currentFormat = State.metadata?.format || 'unknown';
            
            // Basic validation
            if (!fieldName) {
                return { valid: false, error: 'Field name is required' };
            }
            
            // Check for forbidden characters based on format
            if (fieldName.includes('=') || fieldName.includes('~')) {
                return { valid: false, error: 'Field names cannot contain = or ~ characters' };
            }
            
            // Check if field name has spaces
            const hasSpaces = fieldName.includes(' ');
            
            if (hasSpaces) {
                // Formats that handle spaces well (based on the report)
                const spaceFriendlyFormats = ['flac', 'ogg'];  // 'ogg' covers both Vorbis and Opus
                const isSpaceFriendly = spaceFriendlyFormats.includes(currentFormat);
                
                // Create underscore version as suggestion
                const suggestion = fieldName.replace(/\s+/g, '_');
                
                if (isSpaceFriendly) {
                    // FLAC/OGG handle spaces well, but still warn about compatibility
                    return {
                        valid: true,
                        warning: `Field names with spaces may have limited compatibility with some players. Consider using "${suggestion}" for better compatibility.`,
                        suggestion: suggestion
                    };
                } else {
                    // Other formats have more issues with spaces
                    return {
                        valid: true,
                        warning: `Field names with spaces have compatibility issues in ${currentFormat.toUpperCase()} format. Strongly recommend using "${suggestion}" instead.`,
                        suggestion: suggestion
                    };
                }
            }
            
            // If no spaces, validate alphanumeric + underscore (existing behavior)
            if (!/^[A-Za-z0-9_]+$/.test(fieldName)) {
                return { 
                    valid: false, 
                    error: 'Field names must contain only letters, numbers, underscores, or spaces' 
                };
            }
            
            // All good
            return { valid: true };
        },
        
        /**
         * Create a new metadata field
         * @param {boolean} applyToFolder - Whether to apply to entire folder
         */
        async createNewField(applyToFolder) {
            const fieldNameInput = document.getElementById('new-field-name').value.trim();
            const fieldValue = document.getElementById('new-field-value').value.trim();
            
            
            if (!fieldNameInput) {
                UIUtils.showStatus('Field name is required', 'error');
                return;
            }
            
            // Validate field name length
            if (fieldNameInput.length > 50) {
                UIUtils.showStatus('Field name must be 50 characters or less', 'error');
                return;
            }
            
            // Check for null bytes
            if (fieldNameInput.includes('\x00')) {
                UIUtils.showStatus('Field name contains invalid characters', 'error');
                return;
            }
            
            // Check if this is a standard field by normalizing the input
            const normalizedInput = fieldNameInput.toLowerCase();
            const standardFieldId = fieldNameNormalizations[normalizedInput];
            
            let fieldName;
            if (standardFieldId) {
                // This is a standard field - use the normalized ID
                fieldName = standardFieldId;
            } else {
                // This is a custom field - validate the name with format awareness
                const validation = this.validateCustomFieldName(fieldNameInput);
                
                if (!validation.valid) {
                    UIUtils.showStatus(validation.error, 'error');
                    return;
                }
                
                // Show warning if field has spaces but allow creation
                if (validation.warning) {
                    // Show warning but don't block
                    UIUtils.showStatus(validation.warning, 'warning');
                    
                    // If user wants the compatible version, suggest it
                    if (validation.suggestion && validation.suggestion !== fieldNameInput) {
                    }
                }
                
                fieldName = fieldNameInput;
            }
            
            // Check if field already exists
            if (standardFieldId) {
                // For standard fields, check if they're actually present in the current file
                const fieldElement = document.getElementById(fieldName);
                if (fieldElement) {
                    UIUtils.showStatus('Field already exists', 'error');
                    return;
                }
            } else if (dynamicFields.has(fieldName.toUpperCase())) {
                UIUtils.showStatus('Field already exists', 'error');
                return;
            }
            
            try {
                const data = {};
                data[fieldName] = fieldValue;
                
                
                if (applyToFolder) {
                    const folderPath = State.currentFile.substring(0, State.currentFile.lastIndexOf('/'));
                    const result = await API.applyFieldToFolder(folderPath, fieldName, fieldValue);
                    
                    if (result.status === 'success') {
                        UIUtils.showStatus(`Created field in ${result.filesUpdated} files`, 'success');
                        this.cancelNewField();
                        // Reload current file to show new field
                        if (window.MetadataRemote.Files && window.MetadataRemote.Files.Manager) {
                            window.MetadataRemote.Files.Manager.loadFile(State.currentFile, State.selectedListItem);
                        }
                    } else {
                        UIUtils.showStatus(result.error || 'Failed to create field', 'error');
                    }
                } else {
                    const result = await API.setMetadata(State.currentFile, data);
                    
                    if (result.status === 'success') {
                        UIUtils.showStatus('Field created successfully', 'success');
                        this.cancelNewField();
                        // Reload current file to show new field
                        if (window.MetadataRemote.Files && window.MetadataRemote.Files.Manager) {
                            window.MetadataRemote.Files.Manager.loadFile(State.currentFile, State.selectedListItem);
                        }
                    } else {
                        UIUtils.showStatus('Failed to create field', 'error');
                    }
                }
            } catch (err) {
                console.error('Error creating field:', err);
                UIUtils.showStatus('Error creating field', 'error');
            }
        },
        
        /**
         * Cancel new field creation
         */
        cancelNewField() {
            document.getElementById('new-field-name').value = '';
            document.getElementById('new-field-value').value = '';
            this.toggleNewFieldForm();
        },
        
        /**
         * Delete a metadata field
         * @param {string} fieldId - Field ID to delete
         */
        async deleteField(fieldId) {
            // Try to find the field element - check for dynamic fields first
            let fieldElement = document.querySelector(`.dynamic-field[data-field-id="${fieldId}"]`);
            
            // If not found, look for standard fields by checking for the delete button with the field ID
            if (!fieldElement) {
                // Find the delete button that calls deleteField with this fieldId
                const deleteBtn = document.querySelector(`button[onclick*="deleteField('${fieldId}')"]`);
                if (deleteBtn) {
                    // Navigate up to find the parent field container
                    fieldElement = deleteBtn.closest('.form-group-with-button, .form-group-wrapper');
                }
            }
            
            if (!fieldElement) {
                return;
            }
            
            const deleteBtn = fieldElement.querySelector('.delete-field-btn');
            if (!deleteBtn) {
                return;
            }
            
            // Show inline confirmation
            this.showDeleteConfirmation(fieldId, deleteBtn);
        },
        
        /**
         * Show inline confirmation UI for delete
         * @param {string} fieldId - Field ID to delete
         * @param {HTMLElement} deleteBtn - Delete button element
         */
        showDeleteConfirmation(fieldId, deleteBtn) {
            // Hide the delete button
            deleteBtn.style.display = 'none';
            
            // Create confirmation UI
            const confirmUI = document.createElement('div');
            confirmUI.className = 'delete-confirmation';
            confirmUI.innerHTML = `
                <span class="confirm-text">Delete this field?</span>
                <button type="button" class="confirm-yes" onclick="window.MetadataRemote.Metadata.Editor.confirmDelete('${fieldId}')">Yes</button>
                <button type="button" class="confirm-no" onclick="window.MetadataRemote.Metadata.Editor.cancelDelete('${fieldId}')">No</button>
            `;
            
            // Insert confirmation UI after the delete button
            deleteBtn.parentElement.appendChild(confirmUI);
            
            // Add keyboard event handler for Escape key
            const handleEscape = (e) => {
                if (e.key === 'Escape') {
                    e.preventDefault();
                    this.cancelDelete(fieldId);
                    document.removeEventListener('keydown', handleEscape);
                }
            };
            document.addEventListener('keydown', handleEscape);
            
            // Store the handler reference for cleanup
            confirmUI.dataset.escapeHandler = 'true';
            
            // Focus on the No button for safety
            confirmUI.querySelector('.confirm-no').focus();
        },
        
        /**
         * Confirm field deletion
         * @param {string} fieldId - Field ID to delete
         */
        async confirmDelete(fieldId) {
            
            // Get field display name for success message
            let displayName = fieldId;
            
            // Check if it's a dynamic field
            const fieldInfo = dynamicFields.get(fieldId);
            if (fieldInfo) {
                displayName = fieldInfo.display_name;
            }
            
            try {
                // Call API to delete the field
                const result = await API.deleteMetadataField(State.currentFile, fieldId);
                
                if (result.status === 'success') {
                    UIUtils.showStatus(`Field "${displayName}" deleted successfully`, 'success');
                    
                    // Reload current file to refresh metadata display
                    if (window.MetadataRemote.Files && window.MetadataRemote.Files.Manager) {
                        window.MetadataRemote.Files.Manager.loadFile(State.currentFile, State.selectedListItem);
                    }
                    
                    // Refresh history to show the delete action
                    if (loadHistoryCallback) {
                        loadHistoryCallback();
                    }
                } else {
                    UIUtils.showStatus(result.error || 'Failed to delete field', 'error');
                    this.cancelDelete(fieldId);
                }
            } catch (err) {
                console.error('Error deleting field:', err);
                UIUtils.showStatus('Error deleting field', 'error');
                this.cancelDelete(fieldId);
            }
        },
        
        /**
         * Cancel field deletion
         * @param {string} fieldId - Field ID
         */
        cancelDelete(fieldId) {
            // Try to find the field element - check for dynamic fields first
            let fieldElement = document.querySelector(`.dynamic-field[data-field-id="${fieldId}"]`);
            
            // If not found, look for standard fields by checking for the delete button with the field ID
            if (!fieldElement) {
                // Find the delete button that calls deleteField with this fieldId
                const deleteBtn = document.querySelector(`button[onclick*="deleteField('${fieldId}')"]`);
                if (deleteBtn) {
                    // Navigate up to find the parent field container
                    fieldElement = deleteBtn.closest('.form-group-with-button, .form-group-wrapper');
                }
            }
            
            if (!fieldElement) {
                return;
            }
            
            const confirmUI = fieldElement.querySelector('.delete-confirmation');
            const deleteBtn = fieldElement.querySelector('.delete-field-btn');
            
            if (confirmUI) {
                confirmUI.remove();
            }
            
            if (deleteBtn) {
                deleteBtn.style.display = '';
            }
        }
    };
})();
