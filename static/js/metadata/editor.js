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
    
    // Import TransitionController (will be defined later)
    let TransitionController = null;
    
    // Dynamic fields tracking
    let dynamicFields = new Map();
    const standardFields = ['title', 'artist', 'album', 'albumartist', 'date', 'genre', 'composer', 'track', 'disc'];
    
    // Standard fields info for other modules to access
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
        // Expose dynamic fields map
        dynamicFields: dynamicFields,
        
        // Expose standard fields info
        standardFieldsInfo: standardFieldsInfo,
        
        // Check if a field is standard
        isStandardField(fieldId) {
            return standardFields.includes(fieldId);
        },
        
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
        
        // Clean up transition monitoring when fields are removed
        cleanupFieldMonitoring(fieldId) {
            if (TransitionController) {
                TransitionController.stopMonitoring(fieldId);
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
                    return inp && inp.value !== (State.originalMetadata[f] || '');
                });
                
                // Hide entire grouped controls if no fields are changed
                if (!anyGroupedFieldChanged) {
                    const groupedControls = document.getElementById('grouped-apply-controls');
                    if (groupedControls) {
                        groupedControls.classList.remove('visible');
                        groupedControls.style.display = 'none';
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
            // Empty function for compatibility
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
                    // Treat single space as empty to ensure consistency
                    data[field] = input.value === ' ' ? '' : input.value;
                }
            });
            
            // Collect dynamic fields
            dynamicFields.forEach((fieldInfo, fieldId) => {
                if (fieldInfo.is_editable) {
                    // Try to find the input element
                    const element = document.getElementById(`dynamic-${fieldId}`) || 
                                   document.querySelector(`#dynamic-field_${fieldId}`) ||
                                   document.querySelector(`[data-field="${fieldId}"]`);
                    
                    if (element) {
                        if (element.tagName === 'INPUT' && !element.disabled) {
                            // It's an input field - get the current value
                            data[fieldId] = element.value === ' ' ? '' : element.value;
                        } else if (element.tagName === 'BUTTON') {
                            // It's an oversized field button - get the value from fieldInfo
                            data[fieldId] = fieldInfo.value === ' ' ? '' : fieldInfo.value;
                        }
                    } else {
                        // Element not found, but we have the value in fieldInfo
                        data[fieldId] = fieldInfo.value === ' ' ? '' : fieldInfo.value;
                    }
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
            showButtonStatus(button, '', 'processing');
            
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
                
                // Restore dynamic fields to originalMetadata
                if (data.all_fields) {
                    const standardFields = ['title', 'artist', 'album', 'albumartist', 'date', 'genre', 'composer', 'track', 'disc'];
                    Object.entries(data.all_fields).forEach(([fieldId, fieldInfo]) => {
                        if (fieldInfo.value !== undefined && fieldInfo.value !== null) {
                            // Only store non-standard fields to avoid overwriting standard field values
                            if (!standardFields.includes(fieldId)) {
                                State.originalMetadata[fieldId] = fieldInfo.value;
                            }
                        }
                    });
                }
                
                // Render fields with updated metadata
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
                    const albumArtSrc = `data:image/jpeg;base64,${data.art}`;
                    const AlbumArt = window.MetadataRemote.Metadata.AlbumArt;
                    if (AlbumArt && AlbumArt.displayAlbumArtWithMetadata) {
                        AlbumArt.displayAlbumArtWithMetadata(albumArtSrc, artDisplay);
                    } else {
                        artDisplay.innerHTML = `<img src="${albumArtSrc}" class="album-art">`;
                    }
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
                
                showButtonStatus(button, '', 'success', 2000);
                
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
                showButtonStatus(button, '', 'error');
            }
        },
        
        /**
         * Save individual field to file
         * @param {string} field - Field name to save
         * @param {Function} showButtonStatus - Callback to show button status
         */
        async saveFieldToFile(field, showButtonStatus) {
            if (!State.currentFile) {
                return;
            }
            
            const button = document.querySelector(`.apply-file-btn[data-field="${field}"]`);
            
            // Find input by data-field attribute (works for both standard and dynamic fields)
            const input = document.querySelector(`input[data-field="${field}"]`);
            
            if (!input) {
                return;
            }
            
            const value = input.value.trim();
            
            if (!value && value !== '') {
                return; // Allow empty string to clear field
            }
            
            button.disabled = true;
            showButtonStatus(button, 'Saving to file...', 'processing');
            
            // Create metadata object with only this field
            const data = {};
            // Treat single space as empty to ensure consistency
            data[field] = value === ' ' ? '' : value;
            
            try {
                const result = await API.setMetadata(State.currentFile, data);
                
                if (result.status === 'success') {
                    showButtonStatus(button, 'Saved to file!', 'success', 2000);
                    State.originalMetadata[field] = value;
                    
                    // Update dynamic fields map
                    if (dynamicFields.has(field)) {
                        const fieldInfo = dynamicFields.get(field);
                        fieldInfo.value = value;
                        dynamicFields.set(field, fieldInfo);
                    }
                    
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
            
            button.disabled = true;
            setFormEnabled(false);
            showButtonStatus(button, 'Applying to folder...', 'processing');
            
            try {
                // Send normalized value (single space becomes empty)
                const normalizedValue = value === ' ' ? '' : value;
                const result = await API.applyFieldToFolder(folderPath, field, normalizedValue);
                
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
            
            // Get existing standard fields from the metadata
            const existingFields = metadata.existing_standard_fields || {};
            
            // Check standard_fields property
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
                    const fieldValue = standardFields[field] || existingFields[field] || '';
                    
                    if (info.group === 'numbers') {
                        numberFields.push({ field, info, value: fieldValue });
                    } else {
                        regularFields.push({ field, info, value: fieldValue });
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
            // Only show fields that actually exist
            return false;
        },
        
        renderStandardField(container, field, info, value) {
            const isOversized = value && value.length >= 100;
            
            // Create the field element (input or button based on size)
            let fieldElement;
            if (isOversized) {
                fieldElement = `<button type="button" id="${field}" class="oversized-field-button" 
                                       data-field="${field}" data-value="${escapeHtml(value || '')}">Click to view/edit</button>`;
            } else {
                fieldElement = `<input type="text" id="${field}" placeholder="${info.placeholder}" 
                                      data-field="${field}" value="${escapeHtml(value || '')}" readonly data-editing="false">`;
            }
            
            const fieldHtml = `
                <div class="form-group-with-button standard-field">
                    <div class="form-group-wrapper">
                        <div class="label-with-delete">
                            <label for="${field}">${info.display}</label>
                            <button type="button" class="delete-field-btn" 
                                    onclick="window.MetadataRemote.Metadata.Editor.deleteField('${field.replace(/'/g, "\\'").replace(/"/g, "&quot;")}')" 
                                    title="Delete ${escapeHtml(field)} metadata">
                                <span>⊖</span>
                            </button>
                        </div>
                        <div class="input-wrapper">
                            ${fieldElement}
                            <div class="inference-loading" id="${field}-loading">
                                <div class="inference-spinner"></div>
                            </div>
                            <div class="inference-suggestions" id="${field}-suggestions"></div>
                        </div>
                    </div>
                    <div class="apply-field-controls" data-field="${field}">
                        <span class="apply-field-label">Apply to</span>
                        <button type="button" class="apply-field-btn apply-file-btn btn-status" 
                                data-field="${field}" onclick="saveFieldToFile('${field.replace(/'/g, "\\'")}')">
                            <span class="btn-status-content">File</span>
                            <span class="btn-status-message"></span>
                        </button>
                        <button type="button" class="apply-field-btn apply-folder-btn-new btn-status" 
                                data-field="${field}" onclick="window.MetadataRemote.Metadata.Editor.showFolderConfirmation('${field.replace(/'/g, "\\'")}');">
                            <span class="btn-status-content">Folder</span>
                            <span class="btn-status-message"></span>
                        </button>
                        <div class="folder-confirmation" data-field="${field}" style="display: none;">
                            <span class="confirm-text">Apply to folder?</span>
                            <button type="button" class="confirm-yes" 
                                    onclick="window.MetadataRemote.Metadata.Editor.confirmFolderApply('${field.replace(/'/g, "\\'")}');">Yes</button>
                            <button type="button" class="confirm-no" 
                                    onclick="window.MetadataRemote.Metadata.Editor.cancelFolderApply('${field.replace(/'/g, "\\'")}');">No</button>
                        </div>
                    </div>
                </div>
            `;
            
            container.insertAdjacentHTML('beforeend', fieldHtml);
            
            // Handle based on element type
            const element = document.getElementById(field);
            if (element) {
                if (isOversized) {
                    // Button - only needs click handler
                    element.addEventListener('click', (e) => {
                        e.preventDefault();
                        if (window.MetadataRemote.Metadata.FieldEditModal) {
                            const fieldInfo = {
                                field_name: field,
                                display_name: info.display,
                                value: value,
                                is_editable: true
                            };
                            window.MetadataRemote.Metadata.FieldEditModal.open(field, fieldInfo, element);
                        }
                    });
                } else {
                    // Input - needs event listeners and monitors
                    this.attachFieldEventListeners(element, field);
                    // Also attach inference handlers
                    if (window.MetadataRemote.Metadata.Inference) {
                        window.MetadataRemote.Metadata.Inference.attachInferenceHandlers(field);
                    }
                    // Monitor fields for transitions
                    if (!TransitionController && window.MetadataRemote.Metadata.TransitionController) {
                        TransitionController = window.MetadataRemote.Metadata.TransitionController;
                    }
                    if (TransitionController) {
                        TransitionController.monitorField(element);
                    }
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
            // Clean up TransitionController monitoring before rendering new fields
            if (window.MetadataRemote.Metadata.TransitionController) {
                window.MetadataRemote.Metadata.TransitionController.stopAllMonitoring();
            }
            
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
            
            // New field creator is handled in the template
            
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
            
            // Determine if this field should be rendered as oversized
            const isOversized = fieldInfo.value && fieldInfo.value.length >= 100;
            
            // Create the field element (input or button based on size)
            let fieldElement;
            if (isOversized) {
                fieldElement = `<button type="button" id="dynamic-${safeId}" class="oversized-field-button" 
                                       data-field="${escapeHtml(fieldId)}" data-value="${escapeHtml(fieldInfo.value || '')}">Click to view/edit</button>`;
            } else {
                fieldElement = `<input type="text" 
                                     id="dynamic-${safeId}" 
                                     placeholder="${fieldInfo.is_editable ? escapeHtml(`Enter ${fieldInfo.display_name}`) : ''}"
                                     data-field="${escapeHtml(fieldId)}"
                                     data-dynamic="true"
                                     data-editing="false"
                                     value="${escapeHtml(fieldInfo.value || '')}"
                                     ${!fieldInfo.is_editable ? 'readonly' : ''}
                                     ${fieldInfo.field_type === 'binary' ? 'disabled' : ''}>`;
            }
            
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
                            ${fieldElement}
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
                                    onclick="window.MetadataRemote.Metadata.Editor.showFolderConfirmation(this.getAttribute('data-field'));">
                                <span class="btn-status-content">Folder</span>
                                <span class="btn-status-message"></span>
                            </button>
                            <div class="folder-confirmation" data-field="${escapeHtml(fieldId)}" style="display: none;">
                                <span class="confirm-text">Apply to folder?</span>
                                <button type="button" class="confirm-yes" 
                                        onclick="window.MetadataRemote.Metadata.Editor.confirmFolderApply(this.parentElement.getAttribute('data-field'));">Yes</button>
                                <button type="button" class="confirm-no" 
                                        onclick="window.MetadataRemote.Metadata.Editor.cancelFolderApply(this.parentElement.getAttribute('data-field'));">No</button>
                            </div>
                        </div>
                    ` : ''}
                </div>
            `;
            
            container.insertAdjacentHTML('beforeend', fieldHtml);
            
            // Handle based on element type
            const element = document.getElementById(`dynamic-${safeId}`);
            if (element) {
                if (isOversized) {
                    // Button - only needs click handler
                    element.addEventListener('click', (e) => {
                        e.preventDefault();
                        if (window.MetadataRemote.Metadata.FieldEditModal) {
                            window.MetadataRemote.Metadata.FieldEditModal.open(fieldId, fieldInfo, element);
                        }
                    });
                } else {
                    // Input - handle based on field type
                    if (fieldInfo.field_type === 'binary') {
                        element.value = 'Unsupported Content type';
                        element.style.color = '#999';
                        element.style.fontStyle = 'italic';
                    } else if (fieldInfo.is_editable) {
                        // Attach event listeners for editable fields
                        this.attachFieldEventListeners(element, fieldId);
                        // Monitor for transitions
                        if (!TransitionController && window.MetadataRemote.Metadata.TransitionController) {
                            TransitionController = window.MetadataRemote.Metadata.TransitionController;
                        }
                        if (TransitionController) {
                            TransitionController.monitorField(element);
                        }
                    }
                }
            }
        },
        
        // renderNewFieldCreator handled in template
        
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
            
            // Add transition monitoring for all editable text fields
            if (!input.disabled && input.type === 'text') {
                if (!TransitionController && window.MetadataRemote.Metadata.TransitionController) {
                    TransitionController = window.MetadataRemote.Metadata.TransitionController;
                }
                if (TransitionController) {
                    TransitionController.monitorField(input);
                }
            }
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
                header.focus();
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
            
            // Validate alphanumeric + underscore + spaces
            if (!/^[A-Za-z0-9_ ]+$/.test(fieldName)) {
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
                if (fieldElement && fieldElement.closest('.form-group-with-button')?.style.display !== 'none') {
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
                        
                        // For folder creation, we still need to reload to show the field in current file
                        // This is acceptable as it's less frequent than deletion
                        this.cancelNewField();
                        
                        // Refresh history to show new field creation
                        if (loadHistoryCallback) {
                            loadHistoryCallback();
                        }
                        
                        // Reload current file to show new field
                        if (window.MetadataRemote.Files && window.MetadataRemote.Files.Manager) {
                            window.MetadataRemote.Files.Manager.loadFile(State.currentFile, State.selectedListItem);
                        }
                    } else {
                        UIUtils.showStatus(result.error || 'Failed to create field', 'error');
                    }
                } else {
                    const result = await API.createField(State.currentFile, fieldName, fieldValue);
                    
                    if (result.status === 'success') {
                        UIUtils.showStatus('Field created successfully', 'success');
                        
                        // Add the field to current metadata
                        State.originalMetadata[fieldName] = fieldValue;
                        
                        // For standard fields that were hidden, show them
                        if (standardFieldId) {
                            const fieldElement = document.getElementById(standardFieldId);
                            if (fieldElement) {
                                const fieldContainer = fieldElement.closest('.form-group-with-button');
                                if (fieldContainer && fieldContainer.style.display === 'none') {
                                    fieldContainer.style.display = '';
                                    fieldElement.disabled = false;
                                    fieldElement.value = fieldValue;
                                }
                            } else {
                                // Standard field doesn't exist in DOM yet, need to refresh metadata
                                // Clear and close the creation form first
                                this.cancelNewField();
                                
                                if (window.MetadataRemote.Files && window.MetadataRemote.Files.Manager) {
                                    await window.MetadataRemote.Files.Manager.loadFile(State.currentFile, State.selectedListItem);
                                }
                                
                                // Refresh history
                                if (loadHistoryCallback) {
                                    loadHistoryCallback();
                                }
                                
                                return;
                            }
                        } else {
                            // For dynamic fields, render the new field
                            const dynamicFieldsContainer = document.getElementById('dynamic-fields-container');
                            const fieldInfo = {
                                display_name: fieldName,
                                value: fieldValue,
                                is_editable: true,
                                field_type: 'text'
                            };
                            
                            this.renderDynamicField(fieldName, fieldInfo, dynamicFieldsContainer);
                            dynamicFields.set(fieldName, fieldInfo);
                            
                            // Show extended fields section if this is the first dynamic field
                            if (dynamicFields.size === 1) {
                                const extendedToggle = document.querySelector('.extended-fields-toggle');
                                if (extendedToggle) {
                                    extendedToggle.style.display = 'flex';
                                }
                            }
                            
                            // Attach event listeners to the new field
                            const newFieldInputs = dynamicFieldsContainer.querySelectorAll(`input[data-field="${fieldName}"]`);
                            newFieldInputs.forEach(input => {
                                if (input && !input.disabled) {
                                    this.attachFieldEventListeners(input, fieldName);
                                }
                            });
                        }
                        
                        // Update navigable elements
                        this.updateNavigableElements();
                        
                        // Clear and close the creation form
                        this.cancelNewField();
                        
                        // Focus the new field
                        let newFieldElement = null;
                        if (standardFieldId) {
                            newFieldElement = document.getElementById(standardFieldId);
                        } else {
                            newFieldElement = document.querySelector(`[data-field="${fieldName}"]`);
                        }
                        
                        if (newFieldElement) {
                            newFieldElement.focus();
                            if (newFieldElement.tagName === 'INPUT') {
                                newFieldElement.dataset.editing = 'true';
                                newFieldElement.readOnly = false;
                            }
                        }
                        
                        // Refresh history
                        if (loadHistoryCallback) {
                            loadHistoryCallback();
                        }
                    } else {
                        UIUtils.showStatus(result.error || 'Failed to create field', 'error');
                    }
                }
            } catch (err) {
                console.error('Error creating field:', err);
                // Extract the actual error message if available
                const errorMessage = err.message || 'Error creating field';
                UIUtils.showStatus(errorMessage, 'error');
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
            
            // Show inline confirmation with file/folder options directly
            this.confirmDelete(fieldId);
            
            setTimeout(() => {
                const confirmUI = document.querySelector('.delete-confirmation');
                if (confirmUI) {
                    this.setupConfirmationNavigation(confirmUI, fieldId);
                }
            }, 0);
            
        },
        
        /**
         * Trigger field deletion from keyboard shortcut
         * @param {string} fieldId - Field ID to delete
         */
        triggerFieldDeletion(fieldId) {
            // Exit edit mode if active
            // Try to find input by id first, then by data-field attribute
            let input = document.getElementById(fieldId);
            if (!input) {
                input = document.querySelector(`input[data-field="${fieldId}"]`);
            }
            
            if (input && input.dataset.editing === 'true') {
                input.dataset.editing = 'false';
                input.readOnly = true;
                // Also transition state machine back to normal if needed
                if (window.MetadataRemote.Navigation.StateMachine) {
                    window.MetadataRemote.Navigation.StateMachine.transition('normal');
                }
            }
            
            // Hide any active inference suggestions for this field
            if (hideInferenceSuggestionsCallback && input) {
                hideInferenceSuggestionsCallback(input.id);
            }
            
            // Show confirmation with focus management
            this.confirmDelete(fieldId);
            
            // Set up confirmation navigation after a brief delay to ensure DOM is ready
            setTimeout(() => {
                const confirmUI = document.querySelector('.delete-confirmation');
                if (confirmUI) {
                    this.setupConfirmationNavigation(confirmUI, fieldId);
                }
            }, 0);
        },
        
        /**
         * Set up keyboard navigation for delete confirmation UI
         * @param {Element} confirmUI - Confirmation UI element
         * @param {string} fieldId - Field being deleted
         */
        setupConfirmationNavigation(confirmUI, fieldId) {
            const handleNav = (e) => {
                const target = e.target;
                const isFileBtn = target.classList.contains('inline-choice-file');
                const isFolderBtn = target.classList.contains('inline-choice-folder');
                
                if (!isFileBtn && !isFolderBtn) return;
                
                switch(e.key) {
                    case 'ArrowLeft':
                        if (isFolderBtn) {
                            e.preventDefault();
                            const fileBtn = confirmUI.querySelector('.inline-choice-file');
                            if (fileBtn) fileBtn.focus();
                        }
                        break;
                        
                    case 'ArrowRight':
                        if (isFileBtn) {
                            e.preventDefault();
                            const folderBtn = confirmUI.querySelector('.inline-choice-folder');
                            if (folderBtn) folderBtn.focus();
                        }
                        break;
                        
                    case 'ArrowDown':
                    case 'Escape':
                        e.preventDefault();
                        this.cancelDelete(fieldId);
                        // Try to find field by id first, then by data-field attribute
                        let field = document.getElementById(fieldId);
                        if (!field) {
                            field = document.querySelector(`input[data-field="${fieldId}"]`);
                        }
                        if (field) field.focus();
                        break;
                        
                    case 'ArrowUp':
                        e.preventDefault();
                        // Navigate to previous field and cancel deletion
                        const prevField = this.findPreviousField(fieldId);
                        this.cancelDelete(fieldId);
                        if (prevField) {
                            prevField.focus();
                            // If it's an input field, ensure it's in non-edit mode
                            if (prevField.tagName === 'INPUT' && prevField.dataset.editing) {
                                prevField.dataset.editing = 'false';
                                prevField.readOnly = true;
                            }
                        }
                        break;
                }
            };
            
            confirmUI.addEventListener('keydown', handleNav);
            confirmUI.dataset.navHandler = 'true';
        },
        
        /**
         * Find the next navigable field after the given field
         * @param {string} fieldId - Current field ID
         * @returns {Element|null} Next field element
         */
        findNextField(fieldId) {
            const metadataSection = document.getElementById('metadata-section');
            if (!metadataSection) return null;
            
            // Get all visible, enabled text inputs
            const allFields = Array.from(metadataSection.querySelectorAll('input[type="text"]:not([disabled])')).filter(
                field => field.offsetParent !== null  // Check if visible
            );
            
            // Find current field by matching either id or data-field attribute
            const currentIndex = allFields.findIndex(f => 
                f.id === fieldId || f.dataset.field === fieldId
            );
            
            if (currentIndex >= 0 && currentIndex < allFields.length - 1) {
                return allFields[currentIndex + 1];
            }
            
            // If no next field, try to find new field creator header
            const newFieldHeader = document.querySelector('.new-field-header');
            if (newFieldHeader && newFieldHeader.offsetParent !== null) {
                return newFieldHeader;
            }
            
            return null;
        },
        
        /**
         * Find the previous navigable field before the given field
         * @param {string} fieldId - Current field ID
         * @returns {Element|null} Previous field element
         */
        findPreviousField(fieldId) {
            const metadataSection = document.getElementById('metadata-section');
            if (!metadataSection) return null;
            
            // Get all visible, enabled text inputs
            const allFields = Array.from(metadataSection.querySelectorAll('input[type="text"]:not([disabled])')).filter(
                field => field.offsetParent !== null  // Check if visible
            );
            
            // Find current field by matching either id or data-field attribute
            const currentIndex = allFields.findIndex(f => 
                f.id === fieldId || f.dataset.field === fieldId
            );
            
            if (currentIndex > 0) {
                return allFields[currentIndex - 1];
            }
            
            // If no previous metadata field, try filename field
            const filenameField = document.getElementById('current-filename');
            if (filenameField && filenameField.offsetParent !== null) {
                return filenameField;
            }
            
            return null;
        },
        
        /**
         * Confirm field deletion
         * @param {string} fieldId - Field ID to delete
         */
        async confirmDelete(fieldId) {
            // Cancel any existing delete confirmations
            const existingConfirm = document.querySelector('.delete-confirmation');
            if (existingConfirm) {
                // Find the field ID of the existing confirmation
                const existingBtn = document.querySelector('.delete-field-btn[style*="visibility: hidden"]');
                if (existingBtn) {
                    const existingFieldElement = existingBtn.closest('.dynamic-field[data-field-id]') || 
                                                existingBtn.closest('.form-group-with-button');
                    if (existingFieldElement) {
                        const existingFieldId = existingFieldElement.dataset.fieldId || 
                                              existingFieldElement.querySelector('input[data-field]')?.dataset.field;
                        if (existingFieldId) {
                            this.cancelDelete(existingFieldId);
                        }
                    }
                }
            }
            
            // Find the field element and delete button
            let fieldElement = document.querySelector(`.dynamic-field[data-field-id="${fieldId}"]`);
            
            if (!fieldElement) {
                const deleteBtn = document.querySelector(`button[onclick*="deleteField('${fieldId}')"]`);
                if (deleteBtn) {
                    fieldElement = deleteBtn.closest('.form-group-with-button, .form-group-wrapper');
                }
            }
            
            if (!fieldElement) return;
            
            const deleteBtn = fieldElement.querySelector('.delete-field-btn');
            if (!deleteBtn) return;
            
            // Make delete button invisible but keep its space
            deleteBtn.style.visibility = 'hidden';
            
            // Create confirmation UI
            const confirmUI = document.createElement('div');
            confirmUI.className = 'delete-confirmation';
            
            // Determine if this is a grouped field
            const isGroupedField = ['track', 'disc', 'date'].includes(fieldId);
            
            if (isGroupedField) {
                // GROUPED FIELDS: Insert after label-with-delete div (between label and input)
                const labelDiv = fieldElement.querySelector('.label-with-delete');
                if (labelDiv) {
                    labelDiv.insertAdjacentElement('afterend', confirmUI);
                    // Add class to parent container to push down all input fields
                    const threeColumnContainer = fieldElement.closest('.form-group-three-column');
                    if (threeColumnContainer) {
                        threeColumnContainer.classList.add('has-confirmation-ui');
                    }
                } else {
                    // Append to delete button's parent if structure is unexpected
                    deleteBtn.parentElement.appendChild(confirmUI);
                }
            } else {
                // REGULAR FIELDS: Keep existing behavior (append to delete button's parent)
                deleteBtn.parentElement.appendChild(confirmUI);
            }
            
            // Add keyboard event handler for Escape key
            const handleEscape = (e) => {
                if (e.key === 'Escape') {
                    e.preventDefault();
                    this.cancelDelete(fieldId);
                    document.removeEventListener('keydown', handleEscape);
                }
            };
            document.addEventListener('keydown', handleEscape);
            
            // Add click handler to cancel when clicking outside
            const handleOutsideClick = (e) => {
                // Check if click is outside the confirmation UI and its buttons
                if (!confirmUI.contains(e.target) && !deleteBtn.contains(e.target)) {
                    e.preventDefault();
                    e.stopPropagation();
                    this.cancelDelete(fieldId);
                    document.removeEventListener('click', handleOutsideClick);
                    document.removeEventListener('keydown', handleEscape);
                }
            };
            // Use bubble phase to avoid intercepting clicks on other elements
            setTimeout(() => {
                document.addEventListener('click', handleOutsideClick);
            }, 0);
            
            // Store the handler reference for cleanup
            confirmUI.dataset.escapeHandler = 'true';
            confirmUI.dataset.clickHandler = 'true';
            
            // Get field display name
            let fieldName = fieldId;
            const fieldInfo = dynamicFields.get(fieldId);
            if (fieldInfo) {
                fieldName = fieldInfo.display_name;
            } else if (standardFields.includes(fieldId)) {
                // Use proper display name for standard fields
                const fieldNames = {
                    'title': 'Title',
                    'artist': 'Artist',
                    'album': 'Album',
                    'albumartist': 'Album Artist',
                    'date': 'Year',
                    'genre': 'Genre',
                    'composer': 'Composer',
                    'track': 'Track #',
                    'disc': 'Disc #'
                };
                fieldName = fieldNames[fieldId] || fieldId;
            }
            
            // Truncate long field names
            const truncatedName = fieldName.length > 20 ? fieldName.substring(0, 20) + '...' : fieldName;
            
            // Determine confirmation text based on field type
            const confirmText = isGroupedField ? 'Delete from:' : 'Delete field from:';
            
            // Update confirmation UI to show file/folder options
            confirmUI.innerHTML = `
                <span class="confirm-text">${confirmText}</span>
                <button type="button" class="inline-choice-btn inline-choice-file" onclick="window.MetadataRemote.Metadata.Editor.deleteFromFile('${fieldId.replace(/'/g, "\\'").replace(/"/g, "&quot;")}')">file</button>
                <button type="button" class="inline-choice-btn inline-choice-folder" onclick="window.MetadataRemote.Metadata.Editor.confirmBatchDelete('${fieldId.replace(/'/g, "\\'").replace(/"/g, "&quot;")}')">folder</button>
            `;
            
            // Focus on safer option
            confirmUI.querySelector('.inline-choice-file').focus();
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
                deleteBtn.style.visibility = '';
            }
            
            // Remove class from parent container for grouped fields
            const isGroupedField = ['track', 'disc', 'date'].includes(fieldId);
            if (isGroupedField) {
                const threeColumnContainer = fieldElement.closest('.form-group-three-column');
                if (threeColumnContainer) {
                    threeColumnContainer.classList.remove('has-confirmation-ui');
                }
            }
        },

        /**
         * Delete field from current file only
         * @param {string} fieldId - Field ID to delete
         */
        async deleteFromFile(fieldId) {
            const confirmUI = document.querySelector('.delete-confirmation');
            const deleteBtn = document.querySelector(`button[onclick*="deleteField('${fieldId}')"]`) || 
                              document.querySelector(`.dynamic-field[data-field-id="${fieldId}"] .delete-field-btn`);
            
            if (confirmUI) {
                confirmUI.remove();
            }
            
            if (deleteBtn) {
                deleteBtn.style.visibility = '';
            }
            
            // Remove class from parent container for grouped fields
            const isGroupedField = ['track', 'disc', 'date'].includes(fieldId);
            if (isGroupedField) {
                const threeColumnContainer = document.querySelector('.form-group-three-column');
                if (threeColumnContainer) {
                    threeColumnContainer.classList.remove('has-confirmation-ui');
                }
            }
            
            try {
                // Determine the next field to focus BEFORE deletion
                const nextFieldElement = this.findNextField(fieldId);
                const prevFieldElement = !nextFieldElement ? this.findPreviousField(fieldId) : null;
                
                let focusTargetId = null;
                let focusTargetIsNewFieldHeader = false;
                
                if (nextFieldElement) {
                    focusTargetId = nextFieldElement.id || nextFieldElement.dataset?.field;
                } else if (prevFieldElement && prevFieldElement.id !== 'current-filename') {
                    // Only use previous field if it's not the filename
                    focusTargetId = prevFieldElement.id || prevFieldElement.dataset?.field;
                } else {
                    // No suitable field found, will focus on new field header
                    focusTargetIsNewFieldHeader = true;
                }
                
                const result = await API.deleteMetadataField(State.currentFile, fieldId);
                
                if (result.status === 'success') {
                    // Get field display name for success message
                    let fieldName = fieldId;
                    const fieldInfo = dynamicFields.get(fieldId);
                    if (fieldInfo) {
                        fieldName = fieldInfo.display_name;
                    }
                    
                    UIUtils.showStatus(`${fieldName} deleted`, 'success');
                    
                    // Remove from UI
                    const isStandardField = standardFields.includes(fieldId);
                    let fieldElement = null;
                    
                    if (isStandardField) {
                        // For standard fields, find the form-group-with-button container
                        const input = document.getElementById(fieldId);
                        if (input) {
                            fieldElement = input.closest('.form-group-with-button');
                            // Hide standard fields
                            if (fieldElement) {
                                fieldElement.style.display = 'none';
                                // Disable the input to prevent it from being collected during save
                                input.disabled = true;
                                input.value = '';
                            }
                        }
                    } else {
                        // For dynamic fields, remove the entire element
                        fieldElement = document.querySelector(`.dynamic-field[data-field-id="${fieldId}"]`);
                        // Clean up monitoring for this field
                        this.cleanupFieldMonitoring(fieldId);
                        if (fieldElement) {
                            fieldElement.remove();
                        }
                    }
                    
                    // Update internal state
                    if (isStandardField) {
                        // For standard fields, clear the value
                        State.originalMetadata[fieldId] = '';
                    } else {
                        // For dynamic fields, remove from tracking
                        dynamicFields.delete(fieldId);
                        delete State.originalMetadata[fieldId];
                    }
                    
                    // Update extended fields toggle visibility
                    const hasExtendedFields = dynamicFields.size > 0;
                    const extendedToggle = document.querySelector('.extended-fields-toggle');
                    if (extendedToggle) {
                        extendedToggle.style.display = hasExtendedFields ? 'flex' : 'none';
                    }
                    
                    // Update navigable elements for keyboard navigation
                    this.updateNavigableElements();
                    
                    // Focus on the predetermined next element
                    let elementToFocus = null;
                    
                    if (focusTargetIsNewFieldHeader) {
                        elementToFocus = document.querySelector('.new-field-header');
                    } else if (focusTargetId) {
                        // Try to find by ID first
                        elementToFocus = document.getElementById(focusTargetId);
                        // If not found by ID, try by data-field attribute
                        if (!elementToFocus) {
                            elementToFocus = document.querySelector(`[data-field="${focusTargetId}"]`);
                        }
                    }
                    
                    if (elementToFocus) {
                        elementToFocus.focus();
                        // Ensure input fields are in non-edit mode
                        if (elementToFocus.tagName === 'INPUT') {
                            elementToFocus.dataset.editing = 'false';
                            elementToFocus.readOnly = true;
                        }
                    }
                    
                    // Refresh history
                    if (loadHistoryCallback) {
                        loadHistoryCallback();
                    }
                } else {
                    UIUtils.showStatus(result.error || 'Failed to delete field', 'error');
                }
            } catch (error) {
                console.error('Error deleting field:', error);
                UIUtils.showStatus('Failed to delete field', 'error');
            }
        },


        /**
         * Confirm batch field deletion for entire folder
         * @param {string} fieldId - Field ID to delete
         */
        async confirmBatchDelete(fieldId) {
            // Check if another batch operation is in progress
            if (window.MetadataRemote.batchOperationInProgress) {
                UIUtils.showStatus('Another batch operation is in progress', 'warning');
                this.cancelDelete(fieldId);
                return;
            }
            
            // Determine the next field to focus BEFORE deletion
            const nextFieldElement = this.findNextField(fieldId);
            const prevFieldElement = !nextFieldElement ? this.findPreviousField(fieldId) : null;
            
            let focusTargetId = null;
            let focusTargetIsNewFieldHeader = false;
            
            if (nextFieldElement) {
                focusTargetId = nextFieldElement.id || nextFieldElement.dataset?.field;
            } else if (prevFieldElement && prevFieldElement.id !== 'current-filename') {
                // Only use previous field if it's not the filename
                focusTargetId = prevFieldElement.id || prevFieldElement.dataset?.field;
            } else {
                // No suitable field found, will focus on new field header
                focusTargetIsNewFieldHeader = true;
            }
            
            // Set lock
            window.MetadataRemote.batchOperationInProgress = true;
            
            const deleteBtn = document.querySelector(`button[onclick*="deleteField('${fieldId}')"]`) || 
                              document.querySelector(`.dynamic-field[data-field-id="${fieldId}"] .delete-field-btn`);
            
            // Show spinner in place of delete button
            if (deleteBtn) {
                deleteBtn.innerHTML = '<span class="spinner"></span>';
                deleteBtn.style.visibility = '';
                deleteBtn.disabled = true;
            }
            
            // Hide confirmation UI
            const confirmUI = document.querySelector('.delete-confirmation');
            if (confirmUI) confirmUI.remove();
            
            // Remove class from parent container for grouped fields
            const isGroupedField = ['track', 'disc', 'date'].includes(fieldId);
            if (isGroupedField) {
                const threeColumnContainer = document.querySelector('.form-group-three-column');
                if (threeColumnContainer) {
                    threeColumnContainer.classList.remove('has-confirmation-ui');
                }
            }
            
            try {
                const folderPath = State.currentPath || '';
                const result = await API.deleteFieldFromFolder(folderPath, fieldId);
                
                if (result.status === 'success' || result.status === 'partial') {
                    // Show success checkmark briefly
                    if (deleteBtn) {
                        deleteBtn.innerHTML = '<span class="status-icon success">✓</span>';
                        deleteBtn.classList.add('success');
                    }
                    
                    // Build detailed message
                    let message = `Field deleted from ${result.filesUpdated} file(s)`;
                    if (result.filesSkipped > 0) {
                        message += ` (${result.filesSkipped} files didn't have this field)`;
                    }
                    if (result.errors && result.errors.length > 0) {
                        message += ` - ${result.errors.length} errors`;
                        console.error('Batch delete errors:', result.errors);
                    }
                    
                    UIUtils.showStatus(message, result.status === 'partial' ? 'warning' : 'success');
                    
                    setTimeout(() => {
                        // Save the current focused pane before reloading
                        const currentFocusedPane = State.focusedPane;
                        
                        // Reload to show updated state
                        if (window.MetadataRemote.Files?.Manager) {
                            window.MetadataRemote.Files.Manager.loadFile(State.currentFile, State.selectedListItem);
                        }
                        if (loadHistoryCallback) {
                            loadHistoryCallback();
                        }
                        
                        // Restore focus after reload completes
                        setTimeout(() => {
                            // Restore the focused pane state
                            State.focusedPane = currentFocusedPane;
                            
                            let elementToFocus = null;
                            
                            if (focusTargetIsNewFieldHeader) {
                                elementToFocus = document.querySelector('.new-field-header');
                            } else if (focusTargetId) {
                                // Try to find by ID first
                                elementToFocus = document.getElementById(focusTargetId);
                                // If not found by ID, try by data-field attribute
                                if (!elementToFocus) {
                                    elementToFocus = document.querySelector(`[data-field="${focusTargetId}"]`);
                                }
                            }
                            
                            if (elementToFocus) {
                                elementToFocus.focus();
                                // Ensure input fields are in non-edit mode
                                if (elementToFocus.tagName === 'INPUT' && elementToFocus.dataset.editing) {
                                    elementToFocus.dataset.editing = 'false';
                                    elementToFocus.readOnly = true;
                                }
                            }
                        }, 100);
                    }, 1000);
                    
                } else {
                    throw new Error(result.error || 'Failed to delete field from folder');
                }
                
            } catch (err) {
                console.error('Error in batch field deletion:', err);
                UIUtils.showStatus(err.message || 'Error deleting field from folder', 'error');
                
                // Restore delete button
                if (deleteBtn) {
                    deleteBtn.innerHTML = '<span>⊖</span>';
                    deleteBtn.disabled = false;
                    deleteBtn.classList.remove('success');
                }
            } finally {
                // Release lock
                window.MetadataRemote.batchOperationInProgress = false;
            }
        },

        /**
         * Show folder confirmation UI
         * @param {string} field - Field ID
         */
        showFolderConfirmation(field) {
            const controls = document.querySelector(`.apply-field-controls[data-field="${field}"]`);
            if (!controls) return;
            
            // Hide the apply label and buttons
            const applyLabel = controls.querySelector('.apply-field-label');
            const fileBtn = controls.querySelector('.apply-file-btn');
            const folderBtn = controls.querySelector('.apply-folder-btn-new');
            const confirmDiv = controls.querySelector('.folder-confirmation');
            
            if (applyLabel) applyLabel.style.display = 'none';
            if (fileBtn) fileBtn.style.display = 'none';
            if (folderBtn) folderBtn.style.display = 'none';
            if (confirmDiv) confirmDiv.style.display = 'flex';
            
            // Focus on No button
            const noBtn = confirmDiv?.querySelector('.confirm-no');
            if (noBtn) noBtn.focus();
        },

        /**
         * Cancel folder confirmation
         * @param {string} field - Field ID
         */
        cancelFolderApply(field) {
            const controls = document.querySelector(`.apply-field-controls[data-field="${field}"]`);
            if (!controls) return;
            
            // Show the apply label and buttons
            const applyLabel = controls.querySelector('.apply-field-label');
            const fileBtn = controls.querySelector('.apply-file-btn');
            const folderBtn = controls.querySelector('.apply-folder-btn-new');
            const confirmDiv = controls.querySelector('.folder-confirmation');
            
            if (applyLabel) applyLabel.style.display = '';
            if (fileBtn) fileBtn.style.display = '';
            if (folderBtn) folderBtn.style.display = '';
            if (confirmDiv) confirmDiv.style.display = 'none';
        },

        /**
         * Confirm folder apply
         * @param {string} field - Field ID
         */
        confirmFolderApply(field) {
            // First hide the confirmation UI
            this.cancelFolderApply(field);
            
            // Then call the original applyFieldToFolder function
            this.applyFieldToFolder(field, ButtonStatus.showButtonStatus, UIUtils.setFormEnabled);
        },
        
        // Expose dynamicFields for modal access
        get dynamicFields() {
            return dynamicFields;
        }
    };
})();
