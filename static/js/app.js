/**
 * Main Application Logic for Metadata Remote
 * Coordinates between state, API, and UI components
 */

// Ensure namespace exists
window.MetadataRemote = window.MetadataRemote || {};

// Create shortcuts for easier access
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

const AudioMetadataEditor = {
    // Initialize the application
    init() {
        // Reset state to ensure clean start
        State.reset();
        TreeNav.init(this.selectTreeItem.bind(this), this.loadFiles.bind(this));
        AudioPlayer.init(document.getElementById('audio-player'));
        KeyboardNav.init({
            selectTreeItem: this.selectTreeItem.bind(this),
            selectFileItem: this.selectFileItem.bind(this),
            loadFile: this.loadFile.bind(this),
            loadFiles: this.loadFiles.bind(this)
        });
        FilesManager.init({
            selectFileItem: this.selectFileItem.bind(this)
        });
        MetadataEditor.init({
            loadHistory: () => HistoryManager.loadHistory(),
            hideInferenceSuggestions: this.hideInferenceSuggestions.bind(this)
        });
        AlbumArt.init({
            showStatus: this.showStatus.bind(this),
            loadHistory: () => HistoryManager.loadHistory(),
            setFormEnabled: this.setFormEnabled.bind(this)
        });
        TreeNav.loadTree();
        TreeNav.updateSortUI();
        MetadataEditor.setupMetadataFieldListeners();
        InferenceUI.setupInferenceHandlers();
        HistoryManager.init({
            showStatus: this.showStatus.bind(this),
            loadFiles: this.loadFiles.bind(this),
            loadFile: this.loadFile.bind(this)
        });
        PaneResize.initializePaneResize();
        PaneResize.initializeHistoryPanelResize(() => HistoryManager.toggleHistoryPanel());
        HistoryManager.loadHistory();
        const historyPanel = document.getElementById('history-panel');
        const metadataContent = document.querySelector('.metadata-content');
        if (historyPanel.classList.contains('expanded')) {
            metadataContent.style.paddingBottom = `${State.historyPanelHeight + 20}px`;
        }
    },
   
    // Button status management
    showButtonStatus(button, message, type = 'processing', duration = 3000) {
        ButtonStatus.showButtonStatus(button, message, type, duration);
    },
    
    clearButtonStatus(button) {
        ButtonStatus.clearButtonStatus(button);
    },
    
    togglePlayback(filepath, button) {
        AudioPlayer.togglePlayback(filepath, button);
    },

    stopPlayback() {
        AudioPlayer.stopPlayback();
    },

    // Inference UI delegation methods
    showInferenceSuggestions(field) {
        InferenceUI.showInferenceSuggestions(field);
    },
    
    hideInferenceSuggestions(field) {
        InferenceUI.hideInferenceSuggestions(field);
    },

    selectTreeItem(item, isKeyboard = false) {
        if (State.selectedTreeItem) {
            State.selectedTreeItem.classList.remove('selected', 'keyboard-focus');
        }
        item.classList.add('selected');
        // Always add keyboard-focus when selecting, regardless of input method
        item.classList.add('keyboard-focus');
        
        // Remove keyboard-focus from files pane when selecting a folder
        document.querySelectorAll('.files .keyboard-focus').forEach(el => {
            el.classList.remove('keyboard-focus');
        });
        
        State.selectedTreeItem = item;
        State.focusedPane = 'folders';
        // Note: updatePaneFocus is now handled by the keyboard module
        
        // Always load files when a folder is selected (remove the isKeyboard check)
        if (State.loadFileDebounceTimer) {
            clearTimeout(State.loadFileDebounceTimer);
        }
        
        const folderPath = item.dataset.path;
        if (folderPath !== undefined) { // folderPath can be empty string for root
            State.loadFileDebounceTimer = setTimeout(() => {
                this.loadFiles(folderPath);
            }, 300);
        }
    },

    selectFileItem(item, isKeyboard = false) {
        if (State.selectedListItem) {
            State.selectedListItem.classList.remove('selected', 'keyboard-focus');
        }
        
        item.classList.add('selected');
        // Always add keyboard-focus when selecting, regardless of input method
        item.classList.add('keyboard-focus');
        
        // Remove keyboard-focus from folders pane when selecting a file
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
        
        State.selectedListItem = item;
        State.focusedPane = 'files';
        // Note: updatePaneFocus is now handled by the keyboard module
    },

    // File operations
    async loadFiles(folderPath) {
        await FilesManager.loadFiles(folderPath);
    },

    async loadFile(filepath, listItem) {
        await FilesManager.loadFile(filepath, listItem);
    },
    
    // Filename editing
    cancelFilenameEdit() {
        FilesManager.cancelFilenameEdit();
    },
    
    resetFilename() {
        FilesManager.resetFilename();
    },
    
    async saveFilename() {
        await FilesManager.saveFilename(
            this.showButtonStatus.bind(this),
            this.loadFiles.bind(this),
            () => HistoryManager.loadHistory()
        );
    },

    // Utility functions
    setFormEnabled(enabled) {
        UIUtils.setFormEnabled(enabled);
    },

    showStatus(message, type) {
        UIUtils.showStatus(message, type);
    },

    hideStatus() {
        UIUtils.hideStatus();
    },
};

// Global function bindings for onclick handlers in HTML
function setSortMethod(method) {
    window.MetadataRemote.Navigation.Tree.setSortMethod(method);
}

function saveFilename() {
    AudioMetadataEditor.saveFilename();
}

function resetFilename() {
    AudioMetadataEditor.resetFilename();
}

function cancelFilenameEdit() {
    AudioMetadataEditor.cancelFilenameEdit();
}

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

function applyFieldToFolder(field) {
    MetadataEditor.applyFieldToFolder(field, 
        AudioMetadataEditor.showButtonStatus.bind(AudioMetadataEditor),
        AudioMetadataEditor.setFormEnabled.bind(AudioMetadataEditor)
    );
}

function saveFieldToFile(field) {
    MetadataEditor.saveFieldToFile(field,
        AudioMetadataEditor.showButtonStatus.bind(AudioMetadataEditor)
    );
}

function save() {
    MetadataEditor.save(
        AudioMetadataEditor.showButtonStatus.bind(AudioMetadataEditor)
    );
}

function resetForm() {
    MetadataEditor.resetForm(
        AudioMetadataEditor.showButtonStatus.bind(AudioMetadataEditor)
    );
}

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

// Filename edit click handler
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('current-filename').onclick = function() {
        if (!State.currentFile) return;
        
        document.getElementById('current-filename').style.display = 'none';
        document.querySelector('.filename-edit').style.display = 'flex';
        document.getElementById('filename-input').value = State.originalFilename;
        document.getElementById('filename-input').focus();
    };
    
    // Initialize the application
    AudioMetadataEditor.init();
});

// Filter box on input handler
const filter_box = document.getElementById('filter-box');
filter_box.addEventListener('input', (e) => {
  const value = e.target.value.toLowerCase().trim();
  const file_list_li = document.querySelectorAll('#file-list > li');
  for (let i = 0; i < file_list_li.length; i++) {
    const li = file_list_li[i];
    const file_name = li.querySelector('.file-info > div').innerText.toLowerCase();
    // if the filterd value does not match name, hide item
    if (value.length > 0 && !file_name.includes(value)) {
      li.setAttribute("aria-hidden", "true");
    } else {
      li.removeAttribute("aria-hidden");
    }
  }
});
