/**
 * Centralized State Management for Metadata Remote
 * Manages all application state in a single location
 */

// Create namespace if it doesn't exist
window.MetadataRemote = window.MetadataRemote || {};

// State manager
window.MetadataRemote.State = {
    // Current file and metadata
    currentFile: null,
    currentPath: '',
    selectedListItem: null,
    selectedTreeItem: null,
    originalFilename: '',
    currentAlbumArt: null,
    pendingAlbumArt: null,
    originalMetadata: {},
    currentFiles: [],
    
    // Tree and folder state
    treeData: {},
    expandedFolders: new Set(),
    
    // Separate sort state for folders and files
    foldersSort: {
        method: 'name',      // 'name', 'date', 'size'
        direction: 'asc'     // 'asc', 'desc'
    },
    filesSort: {
        method: 'name',      // 'name', 'date', 'type', 'size'
        direction: 'asc'     // 'asc', 'desc'
    },
    
    // Filter state for both panes
    foldersFilter: '',       // Filter text for folders
    filesFilter: '',         // Filter text for files
    
    // UI state for active dropdowns/filters
    activeFilterPane: null,      // 'folders', 'files', or null
    activeSortDropdown: null,    // 'folders', 'files', or null
    
    // UI state
    focusedPane: 'folders',
    savedPaneSizes: { folders: 25, files: 35 },
    isResizing: false,
    currentDivider: null,
    startX: 0,
    startWidths: {},
    helpBoxOpen: false,
    
    // Audio playback
    currentlyPlayingFile: null,
    
    // Timers and debouncing
    loadFileDebounceTimer: null,
    loadFileRequestId: 0,
    
    // Keyboard navigation
    keyRepeatTimer: null,
    keyRepeatDelayTimer: null,
    keyHeldDown: null,
    keyRepeatDelay: 200,
    keyRepeatInterval: 40,
    isKeyRepeating: false,
    
    // Folder editing state
    editingFolder: null,         // Currently editing folder element
    editingFolderData: null,     // Data about the editing operation
    isRenamingFolder: false,     // Prevent concurrent rename operations
    lastFolderEnterPress: 0,     // Track last Enter press for double-Enter detection
    
    // Header navigation state
    headerFocus: null,           // { pane: 'folders'|'files'|'metadata', iconType: 'filter'|'sort'|'sort-direction'|'help' }
    filterInputActive: null,     // 'folders'|'files'|null - tracks which filter input is active
    previousFocusBeforeHelp: null, // Stores focus state before navigating to help icon
    
    // Inference state
    inferenceActive: {},
    inferenceAbortControllers: {},
    
    // History state
    historyActions: [],
    selectedHistoryAction: null,
    historyPanelExpanded: false,
    historyRefreshTimer: null,
    historyPanelHeight: 400,
    historyListWidth: 50,
    isResizingHistoryPane: false,
    startHistoryListWidth: 50,
    processingUndoActionId: null,
    processingRedoActionId: null,  
    
    // State management methods
    reset() {
        // Reset to initial state (useful for testing or cleanup)
        this.currentFile = null;
        this.currentPath = '';
        this.selectedListItem = null;
        this.selectedTreeItem = null;
        this.originalFilename = '';
        this.currentAlbumArt = null;
        this.pendingAlbumArt = null;
        this.originalMetadata = {};
        this.currentlyPlayingFile = null;
        
        // Reset new filter/sort state
        this.foldersSort = { method: 'name', direction: 'asc' };
        this.filesSort = { method: 'name', direction: 'asc' };
        this.foldersFilter = '';
        this.filesFilter = '';
        this.activeFilterPane = null;
        this.activeSortDropdown = null;
        
        // Clear timers
        if (this.loadFileDebounceTimer) {
            clearTimeout(this.loadFileDebounceTimer);
            this.loadFileDebounceTimer = null;
        }
        if (this.keyRepeatTimer) {
            clearInterval(this.keyRepeatTimer);
            this.keyRepeatTimer = null;
        }
        if (this.keyRepeatDelayTimer) {
            clearTimeout(this.keyRepeatDelayTimer);
            this.keyRepeatDelayTimer = null;
        }
    },
    
    // Get a copy of the state (useful for debugging)
    getSnapshot() {
        return {
            currentFile: this.currentFile,
            currentPath: this.currentPath,
            originalFilename: this.originalFilename,
            focusedPane: this.focusedPane,
            historyPanelExpanded: this.historyPanelExpanded,
            expandedFolders: Array.from(this.expandedFolders),
            foldersSort: { ...this.foldersSort },
            filesSort: { ...this.filesSort },
            foldersFilter: this.foldersFilter,
            filesFilter: this.filesFilter,
            activeFilterPane: this.activeFilterPane,
            activeSortDropdown: this.activeSortDropdown
        };
    }
};
