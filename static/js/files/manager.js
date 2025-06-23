/**
 * File Management Module for Metadata Remote
 * Handles file loading, metadata loading, and filename operations
 */

(function() {
    // Create namespace if it doesn't exist
    window.MetadataRemote = window.MetadataRemote || {};
    window.MetadataRemote.Files = window.MetadataRemote.Files || {};
    
    // Create shortcuts
    const State = window.MetadataRemote.State;
    const API = window.MetadataRemote.API;
    const UIUtils = window.MetadataRemote.UI.Utilities;
    const AudioPlayer = window.MetadataRemote.Audio.Player;
    
    // Store callbacks that will be set during initialization
    let selectFileItemCallback = null;
    let showInferenceSuggestionsCallback = null;
    let hideInferenceSuggestionsCallback = null;
    
    window.MetadataRemote.Files.Manager = {
        /**
         * Initialize the files manager with required callbacks
         * @param {Object} callbacks - Object containing callback functions
         */
        init(callbacks) {
            selectFileItemCallback = callbacks.selectFileItem;
            showInferenceSuggestionsCallback = callbacks.showInferenceSuggestions;
            hideInferenceSuggestionsCallback = callbacks.hideInferenceSuggestions;
        },
        
        /**
         * Load and display files in a folder
         * @param {string} folderPath - Path to the folder
         */
        async loadFiles(folderPath) {
            State.currentPath = folderPath;
            document.getElementById('file-count').textContent = '(loading...)';
            
            AudioPlayer.stopPlayback();
            
            try {
                const data = await API.loadFiles(folderPath);
                const list = document.getElementById('file-list');
                list.innerHTML = '';
                
                document.getElementById('file-count').textContent = `(${data.files.length})`;
                
                if (data.files.length === 0) {
                    const li = document.createElement('li');
                    li.textContent = 'No audio files found';
                    li.style.color = '#999';
                    li.style.cursor = 'default';
                    list.appendChild(li);
                    return;
                }

                const filter_value = document.getElementById('filter-box').value.toLowerCase().trim();
                
                data.files.forEach(file => {
                    const li = document.createElement('li');
                    li.dataset.filepath = file.path;

                    if (filter_value.length > 0 && !file.name.toLowerCase().includes(filter_value)) {
                        li.setAttribute("aria-hidden", "true");
                    }
                    
                    const fileInfo = document.createElement('div');
                    fileInfo.className = 'file-info';
                    
                    const nameDiv = document.createElement('div');
                    const formatEmoji = UIUtils.getFormatEmoji(file.name);
                    const musicIcon = document.createTextNode(formatEmoji + ' ');
                    nameDiv.appendChild(musicIcon);
                    nameDiv.appendChild(document.createTextNode(file.name));
                    
                    // Add format badge
                    const badgeHtml = UIUtils.getFormatBadge(file.name);
                    nameDiv.insertAdjacentHTML('beforeend', badgeHtml);
                    
                    fileInfo.appendChild(nameDiv);
                    
                    if (file.folder !== '.') {
                        const folderDiv = document.createElement('div');
                        folderDiv.className = 'file-folder';
                        folderDiv.textContent = file.folder;
                        fileInfo.appendChild(folderDiv);
                    }
                    
                    li.appendChild(fileInfo);
                    
                    const playButton = document.createElement('div');
                    playButton.className = 'play-button';
                    playButton.innerHTML = '<span class="play-icon">▶</span><span class="pause-icon">❚❚</span>';
                    playButton.onclick = (e) => {
                        e.stopPropagation();
                        AudioPlayer.togglePlayback(file.path, playButton);
                    };
                    li.appendChild(playButton);
                    
                    li.onclick = (e) => {
                        if (!e.target.closest('.play-button')) {
                            this.loadFile(file.path, li);
                        }
                    };
                    list.appendChild(li);
                });
            } catch (err) {
                console.error('Error loading files:', err);
                UIUtils.showStatus('Error loading files', 'error');
                document.getElementById('file-count').textContent = '(error)';
            }
        },

        /**
         * Load metadata for a specific file
         * @param {string} filepath - Path to the file
         * @param {HTMLElement} listItem - The list item element
         */
        async loadFile(filepath, listItem) {
            // Increment request ID to track this as the latest request
            const requestId = ++State.loadFileRequestId;
            
            // Stop any current playback when selecting a different file
            AudioPlayer.stopPlayback();
            
            // Hide all inference suggestions
            const fields = ['title', 'artist', 'album', 'albumartist', 'date', 'genre', 'track', 'disc'];
            fields.forEach(field => {
                if (window.MetadataRemote.Metadata.Inference) {
                    window.MetadataRemote.Metadata.Inference.hideInferenceSuggestions(field);
                }
            });
            
            if (State.loadFileDebounceTimer) {
                clearTimeout(State.loadFileDebounceTimer);
                State.loadFileDebounceTimer = null;
            }
            
            selectFileItemCallback(listItem);
            
            State.currentFile = filepath;
            State.originalFilename = filepath.split('/').pop();
            document.getElementById('current-filename').textContent = State.originalFilename;
            document.getElementById('no-file-message').style.display = 'none';
            document.getElementById('metadata-section').style.display = 'block';
            
            this.cancelFilenameEdit();
            UIUtils.hideStatus();
            
            document.querySelectorAll('.apply-field-controls').forEach(controls => {
                controls.classList.remove('visible');
            });
            
            if (listItem.classList.contains('keyboard-focus')) {
                UIUtils.showStatus('Loading metadata...', 'success');
            }
            
            State.currentAlbumArt = null;
            State.pendingAlbumArt = null;
            State.shouldRemoveArt = false;
            
            UIUtils.setFormEnabled(false);
            
            try {
                const data = await API.getMetadata(filepath);
                
                if (requestId !== State.loadFileRequestId) {
                    // A newer request has been made, discard this response
                    return;
                }
                
                State.originalMetadata = {
                    title: data.title || '',
                    artist: data.artist || '',
                    album: data.album || '',
                    albumartist: data.albumartist || '',
                    date: data.date || '',
                    genre: data.genre || '',
                    track: data.track || '',
                    disc: data.disc || ''
                };
                
                Object.entries(State.originalMetadata).forEach(([field, value]) => {
                    document.getElementById(field).value = value;
                });
                
                // Handle format limitations
                const formatLimitations = data.formatLimitations || {};
                const format = data.format || '';
                
                // Show format-specific warnings
                if (formatLimitations.hasLimitedMetadata) {
                    UIUtils.showStatus(`Note: ${format.toUpperCase()} files have limited metadata support`, 'warning');
                    
                    // Disable unsupported fields
                    if (data.supportedFields) {
                        const allFields = ['title', 'artist', 'album', 'albumartist', 'date', 'genre', 'track', 'disc'];
                        allFields.forEach(field => {
                            const input = document.getElementById(field);
                            const controls = document.querySelector(`.apply-field-controls[data-field="${field}"]`);
                            if (!data.supportedFields.includes(field)) {
                                input.disabled = true;
                                input.style.opacity = '0.5';
                                input.title = `${format.toUpperCase()} format does not support this field`;
                                if (controls) {
                                    controls.style.display = 'none';
                                }
                            } else {
                                input.disabled = false;
                                input.style.opacity = '1';
                                input.title = '';
                                if (controls) {
                                    controls.style.display = '';
                                }
                            }
                        });
                    }
                }
                
                // Handle album art
                const artDisplay = document.getElementById('art-display');
                const deleteBtn = document.querySelector('.delete-art-btn');
                const saveImageBtn = document.querySelector('.save-image-btn');
                const applyFolderBtn = document.querySelector('.apply-folder-btn');
                const uploadBtn = document.querySelector('.upload-btn');
                
                // Check if format supports album art
                if (!formatLimitations.supportsAlbumArt) {
                    artDisplay.innerHTML = `<div class="album-art-placeholder" style="opacity: 0.5;">Album art not supported for ${format.toUpperCase()}</div>`;
                    deleteBtn.style.display = 'none';
                    saveImageBtn.style.display = 'none';
                    applyFolderBtn.style.display = 'none';
                    uploadBtn.disabled = true;
                    uploadBtn.style.opacity = '0.5';
                    uploadBtn.title = `${format.toUpperCase()} format does not support embedded album art`;
                } else {
                    uploadBtn.disabled = false;
                    uploadBtn.style.opacity = '1';
                    uploadBtn.title = '';
                    
                    if (data.hasArt && data.art) {
                        State.currentAlbumArt = data.art;
                        artDisplay.innerHTML = `<img src="data:image/jpeg;base64,${data.art}" class="album-art">`;
                        deleteBtn.style.display = 'block';
                        saveImageBtn.style.display = 'none';
                        applyFolderBtn.style.display = 'none';
                    } else {
                        artDisplay.innerHTML = '<div class="album-art-placeholder">No album art</div>';
                        deleteBtn.style.display = 'none';
                        saveImageBtn.style.display = 'none';
                        applyFolderBtn.style.display = 'none';
                    }
                }
                
                UIUtils.setFormEnabled(true);
                
                if (listItem.classList.contains('keyboard-focus')) {
                    UIUtils.hideStatus();
                }
            } catch (err) {
                // Check if this is still the most recent request before showing error
                if (requestId === State.loadFileRequestId) {
                    console.error('Error loading metadata:', err);
                    UIUtils.showStatus('Error loading metadata', 'error');
                    UIUtils.setFormEnabled(true);
                }
            }
        },
        
        /**
         * Cancel filename editing and restore display
         */
        cancelFilenameEdit() {
            document.getElementById('current-filename').style.display = 'inline';
            document.querySelector('.filename-edit').style.display = 'none';
        },
        
        /**
         * Reset filename input to original value
         */
        resetFilename() {
            document.getElementById('filename-input').value = State.originalFilename;
        },
        
        /**
         * Save the new filename
         * @param {Function} showButtonStatus - Callback to show button status
         * @param {Function} loadFilesCallback - Callback to reload files
         * @param {Function} loadHistoryCallback - Callback to reload history
         */
        async saveFilename(showButtonStatus, loadFilesCallback, loadHistoryCallback) {
            const button = document.querySelector('.filename-save');
            const newName = document.getElementById('filename-input').value.trim();
            if (!newName || newName === State.originalFilename) {
                this.cancelFilenameEdit();
                return;
            }
            
            UIUtils.setFormEnabled(false);
            showButtonStatus(button, 'Renaming...', 'processing');
            
            try {
                const result = await API.renameFile(State.currentFile, newName);
                
                if (result.status === 'success') {
                    State.currentFile = result.newPath;
                    State.originalFilename = newName;
                    document.getElementById('current-filename').textContent = newName;
                    this.cancelFilenameEdit();
                    showButtonStatus(button, 'Renamed!', 'success');
                    loadFilesCallback(State.currentPath);
                    loadHistoryCallback();
                } else {
                    showButtonStatus(button, result.error || 'Error', 'error');
                }
            } catch (err) {
                console.error('Error renaming file:', err);
                showButtonStatus(button, 'Error', 'error');
            }
            
            UIUtils.setFormEnabled(true);
        }
    };
})();
