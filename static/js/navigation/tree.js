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

            this.selectedFolderPaths = new Set();
            this.selectionAnchorPath = null;
            
            // Set up the new folder controls
            this.setupFolderControls();

            UIUtils.setupActionsMenuGlobalClose();
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
                State.treeData = { '': data.items };
                this.buildTreeFromData();
                this.updateSortUI(); // Initialize sort UI

                if (this.updateSelectedFolderStats) {
                    await this.updateSelectedFolderStats();
                }
            } catch (err) {
                console.error('Error loading tree:', err);
                UIUtils.showStatus('Error loading folders', 'error');
                // Set error state
                document.getElementById('folder-count').textContent = '(error)';
            }
        },

        /**
         * Reload tree while preserving expanded and selected state.
         * @param {Object} state - State to preserve
         * @param {Array<string>} state.expandedPaths - Expanded folder paths
         * @param {string|null} state.selectedPath - Selected folder path
         */
        async reloadTreePreservingState({ expandedPaths = [], selectedPath = null } = {}) {
            try {
                document.getElementById('folder-count').textContent = '(loading...)';

                const data = await API.loadTree();
                State.treeData = { '': data.items };

                const expandedSet = new Set();

                const addAncestors = (path) => {
                    for (let current = path; current; ) {
                        expandedSet.add(current);
                        const idx = current.lastIndexOf('/');
                        current = idx === -1 ? '' : current.substring(0, idx);
                    }
                };

                expandedPaths.filter(Boolean).forEach(addAncestors);
                if (selectedPath) addAncestors(selectedPath);

                State.expandedFolders = expandedSet;
                State.selectedTreeItem = selectedPath ? { dataset: { path: selectedPath } } : null;

                // Tree rebuild recreates DOM nodes; keep multi-selection consistent.
                this.selectedFolderPaths = selectedPath ? new Set([selectedPath]) : new Set();
                this.selectionAnchorPath = selectedPath || null;

                const pathsToLoad = Array.from(State.expandedFolders).sort((a, b) => this.getLevel(a) - this.getLevel(b));

                for (const path of pathsToLoad) {
                    try {
                        const children = await API.loadTreeChildren(path);
                        State.treeData[path] = children.items;
                    } catch (err) {
                        // Ignore missing/invalid paths during reload
                    }
                }

                this.rebuildTree();
                this.updateSortUI();

                if (selectedPath) {
                    const selectedEl = document.querySelector(`[data-path="${selectedPath}"]`);
                    if (!selectedEl) {
                        State.selectedTreeItem = null;
                    }
                }

                this.syncFolderMultiSelection({ updateStats: true });
            } catch (err) {
                console.error('Error reloading tree:', err);
                UIUtils.showStatus('Error loading folders', 'error');
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
                // Keep multi-select state consistent even on initial auto-select.
                this.selectedFolderPaths = new Set([firstTreeItem.dataset.path]);
                firstTreeItem.classList.add('multi-selected');
                this.selectionAnchorPath = firstTreeItem.dataset.path;
                this.updateSelectedFolderStats();

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

            this.syncFolderMultiSelection();
        },

        syncFolderMultiSelection({ updateStats = false } = {}) {
            const escapePath = (path) => {
                if (window.CSS && typeof CSS.escape === 'function') {
                    return CSS.escape(path);
                }
                return path.replace(/"/g, '\\"');
            };

            const previous = Array.from(this.selectedFolderPaths || []);
            const visibleItems = this.getVisibleFolderItems();

            visibleItems.forEach(item => item.classList.remove('multi-selected'));

            const isVisible = (el) => {
                const content = el.querySelector('.tree-item-content');
                return content && content.offsetParent !== null;
            };

            const newSet = new Set();

            previous.forEach(path => {
                const el = document.querySelector(`[data-path="${escapePath(path)}"]`);
                if (el && isVisible(el)) {
                    el.classList.add('multi-selected');
                    newSet.add(path);
                }
            });

            const statePath = State.selectedTreeItem && State.selectedTreeItem.dataset ? State.selectedTreeItem.dataset.path : null;
            if (newSet.size === 0 && statePath) {
                const el = document.querySelector(`[data-path="${escapePath(statePath)}"]`);
                if (el && isVisible(el)) {
                    el.classList.add('multi-selected');
                    newSet.add(statePath);
                }
            }

            let changed = previous.length !== newSet.size;
            if (!changed) {
                changed = previous.some(p => !newSet.has(p));
            }

            this.selectedFolderPaths = newSet;

            if (updateStats || changed) {
                this.updateSelectedFolderStats();
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
        getVisibleFolderItems() {
            return Array.from(document.querySelectorAll('#folder-tree .tree-item')).filter(el => {
                const content = el.querySelector('.tree-item-content');
                return content && content.offsetParent !== null;
            });
        },

        clearFolderSelection() {
            this.selectedFolderPaths = new Set();
            this.getVisibleFolderItems().forEach(item => item.classList.remove('multi-selected'));
            this.updateSelectedFolderStats();
        },

        toggleFolderSelected(treeItem, forceSelected = null) {
            const path = treeItem.dataset.path;
            const isSelected = this.selectedFolderPaths.has(path);
            const shouldSelect = forceSelected === null ? !isSelected : Boolean(forceSelected);

            if (shouldSelect) {
                this.selectedFolderPaths.add(path);
                treeItem.classList.add('multi-selected');
            } else {
                this.selectedFolderPaths.delete(path);
                treeItem.classList.remove('multi-selected');
            }

            this.updateSelectedFolderStats();
        },

        selectFolderRange(targetItem, { additive = false } = {}) {
            const items = this.getVisibleFolderItems();
            if (items.length === 0) return;

            const targetIndex = items.indexOf(targetItem);
            if (targetIndex === -1) return;

            const anchorPath = this.selectionAnchorPath || (State.selectedTreeItem && State.selectedTreeItem.dataset ? State.selectedTreeItem.dataset.path : null);
            const anchorIndex = anchorPath ? items.findIndex(item => item.dataset.path === anchorPath) : -1;

            const startIndex = Math.min(anchorIndex !== -1 ? anchorIndex : targetIndex, targetIndex);
            const endIndex = Math.max(anchorIndex !== -1 ? anchorIndex : targetIndex, targetIndex);

            if (!additive) {
                this.selectedFolderPaths = new Set();
                this.getVisibleFolderItems().forEach(item => item.classList.remove('multi-selected'));
            }

            for (let i = startIndex; i <= endIndex; i++) {
                const path = items[i].dataset.path;
                this.selectedFolderPaths.add(path);
                items[i].classList.add('multi-selected');
            }

            this.updateSelectedFolderStats();
        },

        selectAllFolders() {
            const items = this.getVisibleFolderItems();
            this.selectedFolderPaths = new Set(items.map(item => item.dataset.path));
            items.forEach(item => item.classList.add('multi-selected'));

            if (items[0]) {
                this.selectionAnchorPath = items[0].dataset.path;
            }

            this.updateSelectedFolderStats();
        },

        async deleteSelectedFolders() {
            const Dialog = window.MetadataRemote.UI.Dialog;

            const selectedPaths = this.selectedFolderPaths && this.selectedFolderPaths.size
                ? Array.from(this.selectedFolderPaths)
                : (State.selectedTreeItem && State.selectedTreeItem.dataset ? [State.selectedTreeItem.dataset.path] : []);

            if (!selectedPaths.length) {
                return;
            }

            const roots = selectedPaths.filter(p => !selectedPaths.some(other => other !== p && p.startsWith(other + '/')));

            const items = [];
            let previewStats = { folderCount: 0, fileCount: 0, truncated: false };

            const loadingTitle = roots.length === 1 ? 'Delete folder' : 'Delete folders';
            const loadingMessage = roots.length === 1
                ? 'Building preview…\n\nPress Cancel to stop.'
                : `Building previews for ${roots.length} folders…\n\nPress Cancel to stop.`;

            const loading = (() => {
                const shown = Boolean(Dialog && Dialog.showLoading);
                const throttleMs = 150;
                let lastUpdate = 0;

                if (shown) {
                    Dialog.showLoading({
                        title: loadingTitle,
                        message: loadingMessage,
                        cancelText: 'Cancel',
                        monospace: true
                    });
                }

                return {
                    shown,
                    abortIfCancelled() {
                        if (shown && Dialog && !Dialog.isOpen()) {
                            throw new Error('cancelled');
                        }
                    },
                    isCancelled() {
                        return shown && Dialog && !Dialog.isOpen();
                    },
                    update(bodyText, { force = false } = {}) {
                        if (!shown || !Dialog || !Dialog.update || !Dialog.isOpen()) {
                            return;
                        }

                        const now = Date.now();
                        if (!force && now - lastUpdate < throttleMs) {
                            return;
                        }

                        lastUpdate = now;
                        Dialog.update({ bodyText, monospace: true });
                    },
                    close() {
                        if (shown && Dialog && Dialog.isOpen()) {
                            Dialog.close(false);
                        }
                    }
                };
            })();

            const buildFolderTreeLines = async (rootPath, maxLines = 1500) => {
                const rootName = rootPath.split('/').filter(Boolean).pop() || rootPath || '(root)';
                const lines = [`📁 ${rootName}`];
                let linesAdded = 0;
                let truncated = false;
                let folderCount = 0;
                let fileCount = 0;

                const walk = async (folderPath, prefix) => {
                    loading.abortIfCancelled();

                    if (truncated) {
                        return;
                    }

                    loading.update(
                        `${loadingMessage}\n\nScanning: ${folderPath}\nFolders: ${previewStats.folderCount + folderCount} | Files: ${previewStats.fileCount + fileCount}`
                    );

                    let childrenData = null;
                    let filesData = null;

                    try {
                        [childrenData, filesData] = await Promise.all([
                            API.loadTreeChildren(folderPath),
                            API.loadFiles(folderPath)
                        ]);
                    } catch (err) {
                        return;
                    }

                    const childFolders = (childrenData && Array.isArray(childrenData.items) ? childrenData.items : [])
                        .filter(item => item.type === 'folder')
                        .sort((a, b) => a.name.localeCompare(b.name));

                    const childFiles = (filesData && Array.isArray(filesData.files) ? filesData.files : [])
                        .slice()
                        .sort((a, b) => a.name.localeCompare(b.name));

                    const entries = [
                        ...childFolders.map(f => ({ type: 'folder', name: f.name, path: f.path })),
                        ...childFiles.map(f => ({ type: 'file', name: f.name, path: f.path }))
                    ];

                    for (let idx = 0; idx < entries.length; idx++) {
                        loading.abortIfCancelled();

                        if (truncated) {
                            return;
                        }

                        const entry = entries[idx];
                        const isLast = idx === entries.length - 1;
                        const connector = isLast ? '└─ ' : '├─ ';
                        const nextPrefix = prefix + (isLast ? '   ' : '│  ');

                        if (entry.type === 'folder') {
                            lines.push(`${prefix}${connector}📁 ${entry.name}`);
                            folderCount += 1;
                        } else {
                            lines.push(`${prefix}${connector}${UIUtils.getFormatEmoji(entry.name)} ${entry.name}`);
                            fileCount += 1;
                        }

                        linesAdded += 1;
                        if (linesAdded >= maxLines) {
                            truncated = true;
                            return;
                        }

                        if (entry.type === 'folder') {
                            await walk(entry.path, nextPrefix);
                        }
                    }
                };

                await walk(rootPath, '');

                if (truncated) {
                    lines.push('… (more items)');
                }

                return { lines, folderCount, fileCount, truncated };
            };

            let cancelled = false;

            try {
                for (let i = 0; i < roots.length; i++) {
                    loading.abortIfCancelled();

                    const path = roots[i];

                    try {
                        loading.update(
                            `${loadingMessage}\n\nPreparing: ${path}\nFolders: ${previewStats.folderCount} | Files: ${previewStats.fileCount}`,
                            { force: true }
                        );

                        const preview = await buildFolderTreeLines(path, 1500);
                        items.push(...preview.lines);
                        previewStats.folderCount += preview.folderCount;
                        previewStats.fileCount += preview.fileCount;
                        previewStats.truncated = previewStats.truncated || preview.truncated;
                    } catch (err) {
                        if (err && err.message === 'cancelled') {
                            throw err;
                        }
                        items.push(`📁 ${path}`);
                    }

                    if (i < roots.length - 1) {
                        items.push('');
                    }
                }
            } catch (err) {
                cancelled = loading.isCancelled();
                if (!cancelled) {
                    console.error('Error building delete preview:', err);
                }
            } finally {
                loading.close();
            }

            if (cancelled) {
                return;
            }

            const intro = roots.length === 1
                ? `Delete this folder and all contents? This cannot be undone.`
                : `Delete these ${roots.length} folders and all contents? This cannot be undone.`;

            const countsLine = `This includes ${previewStats.folderCount} folders and ${previewStats.fileCount} files.`
                + (previewStats.truncated ? ' (preview truncated)' : '');

            const ok = Dialog ? await Dialog.confirmList({
                title: roots.length === 1 ? 'Delete folder' : 'Delete folders',
                intro: intro + (countsLine ? `\n${countsLine}` : ''),
                items: items,
                confirmText: 'Delete',
                cancelText: 'Cancel',
                danger: true,
                icon: '🗑️📁',
                showCopy: false,
                monospace: true
            }) : false;

            if (!ok) {
                return;
            }

            try {
                await UIUtils.runBulkOperation({
                    label: 'Deleting folders',
                    items: roots,
                    onItem: async (path) => {
                        await API.deleteFolder(path, false);

                        if (State.currentPath && (State.currentPath === path || State.currentPath.startsWith(path + '/'))) {
                            State.currentPath = '';
                        }

                        if (State.currentFile && (State.currentFile === path || State.currentFile.startsWith(path + '/'))) {
                            if (window.MetadataRemote.Audio && window.MetadataRemote.Audio.Player) {
                                window.MetadataRemote.Audio.Player.stopPlayback();
                            }
                            State.currentFile = null;
                            State.originalFilename = '';
                            State.selectedListItem = null;
                            document.getElementById('metadata-section').style.display = 'none';
                            document.getElementById('no-file-message').style.display = '';
                            document.getElementById('current-filename').textContent = '';
                        }
                    }
                });
            } catch (err) {
                const errorData = err && err.data ? err.data : null;
                const message = (errorData && errorData.error) ? errorData.error : 'Error deleting folder';
                UIUtils.showStatus(message, 'error');
                return;
            }

            // Preserve expanded state outside deleted roots
            const expandedPaths = Array.from(State.expandedFolders).filter(p => {
                return !roots.some(root => p === root || p.startsWith(root + '/'));
            });

            let preservedSelectedPath = State.selectedTreeItem && State.selectedTreeItem.dataset ? State.selectedTreeItem.dataset.path : null;
            if (preservedSelectedPath && roots.some(root => preservedSelectedPath === root || preservedSelectedPath.startsWith(root + '/'))) {
                preservedSelectedPath = null;
            }

            this.clearFolderSelection();

            await this.reloadTreePreservingState({ expandedPaths, selectedPath: preservedSelectedPath });

            if (loadFilesCallback) {
                loadFilesCallback(State.currentPath);
            }

            if (window.MetadataRemote.History && window.MetadataRemote.History.Manager) {
                window.MetadataRemote.History.Manager.loadHistory();
            }
        },

        async updateSelectedFolderStats() {
            const FilesManager = window.MetadataRemote.Files.Manager;
            if (!FilesManager || !FilesManager.updateFolderStatsFooter) {
                return;
            }

            const selectedPaths = Array.from(this.selectedFolderPaths || []);

            if (selectedPaths.length === 0) {
                try {
                    const stats = await API.getFolderStats(State.currentPath || '');
                    FilesManager.updateFolderStatsFooter(stats);
                } catch (err) {
                    FilesManager.updateFolderStatsFooter(null);
                }
                return;
            }

            // Avoid double counting nested selections
            const uniqueRoots = selectedPaths.filter(p => !selectedPaths.some(other => other !== p && p.startsWith(other + '/')));

            const requestId = (this._statsRequestId || 0) + 1;
            this._statsRequestId = requestId;

            try {
                const results = await Promise.all(uniqueRoots.map(p => API.getFolderStats(p)));

                if (this._statsRequestId !== requestId) {
                    return;
                }

                const merged = results.reduce((acc, stats) => {
                    if (!stats || stats.status !== 'success') {
                        return acc;
                    }

                    acc.folderCount += stats.folderCount;
                    acc.fileCount += stats.fileCount;
                    acc.totalSizeBytes += stats.totalSizeBytes;
                    return acc;
                }, { status: 'success', folderCount: 0, fileCount: 0, totalSizeBytes: 0 });

                FilesManager.updateFolderStatsFooter({
                    ...merged,
                    selectionCount: uniqueRoots.length
                });
            } catch (err) {
                if (this._statsRequestId !== requestId) {
                    return;
                }
                FilesManager.updateFolderStatsFooter(null);
            }
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
            icon.innerHTML = State.expandedFolders.has(item.path) ? '📂' : '📁';
            
            const name = document.createElement('span');
            name.className = 'tree-name';
            name.textContent = item.name;
            
            name.style.flex = '1';
            name.style.minWidth = '0';

            name.draggable = true;
            name.title = 'Drag to move';

            name.ondragstart = (e) => {
                e.dataTransfer.effectAllowed = 'copyMove';
                const payload = JSON.stringify({ type: 'folder', path: item.path, name: item.name });
                e.dataTransfer.setData('application/json', payload);
                e.dataTransfer.setData('text/plain', payload);

                // Windows-like drag ghost: closed folder icon + name
                const badge = e.ctrlKey ? '+' : '';
                UIUtils.setDragImage(e, '📁', item.name, 10, 10, badge);
                div.classList.add('dragging');
            };

            name.ondragend = () => {
                div.classList.remove('dragging');
            };

            content.appendChild(icon);
            content.appendChild(name);

            const actionsButton = document.createElement('button');
            actionsButton.className = 'item-actions-btn folder-actions-btn';
            actionsButton.type = 'button';
            actionsButton.textContent = '⋮';
            actionsButton.title = 'Folder actions';

            const actionsMenu = document.createElement('div');
            actionsMenu.className = 'item-actions-menu';

            const renameBtn = document.createElement('button');
            renameBtn.type = 'button';
            renameBtn.textContent = 'Rename';

            const deleteBtn = document.createElement('button');
            deleteBtn.type = 'button';
            deleteBtn.textContent = 'Delete';
            deleteBtn.className = 'danger';

            actionsMenu.appendChild(renameBtn);
            actionsMenu.appendChild(deleteBtn);

            actionsButton.onclick = (e) => {
                e.stopPropagation();
                UIUtils.toggleActionsMenu(actionsButton, actionsMenu);
            };

            renameBtn.onclick = (e) => {
                e.stopPropagation();
                actionsMenu.classList.remove('active');
                this.startFolderRename(div, item);
            };

            const handleDrop = async (payload, isCopy = false) => {
                const Dialog = window.MetadataRemote.UI.Dialog;

                if (!payload || !payload.type || !payload.path) {
                    return;
                }

                // File drop: move file into this folder
                if (payload.type === 'file') {
                    const oldPath = payload.path;

                    try {
                        const result = await API.moveFile(oldPath, item.path, isCopy);

                        if (State.currentFile === oldPath) {
                            AudioPlayer.stopPlayback();
                            State.currentFile = result.newPath;
                        }

                        if (window.MetadataRemote.History && window.MetadataRemote.History.Manager) {
                            window.MetadataRemote.History.Manager.loadHistory();
                        }

                        // Refresh current list if needed
                        if (loadFilesCallback) {
                            loadFilesCallback(State.currentPath);
                        }
                    } catch (err) {
                        const errorData = err && err.data ? err.data : null;
                        const message = (errorData && errorData.error) ? errorData.error : 'Error moving file';
                        UIUtils.showStatus(message, 'error');
                    }

                    return;
                }

                // Folder drop: move folder into this folder
                if (payload.type === 'folder') {
                    const oldPath = payload.path;

                    if (oldPath === item.path || oldPath.startsWith(item.path + '/')) {
                        return;
                    }

                    let result = null;
                    try {
                        result = await API.moveFolder(oldPath, item.path, false, isCopy);
                    } catch (err) {
                        result = err && err.data ? err.data : { error: 'Network error' };
                    }

                    if (result && result.error === 'Folder already exists') {
                        const ok = Dialog ? await Dialog.confirm({
                            title: 'Merge folders',
                            message: `Folder "${payload.name}" already exists. Merge contents into the existing folder?\n\nThis will move all files and then delete the empty source folder.`,
                            confirmText: 'Merge',
                            cancelText: 'Cancel',
                            danger: true
                        }) : false;

                        if (ok) {
                            try {
                                result = await API.moveFolder(oldPath, item.path, true, isCopy);
                            } catch (err) {
                                result = err && err.data ? err.data : { error: 'Network error' };
                            }
                        }
                    }

                    if (result && result.error) {
                        if (result.error === 'Merge conflicts') {
                            const conflicts = Array.isArray(result.conflicts) ? result.conflicts : [];
                            if (Dialog) {
                                await Dialog.showConflicts({
                                    title: 'Merge conflicts',
                                    intro: `Cannot merge because these paths already exist (${conflicts.length}):`,
                                    items: conflicts
                                });
                            }
                        }

                        UIUtils.showStatus(result.error, 'error');
                        return;
                    }

                    const newPath = result.newPath;

                    // Update current path/file if under moved folder
                    if (State.currentPath && (State.currentPath === oldPath || State.currentPath.startsWith(oldPath + '/'))) {
                        State.currentPath = newPath + State.currentPath.slice(oldPath.length);
                    }

                    if (State.currentFile && (State.currentFile === oldPath || State.currentFile.startsWith(oldPath + '/'))) {
                        State.currentFile = newPath + State.currentFile.slice(oldPath.length);
                    }

                    const currentExpanded = Array.from(State.expandedFolders);
                    const expandedPaths = Array.from(new Set(currentExpanded.map(path => {
                        if (path === oldPath || path.startsWith(oldPath + '/')) {
                            return newPath + path.slice(oldPath.length);
                        }
                        return path;
                    })));

                    let selectedPath = State.selectedTreeItem && State.selectedTreeItem.dataset ? State.selectedTreeItem.dataset.path : null;
                    if (selectedPath && (selectedPath === oldPath || selectedPath.startsWith(oldPath + '/'))) {
                        selectedPath = newPath;
                    }

                    await this.reloadTreePreservingState({ expandedPaths, selectedPath });

                    if (loadFilesCallback) {
                        loadFilesCallback(State.currentPath);
                    }

                    if (window.MetadataRemote.History && window.MetadataRemote.History.Manager) {
                        window.MetadataRemote.History.Manager.loadHistory();
                    }
                }
            };

            content.ondragover = (e) => {
                e.preventDefault();
                content.classList.add('drag-over');

                const isCopy = e.ctrlKey === true;
                content.classList.toggle('drag-copy', isCopy);
                e.dataTransfer.dropEffect = isCopy ? 'copy' : 'move';
            };

            content.ondragleave = () => {
                content.classList.remove('drag-over');
                content.classList.remove('drag-copy');
            };

            content.ondrop = async (e) => {
                e.preventDefault();
                const isCopy = e.ctrlKey === true;

                content.classList.remove('drag-over');
                content.classList.remove('drag-copy');

                const raw = e.dataTransfer.getData('application/json') || e.dataTransfer.getData('text/plain');
                let payload = null;
                try {
                    payload = JSON.parse(raw);
                } catch (err) {
                    payload = null;
                }

                await handleDrop(payload, isCopy);
            };

            deleteBtn.onclick = async (e) => {
                e.stopPropagation();
                actionsMenu.classList.remove('active');

                if (!this.selectedFolderPaths || !this.selectedFolderPaths.has(item.path)) {
                    this.clearFolderSelection();
                    this.toggleFolderSelected(div, true);
                    this.selectionAnchorPath = div.dataset.path;
                    selectTreeItemCallback(div, false);
                }

                await this.deleteSelectedFolders();
            };

            actionsMenu.oncontextmenu = (e) => {
                e.preventDefault();
            };

            content.appendChild(actionsButton);
            content.appendChild(actionsMenu);
            
            const children = document.createElement('div');
            children.className = 'tree-children';
            
            div.appendChild(content);
            div.appendChild(children);
            
            content.oncontextmenu = (e) => {
                e.preventDefault();

                if (!this.selectedFolderPaths || !this.selectedFolderPaths.has(item.path)) {
                    this.clearFolderSelection();
                    this.toggleFolderSelected(div, true);
                    this.selectionAnchorPath = div.dataset.path;
                    selectTreeItemCallback(div, false);
                }

                UIUtils.openActionsMenu(actionsMenu, e.clientX, e.clientY);
            };

            content.onclick = (e) => {
                e.stopPropagation();

                // Close any open item menus (content click stops propagation)
                UIUtils.closeActionsMenus();

                // Windows-style selection behavior
                if (e.shiftKey) {
                    this.selectFolderRange(div, { additive: e.ctrlKey });
                    this.selectionAnchorPath = div.dataset.path;
                    selectTreeItemCallback(div, false);
                    return;
                }

                if (e.ctrlKey) {
                    this.toggleFolderSelected(div);
                    this.selectionAnchorPath = div.dataset.path;
                    selectTreeItemCallback(div, false);
                    return;
                }

                // Normal click selects single item and toggles expand
                this.clearFolderSelection();
                this.toggleFolderSelected(div, true);
                this.selectionAnchorPath = div.dataset.path;

                // When switching folders, collapse the previously selected folder
                const previousItem = State.selectedTreeItem;
                if (previousItem && previousItem !== div) {
                    const previousPath = previousItem.dataset ? previousItem.dataset.path : null;
                    const isAncestor = previousPath && item.path && item.path.startsWith(previousPath + '/');

                    if (previousPath && !isAncestor && State.expandedFolders.has(previousPath)) {
                        const previousChildren = previousItem.querySelector('.tree-children');
                        if (previousChildren) {
                            previousChildren.classList.remove('expanded');
                        }
                        const previousIcon = previousItem.querySelector('.tree-icon');
                        if (previousIcon) {
                            previousIcon.innerHTML = '📁';
                        }
                        State.expandedFolders.delete(previousPath);
                    }
                }

                selectTreeItemCallback(div);
                
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
            const nameSpan = content.querySelector('.tree-name');
            
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
                    
                    const Dialog = window.MetadataRemote.UI.Dialog;

                    let result = null;
                    try {
                        result = await API.renameFolder(item.path, newName);
                    } catch (err) {
                        result = err && err.data ? err.data : { error: 'Network error' };
                    }

                    if (result && result.error === 'Folder already exists') {
                        const ok = Dialog ? await Dialog.confirm({
                            title: 'Merge folders',
                            message: `Folder "${newName}" already exists. Merge contents into the existing folder?\n\nThis will move all files and then delete the empty source folder.`,
                            confirmText: 'Merge',
                            cancelText: 'Cancel',
                            danger: true
                        }) : false;

                        if (ok) {
                            try {
                                result = await API.renameFolder(item.path, newName, true);
                            } catch (err) {
                                result = err && err.data ? err.data : { error: 'Network error' };
                            }
                        }
                    }

                    if (result && result.error) {
                        if (result.error === 'Merge conflicts') {
                            const conflicts = Array.isArray(result.conflicts) ? result.conflicts : [];
                            if (Dialog) {
                                await Dialog.showConflicts({
                                    title: 'Merge conflicts',
                                    intro: `Cannot merge because these paths already exist (${conflicts.length}):`,
                                    items: conflicts
                                });
                            }
                        }

                        if (ButtonStatus) {
                            ButtonStatus.showButtonStatus(saveBtn, result.error === 'Merge conflicts' ? 'Merge conflicts' : result.error, 'error', 3000);
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

                    // For merges, avoid mutating the current tree item to prevent duplicates.
                    if (!result.merged) {
                        item.name = newName;
                        item.path = result.newPath;

                        // Update all UI elements
                        this.updateFolderReferences(oldPath, result.newPath);
                    }
                    
                    // Clean up edit UI after brief delay
                    setTimeout(() => {
                        nameSpan.textContent = result.merged ? item.name : newName;
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

                        if (result.merged) {
                            (async () => {
                                const currentExpanded = Array.from(State.expandedFolders);

                                const expandedPaths = Array.from(new Set(currentExpanded.map(path => {
                                    if (path === oldPath || path.startsWith(oldPath + '/')) {
                                        return result.newPath + path.slice(oldPath.length);
                                    }
                                    return path;
                                })));

                                let selectedPath = State.selectedTreeItem && State.selectedTreeItem.dataset ? State.selectedTreeItem.dataset.path : null;
                                if (selectedPath && (selectedPath === oldPath || selectedPath.startsWith(oldPath + '/'))) {
                                    selectedPath = result.newPath;
                                }

                                await this.reloadTreePreservingState({ expandedPaths, selectedPath });

                                const mergedEl = document.querySelector(`[data-path="${result.newPath}"]`);
                                if (mergedEl) {
                                    selectTreeItemCallback(mergedEl, false);
                                }
                            })();
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
