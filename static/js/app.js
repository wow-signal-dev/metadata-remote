/**
 * Main Application Logic for Metadata Remote
 * 
 * This file serves as the central coordinator for all modules:
 * - Initializes all modules with proper callbacks
 * - Provides global functions for HTML event handlers
 * - Manages cross-module communication through delegation
 */

// Ensure namespace exists
window.MetadataRemote = window.MetadataRemote || {};

// =============================
// Module References (Shortcuts)
// =============================
const State = window.MetadataRemote.State;
const API = window.MetadataRemote.API;
const ButtonStatus = window.MetadataRemote.UI.ButtonStatus;
const UIUtils = window.MetadataRemote.UI.Utilities;
const AudioPlayer = window.MetadataRemote.Audio.Player;
const PaneResize = window.MetadataRemote.UI.PaneResize;
const TreeNav = window.MetadataRemote.Navigation.Tree;
const KeyboardNav = window.MetadataRemote.Navigation.Keyboard;
const FilesManager = window.MetadataRemote.Files.Manager;
const MetadataEditor = window.MetadataRemote.Metadata.Editor;
const AlbumArt = window.MetadataRemote.Metadata.AlbumArt;
const InferenceUI = window.MetadataRemote.Metadata.Inference;
const HistoryManager = window.MetadataRemote.History.Manager;

// =============================
// Main Application Coordinator
// =============================
const AudioMetadataEditor = {
    /**
     * Initialize the entire application
     * Sets up all modules with proper callbacks and initializes UI
     */
    init() {
        // Reset state to ensure clean start
        State.reset();
        
        // Initialize all modules with their required callbacks
        this.initializeModules();
        
        // Load initial data
        TreeNav.loadTree();
        TreeNav.updateSortUI();
        HistoryManager.loadHistory();
        
        // Set up UI state
        this.setupInitialUIState();
    },
    
    /**
     * Initialize all modules with their required callbacks
     */
    initializeModules() {
        // Navigation modules
        TreeNav.init(
            this.selectTreeItem.bind(this), 
            this.loadFiles.bind(this)
        );
        
        KeyboardNav.init({
            selectTreeItem: this.selectTreeItem.bind(this),
            selectFileItem: this.selectFileItem.bind(this),
            loadFile: this.loadFile.bind(this),
            loadFiles: this.loadFiles.bind(this)
        });
        
        // File management
        FilesManager.init({
            selectFileItem: this.selectFileItem.bind(this)
        });
        
        // Audio player
        AudioPlayer.init(document.getElementById('audio-player'));
        
        // Metadata modules
        MetadataEditor.init({
            loadHistory: () => HistoryManager.loadHistory(),
            hideInferenceSuggestions: (field) => InferenceUI.hideInferenceSuggestions(field)
        });
        
        AlbumArt.init({
            showStatus: UIUtils.showStatus,
            loadHistory: () => HistoryManager.loadHistory(),
            setFormEnabled: UIUtils.setFormEnabled
        });
        
        InferenceUI.setupInferenceHandlers();
        MetadataEditor.setupMetadataFieldListeners();
        
        // History management
        HistoryManager.init({
            showStatus: UIUtils.showStatus,
            loadFiles: this.loadFiles.bind(this),
            loadFile: this.loadFile.bind(this)
        });
        
        // UI components
        PaneResize.initializePaneResize();
        PaneResize.initializeHistoryPanelResize(() => HistoryManager.toggleHistoryPanel());
        window.MetadataRemote.UI.FilterSort.init();
    },
    
    /**
     * Set up initial UI state
     */
    setupInitialUIState() {
        const historyPanel = document.getElementById('history-panel');
        const metadataContent = document.querySelector('.metadata-content');
        
        if (historyPanel.classList.contains('expanded')) {
            metadataContent.style.paddingBottom = `${State.historyPanelHeight + 20}px`;
        }
        
        // Set up filename edit click handler
        const filenameDisplay = document.getElementById('current-filename');
        if (filenameDisplay) {
            filenameDisplay.onclick = this.handleFilenameEditClick.bind(this);
        }
    },
    
    // =============================
    // Core Navigation Methods
    // =============================
    
    selectTreeItem(item, isKeyboard = false) {
        if (State.selectedTreeItem) {
            State.selectedTreeItem.classList.remove('selected', 'keyboard-focus');
        }
        
        item.classList.add('selected', 'keyboard-focus');
        State.selectedTreeItem = item;
        State.focusedPane = 'folders';
        
        // Remove keyboard focus from files pane
        document.querySelectorAll('.files .keyboard-focus').forEach(el => {
            el.classList.remove('keyboard-focus');
        });
        
        // Load files for the selected folder
        if (State.loadFileDebounceTimer) {
            clearTimeout(State.loadFileDebounceTimer);
        }
        
        const folderPath = item.dataset.path;
        if (folderPath !== undefined) {
            State.loadFileDebounceTimer = setTimeout(() => {
                this.loadFiles(folderPath);
            }, 300);
        }
    },

    selectFileItem(item, isKeyboard = false) {
        if (State.selectedListItem) {
            State.selectedListItem.classList.remove('selected', 'keyboard-focus');
        }
        
        item.classList.add('selected', 'keyboard-focus');
        State.selectedListItem = item;
        State.focusedPane = 'files';
        
        // Remove keyboard focus from folders pane
        document.querySelectorAll('.folders .keyboard-focus').forEach(el => {
            el.classList.remove('keyboard-focus');
        });
        
        // Load file if keyboard navigation
        if (isKeyboard) {
            if (State.loadFileDebounceTimer) {
                clearTimeout(State.loadFileDebounceTimer);
            }
            
            const filepath = item.dataset.filepath;
            if (filepath) {
                State.loadFileDebounceTimer = setTimeout(() => {
                    this.loadFile(filepath, item);
                }, 300);
            }
        }
    },

    // =============================
    // File Operations
    // =============================
    
    async loadFiles(folderPath) {
        await FilesManager.loadFiles(folderPath);
    },

    async loadFile(filepath, listItem) {
        await FilesManager.loadFile(filepath, listItem);
    },
    
    // =============================
    // UI Event Handlers
    // =============================
    
    handleFilenameEditClick() {
        if (!State.currentFile) return;
        
        document.getElementById('current-filename').style.display = 'none';
        document.querySelector('.filename-edit').style.display = 'flex';
        const input = document.getElementById('filename-input');
        input.value = State.originalFilename;
        input.focus();
    },
    
    async saveFilename() {
        await FilesManager.saveFilename(
            ButtonStatus.showButtonStatus,
            this.loadFiles.bind(this),
            () => HistoryManager.loadHistory()
        );
    }
};

// =============================
// Global Function Bindings
// =============================
// These functions are required for HTML onclick handlers

// Navigation
function setSortMethod(method) {
    TreeNav.setSortMethod(method);
}

// File operations
function saveFilename() {
    AudioMetadataEditor.saveFilename();
}

function resetFilename() {
    FilesManager.resetFilename();
}

function cancelFilenameEdit() {
    FilesManager.cancelFilenameEdit();
}

// Album art operations
function handleArtUpload(event) {
    AlbumArt.handleArtUpload(event);
}

function deleteAlbumArt() {
    AlbumArt.deleteAlbumArt();
}

function saveAlbumArt() {
    AlbumArt.saveAlbumArt();
}

function applyArtToFolder() {
    AlbumArt.applyArtToFolder();
}

// Metadata operations
function applyFieldToFolder(field) {
    MetadataEditor.applyFieldToFolder(field, 
        ButtonStatus.showButtonStatus,
        UIUtils.setFormEnabled
    );
}

function saveFieldToFile(field) {
    MetadataEditor.saveFieldToFile(field, ButtonStatus.showButtonStatus);
}

function save() {
    MetadataEditor.save(ButtonStatus.showButtonStatus);
}

function resetForm() {
    MetadataEditor.resetForm(ButtonStatus.showButtonStatus);
}

// History operations
function toggleHistoryPanel() {
    HistoryManager.toggleHistoryPanel();
}

function undoAction() {
    HistoryManager.undoAction();
}

function redoAction() {
    HistoryManager.redoAction();
}

function clearHistory() {
    HistoryManager.clearHistory();
}

// =============================
// Application Initialization
// =============================
document.addEventListener('DOMContentLoaded', () => {
    AudioMetadataEditor.init();
});
