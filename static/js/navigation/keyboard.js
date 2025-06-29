/**
 * Keyboard Navigation Management for Metadata Remote
 * Handles all keyboard interactions and navigation
 */

(function() {
    // Create namespace if it doesn't exist
    window.MetadataRemote = window.MetadataRemote || {};
    window.MetadataRemote.Navigation = window.MetadataRemote.Navigation || {};
    
    // Create shortcuts
    const State = window.MetadataRemote.State;
    const TreeNav = window.MetadataRemote.Navigation.Tree;
    
    // Store callbacks that will be set during initialization
    let selectTreeItemCallback = null;
    let selectFileItemCallback = null;
    let loadFileCallback = null;
    let loadFilesCallback = null;
    
    window.MetadataRemote.Navigation.Keyboard = {
        /**
         * Initialize keyboard navigation with required callbacks
         * @param {Object} callbacks - Object containing callback functions
         * @param {Function} callbacks.selectTreeItem - Callback for selecting tree items
         * @param {Function} callbacks.selectFileItem - Callback for selecting file items
         * @param {Function} callbacks.loadFile - Callback for loading a file
         * @param {Function} callbacks.loadFiles - Callback for loading files in a folder
         */
        init(callbacks) {
            selectTreeItemCallback = callbacks.selectTreeItem;
            selectFileItemCallback = callbacks.selectFileItem;
            loadFileCallback = callbacks.loadFile;
            loadFilesCallback = callbacks.loadFiles;
            
            this.setupKeyboardNavigation();
        },
        
        /**
         * Set up all keyboard event handlers
         */
        setupKeyboardNavigation() {
            // Pane click handlers
            document.querySelector('.folders').addEventListener('click', (e) => {
                State.focusedPane = 'folders';
                this.updatePaneFocus();
            });
            
            document.querySelector('.files').addEventListener('click', (e) => {
                State.focusedPane = 'files';
                this.updatePaneFocus();
                if (State.loadFileDebounceTimer) {
                    clearTimeout(State.loadFileDebounceTimer);
                }
            });
            
            document.querySelector('.metadata').addEventListener('click', (e) => {
                // Don't change focus if clicking on input/button elements
                if (!e.target.closest('input, button, textarea')) {
                    State.focusedPane = 'metadata';
                    this.updatePaneFocus();
                }
            });
            
            this.updatePaneFocus();
            
            // Handle blur events for filename editing
            document.addEventListener('blur', (e) => {
                if (e.target.id === 'current-filename' && e.target.contentEditable === 'true') {
                    // Save filename when losing focus
                    this.saveFilenameInPlace(e.target);
                }
            }, true);
            
            // Handle click events on metadata input fields to immediately activate editing
            document.addEventListener('click', (e) => {
                if (e.target.tagName === 'INPUT' && e.target.type === 'text' && 
                    e.target.closest('.metadata') && e.target.dataset.editing === 'false') {
                    
                    // Clear focus from any other metadata input fields first
                    document.querySelectorAll('.metadata input[type="text"]').forEach(input => {
                        if (input !== e.target) {
                            input.blur();
                            input.dataset.editing = 'false';
                            input.readOnly = true;
                        }
                    });
                    
                    // Immediately activate editing mode on click
                    e.target.dataset.editing = 'true';
                    e.target.readOnly = false;
                    
                    // Position cursor at the click location (default behavior)
                    // Show inference suggestions if field is empty and we have a current file
                    if (e.target.value.trim() === '' && State.currentFile && 
                        window.MetadataRemote.Metadata.Inference) {
                        setTimeout(() => {
                            window.MetadataRemote.Metadata.Inference.showInferenceSuggestions(e.target.id);
                        }, 0);
                    }
                }
            });
            
            // Global keyboard handler with custom repeat
            document.addEventListener('keydown', (e) => {
                // Handle header icon navigation
                if (this.isHeaderIconFocused()) {
                    if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'Enter') {
                        e.preventDefault();
                        this.handleHeaderNavigation(e.key);
                        return;
                    }
                }
                
                // Handle metadata pane navigation
                if (State.focusedPane === 'metadata') {
                    // Handle TAB key to switch panes - this takes priority
                    if (e.key === 'Tab') {
                        e.preventDefault();
                        this.switchPanes();
                        return;
                    }
                    
                    // Handle Enter key on buttons
                    if (e.key === 'Enter' && e.target.tagName === 'BUTTON') {
                        e.preventDefault();
                        e.target.click();
                        return;
                    }
                    
                    // Handle navigation on buttons and non-editable elements
                    if ((e.target.tagName === 'BUTTON' || e.target.id === 'current-filename') &&
                        (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
                        e.preventDefault();
                        this.navigateMetadata(e.key);
                        return;
                    }
                    
                    // Handle input fields
                    if (e.target.tagName === 'INPUT' && e.target.type === 'text') {
                        // Check if field is in edit mode
                        const isEditing = e.target.dataset.editing === 'true';
                        
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            if (isEditing) {
                                // Exit edit mode - keep focus without blur/refocus cycle
                                e.target.dataset.editing = 'false';
                                e.target.readOnly = true;
                                // Keep the element focused for navigation without creating a focus cycle
                            } else {
                                // Enter edit mode
                                e.target.dataset.editing = 'true';
                                e.target.readOnly = false;
                                // Position cursor at end of text instead of selecting all
                                setTimeout(() => {
                                    e.target.setSelectionRange(e.target.value.length, e.target.value.length);
                                }, 0);
                                
                                // Show inference suggestions if field is empty and we have a current file
                                if (e.target.value.trim() === '' && State.currentFile && 
                                    window.MetadataRemote.Metadata.Inference) {
                                    window.MetadataRemote.Metadata.Inference.showInferenceSuggestions(e.target.id);
                                }
                            }
                            return;
                        } else if (e.key === 'Escape' && isEditing) {
                            e.preventDefault();
                            // Exit edit mode - keep focus without blur/refocus cycle
                            e.target.dataset.editing = 'false';
                            e.target.readOnly = true;
                            // Keep the element focused for navigation without creating a focus cycle
                            return;
                        } else if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && isEditing) {
                            e.preventDefault();
                            // Exit edit mode and navigate
                            e.target.dataset.editing = 'false';
                            e.target.readOnly = true;
                            // Navigate in the specified direction
                            this.navigateMetadata(e.key);
                            return;
                        } else if ((e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !isEditing) {
                            // Navigate only when not in edit mode
                            e.preventDefault();
                            this.navigateMetadata(e.key);
                            return;
                        }
                        // When in edit mode, allow normal arrow key behavior for cursor movement
                    }
                    
                    // Handle special case for current filename
                    if (e.target.id === 'current-filename') {
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            if (e.target.contentEditable === 'true') {
                                // Exit edit mode and save
                                this.saveFilenameInPlace(e.target);
                            } else {
                                // Enter edit mode
                                this.navigateMetadata('Enter');
                            }
                            return;
                        } else if (e.key === 'Escape' && e.target.contentEditable === 'true') {
                            e.preventDefault();
                            // Exit edit mode without saving
                            e.target.textContent = State.originalFilename;
                            e.target.contentEditable = false;
                            e.target.dataset.editing = 'false';
                            e.target.focus();
                            return;
                        } else if (e.target.contentEditable === 'true' && 
                                   (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
                            // Allow normal text editing in contentEditable mode
                            return;
                        }
                    }
                }
                
                // Handle filter input arrow key behavior
                if (State.filterInputActive && e.target.classList.contains('filter-input')) {
                    if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                        e.preventDefault();
                        // Store the pane before clearing state
                        const currentPane = State.filterInputActive;
                        // Close the filter
                        const filterBtn = document.getElementById(`${currentPane}-filter-btn`);
                        if (filterBtn) {
                            filterBtn.click(); // Close filter
                        }
                        State.filterInputActive = null;
                        
                        // Navigate based on the arrow key
                        if (e.key === 'ArrowDown') {
                            // Go to topmost item in the pane
                            this.returnToPaneFromHeader(currentPane);
                        } else if (e.key === 'ArrowUp') {
                            // Go to help icon
                            this.navigateToHeaderIcon('metadata', 'help');
                        } else if (e.key === 'ArrowLeft') {
                            // Go to filter icon (stay where we are conceptually)
                            this.navigateToHeaderIcon(currentPane, 'filter');
                        } else if (e.key === 'ArrowRight') {
                            // Go to sort icon
                            this.navigateToHeaderIcon(currentPane, 'sort');
                        }
                        return;
                    } else if (e.key === 'Escape' || e.key === 'Enter') {
                        e.preventDefault();
                        // Store the pane before clearing state
                        const currentPane = State.filterInputActive;
                        // Close the filter
                        const filterBtn = document.getElementById(`${currentPane}-filter-btn`);
                        if (filterBtn) {
                            filterBtn.click(); // Close filter
                        }
                        State.filterInputActive = null;
                        
                        // Move focus to the topmost item in the pane
                        this.returnToPaneFromHeader(currentPane);
                        return;
                    }
                }

                // Normal input field behavior - skip keyboard navigation
                if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
                    return;
                }

                // Filter shortcut: / (forward slash)
                if (e.key === '/' && !e.ctrlKey && !e.shiftKey) {
                    e.preventDefault();
                    const filterBtn = document.getElementById(`${State.focusedPane}-filter-btn`);
                    if (filterBtn) filterBtn.click();
                }
                
                // Filter shortcut: Ctrl+F
                if (e.ctrlKey && e.key === 'f') {
                    e.preventDefault();
                    const filterBtn = document.getElementById(`${State.focusedPane}-filter-btn`);
                    if (filterBtn) filterBtn.click();
                }
                
                // Sort reverse: Ctrl+Shift+S
                if (e.ctrlKey && e.shiftKey && e.key === 'S') {
                    e.preventDefault();
                    const dirBtn = document.getElementById(`${State.focusedPane}-sort-direction`);
                    if (dirBtn) dirBtn.click();
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
                    if (State.keyRepeatDelayTimer) {
                        clearTimeout(State.keyRepeatDelayTimer);
                        State.keyRepeatDelayTimer = null;
                    }
                    if (State.keyRepeatTimer) {
                        clearInterval(State.keyRepeatTimer);
                        State.keyRepeatTimer = null;
                    }
                    
                    // Store which key is being held
                    State.keyHeldDown = e.key;
                    State.isKeyRepeating = false;
                    
                    // Perform the initial navigation
                    this.navigateWithArrows(e.key === 'ArrowUp' ? 'up' : 'down');
                    
                    // Set up custom repeat with initial delay
                    State.keyRepeatDelayTimer = setTimeout(() => {
                        // Only start repeating if the same key is still held down
                        if (State.keyHeldDown === e.key) {
                            State.isKeyRepeating = true;
                            State.keyRepeatTimer = setInterval(() => {
                                if (State.keyHeldDown === e.key) {
                                    this.navigateWithArrows(e.key === 'ArrowUp' ? 'up' : 'down');
                                }
                            }, State.keyRepeatInterval);
                        }
                    }, State.keyRepeatDelay);
                    
                } else if (e.key === 'PageUp' || e.key === 'PageDown') {
                    e.preventDefault();
                    
                    // Add keyboard navigating class for consistent behavior
                    document.querySelector('.folders').classList.add('keyboard-navigating');
                    document.querySelector('.files').classList.add('keyboard-navigating');
                    
                    // Navigate by page
                    this.navigateByPage(e.key === 'PageUp' ? 'up' : 'down');
                    
                    // Remove keyboard navigating class after a short delay
                    setTimeout(() => {
                        document.querySelector('.folders').classList.remove('keyboard-navigating');
                        document.querySelector('.files').classList.remove('keyboard-navigating');
                    }, 100);
                    
                } else if (e.key === 'Enter') {
                    e.preventDefault();
                    this.activateCurrentItem();
                } else if (e.key === 'Tab') {
                    e.preventDefault();
                    this.switchPanes();
                }
            });
            
            // Keyup handler to stop custom repeat
            document.addEventListener('keyup', (e) => {
                if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
                    return;
                }
                
                // If this key was being held down, stop the repeat
                if (State.keyHeldDown === e.key) {
                    State.keyHeldDown = null;
                    State.isKeyRepeating = false;
                    
                    // Remove keyboard navigating class
                    document.querySelector('.folders').classList.remove('keyboard-navigating');
                    document.querySelector('.files').classList.remove('keyboard-navigating');
                    
                    // Clear BOTH the delay timer and repeat timer
                    if (State.keyRepeatDelayTimer) {
                        clearTimeout(State.keyRepeatDelayTimer);
                        State.keyRepeatDelayTimer = null;
                    }
                    if (State.keyRepeatTimer) {
                        clearInterval(State.keyRepeatTimer);
                        State.keyRepeatTimer = null;
                    }
                }
                // Handle PageUp/PageDown keyup to ensure clean state
                if (e.key === 'PageUp' || e.key === 'PageDown') {
                    // Remove keyboard navigating class if it's still there
                    document.querySelector('.folders').classList.remove('keyboard-navigating');
                    document.querySelector('.files').classList.remove('keyboard-navigating');
                }
            });
                            
            // Clear key state on window blur to prevent stuck keys
            window.addEventListener('blur', () => {
                State.keyHeldDown = null;
                State.isKeyRepeating = false;
                
                // Clear BOTH timers on blur
                if (State.keyRepeatDelayTimer) {
                    clearTimeout(State.keyRepeatDelayTimer);
                    State.keyRepeatDelayTimer = null;
                }
                if (State.keyRepeatTimer) {
                    clearInterval(State.keyRepeatTimer);
                    State.keyRepeatTimer = null;
                }
            });
        },

        /**
         * Update visual focus indicators for panes
         */
        updatePaneFocus() {
            // Visual focus indicator handled by CSS :focus-within
        },
        
        /**
         * Switch between folder, file, and metadata panes
         */
        switchPanes() {
            // Clear header focus when switching panes
            this.clearHeaderFocus();
            
            // Remove all keyboard focus indicators
            document.querySelectorAll('.keyboard-focus').forEach(el => {
                el.classList.remove('keyboard-focus');
            });
            
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
                
                if (!State.selectedListItem || !validFileItems.includes(State.selectedListItem)) {
                    selectFileItemCallback(validFileItems[0], true);
                    validFileItems[0].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                } else {
                    State.selectedListItem.classList.add('keyboard-focus');
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
                        State.selectedTreeItem.classList.add('keyboard-focus');
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
                    State.selectedTreeItem.classList.add('keyboard-focus');
                }
            }
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
                this.ensureElementVisible(titleField);
            }
        },
        
        /**
         * Scroll item to center of container with smooth scrolling
         * @param {HTMLElement} item - Item to scroll to
         * @param {HTMLElement} container - Container element
         */
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
            if (State.isKeyRepeating) {
                container.scrollTop = Math.max(0, Math.min(newScroll, maxScroll));
            } else {
                container.scrollTo({
                    top: Math.max(0, Math.min(newScroll, maxScroll)),
                    behavior: 'smooth'
                });
            }
        },

        /**
         * Immediate centering without animation
         * @param {HTMLElement} item - Item to scroll to
         * @param {HTMLElement} container - Container element
         */
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

        /**
         * Navigate with arrow keys
         * @param {string} direction - 'up' or 'down'
         */
        navigateWithArrows(direction) {
            if (State.focusedPane === 'folders') {
                this.navigateFolders(direction);
            } else if (State.focusedPane === 'files') {
                this.navigateFiles(direction);
            }
        },

        /**
         * Navigate by page with PageUp/PageDown keys
         * @param {string} direction - 'up' or 'down'
         */
        navigateByPage(direction) {
            if (State.focusedPane === 'folders') {
                this.navigateFoldersByPage(direction);
            } else if (State.focusedPane === 'files') {
                this.navigateFilesByPage(direction);
            }
        },
        
        /**
         * Calculate visible items per page for a container
         * @param {HTMLElement} container - Container element
         * @param {string} itemSelector - Selector for items
         * @returns {number} Number of visible items per page
         */
        calculateItemsPerPage(container, itemSelector) {
            const containerHeight = container.clientHeight;
            const items = container.querySelectorAll(itemSelector);
            
            if (items.length === 0) return 10; // Default fallback
            
            // Get average item height from first few items
            let totalHeight = 0;
            let count = Math.min(5, items.length);
            
            for (let i = 0; i < count; i++) {
                totalHeight += items[i].offsetHeight;
            }
            
            const avgItemHeight = totalHeight / count;
            
            // Account for headers and padding
            const effectiveHeight = containerHeight - 60; // Approximate header height
            
            // Calculate items per page (leave one item for context)
            return Math.max(1, Math.floor(effectiveHeight / avgItemHeight) - 1);
        },
        
        /**
         * Navigate folders by page
         * @param {string} direction - 'up' or 'down'
         */
        navigateFoldersByPage(direction) {
            const visibleFolders = this.getVisibleFolders();
            if (visibleFolders.length === 0) return;
            
            const container = document.querySelector('.folders-scroll-area');
            const itemsPerPage = this.calculateItemsPerPage(container, '.tree-item:not(.collapsed)');
            
            let currentIndex = -1;
            if (State.selectedTreeItem) {
                currentIndex = visibleFolders.findIndex(item => item === State.selectedTreeItem);
            }
            
            let newIndex;
            if (currentIndex === -1) {
                newIndex = direction === 'up' ? visibleFolders.length - 1 : 0;
            } else if (direction === 'up') {
                newIndex = Math.max(0, currentIndex - itemsPerPage);
            } else {
                newIndex = Math.min(visibleFolders.length - 1, currentIndex + itemsPerPage);
            }
            
            if (visibleFolders[newIndex] && newIndex !== currentIndex) {
                selectTreeItemCallback(visibleFolders[newIndex], true);
                
                // Scroll to the new item
                this.immediateScrollToCenter(visibleFolders[newIndex], container);
            }
        },
        
        /**
         * Navigate files by page
         * @param {string} direction - 'up' or 'down'
         */
        navigateFilesByPage(direction) {
            const fileItems = Array.from(document.querySelectorAll('#file-list li:not([aria-hidden="true"])'))
                .filter(item => item.dataset.filepath);
            if (fileItems.length === 0) return;
            
            const container = document.querySelector('.files-scroll-area');
            const itemsPerPage = this.calculateItemsPerPage(container, '#file-list li:not([aria-hidden="true"])');
            
            let currentIndex = -1;
            if (State.selectedListItem) {
                currentIndex = fileItems.findIndex(item => item === State.selectedListItem);
            }
            
            let newIndex;
            if (currentIndex === -1) {
                newIndex = direction === 'up' ? fileItems.length - 1 : 0;
            } else if (direction === 'up') {
                newIndex = Math.max(0, currentIndex - itemsPerPage);
            } else {
                newIndex = Math.min(fileItems.length - 1, currentIndex + itemsPerPage);
            }
            
            if (fileItems[newIndex] && newIndex !== currentIndex) {
                selectFileItemCallback(fileItems[newIndex], true);
                
                // Scroll to the new item
                this.immediateScrollToCenter(fileItems[newIndex], container);
            }
        },
        
        /**
         * Navigate folders with arrow keys
         * @param {string} direction - 'up' or 'down'
         */
        navigateFolders(direction) {
            const visibleFolders = this.getVisibleFolders();
            if (visibleFolders.length === 0) return;
            
            let currentIndex = -1;
            if (State.selectedTreeItem) {
                currentIndex = visibleFolders.findIndex(item => item === State.selectedTreeItem);
            }
            
            // Check if we're at the topmost item and trying to go up
            if (direction === 'up' && currentIndex === 0) {
                this.navigateToHeaderIcon('folders', 'filter');
                return;
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
                selectTreeItemCallback(visibleFolders[newIndex], true);
                
                // Always use immediate scrolling during arrow navigation for smooth performance
                const container = document.querySelector('.folders-scroll-area');
                this.immediateScrollToCenter(visibleFolders[newIndex], container);
            }
        },

        /**
         * Navigate files with arrow keys
         * @param {string} direction - 'up' or 'down'
         */
        navigateFiles(direction) {
            const fileItems = Array.from(document.querySelectorAll('#file-list li:not([aria-hidden="true"])'))
                .filter(item => item.dataset.filepath);
            if (fileItems.length === 0) return;
            
            let currentIndex = -1;
            if (State.selectedListItem) {
                currentIndex = fileItems.findIndex(item => item === State.selectedListItem);
            }
            
            // Check if we're at the topmost item and trying to go up
            if (direction === 'up' && currentIndex === 0) {
                this.navigateToHeaderIcon('files', 'filter');
                return;
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
                selectFileItemCallback(fileItems[newIndex], true);
                
                // Always use immediate scrolling during arrow navigation for smooth performance
                const container = document.querySelector('.files-scroll-area');
                this.immediateScrollToCenter(fileItems[newIndex], container);
            }
        },

        /**
         * Get all visible folders in the tree
         * @returns {Array<HTMLElement>} Array of visible folder elements
         */
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

        /**
         * Activate the currently selected item (Enter key)
         */
        activateCurrentItem() {
            if (State.focusedPane === 'folders' && State.selectedTreeItem) {
                const children = State.selectedTreeItem.querySelector('.tree-children');
                const folderPath = State.selectedTreeItem.dataset.path;
                
                // Check if we haven't loaded this folder's data yet
                const dataNotLoaded = !State.treeData.hasOwnProperty(folderPath);
                
                // Check if this folder has subfolders in the data
                const hasSubfolders = dataNotLoaded || 
                                     (State.treeData[folderPath] && 
                                      State.treeData[folderPath].some(item => item.type === 'folder'));
                
                // Check if already expanded and has visible subfolder elements
                const hasVisibleSubfolders = children && children.classList.contains('expanded') && 
                                            children.querySelectorAll('.tree-item').length > 0;
                
                if (hasSubfolders || hasVisibleSubfolders) {
                    // Has subfolders - just toggle expand/collapse without loading files
                    const icon = State.selectedTreeItem.querySelector('.tree-icon');
                    const isExpanded = children.classList.contains('expanded');
                    
                    if (!isExpanded) {
                        // Expand
                        if (children.children.length === 0) {
                            // Load children if not already loaded
                            TreeNav.loadTreeChildren(folderPath, children, TreeNav.getLevel(folderPath) + 1);
                        }
                        children.classList.add('expanded');
                        State.expandedFolders.add(folderPath);
                        if (icon) icon.innerHTML = '📂';
                    } else {
                        // Collapse
                        children.classList.remove('expanded');
                        State.expandedFolders.delete(folderPath);
                        if (icon) icon.innerHTML = '📁';
                    }
                    // DO NOT load files, DO NOT move focus - just return
                    return;
                } else {
                    // No subfolders - do nothing
                    return;
                }
            } else if (State.focusedPane === 'files' && State.selectedListItem) {
                const filepath = State.selectedListItem.dataset.filepath;
                if (filepath) {
                    loadFileCallback(filepath, State.selectedListItem);
                }
            }
        },
        
        /**
         * Navigate within the metadata pane using arrow keys
         * @param {string} key - The arrow key pressed
         */
        navigateMetadata(key) {
            const activeElement = document.activeElement;
            const metadataSection = document.getElementById('metadata-section');
            if (!metadataSection) return;
            
            // Define the navigation order
            const navigableElements = [
                'current-filename',
                'filename-input',
                'filename-save',
                'filename-reset',
                'filename-cancel',
                '.upload-btn',
                '.delete-art-btn',
                'title',
                'artist', 
                'album',
                'albumartist',
                'composer',
                'genre',
                'track',
                'disc',
                'date',
                '.save-btn',
                '.clear-btn'
            ];
            
            // Build list of visible focusable elements
            const focusableElements = [];
            
            navigableElements.forEach(selector => {
                let elements;
                if (selector.startsWith('.')) {
                    elements = metadataSection.querySelectorAll(selector);
                } else if (selector.startsWith('#')) {
                    const el = metadataSection.querySelector(selector);
                    elements = el ? [el] : [];
                } else {
                    const el = document.getElementById(selector);
                    elements = el ? [el] : [];
                }
                
                elements.forEach(el => {
                    if (el && el.offsetParent !== null && !el.disabled) {
                        focusableElements.push(el);
                    }
                });
            });
            
            // Add dynamically visible buttons (apply to file/folder buttons)
            const visibleApplyButtons = metadataSection.querySelectorAll('.apply-field-controls.visible button');
            visibleApplyButtons.forEach(btn => {
                if (!focusableElements.includes(btn)) {
                    // Insert after the corresponding field
                    const field = btn.closest('.form-group-with-button')?.querySelector('input');
                    if (field) {
                        const fieldIndex = focusableElements.indexOf(field);
                        if (fieldIndex !== -1) {
                            focusableElements.splice(fieldIndex + 1, 0, btn);
                        }
                    }
                }
            });
            
            // Handle filename navigation
            if (activeElement.id === 'current-filename' && key === 'Enter') {
                // Make filename editable in place
                const filenameElement = activeElement;
                const currentText = filenameElement.textContent;
                
                // Store original value
                window.MetadataRemote.State.originalFilename = currentText;
                
                // Make it editable
                filenameElement.contentEditable = true;
                filenameElement.dataset.editing = 'true';
                
                // Position cursor at end of text instead of selecting all
                setTimeout(() => {
                    const range = document.createRange();
                    const sel = window.getSelection();
                    range.selectNodeContents(filenameElement);
                    range.collapse(false); // false = collapse to end
                    sel.removeAllRanges();
                    sel.addRange(range);
                }, 0);
                
                return;
            }
            
            const currentIndex = focusableElements.indexOf(activeElement);
            let nextIndex = -1;
            
            if (key === 'ArrowUp') {
                // Check if we're on the filename (topmost element) and go to help icon
                if (activeElement.id === 'current-filename') {
                    this.navigateToHeaderIcon('metadata', 'help');
                    return;
                }
                nextIndex = currentIndex > 0 ? currentIndex - 1 : focusableElements.length - 1;
            } else if (key === 'ArrowDown') {
                nextIndex = currentIndex < focusableElements.length - 1 ? currentIndex + 1 : 0;
            } else if (key === 'ArrowLeft' || key === 'ArrowRight') {
                // Handle horizontal navigation for grouped fields
                const parentGroup = activeElement.closest('.form-group-three-column');
                if (parentGroup) {
                    const inputs = Array.from(parentGroup.querySelectorAll('input'));
                    const inputIndex = inputs.indexOf(activeElement);
                    
                    if (key === 'ArrowLeft' && inputIndex > 0) {
                        inputs[inputIndex - 1].focus();
                        // Position cursor at end instead of selecting all
                        setTimeout(() => {
                            const input = inputs[inputIndex - 1];
                            input.setSelectionRange(input.value.length, input.value.length);
                        }, 0);
                    } else if (key === 'ArrowRight' && inputIndex < inputs.length - 1) {
                        inputs[inputIndex + 1].focus();
                        // Position cursor at end instead of selecting all
                        setTimeout(() => {
                            const input = inputs[inputIndex + 1];
                            input.setSelectionRange(input.value.length, input.value.length);
                        }, 0);
                    }
                }
                
                // Handle horizontal navigation for buttons in same row
                const buttonParent = activeElement.closest('.filename-edit, .album-art-controls, .apply-field-controls, .buttons');
                if (buttonParent) {
                    const buttons = Array.from(buttonParent.querySelectorAll('button:not([disabled])'))
                        .filter(btn => btn.offsetParent !== null);
                    const buttonIndex = buttons.indexOf(activeElement);
                    
                    if (key === 'ArrowLeft' && buttonIndex > 0) {
                        buttons[buttonIndex - 1].focus();
                    } else if (key === 'ArrowRight' && buttonIndex < buttons.length - 1) {
                        buttons[buttonIndex + 1].focus();
                    }
                }
                return;
            }
            
            if (nextIndex !== -1 && focusableElements[nextIndex]) {
                focusableElements[nextIndex].focus();
                if (focusableElements[nextIndex].tagName === 'INPUT') {
                    // Set to non-edit mode when navigating to input
                    focusableElements[nextIndex].dataset.editing = 'false';
                    focusableElements[nextIndex].readOnly = true;
                }
                
                // Auto-scroll to ensure the focused element is visible
                this.ensureElementVisible(focusableElements[nextIndex]);
            }
        },
        
        /**
         * Save filename when edited in place
         * @param {HTMLElement} filenameElement - The filename display element
         */
        async saveFilenameInPlace(filenameElement) {
            const newName = filenameElement.textContent.trim();
            const originalName = State.originalFilename;
            
            // Exit edit mode
            filenameElement.contentEditable = false;
            filenameElement.dataset.editing = 'false';
            
            // If no change, just return
            if (newName === originalName || !newName) {
                filenameElement.textContent = originalName;
                return;
            }
            
            try {
                const API = window.MetadataRemote.API;
                const result = await API.renameFile(State.currentFile, newName);
                
                if (result.status === 'success') {
                    State.currentFile = result.newPath;
                    State.originalFilename = newName;
                    filenameElement.textContent = newName;
                    
                    // Reload files and history
                    if (window.AudioMetadataEditor && window.AudioMetadataEditor.loadFiles) {
                        window.AudioMetadataEditor.loadFiles(State.currentPath);
                    }
                    if (window.MetadataRemote.History && window.MetadataRemote.History.Manager) {
                        window.MetadataRemote.History.Manager.loadHistory();
                    }
                } else {
                    // Revert on error
                    filenameElement.textContent = originalName;
                    console.error('Error renaming file:', result.error);
                }
            } catch (err) {
                // Revert on error
                filenameElement.textContent = originalName;
                console.error('Error renaming file:', err);
            }
        },

        /**
         * Check if a header icon currently has focus
         * @returns {boolean} True if a header icon is focused
         */
        isHeaderIconFocused() {
            // Check if we have state indicating header focus
            if (State.headerFocus) {
                return true;
            }
            
            // Fallback to checking the active element
            const focusedElement = document.activeElement;
            return focusedElement && (
                focusedElement.classList.contains('control-icon') ||
                focusedElement.classList.contains('help-button') ||
                focusedElement.id === 'help-button'
            );
        },

        /**
         * Navigate to a specific header icon
         * @param {string} pane - 'folders', 'files', or 'metadata'
         * @param {string} iconType - 'filter', 'sort', 'sort-direction', or 'help'
         */
        navigateToHeaderIcon(pane, iconType) {
            // Clear any existing keyboard focus from list items
            document.querySelectorAll('.keyboard-focus').forEach(el => {
                el.classList.remove('keyboard-focus');
            });

            let targetElement;
            
            if (iconType === 'help') {
                // Store previous focus state before navigating to help
                if (State.headerFocus) {
                    State.previousFocusBeforeHelp = { ...State.headerFocus };
                }
                targetElement = document.getElementById('help-button');
            } else if (pane === 'folders') {
                if (iconType === 'filter') {
                    targetElement = document.getElementById('folders-filter-btn');
                } else if (iconType === 'sort') {
                    targetElement = document.getElementById('folders-sort-btn');
                } else if (iconType === 'sort-direction') {
                    targetElement = document.getElementById('folders-sort-direction');
                }
            } else if (pane === 'files') {
                if (iconType === 'filter') {
                    targetElement = document.getElementById('files-filter-btn');
                } else if (iconType === 'sort') {
                    targetElement = document.getElementById('files-sort-btn');
                } else if (iconType === 'sort-direction') {
                    targetElement = document.getElementById('files-sort-direction');
                }
            }

            if (targetElement) {
                // Add keyboard focus indicator
                targetElement.classList.add('keyboard-focus');
                // Focus the element so it can receive keyboard events
                targetElement.focus();
                // Store current header focus state
                State.headerFocus = { pane, iconType };
            }
        },

        /**
         * Handle keyboard navigation within header icons
         * @param {string} key - The key that was pressed
         */
        handleHeaderNavigation(key) {
            // If State.headerFocus is not set, try to determine it from the active element
            if (!State.headerFocus) {
                const activeElement = document.activeElement;
                if (!activeElement) return;
                
                // Check if it's the help button
                if (activeElement.id === 'help-button') {
                    State.headerFocus = { pane: 'metadata', iconType: 'help' };
                } 
                // Check folders pane icons
                else if (activeElement.id === 'folders-filter-btn') {
                    State.headerFocus = { pane: 'folders', iconType: 'filter' };
                } else if (activeElement.id === 'folders-sort-btn') {
                    State.headerFocus = { pane: 'folders', iconType: 'sort' };
                } else if (activeElement.id === 'folders-sort-direction') {
                    State.headerFocus = { pane: 'folders', iconType: 'sort-direction' };
                }
                // Check files pane icons
                else if (activeElement.id === 'files-filter-btn') {
                    State.headerFocus = { pane: 'files', iconType: 'filter' };
                } else if (activeElement.id === 'files-sort-btn') {
                    State.headerFocus = { pane: 'files', iconType: 'sort' };
                } else if (activeElement.id === 'files-sort-direction') {
                    State.headerFocus = { pane: 'files', iconType: 'sort-direction' };
                }
                // If we still don't have a match, return
                else {
                    return;
                }
            }

            const { pane, iconType } = State.headerFocus;

            if (key === 'Enter') {
                if (iconType === 'filter') {
                    // Activate filter and close filter on arrow keys
                    this.activateFilter(pane);
                } else if (iconType === 'help') {
                    // Activate help box directly
                    if (window.MetadataRemote && window.MetadataRemote.showHelp) {
                        window.MetadataRemote.showHelp();
                    } else {
                        // Fallback to button click
                        const helpButton = document.getElementById('help-button');
                        if (helpButton) {
                            // Create and dispatch a click event
                            const clickEvent = new MouseEvent('click', {
                                bubbles: true,
                                cancelable: true,
                                view: window
                            });
                            helpButton.dispatchEvent(clickEvent);
                        }
                    }
                } else {
                    // For sort buttons, just click them
                    document.activeElement.click();
                }
                return;
            }


            // Handle directional navigation
            if (key === 'ArrowUp') {
                if (iconType !== 'help') {
                    this.navigateToHeaderIcon('metadata', 'help');
                }
            } else if (key === 'ArrowDown') {
                // If we're on the help icon and have a previous focus state, return to it
                if (iconType === 'help' && State.previousFocusBeforeHelp) {
                    const { pane: prevPane, iconType: prevIconType } = State.previousFocusBeforeHelp;
                    this.navigateToHeaderIcon(prevPane, prevIconType);
                    State.previousFocusBeforeHelp = null; // Clear the stored state
                } else {
                    // Go back to the appropriate pane's top item
                    this.returnToPaneFromHeader(pane);
                }
            } else if (key === 'ArrowLeft') {
                if (pane === 'folders') {
                    if (iconType === 'sort') {
                        this.navigateToHeaderIcon(pane, 'filter');
                    } else if (iconType === 'sort-direction') {
                        this.navigateToHeaderIcon(pane, 'sort');
                    }
                } else if (pane === 'files') {
                    if (iconType === 'sort') {
                        this.navigateToHeaderIcon(pane, 'filter');
                    } else if (iconType === 'sort-direction') {
                        this.navigateToHeaderIcon(pane, 'sort');
                    }
                }
            } else if (key === 'ArrowRight') {
                if (pane === 'folders') {
                    if (iconType === 'filter') {
                        this.navigateToHeaderIcon(pane, 'sort');
                    } else if (iconType === 'sort') {
                        this.navigateToHeaderIcon(pane, 'sort-direction');
                    }
                } else if (pane === 'files') {
                    if (iconType === 'filter') {
                        this.navigateToHeaderIcon(pane, 'sort');
                    } else if (iconType === 'sort') {
                        this.navigateToHeaderIcon(pane, 'sort-direction');
                    }
                }
            }
        },

        /**
         * Activate filter and set up arrow key handling
         * @param {string} pane - 'folders' or 'files'
         */
        activateFilter(pane) {
            const filterBtn = document.getElementById(`${pane}-filter-btn`);
            if (filterBtn) {
                // Clear header focus
                this.clearHeaderFocus();
                // Set state BEFORE clicking to avoid race condition
                State.filterInputActive = pane;
                // Click the filter button to open it
                filterBtn.click();
                // Set up the filter input focus with delay to ensure DOM is ready
                setTimeout(() => {
                    const filterInput = document.getElementById(`${pane}-filter-input`);
                    if (filterInput) {
                        // Focus the input
                        filterInput.focus();
                    }
                }, 50);
            }
        },

        /**
         * Return focus to the appropriate pane's topmost item
         * @param {string} pane - 'folders', 'files', or 'metadata'
         */
        returnToPaneFromHeader(pane) {
            this.clearHeaderFocus();
            
            if (pane === 'folders') {
                State.focusedPane = 'folders';
                const visibleFolders = this.getVisibleFolders();
                if (visibleFolders.length > 0) {
                    selectTreeItemCallback(visibleFolders[0], true);
                }
            } else if (pane === 'files') {
                State.focusedPane = 'files';
                const fileItems = Array.from(document.querySelectorAll('#file-list li:not([aria-hidden="true"])'))
                    .filter(item => item.dataset.filepath);
                if (fileItems.length > 0) {
                    selectFileItemCallback(fileItems[0], true);
                }
            } else if (pane === 'metadata') {
                State.focusedPane = 'metadata';
                const filenameElement = document.getElementById('current-filename');
                if (filenameElement) {
                    filenameElement.focus();
                    // Ensure the filename element is visible
                    this.ensureElementVisible(filenameElement);
                }
            }
        },

        /**
         * Clear header focus indicators and state
         */
        clearHeaderFocus() {
            // Remove keyboard-focus class from all header elements and blur the active one
            document.querySelectorAll('.control-icon, .help-button').forEach(el => {
                el.classList.remove('keyboard-focus');
                // If this element currently has DOM focus, blur it
                if (document.activeElement === el) {
                    el.blur();
                }
            });
            // Clear state
            State.headerFocus = null;
        },
        
        /**
         * Ensure an element is visible within its scrollable container
         * @param {HTMLElement} element - The element to make visible
         */
        ensureElementVisible(element) {
            // Find the scrollable container (metadata-content)
            const scrollContainer = element.closest('.metadata-content');
            if (!scrollContainer) return;
            
            // Get element and container positions
            const elementRect = element.getBoundingClientRect();
            const containerRect = scrollContainer.getBoundingClientRect();
            
            // Calculate dynamic bottom padding based on history panel
            const historyHeader = document.querySelector('.history-header');
            let paddingBottom = 80; // Default padding
            
            if (historyHeader) {
                const historyRect = historyHeader.getBoundingClientRect();
                // If history header is visible within the viewport, adjust padding
                if (historyRect.top < window.innerHeight) {
                    // Add extra padding to ensure element is above the history bar
                    paddingBottom = Math.max(80, window.innerHeight - historyRect.top + 20);
                }
            }
            
            // Calculate visible boundaries with padding
            const paddingTop = 20; // Padding from top edge
            const visibleTop = containerRect.top + paddingTop;
            const visibleBottom = containerRect.bottom - paddingBottom;
            
            // Check if element is above visible area
            if (elementRect.top < visibleTop) {
                // Scroll up to show element with padding
                const scrollAmount = elementRect.top - visibleTop;
                scrollContainer.scrollTop += scrollAmount;
            }
            // Check if element is below visible area
            else if (elementRect.bottom > visibleBottom) {
                // Scroll down to show element with padding
                const scrollAmount = elementRect.bottom - visibleBottom;
                scrollContainer.scrollTop += scrollAmount;
            }
        }
    };
})();
