/**
 * History Management Module for Metadata Remote
 * Handles all history UI operations including display, undo/redo, and panel management
 */

(function() {
    // Create namespace if it doesn't exist
    window.MetadataRemote = window.MetadataRemote || {};
    window.MetadataRemote.History = window.MetadataRemote.History || {};
    
    // Create shortcuts
    const State = window.MetadataRemote.State;
    const API = window.MetadataRemote.API;
    const UIUtils = window.MetadataRemote.UI.Utilities;
    
    // Store callbacks that will be set during initialization
    let showStatusCallback = null;
    let loadFilesCallback = null;
    let loadFileCallback = null;
    
    window.MetadataRemote.History.Manager = {
        /**
         * Initialize the history manager with required callbacks
         * @param {Object} callbacks - Object containing callback functions
         */
        init(callbacks) {
            showStatusCallback = callbacks.showStatus;
            loadFilesCallback = callbacks.loadFiles;
            loadFileCallback = callbacks.loadFile;
        },
        
        /**
         * Load history from API and update UI
         */
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
        
        /**
         * Update the history list UI
         */
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
                    undoBtn.className = 'history-btn undo-btn btn-status';
                    undoBtn.id = 'undo-btn';
                    undoBtn.innerHTML = '<span class="btn-status-content">↶ Undo</span><span class="btn-status-message"></span>';
                    undoBtn.disabled = action.is_undone;
                    undoBtn.onclick = (e) => {
                        e.stopPropagation();
                        this.undoAction();
                    };
                    
                    const redoBtn = document.createElement('button');
                    redoBtn.className = 'history-btn redo-btn btn-status';
                    redoBtn.id = 'redo-btn';
                    redoBtn.innerHTML = '<span class="btn-status-content">↷ Redo</span><span class="btn-status-message"></span>';
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
        
        /**
         * Select a history action and display its details
         * @param {string} actionId - ID of the action to select
         * @param {boolean} skipListUpdate - Whether to skip updating the list UI
         */
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
        
        /**
         * Display detailed information about a history action
         * @param {Object} details - Action details from API
         */
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
        
        /**
         * Undo the selected action
         */
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
                    showStatusCallback(`Undo successful! ${result.filesUpdated} file(s) reverted.`, 'success');
                    
                    // Always reload the file list
                    await loadFilesCallback(currentPathBefore);
                    
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
                                await loadFileCallback(result.newPath, listItem);
                            } else {
                                // Create temporary item if not found
                                const tempItem = document.createElement('li');
                                tempItem.dataset.filepath = result.newPath;
                                await loadFileCallback(result.newPath, tempItem);
                            }
                        }, 100);
                    } else if (currentFileBefore) {
                        // For non-rename actions, just reload the current file
                        const listItem = document.querySelector(`#file-list li[data-filepath="${currentFileBefore}"]`);
                        if (listItem) {
                            await loadFileCallback(currentFileBefore, listItem);
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
                    showStatusCallback(result.error || 'Undo failed', 'error');
                    
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
                showStatusCallback('Error undoing action', 'error');
            }
        },
        
        /**
         * Redo the selected action
         */
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
                    showStatusCallback(`Redo successful! ${result.filesUpdated} file(s) updated.`, 'success');
                    
                    // Always reload the file list
                    await loadFilesCallback(currentPathBefore);
                    
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
                                await loadFileCallback(result.newPath, listItem);
                            } else {
                                // Create temporary item if not found
                                const tempItem = document.createElement('li');
                                tempItem.dataset.filepath = result.newPath;
                                await loadFileCallback(result.newPath, tempItem);
                            }
                        }, 100);
                    } else if (currentFileBefore) {
                        // For non-rename actions, just reload the current file
                        const listItem = document.querySelector(`#file-list li[data-filepath="${currentFileBefore}"]`);
                        if (listItem) {
                            await loadFileCallback(currentFileBefore, listItem);
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
                    showStatusCallback(result.error || 'Redo failed', 'error');
                    
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
                showStatusCallback('Error redoing action', 'error');
            }
        },
        
        /**
         * Clear all history
         */
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
                    showStatusCallback('History cleared successfully', 'success');
                    State.historyActions = [];
                    State.selectedHistoryAction = null;
                    this.updateHistoryList();
                    document.getElementById('history-details').innerHTML = '<div class="history-details-empty">Select an action to view details</div>';
                } else {
                    showStatusCallback(result.error || 'Failed to clear history', 'error');
                }
            } catch (err) {
                console.error('Error clearing history:', err);
                showStatusCallback('Error clearing history', 'error');
            }
            
            button.disabled = false;
            button.innerHTML = originalContent;
        },
        
        /**
         * Toggle the history panel visibility
         */
        toggleHistoryPanel() {
            const panel = document.getElementById('history-panel');
            const metadataContent = document.querySelector('.metadata-content');
            
            if (panel.classList.contains('collapsed')) {
                panel.classList.remove('collapsed');
                panel.classList.add('expanded');
                // Apply the stored height
                panel.style.height = `${State.historyPanelHeight}px`;
                State.historyPanelExpanded = true;
                
                // Set padding-bottom to accommodate expanded panel
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
                
                // Remove padding when collapsed
                metadataContent.style.paddingBottom = '';
            }
        },
        
        /**
         * Start auto-refresh timer for history
         */
        startHistoryAutoRefresh() {
            // Auto-refresh history every 5 seconds when panel is expanded
            setInterval(() => {
                if (State.historyPanelExpanded) {
                    this.loadHistory();
                }
            }, 5000);
        }
    };
})();
