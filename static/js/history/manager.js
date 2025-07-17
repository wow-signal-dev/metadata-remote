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
                    undoBtn.disabled = action.is_undone || State.processingUndoActionId === action.id;
                    undoBtn.onclick = (e) => {
                        e.stopPropagation();
                        this.undoAction();
                    };

                    if (State.processingUndoActionId === action.id) {
                        window.MetadataRemote.UI.ButtonStatus.showButtonStatus(undoBtn, '', 'processing');
                    }
                    
                    const redoBtn = document.createElement('button');
                    redoBtn.className = 'history-btn redo-btn btn-status';
                    redoBtn.id = 'redo-btn';
                    redoBtn.innerHTML = '<span class="btn-status-content">↷ Redo</span><span class="btn-status-message"></span>';
                    redoBtn.disabled = !action.is_undone || State.processingRedoActionId === action.id;
                    redoBtn.onclick = (e) => {
                        e.stopPropagation();
                        this.redoAction();
                    };

                    if (State.processingRedoActionId === action.id) {
                        window.MetadataRemote.UI.ButtonStatus.showButtonStatus(redoBtn, '', 'processing');
                    }
                    
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
                // Create a container for the file list
                const filesListContainer = document.createElement('div');
                filesListContainer.className = 'history-detail-value';
                filesListContainer.style.maxHeight = '200px';
                filesListContainer.style.overflowY = 'auto';
                
                // Add each file to the list (showing only filename, not full path)
                details.files.forEach(file => {
                    const fileItem = document.createElement('div');
                    fileItem.className = 'history-change-file';
                    // Extract just the filename from the full path
                    const filename = file.split('/').pop();
                    fileItem.textContent = filename;
                    // Store full path as title for tooltip on hover
                    fileItem.title = file;
                    filesListContainer.appendChild(fileItem);
                });
                
                filesSection.appendChild(filesListContainer);
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

            // Track that we're processing this action
            State.processingUndoActionId = State.selectedHistoryAction;
            this.updateHistoryList(); // Re-render to show processing state
            
            try {
                // Get action details before undo
                const actionDetails = await API.getHistoryAction(State.selectedHistoryAction);
                
                // Remember current state
                const currentFileBefore = State.currentFile;
                const currentPathBefore = State.currentPath;
                
                
                // Perform the undo
                const result = await API.undoAction(State.selectedHistoryAction);
                
                if (result.status === 'success' || result.status === 'partial') {
                    showStatusCallback(`Undo successful! ${result.filesUpdated} file(s) reverted.`, 'success');
                    
                    // Always reload the file list
                    await loadFilesCallback(currentPathBefore);
                    
                    // Handle file updates based on action type
                    if (result.newPath && actionDetails.action_type === 'file_rename') {
                        // Use the newPath provided by the backend
                        
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
            } finally {
                // Clear processing state
                State.processingUndoActionId = null;
                this.updateHistoryList(); // Re-render to clear processing state
            }
        },
        
        /**
         * Redo the selected action
         */
        async redoAction() {
            if (!State.selectedHistoryAction) return;

            // Track that we're processing this action
            State.processingRedoActionId = State.selectedHistoryAction;
            this.updateHistoryList(); // Re-render to show processing state
            
            try {
                // Get action details before redo
                const actionDetails = await API.getHistoryAction(State.selectedHistoryAction);
                
                // Remember current state
                const currentFileBefore = State.currentFile;
                const currentPathBefore = State.currentPath;
                
                
                // Perform the redo
                const result = await API.redoAction(State.selectedHistoryAction);
                
                if (result.status === 'success' || result.status === 'partial') {
                    showStatusCallback(`Redo successful! ${result.filesUpdated} file(s) updated.`, 'success');
                    
                    // Always reload the file list
                    await loadFilesCallback(currentPathBefore);
                    
                    // Handle file updates based on action type
                    if (result.newPath && actionDetails.action_type === 'file_rename') {
                        // Use the newPath provided by the backend
                        
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
            } finally {
                // Clear processing state
                State.processingRedoActionId = null;
                this.updateHistoryList(); // Re-render to clear processing state
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
        
    };
})();
