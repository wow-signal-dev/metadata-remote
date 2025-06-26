/**
 * Filter and Sort UI Management for Metadata Remote
 * Handles icon-based filter and sort controls
 */

(function() {
    // Create namespace if it doesn't exist
    window.MetadataRemote = window.MetadataRemote || {};
    window.MetadataRemote.UI = window.MetadataRemote.UI || {};
    
    // Create shortcuts
    const State = window.MetadataRemote.State;
    
    window.MetadataRemote.UI.FilterSort = {
        /**
         * Initialize filter and sort controls
         */
        init() {
            this.setupFilterControls();
            this.setupSortControls();
            this.setupKeyboardShortcuts();
        },
        
        /**
         * Set up filter controls for both panes
         */
        setupFilterControls() {
            // Folders filter
            const foldersFilterBtn = document.getElementById('folders-filter-btn');
            const foldersFilter = document.getElementById('folders-filter');
            const foldersFilterInput = document.getElementById('folders-filter-input');
            
            foldersFilterBtn.addEventListener('click', () => {
                const isActive = foldersFilter.classList.contains('active');
                foldersFilter.classList.toggle('active');
                foldersFilterBtn.classList.toggle('active');
                
                if (!isActive) {
                    foldersFilterInput.focus();
                    State.focusedPane = 'folders';
                }
            });
            
            foldersFilterInput.addEventListener('input', (e) => {
                State.filterState.folders = e.target.value;
                // Trigger folder filtering
                window.MetadataRemote.Navigation.Tree.filterFolders(e.target.value);
            });
            
            foldersFilterInput.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    foldersFilter.classList.remove('active');
                    foldersFilterBtn.classList.remove('active');
                    document.getElementById('folders-pane').focus();
                }
            });
            
            // Files filter
            const filesFilterBtn = document.getElementById('files-filter-btn');
            const filesFilter = document.getElementById('files-filter');
            const filesFilterInput = document.getElementById('files-filter-input');
            
            filesFilterBtn.addEventListener('click', () => {
                const isActive = filesFilter.classList.contains('active');
                filesFilter.classList.toggle('active');
                filesFilterBtn.classList.toggle('active');
                
                if (!isActive) {
                    filesFilterInput.focus();
                    State.focusedPane = 'files';
                }
            });
            
            filesFilterInput.addEventListener('input', (e) => {
                State.filterState.files = e.target.value;
                // Existing file filtering is already handled
                window.MetadataRemote.Files.Manager.filterFiles(e.target.value);
            });
            
            filesFilterInput.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    filesFilter.classList.remove('active');
                    filesFilterBtn.classList.remove('active');
                    document.getElementById('files-pane').focus();
                }
            });
        },
        
        /**
         * Set up sort controls for both panes
         */
        setupSortControls() {
            // Folders sort
            const foldersSortBtn = document.getElementById('folders-sort-btn');
            const foldersSortDropdown = document.getElementById('folders-sort-dropdown');
            const foldersSortDirection = document.getElementById('folders-sort-direction');
            
            foldersSortBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                foldersSortDropdown.classList.toggle('active');
                State.focusedPane = 'folders';
            });
            
            foldersSortDirection.addEventListener('click', (e) => {
                e.stopPropagation();
                State.currentSort.folders.direction = 
                    State.currentSort.folders.direction === 'asc' ? 'desc' : 'asc';
                this.updateSortUI('folders');
                window.MetadataRemote.Navigation.Tree.rebuildTree();
            });
            
            foldersSortDropdown.querySelectorAll('.sort-option').forEach(option => {
                option.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const sortBy = option.dataset.sort;
                    State.currentSort.folders.method = sortBy;
                    State.currentSort.folders.direction = 'asc';
                    this.updateSortUI('folders');
                    window.MetadataRemote.Navigation.Tree.rebuildTree();
                    foldersSortDropdown.classList.remove('active');
                });
            });
            
            // Files sort - similar setup
            const filesSortBtn = document.getElementById('files-sort-btn');
            const filesSortDropdown = document.getElementById('files-sort-dropdown');
            const filesSortDirection = document.getElementById('files-sort-direction');
            
            filesSortBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                filesSortDropdown.classList.toggle('active');
                State.focusedPane = 'files';
            });
            
            filesSortDirection.addEventListener('click', (e) => {
                e.stopPropagation();
                State.currentSort.files.direction = 
                    State.currentSort.files.direction === 'asc' ? 'desc' : 'asc';
                this.updateSortUI('files');
                // Trigger file re-sort
                window.MetadataRemote.Files.Manager.sortAndRenderFiles();
            });
            
            // Close dropdowns on outside click
            document.addEventListener('click', () => {
                foldersSortDropdown.classList.remove('active');
                filesSortDropdown.classList.remove('active');
            });
        },
        
        /**
         * Update sort UI to reflect current state
         */
        updateSortUI(pane) {
            const sortBtn = document.getElementById(`${pane}-sort-btn`);
            const sortIndicator = document.getElementById(`${pane}-sort-indicator`);
            const sortDropdown = document.getElementById(`${pane}-sort-dropdown`);
            const sortState = State.currentSort[pane];
            
            // Update button title
            const fieldNames = {
                name: 'Name',
                date: 'Date',
                size: 'Size',
                type: 'Type'
            };
            sortBtn.title = `Sort by: ${fieldNames[sortState.method]}`;
            
            // Update direction indicator
            sortIndicator.textContent = sortState.direction === 'asc' ? '▲' : '▼';
            
            // Update active option
            sortDropdown.querySelectorAll('.sort-option').forEach(option => {
                option.classList.toggle('active', option.dataset.sort === sortState.method);
            });
        },
        
        /**
         * Set up keyboard shortcuts
         */
        setupKeyboardShortcuts() {
            document.addEventListener('keydown', (e) => {
                // Skip if typing in an input
                if (e.target.tagName === 'INPUT') return;
                
                // Filter shortcut: /
                if (e.key === '/') {
                    e.preventDefault();
                    const filterBtn = document.getElementById(`${State.focusedPane}-filter-btn`);
                    filterBtn.click();
                }
                
                // Filter shortcut: Ctrl+F
                if (e.ctrlKey && e.key === 'f') {
                    e.preventDefault();
                    const filterBtn = document.getElementById(`${State.focusedPane}-filter-btn`);
                    filterBtn.click();
                }
                
                // Sort reverse: Ctrl+Shift+S
                if (e.ctrlKey && e.shiftKey && e.key === 'S') {
                    e.preventDefault();
                    const sortDirection = document.getElementById(`${State.focusedPane}-sort-direction`);
                    sortDirection.click();
                }
            });
        }
    };
})();
