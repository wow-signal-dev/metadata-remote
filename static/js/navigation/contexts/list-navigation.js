/**
 * List Navigation Context for Metadata Remote
 * Handles arrow key navigation within folder and file lists
 */

(function() {
    // Create namespace if it doesn't exist
    window.MetadataRemote = window.MetadataRemote || {};
    window.MetadataRemote.Navigation = window.MetadataRemote.Navigation || {};
    
    // Create shortcuts - accessed dynamically to avoid initialization order issues
    // const State = window.MetadataRemote.State;
    // const StateMachine = window.MetadataRemote.Navigation.StateMachine;
    
    // Store callbacks that will be set during initialization
    let callbacks = {
        selectTreeItem: null,
        selectFileItem: null,
        loadFile: null,
        loadFiles: null
    };
    
    // Key repeat handler instance
    let keyRepeatHandler = null;
    
    window.MetadataRemote.Navigation.ListNavigation = {
        /**
         * Initialize list navigation with required callbacks
         * @param {Object} callbacksObj - Object containing callback functions
         * @param {Function} callbacksObj.selectTreeItem - Callback for selecting tree items
         * @param {Function} callbacksObj.selectFileItem - Callback for selecting file items
         * @param {Function} callbacksObj.loadFile - Callback for loading a file
         * @param {Function} callbacksObj.loadFiles - Callback for loading files in a folder
         */
        init(callbacksObj) {
            callbacks = { ...callbacksObj };
            
            // Get the global key repeat handler
            keyRepeatHandler = window.MetadataRemote.Navigation.keyRepeatHandler;
            
            this.registerRoutes();
        },
        
        /**
         * Register keyboard routes for list navigation
         */
        registerRoutes() {
            const Router = window.KeyboardRouter;
            
            // Arrow up/down
            ['ArrowUp', 'ArrowDown'].forEach(key => {
                Router.register(
                    { key, state: 'normal', context: { pane: ['folders', 'files'] } },
                    (event) => {
                        event.preventDefault();
                        this.handleArrowNavigation(event.key);
                    },
                    { priority: 70 }
                );
            });
            
            // PageUp/PageDown
            ['PageUp', 'PageDown'].forEach(key => {
                Router.register(
                    { key, state: 'normal', context: { pane: ['folders', 'files'] } },
                    (event) => {
                        event.preventDefault();
                        this.handlePageNavigation(event.key);
                    },
                    { priority: 70 }
                );
            });
            
            // Enter key
            Router.register(
                { key: 'Enter', state: 'normal', context: { pane: ['folders', 'files'] } },
                (event) => {
                    event.preventDefault();
                    this.activateCurrentItem();
                },
                { priority: 70 }
            );
        },
        
        /**
         * Handle arrow navigation with key repeat support
         * @param {string} key - 'ArrowUp' or 'ArrowDown'
         */
        handleArrowNavigation(key) {
            // Add keyboard navigating class
            document.querySelector('.folders').classList.add('keyboard-navigating');
            document.querySelector('.files').classList.add('keyboard-navigating');
            
            // Use KeyRepeatHandler for custom repeat behavior
            if (keyRepeatHandler) {
                keyRepeatHandler.start(key, () => {
                    this.navigateWithArrows(key === 'ArrowUp' ? 'up' : 'down');
                });
                
                // Update state for backward compatibility
                window.MetadataRemote.State.keyHeldDown = key;
                
                // FIXED: isRepeating is a property, not a function
                window.MetadataRemote.State.isKeyRepeating = keyRepeatHandler.isRepeating;
            } else {
                // Fallback if no key repeat handler
                this.navigateWithArrows(key === 'ArrowUp' ? 'up' : 'down');
            }
        },
        
        /**
         * Handle page navigation
         * @param {string} key - 'PageUp' or 'PageDown'
         */
        handlePageNavigation(key) {
            // Add keyboard navigating class for consistent behavior
            document.querySelector('.folders').classList.add('keyboard-navigating');
            document.querySelector('.files').classList.add('keyboard-navigating');
            
            // Navigate by page
            this.navigateByPage(key === 'PageUp' ? 'up' : 'down');
            
            // Remove keyboard navigating class after a short delay
            setTimeout(() => {
                document.querySelector('.folders').classList.remove('keyboard-navigating');
                document.querySelector('.files').classList.remove('keyboard-navigating');
            }, 100);
        },
        
        /**
         * Navigate with arrow keys
         * @param {string} direction - 'up' or 'down'
         */
        navigateWithArrows(direction) {
            if (window.MetadataRemote.State.focusedPane === 'folders') {
                this.navigateFolders(direction);
            } else if (window.MetadataRemote.State.focusedPane === 'files') {
                this.navigateFiles(direction);
            }
        },

        /**
         * Navigate by page with PageUp/PageDown keys
         * @param {string} direction - 'up' or 'down'
         */
        navigateByPage(direction) {
            if (window.MetadataRemote.State.focusedPane === 'folders') {
                this.navigateFoldersByPage(direction);
            } else if (window.MetadataRemote.State.focusedPane === 'files') {
                this.navigateFilesByPage(direction);
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
            if (window.MetadataRemote.State.selectedTreeItem) {
                currentIndex = visibleFolders.findIndex(item => item === window.MetadataRemote.State.selectedTreeItem);
            }
            
            // Check if we're at the topmost item and trying to go up
            if (direction === 'up' && currentIndex === 0) {
                // Transition to header navigation
                const HeaderNav = window.MetadataRemote.Navigation.HeaderNavigation;
                if (HeaderNav && HeaderNav.focusIcon) {
                    window.MetadataRemote.Navigation.StateMachine.transition('header_focus', { from: 'folders' });
                    HeaderNav.focusIcon('folders', 'filter');
                } else {
                    // Fallback to direct header navigation
                    const keyboard = window.MetadataRemote.Navigation.Keyboard;
                    if (keyboard && keyboard.navigateToHeaderIcon) {
                        keyboard.navigateToHeaderIcon('folders', 'filter');
                    }
                }
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
                callbacks.selectTreeItem(visibleFolders[newIndex], true);
                
                // Always use immediate scrolling during arrow navigation for smooth performance
                const container = document.querySelector('.folders-scroll-area');
                
                if (window.MetadataRemote?.Navigation?.ScrollManager) {
                    window.MetadataRemote.Navigation.ScrollManager.immediateScrollToCenter(visibleFolders[newIndex], container);
                } else {
                    // ScrollManager not available, skipping scroll
                }
            }
        },

        /**
         * Navigate files with arrow keys
         * @param {string} direction - 'up' or 'down'
         */
        navigateFiles(direction) {
            const fileItems = Array.from(document.querySelectorAll('#file-list li:not([aria-hidden="true"])'))
                .filter(item => item.dataset.filepath);
            if (fileItems.length === 0) {
                return;
            }
            
            let currentIndex = -1;
            if (window.MetadataRemote.State.selectedListItem) {
                currentIndex = fileItems.findIndex(item => item === window.MetadataRemote.State.selectedListItem);
            }
            
            // Check if we're at the topmost item and trying to go up
            if (direction === 'up' && currentIndex === 0) {
                // Transition to header navigation
                const HeaderNav = window.MetadataRemote.Navigation.HeaderNavigation;
                if (HeaderNav && HeaderNav.focusIcon) {
                    window.MetadataRemote.Navigation.StateMachine.transition('header_focus', { from: 'files' });
                    HeaderNav.focusIcon('files', 'filter');
                } else {
                    // Fallback to direct header navigation
                    const keyboard = window.MetadataRemote.Navigation.Keyboard;
                    if (keyboard && keyboard.navigateToHeaderIcon) {
                        keyboard.navigateToHeaderIcon('files', 'filter');
                    }
                }
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
                callbacks.selectFileItem(fileItems[newIndex], true);
                
                // Always use immediate scrolling during arrow navigation for smooth performance
                const container = document.querySelector('.files-scroll-area');
                
                if (window.MetadataRemote?.Navigation?.ScrollManager) {
                    window.MetadataRemote.Navigation.ScrollManager.immediateScrollToCenter(fileItems[newIndex], container);
                } else {
                    // ScrollManager not available, skipping scroll
                }
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
            if (window.MetadataRemote.State.selectedTreeItem) {
                currentIndex = visibleFolders.findIndex(item => item === window.MetadataRemote.State.selectedTreeItem);
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
                callbacks.selectTreeItem(visibleFolders[newIndex], true);
                
                // Scroll to the new item
                if (window.MetadataRemote?.Navigation?.ScrollManager) {
                    window.MetadataRemote.Navigation.ScrollManager.immediateScrollToCenter(visibleFolders[newIndex], container);
                } else {
                    console.warn('[ListNavigation] ScrollManager not available, skipping scroll');
                }
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
            if (window.MetadataRemote.State.selectedListItem) {
                currentIndex = fileItems.findIndex(item => item === window.MetadataRemote.State.selectedListItem);
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
                callbacks.selectFileItem(fileItems[newIndex], true);
                
                // Scroll to the new item
                if (window.MetadataRemote?.Navigation?.ScrollManager) {
                    window.MetadataRemote.Navigation.ScrollManager.immediateScrollToCenter(fileItems[newIndex], container);
                } else {
                    console.warn('[ListNavigation] ScrollManager not available, skipping scroll');
                }
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
            if (window.MetadataRemote.State.focusedPane === 'folders' && window.MetadataRemote.State.selectedTreeItem) {
                const children = window.MetadataRemote.State.selectedTreeItem.querySelector('.tree-children');
                const folderPath = window.MetadataRemote.State.selectedTreeItem.dataset.path;
                const TreeNav = window.MetadataRemote.Navigation.Tree;
                
                // Check if we haven't loaded this folder's data yet
                const dataNotLoaded = !window.MetadataRemote.State.treeData.hasOwnProperty(folderPath);
                
                // Check if this folder has subfolders in the data
                const hasSubfolders = dataNotLoaded || 
                                     (window.MetadataRemote.State.treeData[folderPath] && 
                                      window.MetadataRemote.State.treeData[folderPath].some(item => item.type === 'folder'));
                
                // Check if already expanded and has visible subfolder elements
                const hasVisibleSubfolders = children && children.classList.contains('expanded') && 
                                            children.querySelectorAll('.tree-item').length > 0;
                
                if (hasSubfolders || hasVisibleSubfolders) {
                    // Has subfolders - just toggle expand/collapse without loading files
                    const icon = window.MetadataRemote.State.selectedTreeItem.querySelector('.tree-icon');
                    const isExpanded = children.classList.contains('expanded');
                    
                    if (!isExpanded) {
                        // Expand
                        if (children.children.length === 0) {
                            // Load children if not already loaded
                            TreeNav.loadTreeChildren(folderPath, children, TreeNav.getLevel(folderPath) + 1);
                        }
                        children.classList.add('expanded');
                        window.MetadataRemote.State.expandedFolders.add(folderPath);
                        if (icon) icon.innerHTML = '📂';
                    } else {
                        // Collapse
                        children.classList.remove('expanded');
                        window.MetadataRemote.State.expandedFolders.delete(folderPath);
                        if (icon) icon.innerHTML = '📁';
                    }
                    // DO NOT load files, DO NOT move focus - just return
                    return;
                } else {
                    // No subfolders - do nothing
                    return;
                }
            } else if (window.MetadataRemote.State.focusedPane === 'files' && window.MetadataRemote.State.selectedListItem) {
                const filepath = window.MetadataRemote.State.selectedListItem.dataset.filepath;
                if (filepath) {
                    callbacks.loadFile(filepath, window.MetadataRemote.State.selectedListItem);
                }
            }
        }
    };
})();