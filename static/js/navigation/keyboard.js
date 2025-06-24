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
         * Switch between folder and file panes
         */
        switchPanes() {
            // Determine where we're switching TO
            const switchingToFiles = State.focusedPane === 'folders';
            
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
                State.focusedPane = 'files';
                this.updatePaneFocus();
                
                // Add focus to files pane
                if (!State.selectedListItem || !validFileItems.includes(State.selectedListItem)) {
                    // No file is selected or the selected file is not in the current file list
                    selectFileItemCallback(validFileItems[0], true);
                    validFileItems[0].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                } else {
                    // A file is already selected and it's in the current list, just add keyboard focus to it
                    State.selectedListItem.classList.add('keyboard-focus');
                }
            } else {
                // Switching from files to folders
                
                // Remove keyboard focus from files
                document.querySelectorAll('.files .keyboard-focus').forEach(el => {
                    el.classList.remove('keyboard-focus');
                });
                
                // Switch to folders pane
                State.focusedPane = 'folders';
                this.updatePaneFocus();
                
                // Add focus to folders pane
                if (State.selectedTreeItem) {
                    State.selectedTreeItem.classList.add('keyboard-focus');
                }
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
            
            const container = document.querySelector('.folders');
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
            
            const container = document.querySelector('.files');
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
                const container = document.querySelector('.folders');
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
                const container = document.querySelector('.files');
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
        }
    };
})();
