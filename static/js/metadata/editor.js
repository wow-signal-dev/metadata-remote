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
    
    window.MetadataRemote.Metadata.Editor = {
        /**
         * Initialize the metadata editor with required callbacks
         * @param {Object} callbacks - Object containing callback functions
         */
        init(callbacks) {
            loadHistoryCallback = callbacks.loadHistory;
            hideInferenceSuggestionsCallback = callbacks.hideInferenceSuggestions;
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
                // Hide individual field controls
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
            const fields = ['title', 'artist', 'album', 'albumartist', 'date', 'genre', 'composer', 'track', 'disc'];
            const groupedFields = ['track', 'disc', 'date'];
            
            fields.forEach(field => {
                const input = document.getElementById(field);
                
                const updateControlsVisibility = () => {
                    const hasChanged = input.value !== (State.originalMetadata[field] || '');
                    
                    if (groupedFields.includes(field)) {
                        // Handle grouped fields (track, disc, date)
                        const groupedControls = document.getElementById('grouped-apply-controls');
                        const fieldItem = document.querySelector(`.grouped-apply-item[data-field="${field}"]`);
                        
                        if (hasChanged) {
                            fieldItem.classList.add('visible');
                            fieldItem.style.display = 'flex';
                        } else {
                            fieldItem.classList.remove('visible');
                            fieldItem.style.display = 'none';
                        }
                        
                        // Show/hide the entire grouped controls container
                        const anyGroupedFieldChanged = groupedFields.some(f => {
                            const inp = document.getElementById(f);
                            return inp.value !== (State.originalMetadata[f] || '');
                        });
                        
                        if (anyGroupedFieldChanged) {
                            groupedControls.classList.add('visible');
                        } else {
                            groupedControls.classList.remove('visible');
                        }
                    } else {
                        // Handle regular fields (title, artist, album, etc.)
                        const controls = document.querySelector(`.apply-field-controls[data-field="${field}"]`);
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
            });
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
            const data = {
                title: document.getElementById('title').value,
                artist: document.getElementById('artist').value,
                album: document.getElementById('album').value,
                albumartist: document.getElementById('albumartist').value,
                date: document.getElementById('date').value,
                genre: document.getElementById('genre').value,
                composer: document.getElementById('composer').value,
                track: document.getElementById('track').value,
                disc: document.getElementById('disc').value
            };
            
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
                
                Object.entries(State.originalMetadata).forEach(([field, value]) => {
                    document.getElementById(field).value = value;
                });
                
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
            const value = document.getElementById(field).value.trim();
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
                    const fieldElement = document.getElementById(field);
                    if (fieldElement) {
                        fieldElement.focus();
                        fieldElement.dataset.editing = 'false';
                        fieldElement.readOnly = true;
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
            const value = document.getElementById(field).value.trim();
            if (!value && value !== '') return; // Allow empty string to clear field
            
            const folderPath = State.currentFile.substring(0, State.currentFile.lastIndexOf('/'));
            const fieldLabel = document.querySelector(`label[for="${field}"]`).textContent;
            
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
                    const fieldElement = document.getElementById(field);
                    if (fieldElement) {
                        fieldElement.focus();
                        fieldElement.dataset.editing = 'false';
                        fieldElement.readOnly = true;
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
        }
    };
})();
