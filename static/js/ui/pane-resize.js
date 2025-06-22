/**
 * Pane Resize Management for Metadata Remote
 * Handles resizing of folder/file/metadata panes and history panel
 */

(function() {
    // Create namespace if it doesn't exist
    window.MetadataRemote = window.MetadataRemote || {};
    window.MetadataRemote.UI = window.MetadataRemote.UI || {};
    
    // Create shortcuts
    const State = window.MetadataRemote.State;
    
    window.MetadataRemote.UI.PaneResize = {
        /**
         * Initialize pane resize functionality
         */
        initializePaneResize() {
            const container = document.querySelector('.container');
            const folders = document.querySelector('.folders');
            const files = document.querySelector('.files');
            const metadata = document.querySelector('.metadata');
            const divider1 = document.getElementById('divider1');
            const divider2 = document.getElementById('divider2');

            // Apply saved or default sizes
            folders.style.flex = `0 0 ${State.savedPaneSizes.folders}%`;
            files.style.flex = `0 0 ${State.savedPaneSizes.files}%`;
            metadata.style.flex = `1`;

            divider1.addEventListener('mousedown', (e) => this.startResize(e, 'divider1'));
            divider2.addEventListener('mousedown', (e) => this.startResize(e, 'divider2'));
        },

        /**
         * Start resizing panes
         * @param {MouseEvent} e - Mouse event
         * @param {string} dividerId - ID of the divider being dragged
         */
        startResize(e, dividerId) {
            const container = document.querySelector('.container');
            const folders = document.querySelector('.folders');
            const files = document.querySelector('.files');
            const metadata = document.querySelector('.metadata');

            State.isResizing = true;
            State.currentDivider = dividerId;
            State.startX = e.clientX;

            const containerWidth = container.offsetWidth;
            State.startWidths.folders = (folders.offsetWidth / containerWidth) * 100;
            State.startWidths.files = (files.offsetWidth / containerWidth) * 100;
            State.startWidths.metadata = (metadata.offsetWidth / containerWidth) * 100;

            document.getElementById(dividerId).classList.add('dragging');
            document.body.style.userSelect = 'none';
            document.body.style.cursor = 'col-resize';

            document.addEventListener('mousemove', this.handleResize.bind(this));
            document.addEventListener('mouseup', this.stopResize.bind(this));
        },

        /**
         * Handle pane resize during drag
         * @param {MouseEvent} e - Mouse event
         */
        handleResize(e) {
            if (!State.isResizing) return;

            const container = document.querySelector('.container');
            const folders = document.querySelector('.folders');
            const files = document.querySelector('.files');

            const containerWidth = container.offsetWidth;
            const deltaX = e.clientX - State.startX;
            const deltaPercent = (deltaX / containerWidth) * 100;

            if (State.currentDivider === 'divider1') {
                const newFoldersWidth = Math.max(15, Math.min(40, State.startWidths.folders + deltaPercent));
                const newFilesWidth = Math.max(20, Math.min(50, State.startWidths.files - deltaPercent));
                
                folders.style.flex = `0 0 ${newFoldersWidth}%`;
                files.style.flex = `0 0 ${newFilesWidth}%`;
            } else if (State.currentDivider === 'divider2') {
                const newFilesWidth = Math.max(20, Math.min(50, State.startWidths.files + deltaPercent));
                const remainingWidth = 100 - State.startWidths.folders - newFilesWidth;
                
                if (remainingWidth >= 30) {
                    files.style.flex = `0 0 ${newFilesWidth}%`;
                }
            }
        },

        /**
         * Stop resizing panes
         */
        stopResize() {
            if (!State.isResizing) return;

            State.isResizing = false;

            if (State.currentDivider) {
                document.getElementById(State.currentDivider).classList.remove('dragging');
            }

            document.body.style.userSelect = '';
            document.body.style.cursor = '';

            const container = document.querySelector('.container');
            const folders = document.querySelector('.folders');
            const files = document.querySelector('.files');
            const containerWidth = container.offsetWidth;
            State.savedPaneSizes.folders = (folders.offsetWidth / containerWidth) * 100;
            State.savedPaneSizes.files = (files.offsetWidth / containerWidth) * 100;

            document.removeEventListener('mousemove', this.handleResize.bind(this));
            document.removeEventListener('mouseup', this.stopResize.bind(this));

            State.currentDivider = null;
        },
        
        /**
         * Start resizing history pane (vertical divider within history panel)
         * @param {MouseEvent} e - Mouse event
         */
        startHistoryPaneResize(e) {
            e.preventDefault();
            e.stopPropagation();
            
            const historyContent = document.querySelector('.history-content');
            const historyList = document.querySelector('.history-list');
            
            State.isResizingHistoryPane = true;
            State.startX = e.clientX;
            State.startHistoryListWidth = (historyList.offsetWidth / historyContent.offsetWidth) * 100;
            
            document.getElementById('history-divider').classList.add('dragging');
            document.body.style.userSelect = 'none';
            document.body.style.cursor = 'col-resize';
            
            document.addEventListener('mousemove', this.handleHistoryPaneResize.bind(this));
            document.addEventListener('mouseup', this.stopHistoryPaneResize.bind(this));
        },
        
        /**
         * Handle history pane resize during drag
         * @param {MouseEvent} e - Mouse event
         */
        handleHistoryPaneResize(e) {
            if (!State.isResizingHistoryPane) return;
            
            const historyContent = document.querySelector('.history-content');
            const historyList = document.querySelector('.history-list');
            const historyDetails = document.querySelector('.history-details');
            
            const contentWidth = historyContent.offsetWidth;
            const deltaX = e.clientX - State.startX;
            const deltaPercent = (deltaX / contentWidth) * 100;
            
            const newListWidth = Math.max(30, Math.min(70, State.startHistoryListWidth + deltaPercent));
            const newDetailsWidth = 100 - newListWidth;
            
            historyList.style.flex = `0 0 ${newListWidth}%`;
            historyDetails.style.flex = `0 0 ${newDetailsWidth}%`;
        },
        
        /**
         * Stop resizing history pane
         */
        stopHistoryPaneResize() {
            if (!State.isResizingHistoryPane) return;
            
            State.isResizingHistoryPane = false;
            
            document.getElementById('history-divider').classList.remove('dragging');
            document.body.style.userSelect = '';
            document.body.style.cursor = '';
            
            // Save the current width
            const historyContent = document.querySelector('.history-content');
            const historyList = document.querySelector('.history-list');
            State.historyListWidth = (historyList.offsetWidth / historyContent.offsetWidth) * 100;
            
            document.removeEventListener('mousemove', this.handleHistoryPaneResize.bind(this));
            document.removeEventListener('mouseup', this.stopHistoryPaneResize.bind(this));
        },
        
        /**
         * Initialize history panel resize functionality
         * Note: This contains the callback for toggleHistoryPanel which will need to be passed in
         */
        initializeHistoryPanelResize(toggleHistoryPanelCallback) {
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
                        State.historyPanelHeight = newHeight;
                        
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
                    toggleHistoryPanelCallback();
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
                        historyHeader.classList.add('resize-hover');
                    } else {
                        historyHeader.style.cursor = 'pointer';
                        historyHeader.classList.remove('resize-hover');
                    }
                }
            });
            
            historyHeader.addEventListener('mouseleave', () => {
                if (!isResizingHistory) {
                    historyHeader.style.cursor = 'pointer';
                    historyHeader.classList.remove('resize-hover');
                }
            });
            
            // Initialize history pane divider
            const historyDivider = document.getElementById('history-divider');
            if (historyDivider) {
                historyDivider.addEventListener('mousedown', (e) => this.startHistoryPaneResize(e));
            }
        }
    };
})();
