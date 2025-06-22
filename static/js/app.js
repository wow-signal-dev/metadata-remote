/**
 * Metadata Remote - Main Application JavaScript
 * Handles all UI interactions and state management
 */

const AudioMetadataEditor = {
    // Centralized state management
    state: {
        currentFile: null,
        currentPath: '',
        selectedListItem: null,
        selectedTreeItem: null,
        originalFilename: '',
        currentAlbumArt: null,
        pendingAlbumArt: null,
        shouldRemoveArt: false,
        treeData: {},
        expandedFolders: new Set(),
        currentSort: { method: 'name', direction: 'asc' },
        focusedPane: 'folders',
        loadFileDebounceTimer: null,
        originalMetadata: {},
        currentlyPlayingFile: null,
        savedPaneSizes: { folders: 25, files: 35 },
        isResizing: false,
        currentDivider: null,
        startX: 0,
        startWidths: {},
        // New inference state
        inferenceActive: {},
        inferenceAbortControllers: {},
        // History state
        historyActions: [],
        selectedHistoryAction: null,
        historyPanelExpanded: false,
        historyRefreshTimer: null,
        historyPanelHeight: 400,
        historyListWidth: 50,
        loadFileRequestId: 0,
        keyRepeatTimer: null,
        keyRepeatDelayTimer: null,
        keyHeldDown: null,
        keyRepeatDelay: 200,
        keyRepeatInterval: 40,
        isKeyRepeating: false
    },

    // Initialize the application
    init() {
        this.audioPlayer = document.getElementById('audio-player');
        this.setupAudioPlayer();
        this.loadTree();
        this.updateSortUI();
        this.setupKeyboardNavigation();
        this.setupMetadataFieldListeners();
        this.initializePaneResize();
        this.initializeHistoryPanelResize();
        this.setupInferenceHandlers();
        this.loadHistory();
        const historyPanel = document.getElementById('history-panel');
        const metadataContent = document.querySelector('.metadata-content');
        if (historyPanel.classList.contains('expanded')) {
            metadataContent.style.paddingBottom = `${this.state.historyPanelHeight + 20}px`;
        }
    },

    // API helper with centralized error handling
    async apiCall(url, options = {}) {
        try {
            const response = await fetch(url, options);
            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || 'Request failed');
            }
            return await response.json();
        } catch (error) {
            console.error(`API error for ${url}:`, error);
            throw error;
        }
    },
    
    // Button status management
    showButtonStatus(button, message, type = 'processing', duration = 3000) {
        if (!button || !button.classList.contains('btn-status')) return;
        
        // Clear any existing timeout
        if (button._statusTimeout) {
            clearTimeout(button._statusTimeout);
        }
        
        // Store original width if not already stored
        if (!button._originalWidth) {
            button._originalWidth = window.getComputedStyle(button).width;
        }
        
        // Remove all status classes
        button.classList.remove('processing', 'success', 'error', 'warning');
        
        // Add new status class
        button.classList.add(type);
        
        // Check if this is an apply-field button (File/Folder buttons)
        const isApplyFieldBtn = button.classList.contains('apply-field-btn');
        
        // Truncate very long messages
        const maxLength = 30;
        const displayMessage = message.length > maxLength ? 
            message.substring(0, maxLength - 3) + '...' : message;
        
        // Update message
        const messageEl = button.querySelector('.btn-status-message');
        if (messageEl) {
            if (isApplyFieldBtn) {
                // For File/Folder buttons, show only icons
                messageEl.textContent = '';
                if (type === 'processing') {
                    const spinner = document.createElement('span');
                    spinner.className = 'spinner';
                    messageEl.appendChild(spinner);
                } else {
                    const icons = {
                        success: '✓',
                        error: '✕',
                        warning: '⚠'
                    };
                    const iconSpan = document.createElement('span');
                    iconSpan.className = `status-icon ${type}`;
                    iconSpan.textContent = icons[type] || '';
                    messageEl.appendChild(iconSpan);
                }
                // Add tooltip with the actual message
                button.title = message;
            } else {
                // For other buttons, show icon + text as before
                if (type === 'processing') {
                    messageEl.textContent = '';
                    const spinner = document.createElement('span');
                    spinner.className = 'spinner';
                    messageEl.appendChild(spinner);
                    messageEl.appendChild(document.createTextNode(' ' + displayMessage));
                } else {
                    const icons = {
                        success: '✓',
                        error: '✕',
                        warning: '⚠'
                    };
                    messageEl.textContent = '';
                    const iconSpan = document.createElement('span');
                    iconSpan.className = `status-icon ${type}`;
                    iconSpan.textContent = icons[type] || '';
                    messageEl.appendChild(iconSpan);
                    messageEl.appendChild(document.createTextNode(' ' + displayMessage));
                }
                
                // Add title attribute for full message if truncated
                if (message.length > maxLength) {
                    button.title = message;
                }
            }
        }
        
        // Auto-clear status after duration (except for processing)
        if (type !== 'processing' && duration > 0) {
            button._statusTimeout = setTimeout(() => {
                this.clearButtonStatus(button);
            }, duration);
        }
    },
    
    clearButtonStatus(button) {
        if (!button || !button.classList.contains('btn-status')) return;
        
        if (button._statusTimeout) {
            clearTimeout(button._statusTimeout);
            delete button._statusTimeout;
        }
        
        button.classList.remove('processing', 'success', 'error', 'warning');
        button.title = ''; // Clear tooltip
        
        // Don't restore width for apply-field buttons
        if (!button.classList.contains('apply-field-btn') && button._originalWidth) {
            setTimeout(() => {
                button.style.width = '';
                delete button._originalWidth;
            }, 300);
        }
    },

    // Audio player setup and controls
    setupAudioPlayer() {
        this.audioPlayer.addEventListener('ended', () => this.stopPlayback());
        this.audioPlayer.addEventListener('error', (e) => {
            // Only show error if we're actually trying to play something
            if (this.state.currentlyPlayingFile && this.audioPlayer.src) {
                console.error('Audio playback error:', e);
                this.stopPlayback();
                this.showStatus('Error playing audio file', 'error');
            }
        });
    },

    togglePlayback(filepath, button) {
        if (this.state.currentlyPlayingFile === filepath && !this.audioPlayer.paused) {
            this.audioPlayer.pause();
            button.classList.remove('playing');
        } else {
            this.stopPlayback();
            this.state.currentlyPlayingFile = filepath;
            this.audioPlayer.src = `/stream/${encodeURIComponent(filepath)}`;
            this.audioPlayer.play()
                .then(() => button.classList.add('playing'))
                .catch(err => {
                    console.error('Error playing audio:', err);
                    this.showStatus('Error playing audio file', 'error');
                    this.stopPlayback();
                });
        }
    },

    stopPlayback() {
        if (!this.audioPlayer.paused) {
            this.audioPlayer.pause();
        }
        this.audioPlayer.src = '';
        this.state.currentlyPlayingFile = null;
        document.querySelectorAll('.play-button.playing').forEach(btn => {
            btn.classList.remove('playing');
        });
    },

    // Pane resize functionality
    initializePaneResize() {
        const container = document.querySelector('.container');
        const folders = document.querySelector('.folders');
        const files = document.querySelector('.files');
        const metadata = document.querySelector('.metadata');
        const divider1 = document.getElementById('divider1');
        const divider2 = document.getElementById('divider2');

        // Apply saved or default sizes
        folders.style.flex = `0 0 ${this.state.savedPaneSizes.folders}%`;
        files.style.flex = `0 0 ${this.state.savedPaneSizes.files}%`;
        metadata.style.flex = `1`;

        divider1.addEventListener('mousedown', (e) => this.startResize(e, 'divider1'));
        divider2.addEventListener('mousedown', (e) => this.startResize(e, 'divider2'));
    },

    startResize(e, dividerId) {
        const container = document.querySelector('.container');
        const folders = document.querySelector('.folders');
        const files = document.querySelector('.files');
        const metadata = document.querySelector('.metadata');

        this.state.isResizing = true;
        this.state.currentDivider = dividerId;
        this.state.startX = e.clientX;

        const containerWidth = container.offsetWidth;
        this.state.startWidths.folders = (folders.offsetWidth / containerWidth) * 100;
        this.state.startWidths.files = (files.offsetWidth / containerWidth) * 100;
        this.state.startWidths.metadata = (metadata.offsetWidth / containerWidth) * 100;

        document.getElementById(dividerId).classList.add('dragging');
        document.body.style.userSelect = 'none';
        document.body.style.cursor = 'col-resize';

        document.addEventListener('mousemove', this.handleResize.bind(this));
        document.addEventListener('mouseup', this.stopResize.bind(this));
    },

    handleResize(e) {
        if (!this.state.isResizing) return;

        const container = document.querySelector('.container');
        const folders = document.querySelector('.folders');
        const files = document.querySelector('.files');

        const containerWidth = container.offsetWidth;
        const deltaX = e.clientX - this.state.startX;
        const deltaPercent = (deltaX / containerWidth) * 100;

        if (this.state.currentDivider === 'divider1') {
            const newFoldersWidth = Math.max(15, Math.min(40, this.state.startWidths.folders + deltaPercent));
            const newFilesWidth = Math.max(20, Math.min(50, this.state.startWidths.files - deltaPercent));
            
            folders.style.flex = `0 0 ${newFoldersWidth}%`;
            files.style.flex = `0 0 ${newFilesWidth}%`;
        } else if (this.state.currentDivider === 'divider2') {
            const newFilesWidth = Math.max(20, Math.min(50, this.state.startWidths.files + deltaPercent));
            const remainingWidth = 100 - this.state.startWidths.folders - newFilesWidth;
            
            if (remainingWidth >= 30) {
                files.style.flex = `0 0 ${newFilesWidth}%`;
            }
        }
    },

    stopResize() {
        if (!this.state.isResizing) return;

        this.state.isResizing = false;

        if (this.state.currentDivider) {
            document.getElementById(this.state.currentDivider).classList.remove('dragging');
        }

        document.body.style.userSelect = '';
        document.body.style.cursor = '';

        const container = document.querySelector('.container');
        const folders = document.querySelector('.folders');
        const files = document.querySelector('.files');
        const containerWidth = container.offsetWidth;
        this.state.savedPaneSizes.folders = (folders.offsetWidth / containerWidth) * 100;
        this.state.savedPaneSizes.files = (files.offsetWidth / containerWidth) * 100;

        document.removeEventListener('mousemove', this.handleResize.bind(this));
        document.removeEventListener('mouseup', this.stopResize.bind(this));

        this.state.currentDivider = null;
    },
    
    startHistoryPaneResize(e) {
        e.preventDefault();
        e.stopPropagation();
        
        const historyContent = document.querySelector('.history-content');
        const historyList = document.querySelector('.history-list');
        
        this.state.isResizingHistoryPane = true;
        this.state.startX = e.clientX;
        this.state.startHistoryListWidth = (historyList.offsetWidth / historyContent.offsetWidth) * 100;
        
        document.getElementById('history-divider').classList.add('dragging');
        document.body.style.userSelect = 'none';
        document.body.style.cursor = 'col-resize';
        
        document.addEventListener('mousemove', this.handleHistoryPaneResize.bind(this));
        document.addEventListener('mouseup', this.stopHistoryPaneResize.bind(this));
    },
    
    handleHistoryPaneResize(e) {
        if (!this.state.isResizingHistoryPane) return;
        
        const historyContent = document.querySelector('.history-content');
        const historyList = document.querySelector('.history-list');
        const historyDetails = document.querySelector('.history-details');
        
        const contentWidth = historyContent.offsetWidth;
        const deltaX = e.clientX - this.state.startX;
        const deltaPercent = (deltaX / contentWidth) * 100;
        
        const newListWidth = Math.max(30, Math.min(70, this.state.startHistoryListWidth + deltaPercent));
        const newDetailsWidth = 100 - newListWidth;
        
        historyList.style.flex = `0 0 ${newListWidth}%`;
        historyDetails.style.flex = `0 0 ${newDetailsWidth}%`;
    },
    
    stopHistoryPaneResize() {
        if (!this.state.isResizingHistoryPane) return;
        
        this.state.isResizingHistoryPane = false;
        
        document.getElementById('history-divider').classList.remove('dragging');
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
        
        // Save the current width
        const historyContent = document.querySelector('.history-content');
        const historyList = document.querySelector('.history-list');
        this.state.historyListWidth = (historyList.offsetWidth / historyContent.offsetWidth) * 100;
        
        document.removeEventListener('mousemove', this.handleHistoryPaneResize.bind(this));
        document.removeEventListener('mouseup', this.stopHistoryPaneResize.bind(this));
    },
    
    // History panel resize functionality
    initializeHistoryPanelResize() {
        const historyHeader = document.querySelector('.history-header');
        let isResizingHistory = false;
        let startY = 0;
        let startHeight = 0;
        let hasDragged = false;
        
          // Handle both resize and click
        historyHeader.addEventListener('mousedown', (e) => {
            const panel = document.getElementById('history-panel');
            const isExpanded = panel.classList.contains('expanded');
            const rect = historyHeader.getBoundingClientRect();
            const isInResizeZone = e.clientY - rect.top <= 10;
            
            // Only allow resize if panel is expanded
            if (isInResizeZone && isExpanded) {
                // Start resize
                e.preventDefault();
                e.stopPropagation();
                isResizingHistory = true;
                hasDragged = false;
                startY = e.clientY;
                const panel = document.getElementById('history-panel');
                startHeight = panel.offsetHeight;
                
                document.body.classList.add('resizing-history');
                historyHeader.classList.add('resizing');
                
                const handleMouseMove = (e) => {
                    if (!isResizingHistory) return;
                    
                    // Consider it a drag if moved more than 3px
                    if (Math.abs(e.clientY - startY) > 3) {
                        hasDragged = true;
                    }
                    
                    const deltaY = startY - e.clientY;
                    const newHeight = Math.max(50, Math.min(window.innerHeight * 0.6, startHeight + deltaY));
                    
                    panel.style.height = `${newHeight}px`;
                    this.state.historyPanelHeight = newHeight;
                    
                    const metadataContent = document.querySelector('.metadata-content');
                    if (panel.classList.contains('expanded')) {
                        metadataContent.style.paddingBottom = `${newHeight + 20}px`;
                    }
                };
                
                const handleMouseUp = (e) => {
                    const wasResizing = isResizingHistory;
                    const didDrag = hasDragged;
                    
                    isResizingHistory = false;
                    document.body.classList.remove('resizing-history');
                    historyHeader.classList.remove('resizing');
                    historyHeader.classList.remove('resize-hover');
                    
                    document.removeEventListener('mousemove', handleMouseMove);
                    document.removeEventListener('mouseup', handleMouseUp);
                    
                    // Prevent the click if we were dragging
                    if (wasResizing && didDrag) {
                        e.stopPropagation();
                        e.preventDefault();
                    }
                };
                
                document.addEventListener('mousemove', handleMouseMove);
                document.addEventListener('mouseup', handleMouseUp);
            }
        });
        
        // Handle click separately
        historyHeader.addEventListener('click', (e) => {
            const panel = document.getElementById('history-panel');
            const isExpanded = panel.classList.contains('expanded');
            const rect = historyHeader.getBoundingClientRect();
            const isInResizeZone = e.clientY - rect.top <= 10;
            
            // Only check resize zone if panel is expanded
            if (!isExpanded || !isInResizeZone) {
                this.toggleHistoryPanel();
            }
        });
        
        // Update cursor on hover
        historyHeader.addEventListener('mousemove', (e) => {
            if (!isResizingHistory) {
                const panel = document.getElementById('history-panel');
                const isExpanded = panel.classList.contains('expanded');
                const rect = historyHeader.getBoundingClientRect();
                
                // Only show resize cursor if panel is expanded and in resize zone
                if (e.clientY - rect.top <= 10 && isExpanded) {
                    historyHeader.style.cursor = 'ns-resize';
                    historyHeader.classList.add('resize-hover');  // ADD THIS LINE
                } else {
                    historyHeader.style.cursor = 'pointer';
                    historyHeader.classList.remove('resize-hover');  // ADD THIS LINE
                }
            }
        });
        
        historyHeader.addEventListener('mouseleave', () => {
            if (!isResizingHistory) {
                historyHeader.style.cursor = 'pointer';
                historyHeader.classList.remove('resize-hover');  // ADD THIS LINE
            }
        });
        
        // Initialize history pane divider
        const historyDivider = document.getElementById('history-divider');
        if (historyDivider) {
            historyDivider.addEventListener('mousedown', (e) => this.startHistoryPaneResize(e));
        }
    },
    
    // Metadata field listeners
    setupMetadataFieldListeners() {
        const fields = ['title', 'artist', 'album', 'albumartist', 'date', 'genre', 'track', 'disc'];
        
        fields.forEach(field => {
            const input = document.getElementById(field);
            const controls = document.querySelector(`.apply-field-controls[data-field="${field}"]`);
            
            const updateControlsVisibility = () => {
                const hasValue = input.value.trim().length > 0;
                const hasChanged = input.value !== (this.state.originalMetadata[field] || '');
                
                if (hasValue && hasChanged) {
                    controls.classList.add('visible');
                } else {
                    controls.classList.remove('visible');
                }
            };
            
            input.addEventListener('input', updateControlsVisibility);
            input.addEventListener('focus', updateControlsVisibility);
        });
    },
    
    // NEW: Save individual field to file
    async saveFieldToFile(field) {
        if (!this.state.currentFile) return;
        
        const button = document.querySelector(`.apply-file-btn[data-field="${field}"]`);
        const value = document.getElementById(field).value.trim();
        if (!value && value !== '') return; // Allow empty string to clear field
        
        button.disabled = true;
        this.showButtonStatus(button, 'Saving to file...', 'processing');
        
        // Create metadata object with only this field
        const data = {};
        data[field] = value;
        
        try {
            const result = await this.apiCall(`/metadata/${encodeURIComponent(this.state.currentFile)}`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(data)
            });
            
            if (result.status === 'success') {
                this.showButtonStatus(button, 'Saved to file!', 'success', 2000);
                this.state.originalMetadata[field] = value;
                
                // Hide controls after successful save
                setTimeout(() => {
                    const controls = document.querySelector(`.apply-field-controls[data-field="${field}"]`);
                    controls.classList.remove('visible');
                }, 1000);
                
                // Refresh history
                this.loadHistory();
            } else {
                this.showButtonStatus(button, 'Failed to save', 'error');
            }
        } catch (err) {
            console.error(`Error saving ${field} to file:`, err);
            this.showButtonStatus(button, 'Error saving field', 'error');
        }
        
        button.disabled = false;
    },
    
    // NEW: Setup inference handlers
    setupInferenceHandlers() {
        const fields = ['title', 'artist', 'album', 'albumartist', 'date', 'genre', 'track', 'disc'];
        
        fields.forEach(field => {
            const input = document.getElementById(field);
            const suggestions = document.getElementById(`${field}-suggestions`);
            
            // Click handler for empty fields
            input.addEventListener('click', (e) => {
                if (input.value.trim() === '' && !input.disabled && this.state.currentFile) {
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
        if (this.state.inferenceActive[field]) return;
        
        const loading = document.getElementById(`${field}-loading`);
        const suggestions = document.getElementById(`${field}-suggestions`);
        
        // Cancel any existing request
        if (this.state.inferenceAbortControllers[field]) {
            this.state.inferenceAbortControllers[field].abort();
        }
        
        // Create new abort controller
        const abortController = new AbortController();
        this.state.inferenceAbortControllers[field] = abortController;
        
        // Show loading
        loading.classList.add('active');
        this.state.inferenceActive[field] = true;
        
        try {
            const response = await fetch(`/infer/${encodeURIComponent(this.state.currentFile)}/${field}`, {
                signal: abortController.signal
            });
            
            if (!response.ok) {
                throw new Error('Failed to get suggestions');
            }
            
            const data = await response.json();
            
            // Hide loading
            loading.classList.remove('active');
            
            // Display suggestions if still active
            if (this.state.inferenceActive[field]) {
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
        
        this.state.inferenceActive[field] = false;
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
    
    // NEW: Hide inference suggestions
    hideInferenceSuggestions(field) {
        const loading = document.getElementById(`${field}-loading`);
        const suggestions = document.getElementById(`${field}-suggestions`);
        
        // Cancel any ongoing request
        if (this.state.inferenceAbortControllers[field]) {
            this.state.inferenceAbortControllers[field].abort();
            delete this.state.inferenceAbortControllers[field];
        }
        
        loading.classList.remove('active');
        suggestions.classList.remove('active');
        this.state.inferenceActive[field] = false;
    },

    // Keyboard navigation
    setupKeyboardNavigation() {
        // Pane click handlers
        document.querySelector('.folders').addEventListener('click', (e) => {
            this.state.focusedPane = 'folders';
            this.updatePaneFocus();
        });
        
        document.querySelector('.files').addEventListener('click', (e) => {
            this.state.focusedPane = 'files';
            this.updatePaneFocus();
            if (this.state.loadFileDebounceTimer) {
                clearTimeout(this.state.loadFileDebounceTimer);
            }
        });
        
        this.updatePaneFocus();
        
        // Global keyboard handler with custom repeat
        document.addEventListener('keydown', (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
                return;
            }
            
            if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                e.preventDefault();

                document.querySelector('.folders').classList.add('keyboard-navigating');
                document.querySelector('.files').classList.add('keyboard-navigating');

                // If this is a repeat event from the browser, ignore it
                if (e.repeat) {
                    return;
                }
                
                // Clear any existing repeat timer and delay timer
                if (this.state.keyRepeatDelayTimer) {
                    clearTimeout(this.state.keyRepeatDelayTimer);
                    this.state.keyRepeatDelayTimer = null;
                }
                if (this.state.keyRepeatTimer) {
                    clearInterval(this.state.keyRepeatTimer);
                    this.state.keyRepeatTimer = null;
                }
                
                // Store which key is being held
                this.state.keyHeldDown = e.key;
                this.state.isKeyRepeating = false;
                
                // Perform the initial navigation
                this.navigateWithArrows(e.key === 'ArrowUp' ? 'up' : 'down');
                
                // Set up custom repeat with initial delay
                this.state.keyRepeatDelayTimer = setTimeout(() => {
                    // Only start repeating if the same key is still held down
                    if (this.state.keyHeldDown === e.key) {
                        this.state.isKeyRepeating = true;
                        this.state.keyRepeatTimer = setInterval(() => {
                            if (this.state.keyHeldDown === e.key) {
                                this.navigateWithArrows(e.key === 'ArrowUp' ? 'up' : 'down');
                            }
                        }, this.state.keyRepeatInterval);
                    }
                }, this.state.keyRepeatDelay);
                
            } else if (e.key === 'Enter') {
                e.preventDefault();
                this.activateCurrentItem();
            }
            else if (e.key === 'Tab') {
                e.preventDefault();
                
                // Determine where we're switching TO
                const switchingToFiles = this.state.focusedPane === 'folders';
                
                // If switching to files, check if there are valid files
                if (switchingToFiles) {
                    const fileItems = Array.from(document.querySelectorAll('#file-list li:not([aria-hidden="true"])'));
                    const validFileItems = fileItems.filter(item => item.dataset.filepath);
                    
                    if (validFileItems.length === 0) {
                        return; // Don't switch if no valid files
                    }
                    
                    // Remove keyboard focus from folders
                    document.querySelectorAll('.folders .keyboard-focus').forEach(el => {
                        el.classList.remove('keyboard-focus');
                    });
                    
                    // Switch to files pane
                    this.state.focusedPane = 'files';
                    this.updatePaneFocus();
                    
                    // Add focus to files pane
                    if (!this.state.selectedListItem || !validFileItems.includes(this.state.selectedListItem)) {
                        // No file is selected or the selected file is not in the current file list
                        this.selectFileItem(validFileItems[0], true);
                        validFileItems[0].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                    } else {
                        // A file is already selected and it's in the current list, just add keyboard focus to it
                        this.state.selectedListItem.classList.add('keyboard-focus');
                    }
                } else {
                    // Switching from files to folders
                    
                    // Remove keyboard focus from files
                    document.querySelectorAll('.files .keyboard-focus').forEach(el => {
                        el.classList.remove('keyboard-focus');
                    });
                    
                    // Switch to folders pane
                    this.state.focusedPane = 'folders';
                    this.updatePaneFocus();
                    
                    // Add focus to folders pane
                    if (this.state.selectedTreeItem) {
                        this.state.selectedTreeItem.classList.add('keyboard-focus');
                    }
                }
            }
        });
        
        // Keyup handler to stop custom repeat
        document.addEventListener('keyup', (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
                return;
            }
            
            // If this key was being held down, stop the repeat
            if (this.state.keyHeldDown === e.key) {
                this.state.keyHeldDown = null;
                this.state.isKeyRepeating = false;
                
                // Remove keyboard navigating class
                document.querySelector('.folders').classList.remove('keyboard-navigating');
                document.querySelector('.files').classList.remove('keyboard-navigating');
                
                // Clear BOTH the delay timer and repeat timer  // UPDATED COMMENT
                if (this.state.keyRepeatDelayTimer) {           // ADD THESE 4 LINES
                    clearTimeout(this.state.keyRepeatDelayTimer);
                    this.state.keyRepeatDelayTimer = null;
                }
                if (this.state.keyRepeatTimer) {
                    clearInterval(this.state.keyRepeatTimer);
                    this.state.keyRepeatTimer = null;
                }
            }
        });
                        
        // Clear key state on window blur to prevent stuck keys
        window.addEventListener('blur', () => {
            this.state.keyHeldDown = null;
            this.state.isKeyRepeating = false;
            
            // Clear BOTH timers on blur
            if (this.state.keyRepeatDelayTimer) {
                clearTimeout(this.state.keyRepeatDelayTimer);
                this.state.keyRepeatDelayTimer = null;
            }
            if (this.state.keyRepeatTimer) {
                clearInterval(this.state.keyRepeatTimer);
                this.state.keyRepeatTimer = null;
            }
        });
    },

    updatePaneFocus() {
        // Visual focus indicator handled by CSS :focus-within
    },
    
    scrollItemToCenter(item, container) {
        const containerRect = container.getBoundingClientRect();
        const itemRect = item.getBoundingClientRect();
        
        // Calculate the center position of the container
        const containerCenter = containerRect.top + (containerRect.height / 2);
        
        // Calculate where the item currently is
        const itemCenter = itemRect.top + (itemRect.height / 2);
        
        // Calculate how much we need to scroll
        const scrollOffset = itemCenter - containerCenter;
        
        // Get current scroll position
        const currentScroll = container.scrollTop;
        
        // Calculate new scroll position
        const newScroll = currentScroll + scrollOffset;
        
        // Check boundaries
        const maxScroll = container.scrollHeight - container.clientHeight;
        
        // Use instant scrolling during key repeat for smooth performance
        // Only use smooth scrolling for single key presses
        if (this.state.isKeyRepeating) {
            container.scrollTop = Math.max(0, Math.min(newScroll, maxScroll));
        } else {
            container.scrollTo({
                top: Math.max(0, Math.min(newScroll, maxScroll)),
                behavior: 'smooth'
            });
        }
    },

    // Immediate centering without animation
    immediateScrollToCenter(item, container) {
        const containerRect = container.getBoundingClientRect();
        const itemRect = item.getBoundingClientRect();
        
        const containerTop = containerRect.top;
        const containerBottom = containerRect.bottom;
        const itemTop = itemRect.top;
        const itemBottom = itemRect.bottom;
        
        // Define a margin (e.g., 30% of container height)
        const margin = containerRect.height * 0.3;
        
        let scrollAdjustment = 0;
        
        // If item is above the visible area (with margin)
        if (itemTop < containerTop + margin) {
            scrollAdjustment = itemTop - containerTop - margin;
        }
        // If item is below the visible area (with margin)
        else if (itemBottom > containerBottom - margin) {
            scrollAdjustment = itemBottom - containerBottom + margin;
        }
        
        if (scrollAdjustment !== 0) {
            const currentScroll = container.scrollTop;
            const newScroll = currentScroll + scrollAdjustment;
            const maxScroll = container.scrollHeight - container.clientHeight;
            container.scrollTop = Math.max(0, Math.min(newScroll, maxScroll));
        }
    },

    navigateWithArrows(direction) {
        if (this.state.focusedPane === 'folders') {
            this.navigateFolders(direction);
        } else if (this.state.focusedPane === 'files') {
            this.navigateFiles(direction);
        }
    },

    navigateFolders(direction) {
        const visibleFolders = this.getVisibleFolders();
        if (visibleFolders.length === 0) return;
        
        let currentIndex = -1;
        if (this.state.selectedTreeItem) {
            currentIndex = visibleFolders.findIndex(item => item === this.state.selectedTreeItem);
        }
        
        let newIndex;
        if (currentIndex === -1) {
            newIndex = direction === 'up' ? visibleFolders.length - 1 : 0;
        } else if (direction === 'up') {
            newIndex = currentIndex > 0 ? currentIndex - 1 : 0;
        } else {
            newIndex = currentIndex < visibleFolders.length - 1 ? currentIndex + 1 : visibleFolders.length - 1;
        }
        
        if (visibleFolders[newIndex]) {
            this.selectTreeItem(visibleFolders[newIndex], true);
            
            // Always use immediate scrolling during arrow navigation for smooth performance
            const container = document.querySelector('.folders');
            this.immediateScrollToCenter(visibleFolders[newIndex], container);
        }
    },

    navigateFiles(direction) {
        const fileItems = Array.from(document.querySelectorAll('#file-list li:not([aria-hidden="true"])'))
            .filter(item => item.dataset.filepath);
        if (fileItems.length === 0) return;
        
        let currentIndex = -1;
        if (this.state.selectedListItem) {
            currentIndex = fileItems.findIndex(item => item === this.state.selectedListItem);
        }
        
        let newIndex;
        if (currentIndex === -1) {
            newIndex = direction === 'up' ? fileItems.length - 1 : 0;
        } else if (direction === 'up') {
            newIndex = currentIndex > 0 ? currentIndex - 1 : 0;
        } else {
            newIndex = currentIndex < fileItems.length - 1 ? currentIndex + 1 : fileItems.length - 1;
        }
        
        if (fileItems[newIndex]) {
            this.selectFileItem(fileItems[newIndex], true);
            
            // Always use immediate scrolling during arrow navigation for smooth performance
            const container = document.querySelector('.files');
            this.immediateScrollToCenter(fileItems[newIndex], container);
        }
    },

    getVisibleFolders() {
        const folders = [];
        
        const collectVisible = (container) => {
            const items = container.children;
            for (let item of items) {
                if (item.classList.contains('tree-item')) {
                    folders.push(item);
                    const children = item.querySelector('.tree-children');
                    if (children && children.classList.contains('expanded')) {
                        collectVisible(children);
                    }
                }
            }
        };
        
        collectVisible(document.getElementById('folder-tree'));
        return folders;
    },

    selectTreeItem(item, isKeyboard = false) {
        if (this.state.selectedTreeItem) {
            this.state.selectedTreeItem.classList.remove('selected', 'keyboard-focus');
        }
        item.classList.add('selected');
        // Always add keyboard-focus when selecting, regardless of input method
        item.classList.add('keyboard-focus');
        
        // Remove keyboard-focus from files pane when selecting a folder
        document.querySelectorAll('.files .keyboard-focus').forEach(el => {
            el.classList.remove('keyboard-focus');
        });
        
        this.state.selectedTreeItem = item;
        this.state.focusedPane = 'folders';
        this.updatePaneFocus();
        
        // Always load files when a folder is selected (remove the isKeyboard check)
        if (this.state.loadFileDebounceTimer) {
            clearTimeout(this.state.loadFileDebounceTimer);
        }
        
        const folderPath = item.dataset.path;
        if (folderPath !== undefined) { // folderPath can be empty string for root
            this.state.loadFileDebounceTimer = setTimeout(() => {
                this.loadFiles(folderPath);
            }, 300);
        }
    },

    selectFileItem(item, isKeyboard = false) {
        if (this.state.selectedListItem) {
            this.state.selectedListItem.classList.remove('selected', 'keyboard-focus');
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
            if (this.state.loadFileDebounceTimer) {
                clearTimeout(this.state.loadFileDebounceTimer);
            }
            
            const filepath = item.dataset.filepath;
            if (filepath) {
                this.state.loadFileDebounceTimer = setTimeout(() => {
                    this.loadFile(filepath, item);
                }, 300);
            }
        }
        
        this.state.selectedListItem = item;
        this.state.focusedPane = 'files';
        this.updatePaneFocus();
    },

    activateCurrentItem() {
        if (this.state.focusedPane === 'folders' && this.state.selectedTreeItem) {
            const children = this.state.selectedTreeItem.querySelector('.tree-children');
            const folderPath = this.state.selectedTreeItem.dataset.path;
            
            // Check if we haven't loaded this folder's data yet
            const dataNotLoaded = !this.state.treeData.hasOwnProperty(folderPath);
            
            // Check if this folder has subfolders in the data
            const hasSubfolders = dataNotLoaded || 
                                 (this.state.treeData[folderPath] && 
                                  this.state.treeData[folderPath].some(item => item.type === 'folder'));
            
            // Check if already expanded and has visible subfolder elements
            const hasVisibleSubfolders = children && children.classList.contains('expanded') && 
                                        children.querySelectorAll('.tree-item').length > 0;
            
            if (hasSubfolders || hasVisibleSubfolders) {
                // Has subfolders - just toggle expand/collapse without loading files
                const icon = this.state.selectedTreeItem.querySelector('.tree-icon');
                const isExpanded = children.classList.contains('expanded');
                
                if (!isExpanded) {
                    // Expand
                    if (children.children.length === 0) {
                        // Load children if not already loaded
                        this.loadTreeChildren(folderPath, children, this.getLevel(folderPath) + 1);
                    }
                    children.classList.add('expanded');
                    this.state.expandedFolders.add(folderPath);
                    if (icon) icon.innerHTML = '📂';
                } else {
                    // Collapse
                    children.classList.remove('expanded');
                    this.state.expandedFolders.delete(folderPath);
                    if (icon) icon.innerHTML = '📁';
                }
                // DO NOT load files, DO NOT move focus - just return
                return;
            } else {
                // No subfolders - do nothing
                return;
            }
        } else if (this.state.focusedPane === 'files' && this.state.selectedListItem) {
            const filepath = this.state.selectedListItem.dataset.filepath;
            if (filepath) {
                this.loadFile(filepath, this.state.selectedListItem);
            }
        }
    },

    // Sorting functionality
    updateSortUI() {
        document.querySelectorAll('.sort-option').forEach(opt => {
            opt.classList.remove('active');
            opt.querySelectorAll('.sort-arrow').forEach(arrow => {
                arrow.classList.remove('active');
            });
        });
        
        const activeOption = document.getElementById(`sort-${this.state.currentSort.method}`);
        activeOption.classList.add('active');
        activeOption.querySelector(`.sort-arrow[data-dir="${this.state.currentSort.direction}"]`).classList.add('active');
    },

    setSortMethod(method) {
        if (this.state.currentSort.method === method) {
            this.state.currentSort.direction = this.state.currentSort.direction === 'asc' ? 'desc' : 'asc';
        } else {
            this.state.currentSort.method = method;
            this.state.currentSort.direction = 'asc';
        }
        
        this.updateSortUI();
        this.rebuildTree();
    },

    sortItems(items) {
        return items.sort((a, b) => {
            let comparison = 0;
            
            if (this.state.currentSort.method === 'name') {
                comparison = a.name.toLowerCase().localeCompare(b.name.toLowerCase());
            } else if (this.state.currentSort.method === 'date') {
                comparison = (a.created || 0) - (b.created || 0);
            }
            
            return this.state.currentSort.direction === 'asc' ? comparison : -comparison;
        });
    },

    // Tree functionality
    async loadTree() {
        try {
            const data = await this.apiCall('/tree/');
            this.state.treeData[''] = data.items;
            this.buildTreeFromData();
        } catch (err) {
            console.error('Error loading tree:', err);
            this.showStatus('Error loading folders', 'error');
        }
    },

    buildTreeFromData() {
        const tree = document.getElementById('folder-tree');
        tree.innerHTML = '';
        
        const sortedItems = this.sortItems(this.state.treeData[''] || []);
        
        sortedItems.forEach(item => {
            if (item.type === 'folder') {
                tree.appendChild(this.createTreeItem(item, 0));
            }
        });
        
        // Auto-select the first folder on initial load
        const firstTreeItem = tree.querySelector('.tree-item');
        if (firstTreeItem && !this.state.selectedTreeItem) {
            // Select with keyboard focus to show both highlight and focus indicator
            this.selectTreeItem(firstTreeItem, true);
            // Also set the focused pane to folders
            this.state.focusedPane = 'folders';
            this.updatePaneFocus();
        }
    },

    rebuildTree() {
        this.buildTreeFromData();
        
        this.state.expandedFolders.forEach(path => {
            const element = document.querySelector(`[data-path="${path}"]`);
            if (element && this.state.treeData[path]) {
                const children = element.querySelector('.tree-children');
                if (children && this.state.treeData[path].length > 0) {
                    this.rebuildChildren(path, children, this.getLevel(path) + 1);
                    children.classList.add('expanded');
                }
            }
        });
        
        if (this.state.selectedTreeItem) {
            const path = this.state.selectedTreeItem.dataset.path;
            const newSelected = document.querySelector(`[data-path="${path}"]`);
            if (newSelected) {
                newSelected.classList.add('selected');
                this.state.selectedTreeItem = newSelected;
            }
        }
    },

    getLevel(path) {
        return path ? path.split('/').length - 1 : 0;
    },

    rebuildChildren(path, container, level) {
        container.innerHTML = '';
        const sortedItems = this.sortItems(this.state.treeData[path] || []);
        
        sortedItems.forEach(item => {
            if (item.type === 'folder') {
                container.appendChild(this.createTreeItem(item, level));
            }
        });
    },

    createTreeItem(item, level) {
        const div = document.createElement('div');
        div.className = 'tree-item';
        div.dataset.path = item.path;
        
        const content = document.createElement('div');
        content.className = 'tree-item-content';
        content.style.paddingLeft = `${level * 1.5 + 1.25}rem`;
        
        const icon = document.createElement('span');
        icon.className = 'tree-icon';
        icon.innerHTML = this.state.expandedFolders.has(item.path) ? '📂' : '📁';
        
        const name = document.createElement('span');
        name.textContent = item.name;
        
        content.appendChild(icon);
        content.appendChild(name);
        
        const children = document.createElement('div');
        children.className = 'tree-children';
        
        div.appendChild(content);
        div.appendChild(children);
        
        content.onclick = (e) => {
            e.stopPropagation();
            this.selectTreeItem(div);
            
            // Check if this folder has subfolders
            const hasSubfolders = this.state.treeData[item.path] && 
                                 this.state.treeData[item.path].some(child => child.type === 'folder');
            
            const isExpanded = children.classList.contains('expanded');
            
            if (!isExpanded) {
                if (children.children.length === 0) {
                    this.loadTreeChildren(item.path, children, level + 1);
                }
                children.classList.add('expanded');
                this.state.expandedFolders.add(item.path);
                icon.innerHTML = '📂';
            } else {
                children.classList.remove('expanded');
                this.state.expandedFolders.delete(item.path);
                icon.innerHTML = '📁';
            }
            
            // Always load files regardless of whether folder has subfolders
            // (Remove the hasSubfolders check that was preventing file loading)
            this.loadFiles(item.path);
        };
        
        if (this.state.treeData[item.path] && this.state.treeData[item.path].length > 0 && this.state.expandedFolders.has(item.path)) {
            const sortedItems = this.sortItems(this.state.treeData[item.path]);
            sortedItems.forEach(child => {
                if (child.type === 'folder') {
                    children.appendChild(this.createTreeItem(child, level + 1));
                }
            });
            children.classList.add('expanded');
            icon.innerHTML = '📂';
        }
        
        return div;
    },

    async loadTreeChildren(path, container, level) {
        try {
            const data = await this.apiCall(`/tree/${encodeURIComponent(path)}`);
            this.state.treeData[path] = data.items;
            
            const sortedItems = this.sortItems(data.items);
            
            sortedItems.forEach(item => {
                if (item.type === 'folder') {
                    container.appendChild(this.createTreeItem(item, level));
                }
            });
        } catch (err) {
            console.error('Error loading tree children:', err);
        }
    },

    // File operations
    async loadFiles(folderPath) {
        this.state.currentPath = folderPath;
        document.getElementById('file-count').textContent = '(loading...)';
        
        this.stopPlayback();
        
        try {
            const data = await this.apiCall(`/files/${encodeURIComponent(folderPath)}`);
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
                const formatEmoji = this.getFormatEmoji(file.name);  // Add 'this.'
                const musicIcon = document.createTextNode(formatEmoji + ' ');
                nameDiv.appendChild(musicIcon);
                nameDiv.appendChild(document.createTextNode(file.name));
                
                // Add format badge
                const badgeHtml = this.getFormatBadge(file.name);
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
                    this.togglePlayback(file.path, playButton);
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
            this.showStatus('Error loading files', 'error');
            document.getElementById('file-count').textContent = '(error)';
        }
    },

    async loadFile(filepath, listItem) {
        // Increment request ID to track this as the latest request
        const requestId = ++this.state.loadFileRequestId;
        
        // Stop any current playback when selecting a different file
        this.stopPlayback();
        
        // Hide all inference suggestions
        const fields = ['title', 'artist', 'album', 'albumartist', 'date', 'genre', 'track', 'disc'];
        fields.forEach(field => this.hideInferenceSuggestions(field));
        
        if (this.state.loadFileDebounceTimer) {
            clearTimeout(this.state.loadFileDebounceTimer);
            this.state.loadFileDebounceTimer = null;
        }
        
        this.selectFileItem(listItem);
        
        this.state.currentFile = filepath;
        this.state.originalFilename = filepath.split('/').pop();
        document.getElementById('current-filename').textContent = this.state.originalFilename;
        document.getElementById('no-file-message').style.display = 'none';
        document.getElementById('metadata-section').style.display = 'block';
        
        this.cancelFilenameEdit();
        this.hideStatus();
        
        document.querySelectorAll('.apply-field-controls').forEach(controls => {
            controls.classList.remove('visible');
        });
        
        if (listItem.classList.contains('keyboard-focus')) {
            this.showStatus('Loading metadata...', 'success');
        }
        
        this.state.currentAlbumArt = null;
        this.state.pendingAlbumArt = null;
        this.state.shouldRemoveArt = false;
        
        this.setFormEnabled(false);
        
        try {
            const data = await this.apiCall(`/metadata/${encodeURIComponent(filepath)}`);
            
            if (requestId !== this.state.loadFileRequestId) {
                // A newer request has been made, discard this response
                return;
            }
            
            this.state.originalMetadata = {
                title: data.title || '',
                artist: data.artist || '',
                album: data.album || '',
                albumartist: data.albumartist || '',
                date: data.date || '',
                genre: data.genre || '',
                track: data.track || '',
                disc: data.disc || ''
            };
            
            Object.entries(this.state.originalMetadata).forEach(([field, value]) => {
                document.getElementById(field).value = value;
            });
            
            // Handle format limitations
            const formatLimitations = data.formatLimitations || {};
            const format = data.format || '';
            
            // Show format-specific warnings
            if (formatLimitations.hasLimitedMetadata) {
                this.showStatus(`Note: ${format.toUpperCase()} files have limited metadata support`, 'warning');
                
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
                    this.state.currentAlbumArt = data.art;
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
            
            this.setFormEnabled(true);
            
            if (listItem.classList.contains('keyboard-focus')) {
                this.hideStatus();
            }
        } catch (err) {
            // Check if this is still the most recent request before showing error
            if (requestId === this.state.loadFileRequestId) {
                console.error('Error loading metadata:', err);
                this.showStatus('Error loading metadata', 'error');
                this.setFormEnabled(true);
            }
        }
    },
    
    // Filename editing
    cancelFilenameEdit() {
        document.getElementById('current-filename').style.display = 'inline';
        document.querySelector('.filename-edit').style.display = 'none';
    },
    
    resetFilename() {
        document.getElementById('filename-input').value = this.state.originalFilename;
    },
    
    async saveFilename() {
        const button = document.querySelector('.filename-save');
        const newName = document.getElementById('filename-input').value.trim();
        if (!newName || newName === this.state.originalFilename) {
            this.cancelFilenameEdit();
            return;
        }
        
        this.setFormEnabled(false);
        this.showButtonStatus(button, 'Renaming...', 'processing');
        
        try {
            const result = await this.apiCall('/rename', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    oldPath: this.state.currentFile,
                    newName: newName
                })
            });
            
            if (result.status === 'success') {
                this.state.currentFile = result.newPath;
                this.state.originalFilename = newName;
                document.getElementById('current-filename').textContent = newName;
                this.cancelFilenameEdit();
                this.showButtonStatus(button, 'Renamed!', 'success');
                this.loadFiles(this.state.currentPath);
                this.loadHistory();
            } else {
                this.showButtonStatus(button, result.error || 'Error', 'error');
            }
        } catch (err) {
            console.error('Error renaming file:', err);
            this.showButtonStatus(button, 'Error', 'error');
        }
        
        this.setFormEnabled(true);
    },

    // Album art functions
    handleArtUpload(event) {
        const file = event.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = (e) => {
            this.state.pendingAlbumArt = e.target.result;
            this.state.shouldRemoveArt = false;
            
            const artDisplay = document.getElementById('art-display');
            artDisplay.innerHTML = `<img src="${this.state.pendingAlbumArt}" class="album-art">`;
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
        this.state.shouldRemoveArt = true;
        this.state.pendingAlbumArt = null;
        
        const artDisplay = document.getElementById('art-display');
        artDisplay.innerHTML = '<div class="album-art-placeholder">No album art</div>';
        document.querySelector('.delete-art-btn').style.display = 'none';
        document.querySelector('.save-image-btn').style.display = 'none';
        document.querySelector('.apply-folder-btn').style.display = 'none';
        
        this.showButtonStatus(button, 'Marked for deletion', 'warning', 2000);
    },

    async saveAlbumArt() {
        if (!this.state.currentFile || !this.state.pendingAlbumArt) return;
        
        const button = document.querySelector('.save-image-btn');
        button.disabled = true;
        this.showButtonStatus(button, 'Saving...', 'processing');
        
        try {
            const result = await this.apiCall(`/metadata/${encodeURIComponent(this.state.currentFile)}`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ art: this.state.pendingAlbumArt })
            });
            
            if (result.status === 'success') {
                this.showButtonStatus(button, 'Saved!', 'success');
                this.state.currentAlbumArt = this.state.pendingAlbumArt;
                this.state.pendingAlbumArt = null;
                
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
        if (!this.state.currentFile || (!this.state.pendingAlbumArt && !this.state.currentAlbumArt)) return;
        
        const button = document.querySelector('.apply-folder-btn');
        const artToApply = this.state.pendingAlbumArt || (this.state.currentAlbumArt ? `data:image/jpeg;base64,${this.state.currentAlbumArt}` : null);
        if (!artToApply) {
            this.showButtonStatus(button, 'No art', 'error', 2000);
            return;
        }
        
        const folderPath = this.state.currentFile.substring(0, this.state.currentFile.lastIndexOf('/'));
        
        if (!confirm(`Apply this album art to all files in the folder "${folderPath || 'root'}"? This will replace any existing album art.`)) {
            return;
        }
        
        button.disabled = true;
        this.setFormEnabled(false);
        this.showButtonStatus(button, 'Applying...', 'processing');
        
        try {
            const result = await this.apiCall('/apply-art-to-folder', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    folderPath: folderPath,
                    art: artToApply
                })
            });
            
            if (result.status === 'success') {
                this.showButtonStatus(button, `Applied to ${result.filesUpdated} files!`, 'success', 3000);
                
                if (this.state.pendingAlbumArt) {
                    this.state.currentAlbumArt = this.state.pendingAlbumArt;
                    this.state.pendingAlbumArt = null;
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

    async applyFieldToFolder(field) {
        if (!this.state.currentFile) return;
        
        const button = document.querySelector(`.apply-folder-btn-new[data-field="${field}"]`);
        const value = document.getElementById(field).value.trim();
        if (!value && value !== '') return; // Allow empty string to clear field
        
        const folderPath = this.state.currentFile.substring(0, this.state.currentFile.lastIndexOf('/'));
        const fieldLabel = document.querySelector(`label[for="${field}"]`).textContent;
        
        if (!confirm(`Apply "${fieldLabel}" value "${value}" to all files in the folder "${folderPath || 'root'}"?`)) {
            return;
        }
        
        button.disabled = true;
        this.setFormEnabled(false);
        this.showButtonStatus(button, 'Applying to folder...', 'processing');
        
        try {
            const result = await this.apiCall('/apply-field-to-folder', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    folderPath: folderPath,
                    field: field,
                    value: value
                })
            });
            
            if (result.status === 'success') {
                this.showButtonStatus(button, `Applied to ${result.filesUpdated} files!`, 'success', 3000);
                this.state.originalMetadata[field] = value;
                setTimeout(() => {
                    const controls = document.querySelector(`.apply-field-controls[data-field="${field}"]`);
                    controls.classList.remove('visible');
                }, 1000);
                
                this.loadHistory();
            } else {
                this.showButtonStatus(button, result.error || 'Failed to apply to folder', 'error');
            }
        } catch (err) {
            console.error(`Error applying ${fieldLabel} to folder:`, err);
            this.showButtonStatus(button, 'Error applying to folder', 'error');
        }
        
        button.disabled = false;
        this.setFormEnabled(true);
    },

    // Update the save method to handle format-specific errors
    async save() {
        if (!this.state.currentFile) return;
        
        const button = document.querySelector('.save-btn');
        const data = {
            title: document.getElementById('title').value,
            artist: document.getElementById('artist').value,
            album: document.getElementById('album').value,
            albumartist: document.getElementById('albumartist').value,
            date: document.getElementById('date').value,
            genre: document.getElementById('genre').value,
            track: document.getElementById('track').value,
            disc: document.getElementById('disc').value
        };
        
        if (this.state.pendingAlbumArt) {
            data.art = this.state.pendingAlbumArt;
        } else if (this.state.shouldRemoveArt) {
            data.removeArt = true;
        }
        
        this.setFormEnabled(false);
        this.showButtonStatus(button, 'Saving...', 'processing');
        
        try {
            const result = await this.apiCall(`/metadata/${encodeURIComponent(this.state.currentFile)}`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(data)
            });
            
            if (result.status === 'success') {
                this.showButtonStatus(button, 'Saved!', 'success', 3000);
                
                Object.keys(data).forEach(key => {
                    if (key !== 'art' && key !== 'removeArt') {
                        this.state.originalMetadata[key] = data[key];
                    }
                });
                
                document.querySelectorAll('.apply-field-controls').forEach(controls => {
                    controls.classList.remove('visible');
                });
                
                if (this.state.pendingAlbumArt) {
                    this.state.currentAlbumArt = this.state.pendingAlbumArt;
                    document.querySelector('.save-image-btn').style.display = 'none';
                    document.querySelector('.apply-folder-btn').style.display = 'none';
                } else if (this.state.shouldRemoveArt) {
                    this.state.currentAlbumArt = null;
                }
                this.state.pendingAlbumArt = null;
                this.state.shouldRemoveArt = false;
                
                this.loadHistory();
            } else {
                this.showButtonStatus(button, 'Error', 'error');
            }
        } catch (err) {
            console.error('Error saving metadata:', err);
            // Check for specific format-related errors
            const errorMessage = err.message || '';
            if (errorMessage.includes('Album art is not supported')) {
                this.showButtonStatus(button, 'Album art not supported for this format', 'error', 5000);
            } else {
                this.showButtonStatus(button, 'Error', 'error');
            }
        }
        
        this.setFormEnabled(true);
    },

    getFormatEmoji(filename) {
        const ext = filename.split('.').pop().toLowerCase();
        const FORMAT_EMOJIS = {
            'mp3': '🎵',
            'flac': '💿',
            'm4a': '🎶',
            'wav': '🌊',
            'wma': '🪟',
            'wv': '📦',
        };
        return FORMAT_EMOJIS[ext] || '🎵';
    },

    // Add visual indicators for file format support
    getFormatBadge(filename) {
        const ext = filename.split('.').pop().toUpperCase();
        const lossless = ['FLAC', 'WAV', 'WV'];
        const limitedMetadata = ['WAV', 'WV'];
        const noAlbumArt = ['WAV', 'WV'];
        
        const isLossless = lossless.includes(ext);
        const hasLimitations = limitedMetadata.includes(ext) || noAlbumArt.includes(ext);
        
        let badgeHtml = `<span style="
            font-size: 0.7rem;
            padding: 0.2rem 0.4rem;
            border-radius: 4px;
            background: ${isLossless ? 'rgba(74, 222, 128, 0.2)' : 'rgba(255, 169, 77, 0.2)'};
            color: ${isLossless ? '#4ade80' : '#ffa94d'};
            margin-left: 0.5rem;
            font-weight: 500;
        ">${ext}</span>`;
        
        if (hasLimitations) {
            const limitations = [];
            if (limitedMetadata.includes(ext)) {
                limitations.push('limited metadata');
            }
            if (noAlbumArt.includes(ext)) {
                limitations.push('no album art');
            }
            
            badgeHtml += `<span style="
                font-size: 0.65rem;
                padding: 0.15rem 0.3rem;
                border-radius: 4px;
                background: rgba(255, 107, 107, 0.2);
                color: #ff6b6b;
                margin-left: 0.3rem;
                font-weight: 400;
            " title="${limitations.join(', ')}">⚠</span>`;
        }
        
        return badgeHtml;
    },

    async resetForm() {
        if (!this.state.currentFile) return;
        
        const button = document.querySelector('.clear-btn');
        this.showButtonStatus(button, 'Resetting...', 'processing');
        
        try {
            const data = await this.apiCall(`/metadata/${encodeURIComponent(this.state.currentFile)}`);
            
            this.state.originalMetadata = {
                title: data.title || '',
                artist: data.artist || '',
                album: data.album || '',
                albumartist: data.albumartist || '',
                date: data.date || '',
                genre: data.genre || '',
                track: data.track || '',
                disc: data.disc || ''
            };
            
            Object.entries(this.state.originalMetadata).forEach(([field, value]) => {
                document.getElementById(field).value = value;
            });
            
            document.querySelectorAll('.apply-field-controls').forEach(controls => {
                controls.classList.remove('visible');
            });
            
            this.state.pendingAlbumArt = null;
            this.state.shouldRemoveArt = false;
            
            const artDisplay = document.getElementById('art-display');
            const deleteBtn = document.querySelector('.delete-art-btn');
            const saveImageBtn = document.querySelector('.save-image-btn');
            const applyFolderBtn = document.querySelector('.apply-folder-btn');
            
            if (data.hasArt && data.art) {
                this.state.currentAlbumArt = data.art;
                artDisplay.innerHTML = `<img src="data:image/jpeg;base64,${data.art}" class="album-art">`;
                deleteBtn.style.display = 'block';
                saveImageBtn.style.display = 'none';
                applyFolderBtn.style.display = 'none';
            } else {
                this.state.currentAlbumArt = null;
                artDisplay.innerHTML = '<div class="album-art-placeholder">No album art</div>';
                deleteBtn.style.display = 'none';
                saveImageBtn.style.display = 'none';
                applyFolderBtn.style.display = 'none';
            }
            
            this.showButtonStatus(button, 'Reset!', 'success', 2000);
        } catch (err) {
            console.error('Error resetting form:', err);
            this.showButtonStatus(button, 'Error', 'error');
        }
    },

    // History functionality
    async loadHistory() {
        try {
            const data = await this.apiCall('/history');
            this.state.historyActions = data.actions;
            this.updateHistoryList();
        } catch (err) {
            console.error('Error loading history:', err);
            document.getElementById('history-list').innerHTML = '<div class="history-error">Error loading history</div>';
        }
    },
    
    updateHistoryList() {
        const historyList = document.getElementById('history-list');
        historyList.innerHTML = '';
        
        if (this.state.historyActions.length === 0) {
            historyList.innerHTML = '<div class="history-loading">No editing history yet</div>';
            return;
        }
        
        this.state.historyActions.forEach(action => {
            const item = document.createElement('div');
            item.className = 'history-item';
            if (action.is_undone) {
                item.className += ' undone';
            }
            if (this.state.selectedHistoryAction === action.id) {
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
            if (this.state.selectedHistoryAction === action.id) {
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
        this.state.selectedHistoryAction = actionId;
        
        // Update list UI - this will recreate all items with correct button states
        if (!skipListUpdate) {
            this.updateHistoryList();
        }
        
        // Load details
        try {
            const details = await this.apiCall(`/history/${actionId}`);
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
        if (!this.state.selectedHistoryAction) return;
        
        try {
            // Get action details before undo
            const actionDetails = await this.apiCall(`/history/${this.state.selectedHistoryAction}`);
            
            // Remember current state
            const currentFileBefore = this.state.currentFile;
            const currentPathBefore = this.state.currentPath;
            
            console.log('Undoing action:', actionDetails.action_type);
            console.log('Current file before undo:', currentFileBefore);
            
            // Perform the undo
            const result = await this.apiCall(`/history/${this.state.selectedHistoryAction}/undo`, {
                method: 'POST'
            });
            
            if (result.status === 'success' || result.status === 'partial') {
                this.showStatus(`Undo successful! ${result.filesUpdated} file(s) reverted.`, 'success');
                
                // Always reload the file list
                await this.loadFiles(currentPathBefore);
                
                // Handle file updates based on action type
                if (result.newPath && actionDetails.action_type === 'file_rename') {
                    // Use the newPath provided by the backend
                    console.log('File rename undo - new path from backend:', result.newPath);
                    
                    this.state.currentFile = result.newPath;
                    this.state.originalFilename = result.newPath.split('/').pop();
                    document.getElementById('current-filename').textContent = this.state.originalFilename;
                    
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
                    const actionIndex = this.state.historyActions.findIndex(a => a.id === result.action.id);
                    if (actionIndex !== -1) {
                        this.state.historyActions[actionIndex] = result.action;
                    }
                }
                
                // Update the history list UI with the updated data
                this.updateHistoryList();
                
            } else {
                this.showStatus(result.error || 'Undo failed', 'error');
                
                // Update the action state even on error
                if (result.action) {
                    const actionIndex = this.state.historyActions.findIndex(a => a.id === result.action.id);
                    if (actionIndex !== -1) {
                        this.state.historyActions[actionIndex] = result.action;
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
        if (!this.state.selectedHistoryAction) return;
        
        try {
            // Get action details before redo
            const actionDetails = await this.apiCall(`/history/${this.state.selectedHistoryAction}`);
            
            // Remember current state
            const currentFileBefore = this.state.currentFile;
            const currentPathBefore = this.state.currentPath;
            
            console.log('Redoing action:', actionDetails.action_type);
            console.log('Current file before redo:', currentFileBefore);
            
            // Perform the redo
            const result = await this.apiCall(`/history/${this.state.selectedHistoryAction}/redo`, {
                method: 'POST'
            });
            
            if (result.status === 'success' || result.status === 'partial') {
                this.showStatus(`Redo successful! ${result.filesUpdated} file(s) updated.`, 'success');
                
                // Always reload the file list
                await this.loadFiles(currentPathBefore);
                
                // Handle file updates based on action type
                if (result.newPath && actionDetails.action_type === 'file_rename') {
                    // Use the newPath provided by the backend
                    console.log('File rename redo - new path from backend:', result.newPath);
                    
                    this.state.currentFile = result.newPath;
                    this.state.originalFilename = result.newPath.split('/').pop();
                    document.getElementById('current-filename').textContent = this.state.originalFilename;
                    
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
                    const actionIndex = this.state.historyActions.findIndex(a => a.id === result.action.id);
                    if (actionIndex !== -1) {
                        this.state.historyActions[actionIndex] = result.action;
                    }
                }
                
                // Update the history list UI with the updated data
                this.updateHistoryList();
                
                // Force re-selection of the current action to ensure proper button states
                // Use setTimeout to ensure DOM has updated
                //setTimeout(async () => {
                //    await this.selectHistoryAction(this.state.selectedHistoryAction, true);
                //}, 0);
                
            } else {
                this.showStatus(result.error || 'Redo failed', 'error');
                
                // Update the action state even on error
                if (result.action) {
                    const actionIndex = this.state.historyActions.findIndex(a => a.id === result.action.id);
                    if (actionIndex !== -1) {
                        this.state.historyActions[actionIndex] = result.action;
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
            const result = await this.apiCall('/history/clear', {
                method: 'POST'
            });
            
            if (result.status === 'success') {
                this.showStatus('History cleared successfully', 'success');
                this.state.historyActions = [];
                this.state.selectedHistoryAction = null;
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
            panel.style.height = `${this.state.historyPanelHeight}px`;
            this.state.historyPanelExpanded = true;
            
            // ADD THIS: Set padding-bottom to accommodate expanded panel
            metadataContent.style.paddingBottom = `${this.state.historyPanelHeight + 20}px`;
            
            const historyList = document.querySelector('.history-list');
            const historyDetails = document.querySelector('.history-details');
            if (historyList && historyDetails) {
                historyList.style.flex = `0 0 ${this.state.historyListWidth}%`;
                historyDetails.style.flex = `0 0 ${100 - this.state.historyListWidth}%`;
            }
            
            // Load history if not already loaded
            if (this.state.historyActions.length === 0) {
                this.loadHistory();
            }
        } else {
            // Store current height before collapsing
            if (panel.offsetHeight > 50) {
                this.state.historyPanelHeight = panel.offsetHeight;
            }
            panel.classList.remove('expanded');
            panel.classList.add('collapsed');
            panel.style.height = '';  // Reset to CSS default
            this.state.historyPanelExpanded = false;
            
            // ADD THIS: Remove padding when collapsed
            metadataContent.style.paddingBottom = '';
        }
    },
    
    startHistoryAutoRefresh() {
        // Auto-refresh history every 5 seconds when panel is expanded
        setInterval(() => {
            if (this.state.historyPanelExpanded) {
                this.loadHistory();
            }
        }, 5000);
    },

    // Utility functions
    setFormEnabled(enabled) {
        const inputs = document.querySelectorAll('#metadata-form input');
        const buttons = document.querySelectorAll('button');
        
        inputs.forEach(input => input.disabled = !enabled);
        buttons.forEach(button => {
            // Skip history panel buttons
            if (button.classList.contains('history-btn') || 
                button.classList.contains('history-clear-btn')) {
                return;
            }
            if (!button.classList.contains('btn-status') || !button.classList.contains('processing')) {
                button.disabled = !enabled;
            }
        });
    },

    showStatus(message, type) {
        // Legacy function - kept for compatibility but hidden - status is now hidden by CSS
        const status = document.getElementById('status');
        status.textContent = message;
        status.className = `status ${type}`;
    },

    hideStatus() {
        // Legacy function - kept for compatibility
        const status = document.getElementById('status');
        status.style.display = 'none';
    }
};

// Global function bindings for onclick handlers in HTML
function setSortMethod(method) {
    AudioMetadataEditor.setSortMethod(method);
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
    AudioMetadataEditor.applyFieldToFolder(field);
}

function saveFieldToFile(field) {
    AudioMetadataEditor.saveFieldToFile(field);
}

function save() {
    AudioMetadataEditor.save();
}

function resetForm() {
    AudioMetadataEditor.resetForm();
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
        if (!AudioMetadataEditor.state.currentFile) return;
        
        document.getElementById('current-filename').style.display = 'none';
        document.querySelector('.filename-edit').style.display = 'flex';
        document.getElementById('filename-input').value = AudioMetadataEditor.state.originalFilename;
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
