/**
 * Main Application Logic for Metadata Remote
 * Coordinates between state, API, and UI components
 */

// Ensure namespace exists
window.MetadataRemote = window.MetadataRemote || {};

// Create shortcuts for easier access
const State = window.MetadataRemote.State;
const API = window.MetadataRemote.API;
const ButtonStatus = window.MetadataRemote.UI.ButtonStatus;
const UIUtils = window.MetadataRemote.UI.Utilities;
const AudioPlayer = window.MetadataRemote.Audio.Player;
const PaneResize = window.MetadataRemote.UI.PaneResize;
const TreeNav = window.MetadataRemote.Navigation.Tree;
const KeyboardNav = window.MetadataRemote.Navigation.Keyboard;
const FilesManager = window.MetadataRemote.Files.Manager;
const MetadataEditor = window.MetadataRemote.Metadata.Editor;

const AudioMetadataEditor = {
    // Initialize the application
    init() {
        // Reset state to ensure clean start
        State.reset();
        TreeNav.init(this.selectTreeItem.bind(this), this.loadFiles.bind(this));
        AudioPlayer.init(document.getElementById('audio-player'));
        KeyboardNav.init({
            selectTreeItem: this.selectTreeItem.bind(this),
            selectFileItem: this.selectFileItem.bind(this),
            loadFile: this.loadFile.bind(this),
            loadFiles: this.loadFiles.bind(this)
        });
        FilesManager.init({
            selectFileItem: this.selectFileItem.bind(this),
            showInferenceSuggestions: this.showInferenceSuggestions.bind(this),
            hideInferenceSuggestions: this.hideInferenceSuggestions.bind(this)
        });
        MetadataEditor.init({
            loadHistory: this.loadHistory.bind(this),
            hideInferenceSuggestions: this.hideInferenceSuggestions.bind(this)
        });
        TreeNav.loadTree();
        TreeNav.updateSortUI();
        MetadataEditor.setupMetadataFieldListeners();
        PaneResize.initializePaneResize();
        PaneResize.initializeHistoryPanelResize(this.toggleHistoryPanel.bind(this));
        this.setupInferenceHandlers();
        this.loadHistory();
        const historyPanel = document.getElementById('history-panel');
        const metadataContent = document.querySelector('.metadata-content');
        if (historyPanel.classList.contains('expanded')) {
            metadataContent.style.paddingBottom = `${State.historyPanelHeight + 20}px`;
        }
    },
   
    // Button status management
    showButtonStatus(button, message, type = 'processing', duration = 3000) {
        ButtonStatus.showButtonStatus(button, message, type, duration);
    },
    
    clearButtonStatus(button) {
        ButtonStatus.clearButtonStatus(button);
    },
    
    togglePlayback(filepath, button) {
        AudioPlayer.togglePlayback(filepath, button);
    },

    stopPlayback() {
        AudioPlayer.stopPlayback();
    },
    
    // NEW: Setup inference handlers
    setupInferenceHandlers() {
        const fields = ['title', 'artist', 'album', 'albumartist', 'date', 'genre', 'track', 'disc'];
        
        fields.forEach(field => {
            const input = document.getElementById(field);
            const suggestions = document.getElementById(`${field}-suggestions`);
            
            // Click handler for empty fields
            input.addEventListener('click', (e) => {
                if (input.value.trim() === '' && !input.disabled && State.currentFile) {
                    this.showInferenceSuggestions(field);
                }
            });
            
            // Input handler to hide suggestions when typing
            input.addEventListener('input', (e) => {
                this.hideInferenceSuggestions(field);
            });
            
            // Click outside to hide suggestions
            document.addEventListener('click', (e) => {
                if (!e.target.closest(`#${field}`) && !e.target.closest(`#${field}-suggestions`)) {
                    this.hideInferenceSuggestions(field);
                }
            });
        });
    },
    
    // NEW: Show inference suggestions
    async showInferenceSuggestions(field) {
        if (State.inferenceActive[field]) return;
        
        const loading = document.getElementById(`${field}-loading`);
        const suggestions = document.getElementById(`${field}-suggestions`);
        
        // Cancel any existing request
        if (State.inferenceAbortControllers[field]) {
            State.inferenceAbortControllers[field].abort();
        }
        
        // Create new abort controller
        const abortController = new AbortController();
        State.inferenceAbortControllers[field] = abortController;
        
        // Show loading
        loading.classList.add('active');
        State.inferenceActive[field] = true;
        
        try {
            const response = await fetch(`/infer/${encodeURIComponent(State.currentFile)}/${field}`, {
                signal: abortController.signal
            });
            
            if (!response.ok) {
                throw new Error('Failed to get suggestions');
            }
            
            const data = await response.json();
            
            // Hide loading
            loading.classList.remove('active');
            
            // Display suggestions if still active
            if (State.inferenceActive[field]) {
                this.displaySuggestions(field, data.suggestions);
            }
        } catch (error) {
            if (error.name !== 'AbortError') {
                console.error(`Error getting suggestions for ${field}:`, error);
                loading.classList.remove('active');
                
                // Show error state
                suggestions.innerHTML = '<div class="no-suggestions">Error loading suggestions</div>';
                suggestions.classList.add('active');
                
                setTimeout(() => {
                    this.hideInferenceSuggestions(field);
                }, 2000);
            }
        }
        
        State.inferenceActive[field] = false;
    },
    
    // NEW: Display suggestions
    displaySuggestions(field, suggestions) {
        const container = document.getElementById(`${field}-suggestions`);
        container.innerHTML = '';
        
        if (!suggestions || suggestions.length === 0) {
            container.innerHTML = '<div class="no-suggestions">No suggestions available</div>';
        } else {
            suggestions.forEach(suggestion => {
                const item = document.createElement('div');
                item.className = 'suggestion-item';
                
                const value = document.createElement('div');
                value.className = 'suggestion-value';
                value.textContent = suggestion.value;
                
                const confidence = document.createElement('div');
                confidence.className = 'suggestion-confidence';
                
                const bar = document.createElement('div');
                bar.className = 'confidence-bar';
                
                const fill = document.createElement('div');
                fill.className = 'confidence-fill';
                fill.style.width = `${suggestion.confidence}%`;
                
                bar.appendChild(fill);
                
                const text = document.createElement('div');
                text.className = 'confidence-text';
                text.textContent = `${suggestion.confidence}%`;
                
                confidence.appendChild(bar);
                confidence.appendChild(text);
                
                item.appendChild(value);
                item.appendChild(confidence);
                
                // Click handler
                item.addEventListener('click', () => {
                    document.getElementById(field).value = suggestion.value;
                    this.hideInferenceSuggestions(field);
                    
                    // Trigger input event to update apply controls
                    const event = new Event('input', { bubbles: true });
                    document.getElementById(field).dispatchEvent(event);
                });
                
                container.appendChild(item);
            });
        }
        
        container.classList.add('active');
    },
    
    hideInferenceSuggestions(field) {
        const loading = document.getElementById(`${field}-loading`);
        const suggestions = document.getElementById(`${field}-suggestions`);
        
        // Cancel any ongoing request
        if (State.inferenceAbortControllers[field]) {
            State.inferenceAbortControllers[field].abort();
            delete State.inferenceAbortControllers[field];
        }
        
        loading.classList.remove('active');
        suggestions.classList.remove('active');
        State.inferenceActive[field] = false;
    },

    selectTreeItem(item, isKeyboard = false) {
        if (State.selectedTreeItem) {
            State.selectedTreeItem.classList.remove('selected', 'keyboard-focus');
        }
        item.classList.add('selected');
        // Always add keyboard-focus when selecting, regardless of input method
        item.classList.add('keyboard-focus');
        
        // Remove keyboard-focus from files pane when selecting a folder
        document.querySelectorAll('.files .keyboard-focus').forEach(el => {
            el.classList.remove('keyboard-focus');
        });
        
        State.selectedTreeItem = item;
        State.focusedPane = 'folders';
        // Note: updatePaneFocus is now handled by the keyboard module
        
        // Always load files when a folder is selected (remove the isKeyboard check)
        if (State.loadFileDebounceTimer) {
            clearTimeout(State.loadFileDebounceTimer);
        }
        
        const folderPath = item.dataset.path;
        if (folderPath !== undefined) { // folderPath can be empty string for root
            State.loadFileDebounceTimer = setTimeout(() => {
                this.loadFiles(folderPath);
            }, 300);
        }
    },

    selectFileItem(item, isKeyboard = false) {
        if (State.selectedListItem) {
            State.selectedListItem.classList.remove('selected', 'keyboard-focus');
        }
        
        item.classList.add('selected');
        // Always add keyboard-focus when selecting, regardless of input method
        item.classList.add('keyboard-focus');
        
        // Remove keyboard-focus from folders pane when selecting a file
        document.querySelectorAll('.folders .keyboard-focus').forEach(el => {
            el.classList.remove('keyboard-focus');
        });
        
        // Load file if keyboard navigation
        if (isKeyboard) {
            if (State.loadFileDebounceTimer) {
                clearTimeout(State.loadFileDebounceTimer);
            }
            
            const filepath = item.dataset.filepath;
            if (filepath) {
                State.loadFileDebounceTimer = setTimeout(() => {
                    this.loadFile(filepath, item);
                }, 300);
            }
        }
        
        State.selectedListItem = item;
        State.focusedPane = 'files';
        // Note: updatePaneFocus is now handled by the keyboard module
    },

    // File operations
    async loadFiles(folderPath) {
        await FilesManager.loadFiles(folderPath);
    },

    async loadFile(filepath, listItem) {
        await FilesManager.loadFile(filepath, listItem);
    },
    
    // Filename editing
    cancelFilenameEdit() {
        FilesManager.cancelFilenameEdit();
    },
    
    resetFilename() {
        FilesManager.resetFilename();
    },
    
    async saveFilename() {
        await FilesManager.saveFilename(
            this.showButtonStatus.bind(this),
            this.loadFiles.bind(this),
            this.loadHistory.bind(this)
        );
    },

    // Album art functions
    handleArtUpload(event) {
        const file = event.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = (e) => {
            State.pendingAlbumArt = e.target.result;
            State.shouldRemoveArt = false;
            
            const artDisplay = document.getElementById('art-display');
            artDisplay.innerHTML = `<img src="${State.pendingAlbumArt}" class="album-art">`;
            document.querySelector('.delete-art-btn').style.display = 'block';
            document.querySelector('.save-image-btn').style.display = 'block';
            document.querySelector('.apply-folder-btn').style.display = 'block';
            
            this.showStatus('Image loaded. Click "Save Image" to save only the image, or "Save" to save all changes.', 'success');
        };
        reader.readAsDataURL(file);
        
        event.target.value = '';
    },

    deleteAlbumArt() {
        const button = document.querySelector('.delete-art-btn');
        State.shouldRemoveArt = true;
        State.pendingAlbumArt = null;
        
        const artDisplay = document.getElementById('art-display');
        artDisplay.innerHTML = '<div class="album-art-placeholder">No album art</div>';
        document.querySelector('.delete-art-btn').style.display = 'none';
        document.querySelector('.save-image-btn').style.display = 'none';
        document.querySelector('.apply-folder-btn').style.display = 'none';
        
        this.showButtonStatus(button, 'Marked for deletion', 'warning', 2000);
    },

    async saveAlbumArt() {
        if (!State.currentFile || !State.pendingAlbumArt) return;
        
        const button = document.querySelector('.save-image-btn');
        button.disabled = true;
        this.showButtonStatus(button, 'Saving...', 'processing');
        
        try {
            const result = await API.setMetadata(State.currentFile, { art: State.pendingAlbumArt });
          
            if (result.status === 'success') {
                this.showButtonStatus(button, 'Saved!', 'success');
                State.currentAlbumArt = State.pendingAlbumArt;
                State.pendingAlbumArt = null;
                
                setTimeout(() => {
                    document.querySelector('.save-image-btn').style.display = 'none';
                    document.querySelector('.apply-folder-btn').style.display = 'none';
                }, 2000);
                
                this.loadHistory();
            } else {
                this.showButtonStatus(button, 'Error', 'error');
            }
        } catch (err) {
            console.error('Error saving album art:', err);
            this.showButtonStatus(button, 'Error', 'error');
        }
        
        button.disabled = false;
    },

    async applyArtToFolder() {
        if (!State.currentFile || (!State.pendingAlbumArt && !State.currentAlbumArt)) return;
        
        const button = document.querySelector('.apply-folder-btn');
        const artToApply = State.pendingAlbumArt || (State.currentAlbumArt ? `data:image/jpeg;base64,${State.currentAlbumArt}` : null);
        if (!artToApply) {
            this.showButtonStatus(button, 'No art', 'error', 2000);
            return;
        }
        
        const folderPath = State.currentFile.substring(0, State.currentFile.lastIndexOf('/'));
        
        if (!confirm(`Apply this album art to all files in the folder "${folderPath || 'root'}"? This will replace any existing album art.`)) {
            return;
        }
        
        button.disabled = true;
        this.setFormEnabled(false);
        this.showButtonStatus(button, 'Applying...', 'processing');
        
        try {
            const result = await API.applyArtToFolder(folderPath, artToApply);

            if (result.status === 'success') {
                this.showButtonStatus(button, `Applied to ${result.filesUpdated} files!`, 'success', 3000);
                
                if (State.pendingAlbumArt) {
                    State.currentAlbumArt = State.pendingAlbumArt;
                    State.pendingAlbumArt = null;
                    setTimeout(() => {
                        document.querySelector('.save-image-btn').style.display = 'none';
                        document.querySelector('.apply-folder-btn').style.display = 'none';
                    }, 3000);
                }
                
                this.loadHistory();
            } else {
                this.showButtonStatus(button, result.error || 'Error', 'error');
            }
        } catch (err) {
            console.error('Error applying album art to folder:', err);
            this.showButtonStatus(button, 'Error', 'error');
        }
        
        button.disabled = false;
        this.setFormEnabled(true);
    },

    // History functionality
    async loadHistory() {
        try {
            const data = await API.loadHistory();
            State.historyActions = data.actions;
            this.updateHistoryList();
        } catch (err) {
            console.error('Error loading history:', err);
            document.getElementById('history-list').innerHTML = '<div class="history-error">Error loading history</div>';
        }
    },
    
    updateHistoryList() {
        const historyList = document.getElementById('history-list');
        historyList.innerHTML = '';
        
        if (State.historyActions.length === 0) {
            historyList.innerHTML = '<div class="history-loading">No editing history yet</div>';
            return;
        }
        
        State.historyActions.forEach(action => {
            const item = document.createElement('div');
            item.className = 'history-item';
            if (action.is_undone) {
                item.className += ' undone';
            }
            if (State.selectedHistoryAction === action.id) {
                item.className += ' selected';
            }
            
            const timestamp = new Date(action.timestamp * 1000);
            const timeStr = timestamp.toLocaleTimeString();
            const dateStr = timestamp.toLocaleDateString();
            
            const timeDiv = document.createElement('div');
            timeDiv.className = 'history-item-time';
            timeDiv.textContent = `${dateStr} ${timeStr}`;
            
            const descDiv = document.createElement('div');
            descDiv.className = 'history-item-description';
            descDiv.textContent = action.description;
            
            const typeDiv = document.createElement('div');
            typeDiv.className = 'history-item-type';
            typeDiv.textContent = action.action_type.replace(/_/g, ' ');
            
            item.appendChild(timeDiv);
            item.appendChild(descDiv);
            item.appendChild(typeDiv);
            
            // Add action buttons for selected item
            if (State.selectedHistoryAction === action.id) {
                const actionsDiv = document.createElement('div');
                actionsDiv.className = 'history-item-actions';
                
                const undoBtn = document.createElement('button');
                undoBtn.className = 'history-btn undo-btn';
                undoBtn.id = 'undo-btn';
                undoBtn.textContent = '↶ Undo';
                undoBtn.disabled = action.is_undone;
                undoBtn.onclick = (e) => {
                    e.stopPropagation();
                    this.undoAction();
                };
                
                const redoBtn = document.createElement('button');
                redoBtn.className = 'history-btn redo-btn';
                redoBtn.id = 'redo-btn';
                redoBtn.textContent = '↷ Redo';
                redoBtn.disabled = !action.is_undone;
                redoBtn.onclick = (e) => {
                    e.stopPropagation();
                    this.redoAction();
                };
                
                actionsDiv.appendChild(undoBtn);
                actionsDiv.appendChild(redoBtn);
                item.appendChild(actionsDiv);
            }
            
            item.onclick = () => this.selectHistoryAction(action.id);
            
            historyList.appendChild(item);
        });
    },
    
    async selectHistoryAction(actionId, skipListUpdate = false) {
        State.selectedHistoryAction = actionId;
        
        // Update list UI - this will recreate all items with correct button states
        if (!skipListUpdate) {
            this.updateHistoryList();
        }
        
        // Load details
        try {
            const details = await API.getHistoryAction(actionId);
            this.displayHistoryDetails(details);
        } catch (err) {
            console.error('Error loading action details:', err);
            document.getElementById('history-details').innerHTML = '<div class="history-error">Error loading details</div>';
        }
    },
    
    displayHistoryDetails(details) {
        const detailsContainer = document.getElementById('history-details');
        detailsContainer.innerHTML = '';
        
        // Action type
        const typeSection = document.createElement('div');
        typeSection.className = 'history-detail-section';
        const typeLabel = document.createElement('div');
        typeLabel.className = 'history-detail-label';
        typeLabel.textContent = 'Action Type';
        const typeValue = document.createElement('div');
        typeValue.className = 'history-detail-value';
        typeValue.textContent = details.action_type.replace(/_/g, ' ');
        typeSection.appendChild(typeLabel);
        typeSection.appendChild(typeValue);
        detailsContainer.appendChild(typeSection);
        
        // Files affected
        const filesSection = document.createElement('div');
        filesSection.className = 'history-detail-section';
        const filesLabel = document.createElement('div');
        filesLabel.className = 'history-detail-label';
        filesLabel.textContent = `Files Affected (${details.file_count})`;
        filesSection.appendChild(filesLabel);
        
        if (details.file_count === 1) {
            const fileValue = document.createElement('div');
            fileValue.className = 'history-detail-value';
            fileValue.textContent = details.files[0];
            filesSection.appendChild(fileValue);
        } else {
            const filesList = document.createElement('div');
            filesList.className = 'history-detail-value';
            filesList.textContent = `${details.file_count} files in folder`;
            filesSection.appendChild(filesList);
        }
        detailsContainer.appendChild(filesSection);
        
        // Field changes
        if (details.field && details.action_type !== 'album_art_change' && details.action_type !== 'album_art_delete') {
            const fieldSection = document.createElement('div');
            fieldSection.className = 'history-detail-section';
            const fieldLabel = document.createElement('div');
            fieldLabel.className = 'history-detail-label';
            fieldLabel.textContent = `Field: ${details.field}`;
            fieldSection.appendChild(fieldLabel);
            detailsContainer.appendChild(fieldSection);
        }
        
        // Changes
        if (details.changes && details.changes.length > 0) {
            const changesSection = document.createElement('div');
            changesSection.className = 'history-detail-section';
            const changesLabel = document.createElement('div');
            changesLabel.className = 'history-detail-label';
            changesLabel.textContent = 'Changes';
            changesSection.appendChild(changesLabel);
            
            const changesList = document.createElement('div');
            changesList.className = 'history-detail-changes';
            
            details.changes.forEach(change => {
                const changeItem = document.createElement('div');
                changeItem.className = 'history-change-item';
                
                const fileDiv = document.createElement('div');
                fileDiv.className = 'history-change-file';
                fileDiv.textContent = change.file;
                
                const valuesDiv = document.createElement('div');
                valuesDiv.className = 'history-change-values';
                
                if (change.old_value) {
                    const oldSpan = document.createElement('span');
                    oldSpan.className = 'history-change-old';
                    oldSpan.textContent = change.old_value;
                    valuesDiv.appendChild(oldSpan);
                    
                    const arrow = document.createElement('span');
                    arrow.className = 'history-change-arrow';
                    arrow.textContent = ' → ';
                    valuesDiv.appendChild(arrow);
                }
                
                const newSpan = document.createElement('span');
                newSpan.className = 'history-change-new';
                newSpan.textContent = change.new_value || '(cleared)';
                valuesDiv.appendChild(newSpan);
                
                changeItem.appendChild(fileDiv);
                changeItem.appendChild(valuesDiv);
                changesList.appendChild(changeItem);
            });
            
            changesSection.appendChild(changesList);
            
            if (details.more_files) {
                const moreDiv = document.createElement('div');
                moreDiv.className = 'history-more-files';
                moreDiv.textContent = `...and ${details.more_files} more files`;
                changesSection.appendChild(moreDiv);
            }
            
            detailsContainer.appendChild(changesSection);
        }
        
        // Special handling for file rename
        if (details.action_type === 'file_rename') {
            const renameSection = document.createElement('div');
            renameSection.className = 'history-detail-section';
            const renameLabel = document.createElement('div');
            renameLabel.className = 'history-detail-label';
            renameLabel.textContent = 'Rename Details';
            renameSection.appendChild(renameLabel);
            
            const renameValues = document.createElement('div');
            renameValues.className = 'history-change-values';
            
            const oldSpan = document.createElement('span');
            oldSpan.className = 'history-change-old';
            oldSpan.textContent = details.old_name;
            
            const arrow = document.createElement('span');
            arrow.className = 'history-change-arrow';
            arrow.textContent = ' → ';
            
            const newSpan = document.createElement('span');
            newSpan.className = 'history-change-new';
            newSpan.textContent = details.new_name;
            
            renameValues.appendChild(oldSpan);
            renameValues.appendChild(arrow);
            renameValues.appendChild(newSpan);
            
            renameSection.appendChild(renameValues);
            detailsContainer.appendChild(renameSection);
        }
        
        // Album art changes
        if (details.action_type === 'album_art_change' || details.action_type === 'album_art_delete') {
            const artSection = document.createElement('div');
            artSection.className = 'history-detail-section';
            const artLabel = document.createElement('div');
            artLabel.className = 'history-detail-label';
            artLabel.textContent = 'Album Art Change';
            artSection.appendChild(artLabel);
            
            const artValue = document.createElement('div');
            artValue.className = 'history-detail-value';
            if (details.has_old_art && details.has_new_art) {
                artValue.textContent = 'Replaced existing album art';
            } else if (!details.has_old_art && details.has_new_art) {
                artValue.textContent = 'Added new album art';
            } else if (details.has_old_art && !details.has_new_art) {
                artValue.textContent = 'Removed album art';
            }
            artSection.appendChild(artValue);
            detailsContainer.appendChild(artSection);
        }
    },
                
    async undoAction() {
        if (!State.selectedHistoryAction) return;
        
        try {
            // Get action details before undo
            const actionDetails = await API.getHistoryAction(State.selectedHistoryAction);
            
            // Remember current state
            const currentFileBefore = State.currentFile;
            const currentPathBefore = State.currentPath;
            
            console.log('Undoing action:', actionDetails.action_type);
            console.log('Current file before undo:', currentFileBefore);
            
            // Perform the undo
            const result = await API.undoAction(State.selectedHistoryAction);
            
            if (result.status === 'success' || result.status === 'partial') {
                this.showStatus(`Undo successful! ${result.filesUpdated} file(s) reverted.`, 'success');
                
                // Always reload the file list
                await this.loadFiles(currentPathBefore);
                
                // Handle file updates based on action type
                if (result.newPath && actionDetails.action_type === 'file_rename') {
                    // Use the newPath provided by the backend
                    console.log('File rename undo - new path from backend:', result.newPath);
                    
                    State.currentFile = result.newPath;
                    State.originalFilename = result.newPath.split('/').pop();
                    document.getElementById('current-filename').textContent = State.originalFilename;
                    
                    // Reload metadata after a short delay
                    setTimeout(async () => {
                        const listItem = document.querySelector(`#file-list li[data-filepath="${result.newPath}"]`);
                        if (listItem) {
                            await this.loadFile(result.newPath, listItem);
                        } else {
                            // Create temporary item if not found
                            const tempItem = document.createElement('li');
                            tempItem.dataset.filepath = result.newPath;
                            await this.loadFile(result.newPath, tempItem);
                        }
                    }, 100);
                } else if (currentFileBefore) {
                    // For non-rename actions, just reload the current file
                    const listItem = document.querySelector(`#file-list li[data-filepath="${currentFileBefore}"]`);
                    if (listItem) {
                        await this.loadFile(currentFileBefore, listItem);
                    }
                }
                
                // Update the action in our local state if provided
                if (result.action) {
                    const actionIndex = State.historyActions.findIndex(a => a.id === result.action.id);
                    if (actionIndex !== -1) {
                        State.historyActions[actionIndex] = result.action;
                    }
                }
                
                // Update the history list UI with the updated data
                this.updateHistoryList();
                
            } else {
                this.showStatus(result.error || 'Undo failed', 'error');
                
                // Update the action state even on error
                if (result.action) {
                    const actionIndex = State.historyActions.findIndex(a => a.id === result.action.id);
                    if (actionIndex !== -1) {
                        State.historyActions[actionIndex] = result.action;
                    }
                    this.updateHistoryList();
                }
            }
        } catch (err) {
            console.error('Error undoing action:', err);
            this.showStatus('Error undoing action', 'error');
        }
    },
    
    async redoAction() {
        if (!State.selectedHistoryAction) return;
        
        try {
            // Get action details before redo
            const actionDetails = await API.getHistoryAction(State.selectedHistoryAction);
            
            // Remember current state
            const currentFileBefore = State.currentFile;
            const currentPathBefore = State.currentPath;
            
            console.log('Redoing action:', actionDetails.action_type);
            console.log('Current file before redo:', currentFileBefore);
            
            // Perform the redo
            const result = await API.redoAction(State.selectedHistoryAction);
            
            if (result.status === 'success' || result.status === 'partial') {
                this.showStatus(`Redo successful! ${result.filesUpdated} file(s) updated.`, 'success');
                
                // Always reload the file list
                await this.loadFiles(currentPathBefore);
                
                // Handle file updates based on action type
                if (result.newPath && actionDetails.action_type === 'file_rename') {
                    // Use the newPath provided by the backend
                    console.log('File rename redo - new path from backend:', result.newPath);
                    
                    State.currentFile = result.newPath;
                    State.originalFilename = result.newPath.split('/').pop();
                    document.getElementById('current-filename').textContent = State.originalFilename;
                    
                    // Reload metadata after a short delay
                    setTimeout(async () => {
                        const listItem = document.querySelector(`#file-list li[data-filepath="${result.newPath}"]`);
                        if (listItem) {
                            await this.loadFile(result.newPath, listItem);
                        } else {
                            // Create temporary item if not found
                            const tempItem = document.createElement('li');
                            tempItem.dataset.filepath = result.newPath;
                            await this.loadFile(result.newPath, tempItem);
                        }
                    }, 100);
                } else if (currentFileBefore) {
                    // For non-rename actions, just reload the current file
                    const listItem = document.querySelector(`#file-list li[data-filepath="${currentFileBefore}"]`);
                    if (listItem) {
                        await this.loadFile(currentFileBefore, listItem);
                    }
                }
                
                // Update the action in our local state if provided
                if (result.action) {
                    const actionIndex = State.historyActions.findIndex(a => a.id === result.action.id);
                    if (actionIndex !== -1) {
                        State.historyActions[actionIndex] = result.action;
                    }
                }
                
                // Update the history list UI with the updated data
                this.updateHistoryList();
                
                // Force re-selection of the current action to ensure proper button states
                // Use setTimeout to ensure DOM has updated
                //setTimeout(async () => {
                //    await this.selectHistoryAction(State.selectedHistoryAction, true);
                //}, 0);
                
            } else {
                this.showStatus(result.error || 'Redo failed', 'error');
                
                // Update the action state even on error
                if (result.action) {
                    const actionIndex = State.historyActions.findIndex(a => a.id === result.action.id);
                    if (actionIndex !== -1) {
                        State.historyActions[actionIndex] = result.action;
                    }
                    this.updateHistoryList();
                }
            }
        } catch (err) {
            console.error('Error redoing action:', err);
            this.showStatus('Error redoing action', 'error');
        }
    },
    
    async clearHistory() {
        if (!confirm('Are you sure you want to clear all editing history? This action cannot be undone.')) {
            return;
        }
        
        const button = document.querySelector('.history-clear-btn');
        const originalContent = button.innerHTML;
        button.disabled = true;
        button.innerHTML = '<span class="spinner"></span> Clearing...';
        
        try {
            const result = await API.clearHistory();
            
            if (result.status === 'success') {
                this.showStatus('History cleared successfully', 'success');
                State.historyActions = [];
                State.selectedHistoryAction = null;
                this.updateHistoryList();
                document.getElementById('history-details').innerHTML = '<div class="history-details-empty">Select an action to view details</div>';
            } else {
                this.showStatus(result.error || 'Failed to clear history', 'error');
            }
        } catch (err) {
            console.error('Error clearing history:', err);
            this.showStatus('Error clearing history', 'error');
        }
        
        button.disabled = false;
        button.innerHTML = originalContent;
    },
    
    toggleHistoryPanel() {
        const panel = document.getElementById('history-panel');
        const metadataContent = document.querySelector('.metadata-content');  // ADD THIS LINE
        
        if (panel.classList.contains('collapsed')) {
            panel.classList.remove('collapsed');
            panel.classList.add('expanded');
            // Apply the stored height
            panel.style.height = `${State.historyPanelHeight}px`;
            State.historyPanelExpanded = true;
            
            // ADD THIS: Set padding-bottom to accommodate expanded panel
            metadataContent.style.paddingBottom = `${State.historyPanelHeight + 20}px`;
            
            const historyList = document.querySelector('.history-list');
            const historyDetails = document.querySelector('.history-details');
            if (historyList && historyDetails) {
                historyList.style.flex = `0 0 ${State.historyListWidth}%`;
                historyDetails.style.flex = `0 0 ${100 - State.historyListWidth}%`;
            }
            
            // Load history if not already loaded
            if (State.historyActions.length === 0) {
                this.loadHistory();
            }
        } else {
            // Store current height before collapsing
            if (panel.offsetHeight > 50) {
                State.historyPanelHeight = panel.offsetHeight;
            }
            panel.classList.remove('expanded');
            panel.classList.add('collapsed');
            panel.style.height = '';  // Reset to CSS default
            State.historyPanelExpanded = false;
            
            // ADD THIS: Remove padding when collapsed
            metadataContent.style.paddingBottom = '';
        }
    },
    
    startHistoryAutoRefresh() {
        // Auto-refresh history every 5 seconds when panel is expanded
        setInterval(() => {
            if (State.historyPanelExpanded) {
                this.loadHistory();
            }
        }, 5000);
    },

    // Utility functions
    setFormEnabled(enabled) {
        UIUtils.setFormEnabled(enabled);
    },

    showStatus(message, type) {
        UIUtils.showStatus(message, type);
    },

    hideStatus() {
        UIUtils.hideStatus();
    },
};

// Global function bindings for onclick handlers in HTML
function setSortMethod(method) {
    window.MetadataRemote.Navigation.Tree.setSortMethod(method);
}

function saveFilename() {
    AudioMetadataEditor.saveFilename();
}

function resetFilename() {
    AudioMetadataEditor.resetFilename();
}

function cancelFilenameEdit() {
    AudioMetadataEditor.cancelFilenameEdit();
}

function handleArtUpload(event) {
    AudioMetadataEditor.handleArtUpload(event);
}

function deleteAlbumArt() {
    AudioMetadataEditor.deleteAlbumArt();
}

function saveAlbumArt() {
    AudioMetadataEditor.saveAlbumArt();
}

function applyArtToFolder() {
    AudioMetadataEditor.applyArtToFolder();
}

function applyFieldToFolder(field) {
    MetadataEditor.applyFieldToFolder(field, 
        AudioMetadataEditor.showButtonStatus.bind(AudioMetadataEditor),
        AudioMetadataEditor.setFormEnabled.bind(AudioMetadataEditor)
    );
}

function saveFieldToFile(field) {
    MetadataEditor.saveFieldToFile(field,
        AudioMetadataEditor.showButtonStatus.bind(AudioMetadataEditor)
    );
}

function save() {
    MetadataEditor.save(
        AudioMetadataEditor.showButtonStatus.bind(AudioMetadataEditor)
    );
}

function resetForm() {
    MetadataEditor.resetForm(
        AudioMetadataEditor.showButtonStatus.bind(AudioMetadataEditor)
    );
}

function toggleHistoryPanel() {
    AudioMetadataEditor.toggleHistoryPanel();
}

function undoAction() {
    AudioMetadataEditor.undoAction();
}

function redoAction() {
    AudioMetadataEditor.redoAction();
}
function clearHistory() {
    AudioMetadataEditor.clearHistory();
}

// Filename edit click handler
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('current-filename').onclick = function() {
        if (!State.currentFile) return;
        
        document.getElementById('current-filename').style.display = 'none';
        document.querySelector('.filename-edit').style.display = 'flex';
        document.getElementById('filename-input').value = State.originalFilename;
        document.getElementById('filename-input').focus();
    };
    
    // Initialize the application
    AudioMetadataEditor.init();
});

// Filter box on input handler
const filter_box = document.getElementById('filter-box');
filter_box.addEventListener('input', (e) => {
  const value = e.target.value.toLowerCase().trim();
  const file_list_li = document.querySelectorAll('#file-list > li');
  for (let i = 0; i < file_list_li.length; i++) {
    const li = file_list_li[i];
    const file_name = li.querySelector('.file-info > div').innerText.toLowerCase();
    // if the filterd value does not match name, hide item
    if (value.length > 0 && !file_name.includes(value)) {
      li.setAttribute("aria-hidden", "true");
    } else {
      li.removeAttribute("aria-hidden");
    }
  }
});
