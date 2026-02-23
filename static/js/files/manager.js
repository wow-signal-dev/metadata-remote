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

            this.selectedFilePaths = new Set();
            this.selectionAnchorPath = null;
            
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

        formatTotalSize(bytes) {
            const gbThreshold = 1024 * 1024 * 1024;

            if (bytes < gbThreshold) {
                const mb = bytes / (1024 * 1024);
                return `${mb.toFixed(mb >= 100 ? 0 : 1)} MB`;
            }

            const gb = bytes / gbThreshold;
            return `${gb.toFixed(gb >= 10 ? 0 : 2)} GB`;
        },

        updateFolderStatsFooter(stats) {
            const selectionPrefix = stats && stats.selectionCount
                ? `Selection: ${stats.selectionCount} | `
                : '';

            const text = stats && stats.status === 'success'
                ? `${selectionPrefix}Folders: ${stats.folderCount} | Files: ${stats.fileCount} | Size: ${this.formatTotalSize(stats.totalSizeBytes)}`
                : 'Folders: - | Files: - | Size: -';

            const filesFooter = document.getElementById('files-footer');
            if (filesFooter) {
                filesFooter.textContent = text;
            }

            const foldersFooter = document.getElementById('folders-footer');
            if (foldersFooter) {
                foldersFooter.textContent = text;
            }
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

                const TreeNav = window.MetadataRemote.Navigation.Tree;

                // Footer stats should reflect selected folder(s) when present.
                if (TreeNav && TreeNav.updateSelectedFolderStats) {
                    await TreeNav.updateSelectedFolderStats();
                } else {
                    try {
                        const stats = await API.getFolderStats(folderPath);
                        this.updateFolderStatsFooter(stats);
                    } catch (err) {
                        this.updateFolderStatsFooter(null);
                    }
                }
                
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

            UIUtils.setupActionsMenuGlobalClose();
            
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
                
                nameDiv.draggable = true;
                nameDiv.title = 'Drag to move';

                nameDiv.ondragstart = (e) => {
                    e.dataTransfer.effectAllowed = 'copyMove';
                    const payload = JSON.stringify({ type: 'file', path: file.path, name: file.name });
                    e.dataTransfer.setData('application/json', payload);
                    e.dataTransfer.setData('text/plain', payload);

                    // Windows-like drag ghost: file icon + name
                    const badge = e.ctrlKey ? '+' : '';
                    UIUtils.setDragImage(e, UIUtils.getFormatEmoji(file.name), file.name, 10, 10, badge);
                    li.classList.add('dragging');
                };

                nameDiv.ondragend = () => {
                    li.classList.remove('dragging');
                };

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
                const actionsButton = document.createElement('button');
                actionsButton.className = 'item-actions-btn file-actions-btn';
                actionsButton.type = 'button';
                actionsButton.textContent = '⋮';
                actionsButton.title = 'File actions';

                const rowControls = document.createElement('div');
                rowControls.className = 'file-row-controls';
                rowControls.appendChild(playButton);
                rowControls.appendChild(actionsButton);
                li.appendChild(rowControls);

                const actionsMenu = document.createElement('div');
                actionsMenu.className = 'item-actions-menu';

                const renameBtn = document.createElement('button');
                renameBtn.type = 'button';
                renameBtn.textContent = 'Rename';

                const deleteBtn = document.createElement('button');
                deleteBtn.type = 'button';
                deleteBtn.textContent = 'Delete';
                deleteBtn.className = 'danger';

                actionsMenu.appendChild(renameBtn);
                actionsMenu.appendChild(deleteBtn);

                actionsButton.onclick = (e) => {
                    e.stopPropagation();
                    UIUtils.toggleActionsMenu(actionsButton, actionsMenu);
                };

                renameBtn.onclick = (e) => {
                    e.stopPropagation();
                    actionsMenu.classList.remove('active');
                    this.startFileRename(li, file, nameDiv);
                };

                deleteBtn.onclick = async (e) => {
                    e.stopPropagation();
                    actionsMenu.classList.remove('active');

                    // If right-click/delete is on a non-selected item, select it first
                    if (!this.selectedFilePaths || !this.selectedFilePaths.has(file.path)) {
                        this.clearFileSelection();
                        this.toggleFileSelected(li, true);
                        this.selectionAnchorPath = li.dataset.filepath;
                        selectFileItemCallback(li, false);
                    }

                    await this.deleteSelectedFiles();
                };

                actionsMenu.oncontextmenu = (e) => {
                    e.preventDefault();
                };

                li.appendChild(actionsMenu);

                li.oncontextmenu = (e) => {
                    e.preventDefault();

                    if (e.target.closest('.play-button') || e.target.closest('.item-actions-menu')) {
                        return;
                    }

                    if (!this.selectedFilePaths || !this.selectedFilePaths.has(file.path)) {
                        this.clearFileSelection();
                        this.toggleFileSelected(li, true);
                        this.selectionAnchorPath = li.dataset.filepath;
                        selectFileItemCallback(li, false);
                    }

                    UIUtils.openActionsMenu(actionsMenu, e.clientX, e.clientY);
                };

                li.onclick = (e) => {
                    if (e.target.closest('.play-button') || e.target.closest('.item-actions-btn') || e.target.closest('.item-actions-menu')) {
                        return;
                    }

                    // Windows-style selection behavior
                    if (e.shiftKey) {
                        this.selectFileRange(li, { additive: e.ctrlKey });
                        selectFileItemCallback(li, false);
                        return;
                    }

                    if (e.ctrlKey) {
                        this.toggleFileSelected(li);
                        this.selectionAnchorPath = li.dataset.filepath;
                        selectFileItemCallback(li, false);
                        return;
                    }

                    // Normal click selects single item and loads metadata
                    this.clearFileSelection();
                    this.toggleFileSelected(li, true);
                    this.selectionAnchorPath = li.dataset.filepath;
                    this.loadFile(file.path, li);
                };
                list.appendChild(li);
            });
        },

        getVisibleFileItems() {
            return Array.from(document.querySelectorAll('#file-list li:not([aria-hidden="true"])')).filter(item => item.dataset.filepath);
        },

        clearFileSelection() {
            this.selectedFilePaths = new Set();
            this.getVisibleFileItems().forEach(item => item.classList.remove('multi-selected'));
        },

        toggleFileSelected(listItem, forceSelected = null) {
            const path = listItem.dataset.filepath;
            const isSelected = this.selectedFilePaths.has(path);
            const shouldSelect = forceSelected === null ? !isSelected : Boolean(forceSelected);

            if (shouldSelect) {
                this.selectedFilePaths.add(path);
                listItem.classList.add('multi-selected');
            } else {
                this.selectedFilePaths.delete(path);
                listItem.classList.remove('multi-selected');
            }
        },

        selectFileRange(targetItem, { additive = false } = {}) {
            const items = this.getVisibleFileItems();
            if (items.length === 0) return;

            const targetIndex = items.indexOf(targetItem);
            if (targetIndex === -1) return;

            const anchorPath = this.selectionAnchorPath || (State.selectedListItem && State.selectedListItem.dataset ? State.selectedListItem.dataset.filepath : null);
            const anchorIndex = anchorPath ? items.findIndex(item => item.dataset.filepath === anchorPath) : -1;
            const startIndex = Math.min(anchorIndex !== -1 ? anchorIndex : targetIndex, targetIndex);
            const endIndex = Math.max(anchorIndex !== -1 ? anchorIndex : targetIndex, targetIndex);

            if (!additive) {
                this.clearFileSelection();
            }

            for (let i = startIndex; i <= endIndex; i++) {
                this.toggleFileSelected(items[i], true);
            }
        },

        selectAllFiles() {
            const items = this.getVisibleFileItems();
            this.selectedFilePaths = new Set(items.map(item => item.dataset.filepath));
            items.forEach(item => item.classList.add('multi-selected'));

            if (items[0]) {
                this.selectionAnchorPath = items[0].dataset.filepath;
            }
        },

        async deleteSelectedFiles() {
            const Dialog = window.MetadataRemote.UI.Dialog;

            const selectedPaths = this.selectedFilePaths && this.selectedFilePaths.size
                ? Array.from(this.selectedFilePaths)
                : (State.selectedListItem && State.selectedListItem.dataset ? [State.selectedListItem.dataset.filepath] : []);

            if (!selectedPaths.length) {
                return;
            }

            const pathsByFolder = selectedPaths.reduce((acc, p) => {
                const parts = p.split('/');
                const folder = parts.length > 1 ? parts[0] : '(root)';
                const name = parts[parts.length - 1];

                if (!acc[folder]) {
                    acc[folder] = [];
                }

                acc[folder].push({ name, path: p });
                return acc;
            }, {});

            const folderNames = Object.keys(pathsByFolder).sort((a, b) => a.localeCompare(b));

            const items = [];
            folderNames.forEach(folder => {
                items.push(`📁 ${folder}`);
                pathsByFolder[folder]
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .forEach(f => {
                        const showPath = f.path.includes('/');
                        const display = showPath ? f.path : f.name;
                        items.push(`  ${UIUtils.getFormatEmoji(f.name)} ${display}`);
                    });
            });

            const intro = selectedPaths.length === 1
                ? `Delete "${items[items.length - 1].trim()}"? This cannot be undone.`
                : `Delete these ${selectedPaths.length} files? This cannot be undone.`;

            const ok = Dialog ? await Dialog.confirmList({
                title: selectedPaths.length === 1 ? 'Delete file' : 'Delete files',
                intro: intro,
                items: items,
                confirmText: 'Delete',
                cancelText: 'Cancel',
                danger: true,
                icon: '🗑️🎵',
                showCopy: false
            }) : false;

            if (!ok) {
                return;
            }

            try {
                await UIUtils.runBulkOperation({
                    label: 'Deleting files',
                    items: selectedPaths,
                    onItem: async (path) => {
                        await API.deleteFile(path);

                        if (State.currentFile === path) {
                            AudioPlayer.stopPlayback();
                            State.currentFile = null;
                            State.originalFilename = '';
                            State.selectedListItem = null;

                            document.getElementById('metadata-section').style.display = 'none';
                            document.getElementById('no-file-message').style.display = '';
                            document.getElementById('current-filename').textContent = '';
                        }
                    }
                });
            } catch (err) {
                const errorData = err && err.data ? err.data : null;
                const message = (errorData && errorData.error) ? errorData.error : 'Error deleting file';
                UIUtils.showStatus(message, 'error');
                return;
            }

            this.clearFileSelection();

            await this.loadFiles(State.currentPath);
            if (window.MetadataRemote.History && window.MetadataRemote.History.Manager) {
                window.MetadataRemote.History.Manager.loadHistory();
            }
        },

        /**
         * Start inline rename for a file without reloading metadata.
         * @param {HTMLElement} listItem - The list item element
         * @param {Object} file - File info object
         * @param {HTMLElement} nameDiv - Name container element
         */
        startFileRename(listItem, file, nameDiv) {
            // Prevent concurrent editing (match folder rename behavior)
            if (this.editingFileElement && this.editingFileElement !== listItem) {
                return;
            }

            if (this.editingFileElement === listItem) {
                return;
            }

            const fileInfo = listItem.querySelector('.file-info');
            if (!fileInfo) {
                return;
            }

            this.editingFileElement = listItem;

            nameDiv.style.display = 'none';

            const editContainer = document.createElement('div');
            editContainer.className = 'file-rename-edit';

            const input = document.createElement('input');
            input.type = 'text';
            input.className = 'file-rename-input';
            input.value = file.name;
            input.style.minWidth = '100px';
            input.maxLength = 255;

            const saveBtn = document.createElement('button');
            saveBtn.className = 'file-rename-save file-rename-btn btn-status';
            saveBtn.innerHTML = '<span class="btn-status-content">✓</span><span class="btn-status-message"></span>';
            saveBtn.title = 'Save file name';

            const cancelBtn = document.createElement('button');
            cancelBtn.className = 'file-rename-cancel file-rename-btn';
            cancelBtn.innerHTML = '✕';
            cancelBtn.title = 'Cancel rename';

            editContainer.appendChild(input);
            editContainer.appendChild(saveBtn);
            editContainer.appendChild(cancelBtn);

            fileInfo.insertBefore(editContainer, nameDiv);

            this.editingFileData = {
                nameDiv,
                editContainer,
                input,
                file
            };

            const ButtonStatus = window.MetadataRemote.UI.ButtonStatus;
            const showStatus = (message, type = 'processing', duration = 3000) => {
                if (ButtonStatus) {
                    ButtonStatus.showButtonStatus(saveBtn, message, type, duration);
                }
            };

            const setDisabled = (disabled) => {
                input.disabled = disabled;
                saveBtn.disabled = disabled;
                cancelBtn.disabled = disabled;
            };

            const saveFileName = async () => {
                const newName = input.value.trim();
                if (!newName || newName === file.name) {
                    this.cancelFileRename();
                    return;
                }

                if (newName.includes('/') || newName.includes('\\')) {
                    showStatus('Invalid name', 'error', 3000);
                    return;
                }

                AudioPlayer.stopPlayback();
                setDisabled(true);

                try {
                    showStatus('', 'processing');

                    const oldPath = file.path;
                    const result = await API.renameFile(file.path, newName);

                    if (!result || result.status !== 'success') {
                        showStatus(result && result.error ? result.error : 'Error', 'error', 3000);
                        setDisabled(false);
                        return;
                    }

                    const newFilename = result.newPath.split('/').pop();

                    file.name = newFilename;
                    file.path = result.newPath;
                    listItem.dataset.filepath = result.newPath;

                    const formatEmoji = UIUtils.getFormatEmoji(newFilename);
                    nameDiv.innerHTML = '';
                    nameDiv.appendChild(document.createTextNode(formatEmoji + ' '));
                    nameDiv.appendChild(document.createTextNode(newFilename));
                    nameDiv.insertAdjacentHTML('beforeend', UIUtils.getFormatBadge(newFilename));

                    if (State.currentFile === oldPath) {
                        State.currentFile = result.newPath;
                        State.originalFilename = newFilename;
                        document.getElementById('current-filename').textContent = newFilename;
                        this.cancelFilenameEdit();
                    }

                    showStatus('✓', 'success', 1000);

                    setTimeout(async () => {
                        this.cancelFileRename();

                        try {
                            await this.loadFiles(State.currentPath);

                            if (State.currentFile) {
                                const list = document.getElementById('file-list');
                                const items = list ? Array.from(list.querySelectorAll('li[data-filepath]')) : [];
                                const currentItem = items.find(el => el.dataset.filepath === State.currentFile);
                                if (currentItem) {
                                    selectFileItemCallback(currentItem, false);
                                }
                            }

                            if (window.MetadataRemote.History && window.MetadataRemote.History.Manager) {
                                window.MetadataRemote.History.Manager.loadHistory();
                            }
                        } catch (err) {
                            console.error('Error refreshing after rename:', err);
                        }
                    }, 300);
                } catch (err) {
                    console.error('Error renaming file:', err);
                    showStatus('Error', 'error', 3000);
                    setDisabled(false);
                }
            };

            const cancelRename = () => {
                this.cancelFileRename();
            };

            const handleBlur = (e) => {
                if (e.relatedTarget === saveBtn || e.relatedTarget === cancelBtn) {
                    return;
                }

                setTimeout(() => {
                    if (this.editingFileElement === listItem) {
                        this.cancelFileRename();
                    }
                }, 200);
            };

            editContainer.onclick = (e) => {
                e.stopPropagation();
            };

            saveBtn.onclick = (e) => {
                e.stopPropagation();
                saveFileName();
            };

            cancelBtn.onclick = (e) => {
                e.stopPropagation();
                cancelRename();
            };

            input.onblur = handleBlur;

            input.onkeydown = (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    saveFileName();
                } else if (e.key === 'Escape') {
                    e.preventDefault();
                    cancelRename();
                }
            };

            input.focus();
            input.select();
        },

        /**
         * Cancel active inline file rename
         */
        cancelFileRename() {
            if (!this.editingFileData) {
                this.editingFileElement = null;
                return;
            }

            const { nameDiv, editContainer } = this.editingFileData;

            if (nameDiv) {
                nameDiv.style.display = '';
            }

            if (editContainer && editContainer.parentNode) {
                editContainer.remove();
            }

            this.editingFileElement = null;
            this.editingFileData = null;
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
            
            // Clean up TransitionController monitoring for all fields
            if (window.MetadataRemote.Metadata.TransitionController) {
                window.MetadataRemote.Metadata.TransitionController.stopAllMonitoring();
            }
            
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
