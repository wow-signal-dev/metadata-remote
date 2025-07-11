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
        
        // Initialize theme toggle
        if (window.MetadataRemote.UI.ThemeToggle) {
            // ThemeToggle self-initializes, but we can ensure it's ready
            window.MetadataRemote.UI.ThemeToggle.init();
        }
        this.setupHelpBox();
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

    /**
     * Set up help box functionality
     */
    setupHelpBox() {
        const helpButton = document.getElementById('help-button');
        const helpOverlay = document.getElementById('help-overlay');
        const helpBox = document.getElementById('help-box');
        const helpClose = document.getElementById('help-close');
        
        // Show help box
        const showHelp = () => {
            // Track when help was opened to prevent immediate closure
            State.helpBoxOpenTime = Date.now();
            State.helpBoxOpen = true;
            
            // Use CSS classes for proper display (the correct approach)
            helpOverlay.classList.add('active');
            helpBox.classList.add('active');
        };
        
        // Make showHelp globally accessible for keyboard navigation
        window.MetadataRemote.showHelp = showHelp;
        
        // Hide help box
        const hideHelp = () => {
            // Use CSS classes for proper hiding (the correct approach)
            helpOverlay.classList.remove('active');
            helpBox.classList.remove('active');
            State.helpBoxOpen = false;
            
            // If help was opened via keyboard navigation, restore focus to help button
            if (State.headerFocus && State.headerFocus.iconType === 'help') {
                const helpButton = document.getElementById('help-button');
                if (helpButton) {
                    helpButton.focus();
                    helpButton.classList.add('keyboard-focus');
                }
            }
        };
        
        // Help button click
        helpButton.addEventListener('click', (e) => {
            e.stopPropagation();
            showHelp();
        });
        
        // Close button click
        helpClose.addEventListener('click', (e) => {
            e.stopPropagation();
            hideHelp();
        });
        
        // Overlay click (outside help box)
        helpOverlay.addEventListener('click', hideHelp);
        
        // Prevent clicks inside help box from closing it
        helpBox.addEventListener('click', (e) => {
            e.stopPropagation();
        });
        
        // Close on any key press (except the ones that open help)
        document.addEventListener('keydown', (e) => {
            if (State.helpBoxOpen) {
                // Don't close immediately on Enter key (which might have opened help)
                // Add a small delay to avoid closing help that was just opened
                if (e.key === 'Enter') {
                    // Check if this Enter key opened the help by seeing if it was just opened
                    const timeSinceOpen = Date.now() - (State.helpBoxOpenTime || 0);
                    if (timeSinceOpen < 100) {
                        return; // Don't close help that was just opened
                    }
                }
                
                e.preventDefault();
                hideHelp();
            }
        });
        
        // Also add help shortcut (?) when not in an input
        document.addEventListener('keydown', (e) => {
            if (e.key === '?' && !State.helpBoxOpen && 
                e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
                e.preventDefault();
                showHelp();
            }
        });
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
        
        // When called from keyboard navigation, ensure the item has DOM focus
        if (isKeyboard) {
            // Focus the tree item content div for proper keyboard navigation
            const treeItemContent = item.querySelector('.tree-item-content');
            if (treeItemContent) {
                treeItemContent.setAttribute('tabindex', '0');
                treeItemContent.focus();
            }
        }
        
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
            // Focus the list item for proper keyboard navigation
            item.setAttribute('tabindex', '0');
            item.focus();
            
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
// Make AudioMetadataEditor globally accessible for keyboard navigation
window.AudioMetadataEditor = AudioMetadataEditor;

document.addEventListener('DOMContentLoaded', () => {
    AudioMetadataEditor.init();
});
