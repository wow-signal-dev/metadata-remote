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
            
            // Set up the new file controls instead of the old filter box
            this.setupFileControls();
        },
        
        /**
         * Set up filter and sort controls for files pane
         */
        setupFileControls() {
            // Filter button toggle
            const filterBtn = document.getElementById('files-filter-btn');
            const filterContainer = document.getElementById('files-filter');
            const filterInput = document.getElementById('files-filter-input');
            
            if (filterBtn && filterContainer && filterInput) {
                filterBtn.addEventListener('click', () => {
                    const isActive = filterContainer.classList.contains('active');
                    
                    // Close any open sort dropdown
                    document.getElementById('files-sort-dropdown').classList.remove('active');
                    State.activeSortDropdown = null;
                    
                    filterContainer.classList.toggle('active');
                    filterBtn.classList.toggle('active');
                    State.activeFilterPane = isActive ? null : 'files';
                    
                    if (!isActive) {
                        filterInput.focus();
                        State.focusedPane = 'files';
                    }
                });
                
                // Filter input handler
                filterInput.addEventListener('input', (e) => {
                    State.filesFilter = e.target.value;
                    // Re-render the file list with the new filter
                    this.renderFileList();
                });
            }
            
            // Sort field button
            const sortBtn = document.getElementById('files-sort-btn');
            const sortDropdown = document.getElementById('files-sort-dropdown');
            const sortDirection = document.getElementById('files-sort-direction');
            const sortIndicator = document.getElementById('files-sort-indicator');
            
            if (sortBtn && sortDropdown) {
                sortBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    
                    // Close filter if open
                    filterContainer.classList.remove('active');
                    filterBtn.classList.remove('active');
                    State.activeFilterPane = null;
                    
                    const isActive = sortDropdown.classList.contains('active');
                    sortDropdown.classList.toggle('active');
                    State.activeSortDropdown = isActive ? null : 'files';
                    State.focusedPane = 'files';
                });
                
                // Sort direction toggle
                sortDirection.addEventListener('click', (e) => {
                    e.stopPropagation();
                    State.filesSort.direction = State.filesSort.direction === 'asc' ? 'desc' : 'asc';
                    this.updateSortUI();
                    this.renderFileList();
                });
                
                // Sort options
                sortDropdown.querySelectorAll('.sort-option').forEach(option => {
                    option.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const sortBy = option.dataset.sort;
                        
                        // Use smart defaults for direction based on field
                        State.filesSort.method = sortBy;
                        // Date and size typically start descending (newest/largest first)
                        State.filesSort.direction = (sortBy === 'date' || sortBy === 'size') ? 'desc' : 'asc';
                        
                        this.updateSortUI();
                        this.renderFileList();
                        sortDropdown.classList.remove('active');
                        State.activeSortDropdown = null;
                    });
                });
            }
            
            // Close dropdowns on outside click
            document.addEventListener('click', (e) => {
                if (!e.target.closest('#files-sort-dropdown') && !e.target.closest('#files-sort-btn')) {
                    sortDropdown.classList.remove('active');
                    if (State.activeSortDropdown === 'files') {
                        State.activeSortDropdown = null;
                    }
                }
            });
        },
        
        /**
         * Update the sort UI to reflect current state
         */
        updateSortUI() {
            const sortBtn = document.getElementById('files-sort-btn');
            const sortIndicator = document.getElementById('files-sort-indicator');
            const sortDropdown = document.getElementById('files-sort-dropdown');
            
            if (!sortBtn || !sortIndicator || !sortDropdown) return;
            
            // Update button title
            const fieldNames = {
                name: 'Name',
                date: 'Date',
                type: 'Type',
                size: 'Size'
            };
            sortBtn.title = `Sort by: ${fieldNames[State.filesSort.method] || 'Name'}`;
            
            // Update direction indicator
            sortIndicator.textContent = State.filesSort.direction === 'asc' ? '▲' : '▼';
            
            // Update active option in dropdown
            sortDropdown.querySelectorAll('.sort-option').forEach(option => {
                option.classList.toggle('active', option.dataset.sort === State.filesSort.method);
            });
        },

        /**
         * Format file size in human-readable format
         * @param {number} bytes - Size in bytes
         * @returns {string} Formatted size
         */
        formatFileSize(bytes) {
            if (bytes === 0) return '0 B';
            const k = 1024;
            const sizes = ['B', 'KB', 'MB', 'GB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
        },
        
        /**
         * Format Unix timestamp to readable date
         * @param {number} timestamp - Unix timestamp
         * @returns {string} Formatted date
         */
        formatDate(timestamp) {
            if (!timestamp) return 'Unknown';
            const date = new Date(timestamp * 1000);
            return date.toLocaleDateString();
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
                
                // Store the raw file data
                State.currentFiles = data.files;
                
                // Update count before filtering
                document.getElementById('file-count').textContent = `(${data.files.length})`;
                
                // Render the file list (which will apply filtering and sorting)
                this.renderFileList();
                
                // Update sort UI to reflect current state
                this.updateSortUI();
                
            } catch (err) {
                console.error('Error loading files:', err);
                UIUtils.showStatus('Error loading files', 'error');
                document.getElementById('file-count').textContent = '(error)';
            }
        },
        
        /**
         * Sort files based on current sort settings
         * @param {Array} files - Files to sort
         * @returns {Array} Sorted files
         */
        sortFiles(files) {
            return [...files].sort((a, b) => {
                let aVal, bVal;
                
                switch (State.filesSort.method) {
                    case 'name':
                        aVal = a.name.toLowerCase();
                        bVal = b.name.toLowerCase();
                        break;
                    case 'date':
                        // Need to get file dates from backend
                        // For now, use 0 as placeholder
                        aVal = a.date || 0;
                        bVal = b.date || 0;
                        break;
                    case 'type':
                        const aExt = a.name.split('.').pop().toLowerCase();
                        const bExt = b.name.split('.').pop().toLowerCase();
                        aVal = aExt;
                        bVal = bExt;
                        break;
                    case 'size':
                        // Need to get file sizes from backend
                        // For now, use 0 as placeholder
                        aVal = a.size || 0;
                        bVal = b.size || 0;
                        break;
                    default:
                        aVal = a.name.toLowerCase();
                        bVal = b.name.toLowerCase();
                }
                
                if (State.filesSort.direction === 'asc') {
                    return aVal > bVal ? 1 : -1;
                } else {
                    return aVal < bVal ? 1 : -1;
                }
            });
        },
        
        /**
         * Sort and render files (called from UI controls)
         */
        sortAndRenderFiles() {
            this.renderFileList();
        },
        
        /**
         * Render the file list with current filter and sort settings
         */
        renderFileList() {
            const list = document.getElementById('file-list');
            list.innerHTML = '';
            
            if (!State.currentFiles || State.currentFiles.length === 0) {
                const li = document.createElement('li');
                li.textContent = 'No audio files found';
                li.style.color = '#999';
                li.style.cursor = 'default';
                list.appendChild(li);
                return;
            }
            
            // Apply filter
            const filterValue = State.filesFilter.toLowerCase().trim();
            let filteredFiles = State.currentFiles;
            
            if (filterValue.length > 0) {
                filteredFiles = State.currentFiles.filter(file => 
                    file.name.toLowerCase().includes(filterValue)
                );
            }
            
            // Update file count to show filtered count
            document.getElementById('file-count').textContent = `(${filteredFiles.length})`;
            
            // Apply sorting
            const sortedFiles = this.sortFiles(filteredFiles);
            
            // Render each file
            sortedFiles.forEach(file => {
                const li = document.createElement('li');
                li.dataset.filepath = file.path;
                
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

                // Show date or size when sorted by those fields
                if (State.filesSort.method === 'date' || State.filesSort.method === 'size') {
                    const metaDiv = document.createElement('div');
                    metaDiv.className = 'file-meta';
                    metaDiv.style.cssText = 'font-size: 0.75rem; color: #999; margin-top: 0.1rem;';
                    
                    if (State.filesSort.method === 'date' && file.date) {
                        metaDiv.textContent = this.formatDate(file.date);
                    } else if (State.filesSort.method === 'size' && file.size) {
                        metaDiv.textContent = this.formatFileSize(file.size);
                    }
                    
                    fileInfo.appendChild(metaDiv);
                }
                
                if (file.folder !== '.') {
                    const folderDiv = document.createElement('div');
                    folderDiv.className = 'file-folder';
                    folderDiv.textContent = file.folder;
                    fileInfo.appendChild(folderDiv);
                }
                
                li.appendChild(fileInfo);
                
                const playButton = document.createElement('div');
                playButton.className = 'play-button';
                playButton.innerHTML = '<span class="play-icon">▶</span><span class="pause-icon">❚❚</span><span class="play-spinner"></span>';
                
                const isWMA = file.name.toLowerCase().endsWith('.wma');
                
                if (isWMA) {
                    playButton.classList.add('disabled');
                    playButton.disabled = true;
                    playButton.title = 'WMA playback not supported in browsers';
                } else {
                    playButton.onclick = (e) => {
                        e.stopPropagation();
                        AudioPlayer.togglePlayback(file.path, playButton);
                    };
                }
                li.appendChild(playButton);
                
                li.onclick = (e) => {
                    if (!e.target.closest('.play-button')) {
                        this.loadFile(file.path, li);
                    }
                };
                list.appendChild(li);
            });
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
            const fields = ['title', 'artist', 'album', 'albumartist', 'date', 'genre', 'composer', 'track', 'disc'];
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
            
            // Show loading indicator
            document.getElementById('metadata-loading-indicator').style.display = 'flex';
            document.getElementById('metadata-content-wrapper').style.display = 'none';

            // Clear all button statuses when loading a new file
            window.MetadataRemote.UI.ButtonStatus.clearAllButtonStatuses();
            
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
                        composer: data.composer || '',
                        track: data.track || '',
                        disc: data.disc || ''
                    };
                    
                    
                    // Store all fields data if available, but don't overwrite standard fields
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
                    
                    // Standard field values will be set when fields are rendered
                    // Just ensure metadata is properly stored in State
                    State.metadata = data;
                
                // Render dynamic fields
                if (window.MetadataRemote.Metadata && window.MetadataRemote.Metadata.Editor) {
                    window.MetadataRemote.Metadata.Editor.renderMetadataFields(data);
                }
                
                // Hide loading indicator and show content
                document.getElementById('metadata-loading-indicator').style.display = 'none';
                document.getElementById('metadata-content-wrapper').style.display = '';
                
                // Handle format limitations
                const formatLimitations = data.formatLimitations || {};
                const format = data.format || '';
                
                // Show format-specific warnings
                if (formatLimitations.hasLimitedMetadata) {
                    UIUtils.showStatus(`Note: ${format.toUpperCase()} files have limited metadata support`, 'warning');
                    
                    // Disable unsupported fields
                    if (data.supportedFields) {
                        const allFields = ['title', 'artist', 'album', 'albumartist', 'date', 'genre', 'composer', 'track', 'disc'];
                        allFields.forEach(field => {
                            const input = document.getElementById(field);
                            const controls = document.querySelector(`.apply-field-controls[data-field="${field}"]`);
                            
                            if (!input) {
                                return;
                            }
                            
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
                
                // Only handle album art if elements exist
                if (!artDisplay) {
                    console.error('Album art display element not found!');
                } else {
                
                // Check if format supports album art
                if (!formatLimitations.supportsAlbumArt) {
                    artDisplay.innerHTML = `<div class="album-art-placeholder" style="opacity: 0.5;">Album art not supported for ${format.toUpperCase()}</div>`;
                    if (deleteBtn) deleteBtn.style.display = 'none';
                    if (saveImageBtn) saveImageBtn.style.display = 'none';
                    if (applyFolderBtn) applyFolderBtn.style.display = 'none';
                    if (uploadBtn) {
                        uploadBtn.disabled = true;
                        uploadBtn.style.opacity = '0.5';
                        uploadBtn.title = `${format.toUpperCase()} format does not support embedded album art`;
                    }
                } else {
                    if (uploadBtn) {
                        uploadBtn.disabled = false;
                        uploadBtn.style.opacity = '1';
                        uploadBtn.title = '';
                    }
                    
                    if (data.hasArt && data.art) {
                        State.currentAlbumArt = data.art;
                        const albumArtSrc = `data:image/jpeg;base64,${data.art}`;
                        // Calculate and display metadata
                        const AlbumArt = window.MetadataRemote.Metadata.AlbumArt;
                        if (AlbumArt && AlbumArt.displayAlbumArtWithMetadata) {
                            AlbumArt.displayAlbumArtWithMetadata(albumArtSrc, artDisplay);
                        } else {
                            // Fallback if module not loaded
                            artDisplay.innerHTML = `<img src="${albumArtSrc}" class="album-art">`;
                        }
                        if (deleteBtn) deleteBtn.style.display = 'block';
                        if (saveImageBtn) saveImageBtn.style.display = 'none';
                        if (applyFolderBtn) applyFolderBtn.style.display = 'none';
                    } else {
                        artDisplay.innerHTML = '<div class="album-art-placeholder">No album art</div>';
                        if (deleteBtn) deleteBtn.style.display = 'none';
                        if (saveImageBtn) saveImageBtn.style.display = 'none';
                        if (applyFolderBtn) applyFolderBtn.style.display = 'none';
                    }
                }
                } // Close the else block for artDisplay check
                
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
                    
                    // Hide loading indicator on error
                    document.getElementById('metadata-loading-indicator').style.display = 'none';
                    document.getElementById('metadata-content-wrapper').style.display = '';
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
                    
                    // Restore focus to filename display after successful save
                    document.getElementById('current-filename').focus();
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
