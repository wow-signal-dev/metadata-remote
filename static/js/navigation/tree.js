/**
 * Tree Navigation Management for Metadata Remote
 * Handles folder tree loading, building, sorting, filtering, and interaction
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
            
            // Set up the new folder controls
            this.setupFolderControls();
        },
        
        /**
         * Set up filter and sort controls for folders pane
         */
        setupFolderControls() {
            // Filter button toggle
            const filterBtn = document.getElementById('folders-filter-btn');
            const filterContainer = document.getElementById('folders-filter');
            const filterInput = document.getElementById('folders-filter-input');
            
            if (filterBtn && filterContainer && filterInput) {
                filterBtn.addEventListener('click', () => {
                    const isActive = filterContainer.classList.contains('active');
                    
                    // Close any open sort dropdown
                    document.getElementById('folders-sort-dropdown').classList.remove('active');
                    State.activeSortDropdown = null;
                    
                    filterContainer.classList.toggle('active');
                    filterBtn.classList.toggle('active');
                    State.activeFilterPane = isActive ? null : 'folders';
                    
                    if (!isActive) {
                        filterInput.focus();
                        State.focusedPane = 'folders';
                    }
                });
                
                // Filter input handler
                filterInput.addEventListener('input', (e) => {
                    State.foldersFilter = e.target.value;
                    this.rebuildTree();
                });
            }
            
            // Sort field button
            const sortBtn = document.getElementById('folders-sort-btn');
            const sortDropdown = document.getElementById('folders-sort-dropdown');
            const sortDirection = document.getElementById('folders-sort-direction');
            const sortIndicator = document.getElementById('folders-sort-indicator');
            
            if (sortBtn && sortDropdown) {
                sortBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    
                    // Close filter if open
                    filterContainer.classList.remove('active');
                    filterBtn.classList.remove('active');
                    State.activeFilterPane = null;
                    
                    const isActive = sortDropdown.classList.contains('active');
                    sortDropdown.classList.toggle('active');
                    State.activeSortDropdown = isActive ? null : 'folders';
                    State.focusedPane = 'folders';
                });
                
                // Sort direction toggle
                sortDirection.addEventListener('click', (e) => {
                    e.stopPropagation();
                    State.foldersSort.direction = State.foldersSort.direction === 'asc' ? 'desc' : 'asc';
                    this.updateSortUI();
                    this.rebuildTree();
                });
                
                // Sort options
                sortDropdown.querySelectorAll('.sort-option').forEach(option => {
                    option.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const sortBy = option.dataset.sort;
                        
                        // When selecting a new field, always start with ascending
                        State.foldersSort.method = sortBy;
                        State.foldersSort.direction = 'asc';
                        
                        this.updateSortUI();
                        this.rebuildTree();
                        sortDropdown.classList.remove('active');
                        State.activeSortDropdown = null;
                    });
                });
            }
            
            // Close dropdowns on outside click
            document.addEventListener('click', (e) => {
                if (!e.target.closest('#folders-sort-dropdown') && !e.target.closest('#folders-sort-btn')) {
                    sortDropdown.classList.remove('active');
                    if (State.activeSortDropdown === 'folders') {
                        State.activeSortDropdown = null;
                    }
                }
            });
        },
        
        /**
         * Filter tree items based on filter text
         * @param {Array} items - Items to filter
         * @param {string} filterText - Filter text
         * @returns {Array} Filtered items
         */
        filterTreeItems(items, filterText) {
            if (!filterText) return items;
            const lower = filterText.toLowerCase();
            return items.filter(item => 
                item.name.toLowerCase().includes(lower)
            );
        },
        
        /**
         * Load the initial tree structure
         */
        async loadTree() {
            try {
                // Set loading state
                document.getElementById('folder-count').textContent = '(loading...)';
                
                const data = await API.loadTree();
                State.treeData[''] = data.items;
                this.buildTreeFromData();
                this.updateSortUI(); // Initialize sort UI
            } catch (err) {
                console.error('Error loading tree:', err);
                UIUtils.showStatus('Error loading folders', 'error');
                // Set error state
                document.getElementById('folder-count').textContent = '(error)';
            }
        },

        /**
         * Build the tree from loaded data
         */
        buildTreeFromData() {
            const tree = document.getElementById('folder-tree');
            tree.innerHTML = '';
            
            // Apply filtering first
            const filteredItems = this.filterTreeItems(State.treeData[''] || [], State.foldersFilter);
            const sortedItems = this.sortItems(filteredItems);
            
            let folderCount = 0;
            sortedItems.forEach(item => {
                if (item.type === 'folder') {
                    tree.appendChild(this.createTreeItem(item, 0));
                    folderCount++;
                }
            });
            
            // Update folder count in the header
            document.getElementById('folder-count').textContent = `(${folderCount})`;
            
            // Auto-select the first folder on initial load
            const firstTreeItem = tree.querySelector('.tree-item');
            if (firstTreeItem && !State.selectedTreeItem) {
                // Use the callback to select with keyboard focus
                selectTreeItemCallback(firstTreeItem, true);
                // Also set the focused pane to folders
                State.focusedPane = 'folders';
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
                        // Update folder icon
                        const icon = element.querySelector('.tree-icon');
                        if (icon) {
                            icon.innerHTML = '📂';
                        }
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
            
            // Apply filtering first
            const filteredItems = this.filterTreeItems(State.treeData[path] || [], State.foldersFilter);
            const sortedItems = this.sortItems(filteredItems);
            
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
            
            // Add double-click handler for rename
            content.ondblclick = (e) => {
                e.stopPropagation();
                e.preventDefault();
                this.startFolderRename(div, item);
            };
            
            if (State.treeData[item.path] && State.treeData[item.path].length > 0 && State.expandedFolders.has(item.path)) {
                // Apply filtering to children
                const filteredChildren = this.filterTreeItems(State.treeData[item.path], State.foldersFilter);
                const sortedItems = this.sortItems(filteredChildren);
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
                
                // Apply filtering
                const filteredItems = this.filterTreeItems(data.items, State.foldersFilter);
                const sortedItems = this.sortItems(filteredItems);
                
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
                
                if (State.foldersSort.method === 'name') {
                    comparison = a.name.toLowerCase().localeCompare(b.name.toLowerCase());
                } else if (State.foldersSort.method === 'date') {
                    // Use created timestamp from the folder data
                    comparison = (a.created || 0) - (b.created || 0);
                } else if (State.foldersSort.method === 'size') {
                    // Size sorting will need backend support
                    // For now, use 0 as default size
                    comparison = (a.size || 0) - (b.size || 0);
                }
                
                return State.foldersSort.direction === 'asc' ? comparison : -comparison;
            });
        },

        /**
         * Set the sort method and rebuild tree
         * @param {string} method - Sort method ('name', 'date', or 'size')
         */
        setSortMethod(method) {
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
            const sortBtn = document.getElementById('folders-sort-btn');
            const sortIndicator = document.getElementById('folders-sort-indicator');
            const sortDropdown = document.getElementById('folders-sort-dropdown');
            
            if (!sortBtn || !sortIndicator || !sortDropdown) return;
            
            // Update button title
            const fieldNames = {
                name: 'Name',
                date: 'Date Modified',
                size: 'Size'
            };
            sortBtn.title = `Sort by: ${fieldNames[State.foldersSort.method] || 'Name'}`;
            
            // Update direction indicator
            sortIndicator.textContent = State.foldersSort.direction === 'asc' ? '▲' : '▼';
            
            // Update active option in dropdown
            sortDropdown.querySelectorAll('.sort-option').forEach(option => {
                option.classList.toggle('active', option.dataset.sort === State.foldersSort.method);
            });
        },
        
        /**
         * Start folder rename editing
         * @param {HTMLElement} folderElement - The folder tree item element
         * @param {Object} item - The folder data object
         */
        startFolderRename(folderElement, item) {
            // Prevent concurrent editing
            if (State.editingFolder && State.editingFolder !== folderElement) {
                return;
            }
            
            // Prevent rapid double-clicks from triggering multiple operations
            if (State.isRenamingFolder) {
                return;
            }
            State.isRenamingFolder = true;
            
            // Transition to inline edit state
            if (window.MetadataRemote.Navigation.StateMachine) {
                window.MetadataRemote.Navigation.StateMachine.transition(
                    window.MetadataRemote.Navigation.StateMachine.States.INLINE_EDIT,
                    { element: folderElement, type: 'folder' }
                );
            }
            
            const content = folderElement.querySelector('.tree-item-content');
            const nameSpan = content.querySelector('span:last-child');
            
            // Hide the name span
            nameSpan.style.display = 'none';
            
            // Create edit container
            const editContainer = document.createElement('div');
            editContainer.className = 'tree-rename-edit';
            editContainer.style.display = 'inline-flex';
            editContainer.style.alignItems = 'center';
            editContainer.style.gap = '0.25rem';
            editContainer.style.flex = '1';
            
            // Create input
            const input = document.createElement('input');
            input.type = 'text';
            input.className = 'tree-rename-input';
            input.value = item.name;
            input.style.flex = '1';
            input.style.minWidth = '100px';
            input.maxLength = 255; // Add length limit
            
            // Create save button with proper structure for button status
            const saveBtn = document.createElement('button');
            saveBtn.className = 'tree-rename-save tree-rename-btn btn-status';
            saveBtn.innerHTML = '<span class="btn-status-content">✓</span><span class="btn-status-message"></span>';
            saveBtn.title = 'Save folder name';
            
            // Create cancel button
            const cancelBtn = document.createElement('button');
            cancelBtn.className = 'tree-rename-cancel tree-rename-btn';
            cancelBtn.innerHTML = '✕'; // Use consistent symbol
            cancelBtn.title = 'Cancel rename';
            
            editContainer.appendChild(input);
            editContainer.appendChild(saveBtn);
            editContainer.appendChild(cancelBtn);
            
            // Insert after the icon
            const icon = content.querySelector('.tree-icon');
            icon.insertAdjacentElement('afterend', editContainer);
            
            // Store editing state
            State.editingFolder = folderElement;
            State.editingFolderData = {
                originalName: item.name,
                path: item.path,
                element: folderElement,
                nameSpan: nameSpan,
                editContainer: editContainer,
                input: input
            };
            
            // Set up event handlers
            const saveFolderName = async () => {
                const newName = input.value.trim();
                if (!newName || newName === item.name) {
                    this.cancelFolderRename();
                    return;
                }
                
                // Comprehensive validation
                const invalidChars = /[<>:"|?*\x00-\x1f]/; // Windows/Unix invalid characters
                if (newName.includes('/') || newName.includes('\\') || invalidChars.test(newName)) {
                    const ButtonStatus = window.MetadataRemote.UI.ButtonStatus;
                    if (ButtonStatus) {
                        ButtonStatus.showButtonStatus(saveBtn, 'Invalid name', 'error', 3000);
                    }
                    return;
                }
                
                // Check reserved names (Windows)
                const reservedNames = ['CON', 'PRN', 'AUX', 'NUL', 'COM1', 'COM2', 'COM3', 'COM4', 
                                      'COM5', 'COM6', 'COM7', 'COM8', 'COM9', 'LPT1', 'LPT2', 
                                      'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9'];
                if (reservedNames.includes(newName.toUpperCase())) {
                    const ButtonStatus = window.MetadataRemote.UI.ButtonStatus;
                    if (ButtonStatus) {
                        ButtonStatus.showButtonStatus(saveBtn, 'Reserved name', 'error', 3000);
                    }
                    return;
                }
                
                // Disable input during save
                input.disabled = true;
                saveBtn.disabled = true;
                cancelBtn.disabled = true;
                
                // Call API to rename folder
                try {
                    const ButtonStatus = window.MetadataRemote.UI.ButtonStatus;
                    if (ButtonStatus) {
                        ButtonStatus.showButtonStatus(saveBtn, '', 'processing');
                    }
                    
                    const result = await API.renameFolder(item.path, newName);
                    
                    if (result.error) {
                        if (ButtonStatus) {
                            ButtonStatus.showButtonStatus(saveBtn, result.error, 'error', 3000);
                        }
                        // Re-enable controls
                        input.disabled = false;
                        saveBtn.disabled = false;
                        cancelBtn.disabled = false;
                        return;
                    }
                    
                    // Update successful - update UI
                    if (ButtonStatus) {
                        ButtonStatus.showButtonStatus(saveBtn, '✓', 'success', 1000);
                    }
                    
                    // Update the item data
                    const oldPath = item.path;
                    item.name = newName;
                    item.path = result.newPath;
                    
                    // Update all UI elements
                    this.updateFolderReferences(oldPath, result.newPath);
                    
                    // Clean up edit UI after brief delay
                    setTimeout(() => {
                        nameSpan.textContent = newName;
                        nameSpan.style.display = '';
                        editContainer.remove();
                        
                        // Clear editing state
                        State.editingFolder = null;
                        State.editingFolderData = null;
                        State.isRenamingFolder = false;
                        
                        // Return to normal state
                        if (window.MetadataRemote.Navigation.StateMachine) {
                            window.MetadataRemote.Navigation.StateMachine.transition(
                                window.MetadataRemote.Navigation.StateMachine.States.NORMAL
                            );
                        }
                    }, 1000);
                    
                } catch (error) {
                    console.error('Error renaming folder:', error);
                    const ButtonStatus = window.MetadataRemote.UI.ButtonStatus;
                    if (ButtonStatus) {
                        ButtonStatus.showButtonStatus(saveBtn, 'Network error', 'error', 3000);
                    }
                    // Re-enable controls
                    input.disabled = false;
                    saveBtn.disabled = false;
                    cancelBtn.disabled = false;
                    State.isRenamingFolder = false;
                }
            };
            
            const cancelRename = () => {
                this.cancelFolderRename();
            };
            
            // Handle focus loss
            const handleBlur = (e) => {
                // Check if focus moved to save/cancel buttons
                if (e.relatedTarget === saveBtn || e.relatedTarget === cancelBtn) {
                    return;
                }
                // Otherwise cancel the rename
                setTimeout(() => {
                    if (State.editingFolder === folderElement) {
                        this.cancelFolderRename();
                    }
                }, 200);
            };
            
            // Attach handlers
            saveBtn.onclick = saveFolderName;
            cancelBtn.onclick = cancelRename;
            input.onblur = handleBlur;
            
            input.onkeydown = (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    saveFolderName();
                } else if (e.key === 'Escape') {
                    e.preventDefault();
                    cancelRename();
                }
            };
            
            // Focus and select input
            input.focus();
            input.select();
        },
        
        /**
         * Cancel folder rename editing
         */
        cancelFolderRename() {
            if (!State.editingFolderData) return;
            
            const { nameSpan, editContainer } = State.editingFolderData;
            
            // Restore original display
            nameSpan.style.display = '';
            editContainer.remove();
            
            // Clear editing state
            State.editingFolder = null;
            State.editingFolderData = null;
            State.isRenamingFolder = false;
            
            // Return to normal state
            if (window.MetadataRemote.Navigation.StateMachine) {
                window.MetadataRemote.Navigation.StateMachine.transition(
                    window.MetadataRemote.Navigation.StateMachine.States.NORMAL
                );
            }
        },
        
        /**
         * Update all folder references after rename
         * @param {string} oldPath - Original folder path
         * @param {string} newPath - New folder path
         */
        updateFolderReferences(oldPath, newPath) {
            // Update tree data keys
            if (State.treeData[oldPath]) {
                State.treeData[newPath] = State.treeData[oldPath];
                delete State.treeData[oldPath];
            }
            
            // Update expanded folders set
            if (State.expandedFolders.has(oldPath)) {
                State.expandedFolders.delete(oldPath);
                State.expandedFolders.add(newPath);
            }
            
            // Update current path if it's affected
            if (State.currentPath === oldPath) {
                State.currentPath = newPath;
            } else if (State.currentPath && State.currentPath.startsWith(oldPath + '/')) {
                State.currentPath = newPath + State.currentPath.substring(oldPath.length);
            }
            
            // Update current file path if affected
            if (State.currentFile && State.currentFile.startsWith(oldPath + '/')) {
                State.currentFile = newPath + State.currentFile.substring(oldPath.length);
            }
            
            // Update all child folder paths in tree data
            Object.keys(State.treeData).forEach(key => {
                if (key.startsWith(oldPath + '/')) {
                    const newKey = newPath + key.substring(oldPath.length);
                    State.treeData[newKey] = State.treeData[key];
                    delete State.treeData[key];
                    
                    // Also update in expanded folders
                    if (State.expandedFolders.has(key)) {
                        State.expandedFolders.delete(key);
                        State.expandedFolders.add(newKey);
                    }
                }
            });
            
            // Update DOM elements
            this.updateDOMPaths(oldPath, newPath);
            
            // Reload files if current folder was affected
            if (State.currentPath === newPath || 
                (State.currentPath && State.currentPath.startsWith(newPath + '/'))) {
                if (loadFilesCallback) {
                    loadFilesCallback(State.currentPath);
                }
            }
        },
        
        /**
         * Update DOM element paths after folder rename
         * @param {string} oldPath - Original folder path
         * @param {string} newPath - New folder path
         */
        updateDOMPaths(oldPath, newPath) {
            // Update the renamed folder's data-path
            const renamedElement = document.querySelector(`[data-path="${oldPath}"]`);
            if (renamedElement) {
                renamedElement.dataset.path = newPath;
            }
            
            // Update all child elements
            document.querySelectorAll(`[data-path^="${oldPath}/"]`).forEach(element => {
                const currentPath = element.dataset.path;
                element.dataset.path = newPath + currentPath.substring(oldPath.length);
            });
        }
    };
})();
