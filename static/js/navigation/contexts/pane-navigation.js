/**
 * Pane Navigation Context
 * Handles navigation between folder, file, and metadata panes
 */

(function() {
    window.MetadataRemote = window.MetadataRemote || {};
    window.MetadataRemote.Navigation = window.MetadataRemote.Navigation || {};
    
    // Shortcuts
    const State = window.MetadataRemote.State;
    const FocusManager = window.MetadataRemote.Navigation.FocusManager;
    const ScrollManager = window.MetadataRemote.Navigation.ScrollManager;
    const StateMachine = window.MetadataRemote.Navigation.StateMachine;
    
    // Callbacks to be set during init
    let callbacks = {
        selectTreeItem: null,
        selectFileItem: null,
        loadFile: null
    };
    
    // Track last focused elements per pane
    const lastFocusedElements = {
        folders: null,
        files: null,
        metadata: null
    };
    
    window.MetadataRemote.Navigation.PaneNavigation = {
        /**
         * Store the currently focused element for a pane
         * @param {string} pane - The pane name
         * @param {HTMLElement} element - The focused element
         */
        storeFocusedElement(pane, element) {
            if (pane && element) {
                lastFocusedElements[pane] = element;
            }
        },
        
        /**
         * Get the recently focused element for a pane
         * @param {string} pane - The pane name
         * @returns {HTMLElement|null} The last focused element or null
         */
        getRecentlyFocusedElement(pane) {
            return lastFocusedElements[pane] || null;
        },
        /**
         * Initialize pane navigation with required callbacks
         * @param {Object} moduleCallbacks - Callback functions
         */
        init(moduleCallbacks) {
            callbacks = moduleCallbacks;
            this.setupPaneClickHandlers();
        },
        
        /**
         * Register keyboard routes for pane navigation
         */
        registerRoutes() {
            const Router = window.KeyboardRouter;
            
            // Tab key for pane switching - normal state
            Router.register(
                { key: 'Tab', state: 'normal', context: '*', target: '*' },
                (event) => {
                    event.preventDefault();
                    this.switchPanes();
                },
                { priority: 60 }
            );
            
            // Tab key for pane switching - header_focus state
            Router.register(
                { key: 'Tab', state: 'header_focus', context: '*', target: '*' },
                (event) => {
                    event.preventDefault();
                    
                    // Close any open sort dropdowns
                    const foldersSortDropdown = document.getElementById('folders-sort-dropdown');
                    const filesSortDropdown = document.getElementById('files-sort-dropdown');
                    if (foldersSortDropdown) {
                        foldersSortDropdown.classList.remove('active');
                    }
                    if (filesSortDropdown) {
                        filesSortDropdown.classList.remove('active');
                    }
                    
                    // Clear header focus first
                    if (window.MetadataRemote.Navigation.Keyboard) {
                        window.MetadataRemote.Navigation.Keyboard.clearHeaderFocus();
                    }
                    
                    // Then switch panes
                    this.switchPanes();
                },
                { priority: 60 }
            );
            
            // Tab key for pane switching - form_edit state (when editing metadata fields)
            Router.register(
                { key: 'Tab', state: 'form_edit', context: '*', target: '*' },
                (event) => {
                    event.preventDefault();
                    
                    // Exit edit mode if currently editing a metadata field
                    if (event.target.tagName === 'INPUT' && event.target.dataset.editing === 'true') {
                        event.target.dataset.editing = 'false';
                        event.target.readOnly = true;
                    }
                    
                    // Transition back to normal state
                    StateMachine.transition(StateMachine.States.NORMAL);
                    
                    // Then switch panes
                    this.switchPanes();
                },
                { priority: 60 }
            );
            
            // Tab key for pane switching - filter_active state (when filter input is active)
            Router.register(
                { key: 'Tab', state: 'filter_active', context: '*', target: '*' },
                (event) => {
                    event.preventDefault();
                    
                    // Close the filter if it's active
                    const State = window.MetadataRemote.State;
                    if (State.filterInputActive) {
                        const filterBtn = document.getElementById(`${State.filterInputActive}-filter-btn`);
                        if (filterBtn) {
                            filterBtn.click(); // Close filter
                        }
                        State.filterInputActive = null;
                    }
                    
                    // Transition back to normal state
                    StateMachine.transition(StateMachine.States.NORMAL);
                    
                    // Then switch panes
                    this.switchPanes();
                },
                { priority: 60 }
            );
        },
        
        /**
         * Set up click handlers for panes
         */
        setupPaneClickHandlers() {
            // Folders pane click handler
            document.querySelector('.folders').addEventListener('click', (e) => {
                State.focusedPane = 'folders';
                this.updatePaneFocus();
            });
            
            // Files pane click handler
            document.querySelector('.files').addEventListener('click', (e) => {
                State.focusedPane = 'files';
                this.updatePaneFocus();
                if (State.loadFileDebounceTimer) {
                    clearTimeout(State.loadFileDebounceTimer);
                }
            });
            
            // Metadata pane click handler
            document.querySelector('.metadata').addEventListener('click', (e) => {
                // Don't change focus if clicking on input/button elements
                if (!e.target.closest('input, button, textarea')) {
                    State.focusedPane = 'metadata';
                    this.updatePaneFocus();
                }
            });
            
            // Initial focus update
            this.updatePaneFocus();
        },
        
        /**
         * Switch between folder, file, and metadata panes
         */
        switchPanes() {
            // console.log('[PaneNavigation] switchPanes called, current pane:', State.focusedPane);
            
            // Clear header focus when switching panes
            if (window.MetadataRemote.Navigation.Keyboard) {
                window.MetadataRemote.Navigation.Keyboard.clearHeaderFocus();
            }
            
            // Remove all keyboard focus indicators
            FocusManager.clearAllKeyboardFocus();
            
            if (State.focusedPane === 'folders') {
                // Switch from folders to files
                const fileItems = Array.from(document.querySelectorAll('#file-list li:not([aria-hidden="true"])'));
                const validFileItems = fileItems.filter(item => item.dataset.filepath);
                
                if (validFileItems.length === 0) {
                    // No valid files, skip to metadata if there's a current file
                    if (State.currentFile) {
                        State.focusedPane = 'metadata';
                        this.focusMetadataPane();
                    }
                    return;
                }
                
                State.focusedPane = 'files';
                this.updatePaneFocus();
                
                // Focus the files pane container
                const filesPane = document.getElementById('files-pane');
                if (filesPane) {
                    filesPane.focus();
                }
                
                // Check for most recently focused file item
                const recentlyFocusedFile = this.getRecentlyFocusedElement('files');
                
                if (recentlyFocusedFile && validFileItems.includes(recentlyFocusedFile)) {
                    callbacks.selectFileItem(recentlyFocusedFile, true);
                    recentlyFocusedFile.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                } else if (!State.selectedListItem || !validFileItems.includes(State.selectedListItem)) {
                    callbacks.selectFileItem(validFileItems[0], true);
                    validFileItems[0].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                } else {
                    FocusManager.addKeyboardFocus(State.selectedListItem);
                }
            } else if (State.focusedPane === 'files') {
                // Switch from files to metadata
                if (State.currentFile) {
                    State.focusedPane = 'metadata';
                    this.focusMetadataPane();
                } else {
                    // No file loaded, go back to folders
                    State.focusedPane = 'folders';
                    this.updatePaneFocus();
                    
                    // Focus the folders pane container
                    const foldersPane = document.getElementById('folders-pane');
                    if (foldersPane) {
                        foldersPane.focus();
                    }
                    
                    if (State.selectedTreeItem) {
                        FocusManager.addKeyboardFocus(State.selectedTreeItem);
                    }
                }
            } else if (State.focusedPane === 'metadata') {
                // Switch from metadata to folders
                // First, explicitly blur the currently focused metadata element
                if (document.activeElement && document.activeElement.closest('.metadata')) {
                    document.activeElement.blur();
                }
                
                State.focusedPane = 'folders';
                this.updatePaneFocus();
                
                // Focus the folders pane container (which has tabindex="0")
                const foldersPane = document.getElementById('folders-pane');
                if (foldersPane) {
                    foldersPane.focus();
                }
                
                if (State.selectedTreeItem) {
                    FocusManager.addKeyboardFocus(State.selectedTreeItem);
                }
            }
            
            // Emit custom event for pane change
            const event = new CustomEvent('panechange', {
                detail: { pane: State.focusedPane }
            });
            window.dispatchEvent(event);
        },
        
        /**
         * Update visual focus indicators for panes
         */
        updatePaneFocus() {
            // Visual focus indicator handled by CSS :focus-within
        },
        
        /**
         * Focus the metadata pane and set focus to Title field
         */
        focusMetadataPane() {
            this.updatePaneFocus();
            
            // Focus the Title field
            const titleField = document.getElementById('title');
            if (titleField) {
                titleField.dataset.editing = 'false';
                titleField.readOnly = true;
                titleField.focus();
                // Don't select text - user must press Enter to edit
                
                // Ensure the title field is visible
                FocusManager.ensureElementVisible(titleField);
            }
        },
        
        /**
         * Get the currently focused pane
         * @returns {string} Current pane name ('folders', 'files', or 'metadata')
         */
        getCurrentPane() {
            return State.focusedPane;
        },
        
        /**
         * Focus a specific pane
         * @param {string} paneName - The pane to focus ('folders', 'files', or 'metadata')
         */
        focusPane(paneName) {
            if (['folders', 'files', 'metadata'].includes(paneName)) {
                State.focusedPane = paneName;
                this.updatePaneFocus();
                
                // Handle specific focus logic for each pane
                if (paneName === 'folders') {
                    const foldersPane = document.getElementById('folders-pane');
                    if (foldersPane) {
                        foldersPane.focus();
                    }
                    if (State.selectedTreeItem) {
                        FocusManager.addKeyboardFocus(State.selectedTreeItem);
                    }
                } else if (paneName === 'files') {
                    const filesPane = document.getElementById('files-pane');
                    if (filesPane) {
                        filesPane.focus();
                    }
                    if (State.selectedListItem) {
                        FocusManager.addKeyboardFocus(State.selectedListItem);
                    }
                } else if (paneName === 'metadata') {
                    this.focusMetadataPane();
                }
                
                // Emit custom event
                const event = new CustomEvent('panechange', {
                    detail: { pane: paneName }
                });
                window.dispatchEvent(event);
            }
        },
        
        /**
         * Get the next pane in the cycle
         * @param {string} current - Current pane name
         * @returns {string} Next pane name
         */
        getNextPane(current) {
            const paneOrder = ['folders', 'files', 'metadata'];
            const currentIndex = paneOrder.indexOf(current);
            if (currentIndex === -1) return 'folders';
            
            // Simple cycle for now, but could be enhanced to skip empty panes
            return paneOrder[(currentIndex + 1) % paneOrder.length];
        },
        
        /**
         * Get the previous pane in the cycle
         * @param {string} current - Current pane name
         * @returns {string} Previous pane name
         */
        getPreviousPane(current) {
            const paneOrder = ['folders', 'files', 'metadata'];
            const currentIndex = paneOrder.indexOf(current);
            if (currentIndex === -1) return 'metadata';
            
            // Simple reverse cycle for now
            return paneOrder[(currentIndex - 1 + paneOrder.length) % paneOrder.length];
        }
    };
})();