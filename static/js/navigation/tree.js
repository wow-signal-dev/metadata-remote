/**
 * Tree Navigation Management for Metadata Remote
 * Handles folder tree loading, building, sorting, and interaction
 */

(function() {
    // Create namespace if it doesn't exist
    window.MetadataRemote = window.MetadataRemote || {};
    window.MetadataRemote.Navigation = window.MetadataRemote.Navigation || {};
    
    // Create shortcuts
    const State = window.MetadataRemote.State;
    const API = window.MetadataRemote.API;
    const UIUtils = window.MetadataRemote.UI.Utilities;
    
    // Store callbacks that will be set during initialization
    let selectTreeItemCallback = null;
    let loadFilesCallback = null;
    
    window.MetadataRemote.Navigation.Tree = {
        /**
         * Initialize the tree module with required callbacks
         * @param {Function} selectTreeItem - Callback for selecting tree items
         * @param {Function} loadFiles - Callback for loading files
         */
        init(selectTreeItem, loadFiles) {
            selectTreeItemCallback = selectTreeItem;
            loadFilesCallback = loadFiles;
        },
        
        /**
         * Load the initial tree structure
         */
        async loadTree() {
            try {
                const data = await API.loadTree();
                State.treeData[''] = data.items;
                this.buildTreeFromData();
            } catch (err) {
                console.error('Error loading tree:', err);
                UIUtils.showStatus('Error loading folders', 'error');
            }
        },

        /**
         * Build the tree from loaded data
         */
        buildTreeFromData() {
            const tree = document.getElementById('folder-tree');
            tree.innerHTML = '';
            
            const sortedItems = this.sortItems(State.treeData[''] || []);
            
            sortedItems.forEach(item => {
                if (item.type === 'folder') {
                    tree.appendChild(this.createTreeItem(item, 0));
                }
            });
            
            // Auto-select the first folder on initial load
            const firstTreeItem = tree.querySelector('.tree-item');
            if (firstTreeItem && !State.selectedTreeItem) {
                // Use the callback to select with keyboard focus
                selectTreeItemCallback(firstTreeItem, true);
                // Also set the focused pane to folders
                State.focusedPane = 'folders';
                // Note: updatePaneFocus is handled by the main app
            }
        },

        /**
         * Rebuild the entire tree maintaining expanded state
         */
        rebuildTree() {
            this.buildTreeFromData();
            
            State.expandedFolders.forEach(path => {
                const element = document.querySelector(`[data-path="${path}"]`);
                if (element && State.treeData[path]) {
                    const children = element.querySelector('.tree-children');
                    if (children && State.treeData[path].length > 0) {
                        this.rebuildChildren(path, children, this.getLevel(path) + 1);
                        children.classList.add('expanded');
                    }
                }
            });
            
            if (State.selectedTreeItem) {
                const path = State.selectedTreeItem.dataset.path;
                const newSelected = document.querySelector(`[data-path="${path}"]`);
                if (newSelected) {
                    newSelected.classList.add('selected');
                    State.selectedTreeItem = newSelected;
                }
            }
        },

        /**
         * Get the depth level of a path
         * @param {string} path - Folder path
         * @returns {number} Depth level
         */
        getLevel(path) {
            return path ? path.split('/').length - 1 : 0;
        },

        /**
         * Rebuild children for a specific folder
         * @param {string} path - Folder path
         * @param {HTMLElement} container - Container element
         * @param {number} level - Depth level
         */
        rebuildChildren(path, container, level) {
            container.innerHTML = '';
            const sortedItems = this.sortItems(State.treeData[path] || []);
            
            sortedItems.forEach(item => {
                if (item.type === 'folder') {
                    container.appendChild(this.createTreeItem(item, level));
                }
            });
        },

        /**
         * Create a tree item element
         * @param {Object} item - Item data
         * @param {number} level - Depth level
         * @returns {HTMLElement} Tree item element
         */
        createTreeItem(item, level) {
            const div = document.createElement('div');
            div.className = 'tree-item';
            div.dataset.path = item.path;
            
            const content = document.createElement('div');
            content.className = 'tree-item-content';
            content.style.paddingLeft = `${level * 1.5 + 1.25}rem`;
            
            const icon = document.createElement('span');
            icon.className = 'tree-icon';
            icon.innerHTML = State.expandedFolders.has(item.path) ? '📂' : '📁';
            
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
                selectTreeItemCallback(div);
                
                // Check if this folder has subfolders
                const hasSubfolders = State.treeData[item.path] && 
                                     State.treeData[item.path].some(child => child.type === 'folder');
                
                const isExpanded = children.classList.contains('expanded');
                
                if (!isExpanded) {
                    if (children.children.length === 0) {
                        this.loadTreeChildren(item.path, children, level + 1);
                    }
                    children.classList.add('expanded');
                    State.expandedFolders.add(item.path);
                    icon.innerHTML = '📂';
                } else {
                    children.classList.remove('expanded');
                    State.expandedFolders.delete(item.path);
                    icon.innerHTML = '📁';
                }
                
                // Always load files regardless of whether folder has subfolders
                loadFilesCallback(item.path);
            };
            
            if (State.treeData[item.path] && State.treeData[item.path].length > 0 && State.expandedFolders.has(item.path)) {
                const sortedItems = this.sortItems(State.treeData[item.path]);
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

        /**
         * Load children for a tree node
         * @param {string} path - Folder path
         * @param {HTMLElement} container - Container element
         * @param {number} level - Depth level
         */
        async loadTreeChildren(path, container, level) {
            try {
                const data = await API.loadTreeChildren(path);
                State.treeData[path] = data.items;
                
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

        /**
         * Sort items based on current sort settings
         * @param {Array} items - Items to sort
         * @returns {Array} Sorted items
         */
        sortItems(items) {
            return items.sort((a, b) => {
                let comparison = 0;
                
                // CHANGED: Use State.foldersSort instead of State.currentSort
                if (State.foldersSort.method === 'name') {
                    comparison = a.name.toLowerCase().localeCompare(b.name.toLowerCase());
                } else if (State.foldersSort.method === 'date') {
                    comparison = (a.created || 0) - (b.created || 0);
                } else if (State.foldersSort.method === 'size') {
                    // Size sorting will need backend support
                    comparison = (a.size || 0) - (b.size || 0);
                }
                
                // CHANGED: Use State.foldersSort.direction
                return State.foldersSort.direction === 'asc' ? comparison : -comparison;
            });
        },

        /**
         * Set the sort method and rebuild tree
         * @param {string} method - Sort method ('name' or 'date')
         */
        setSortMethod(method) {
            // CHANGED: Use State.foldersSort
            if (State.foldersSort.method === method) {
                State.foldersSort.direction = State.foldersSort.direction === 'asc' ? 'desc' : 'asc';
            } else {
                State.foldersSort.method = method;
                State.foldersSort.direction = 'asc';
            }
            
            this.updateSortUI();
            this.rebuildTree();
        },

        /**
         * Update the sort UI to reflect current state
         */
        updateSortUI() {
            // Note: This method will be completely replaced in later subtasks
            // For now, just update the state references
            document.querySelectorAll('.sort-option').forEach(opt => {
                opt.classList.remove('active');
                opt.querySelectorAll('.sort-arrow').forEach(arrow => {
                    arrow.classList.remove('active');
                });
            });
            
            // CHANGED: Use State.foldersSort
            const activeOption = document.getElementById(`sort-${State.foldersSort.method}`);
            if (activeOption) {
                activeOption.classList.add('active');
                const arrow = activeOption.querySelector(`.sort-arrow[data-dir="${State.foldersSort.direction}"]`);
                if (arrow) {
                    arrow.classList.add('active');
                }
            }
        }
    };
})();
