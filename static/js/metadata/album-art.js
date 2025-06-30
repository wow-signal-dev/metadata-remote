/**
 * Album Art Management Module for Metadata Remote
 * Handles album art upload, deletion, and batch operations
 */

(function() {
    // Create namespace if it doesn't exist
    window.MetadataRemote = window.MetadataRemote || {};
    window.MetadataRemote.Metadata = window.MetadataRemote.Metadata || {};
    
    // Create shortcuts
    const State = window.MetadataRemote.State;
    const API = window.MetadataRemote.API;
    const UIUtils = window.MetadataRemote.UI.Utilities;
    const ButtonStatus = window.MetadataRemote.UI.ButtonStatus;
    
    // Store callbacks that will be set during initialization
    let showStatusCallback = null;
    let loadHistoryCallback = null;
    let setFormEnabledCallback = null;
    
    window.MetadataRemote.Metadata.AlbumArt = {
        /**
         * Initialize the album art module with required callbacks
         * @param {Object} callbacks - Object containing callback functions
         */
        init(callbacks) {
            showStatusCallback = callbacks.showStatus;
            loadHistoryCallback = callbacks.loadHistory;
            setFormEnabledCallback = callbacks.setFormEnabled;
        },
        
        /**
         * Handle album art file upload
         * @param {Event} event - File input change event
         */
        handleArtUpload(event) {
            const file = event.target.files[0];
            if (!file) return;
            
            const reader = new FileReader();
            reader.onload = (e) => {
                State.pendingAlbumArt = e.target.result;
                
                const artDisplay = document.getElementById('art-display');
                artDisplay.innerHTML = `<img src="${State.pendingAlbumArt}" class="album-art">`;
                document.querySelector('.delete-art-btn').style.display = 'block';
                document.querySelector('.save-image-btn').style.display = 'block';
                document.querySelector('.apply-folder-btn').style.display = 'block';
                
                showStatusCallback('Image loaded. Click "Save Image" to save only the image, or "Save" to save all changes.', 'success');
            };
            reader.readAsDataURL(file);
            
            event.target.value = '';
        },

        /**
         * Delete album art from file immediately
         */
        async deleteAlbumArt() {
            if (!State.currentFile) return;
            
            const button = document.querySelector('.delete-art-btn');
            button.disabled = true;
            ButtonStatus.showButtonStatus(button, 'Deleting...', 'processing');
            
            try {
                const result = await API.setMetadata(State.currentFile, { removeArt: true });
                
                if (result.status === 'success') {
                    State.pendingAlbumArt = null;
                    State.currentAlbumArt = null;
                    
                    const artDisplay = document.getElementById('art-display');
                    artDisplay.innerHTML = '<div class="album-art-placeholder">No album art</div>';
                    document.querySelector('.delete-art-btn').style.display = 'none';
                    document.querySelector('.save-image-btn').style.display = 'none';
                    document.querySelector('.apply-folder-btn').style.display = 'none';
                    
                    ButtonStatus.showButtonStatus(button, 'Deleted!', 'success', 2000);
                    loadHistoryCallback();
                    
                    // Return focus to upload button
                    const uploadBtn = document.querySelector('.upload-btn');
                    if (uploadBtn) uploadBtn.focus();
                } else {
                    ButtonStatus.showButtonStatus(button, 'Error', 'error');
                }
            } catch (err) {
                console.error('Error deleting album art:', err);
                ButtonStatus.showButtonStatus(button, 'Error', 'error');
            }
            
            button.disabled = false;
        },

        /**
         * Save album art to current file
         */
        async saveAlbumArt() {
            if (!State.currentFile || !State.pendingAlbumArt) return;
            
            const button = document.querySelector('.save-image-btn');
            button.disabled = true;
            ButtonStatus.showButtonStatus(button, 'Saving...', 'processing');
            
            try {
                const result = await API.setMetadata(State.currentFile, { art: State.pendingAlbumArt });
              
                if (result.status === 'success') {
                    ButtonStatus.showButtonStatus(button, 'Saved!', 'success');
                    State.currentAlbumArt = State.pendingAlbumArt;
                    State.pendingAlbumArt = null;
                    
                    setTimeout(() => {
                        document.querySelector('.save-image-btn').style.display = 'none';
                        document.querySelector('.apply-folder-btn').style.display = 'none';
                        
                        // Return focus to upload button after buttons are hidden
                        const uploadBtn = document.querySelector('.upload-btn');
                        if (uploadBtn) uploadBtn.focus();
                    }, 1000);
                    
                    loadHistoryCallback();
                } else {
                    ButtonStatus.showButtonStatus(button, 'Error', 'error');
                }
            } catch (err) {
                console.error('Error saving album art:', err);
                ButtonStatus.showButtonStatus(button, 'Error', 'error');
            }
            
            button.disabled = false;
        },

        /**
         * Apply album art to all files in folder
         */
        async applyArtToFolder() {
            if (!State.currentFile || (!State.pendingAlbumArt && !State.currentAlbumArt)) return;
            
            const button = document.querySelector('.apply-folder-btn');
            const artToApply = State.pendingAlbumArt || (State.currentAlbumArt ? `data:image/jpeg;base64,${State.currentAlbumArt}` : null);
            if (!artToApply) {
                ButtonStatus.showButtonStatus(button, 'No art', 'error', 2000);
                return;
            }
            
            const folderPath = State.currentFile.substring(0, State.currentFile.lastIndexOf('/'));
            
            if (!confirm(`Apply this album art to all files in the folder "${folderPath || 'root'}"? This will replace any existing album art.`)) {
                return;
            }
            
            button.disabled = true;
            setFormEnabledCallback(false);
            ButtonStatus.showButtonStatus(button, 'Applying...', 'processing');
            
            try {
                const result = await API.applyArtToFolder(folderPath, artToApply);

                if (result.status === 'success') {
                    ButtonStatus.showButtonStatus(button, `Applied to ${result.filesUpdated} files!`, 'success', 3000);
                    
                    if (State.pendingAlbumArt) {
                        State.currentAlbumArt = State.pendingAlbumArt;
                        State.pendingAlbumArt = null;
                        setTimeout(() => {
                            document.querySelector('.save-image-btn').style.display = 'none';
                            document.querySelector('.apply-folder-btn').style.display = 'none';
                            
                            // Return focus to upload button after buttons are hidden
                            const uploadBtn = document.querySelector('.upload-btn');
                            if (uploadBtn) uploadBtn.focus();
                        }, 1000);
                    }
                    
                    loadHistoryCallback();
                } else {
                    ButtonStatus.showButtonStatus(button, result.error || 'Error', 'error');
                }
            } catch (err) {
                console.error('Error applying album art to folder:', err);
                ButtonStatus.showButtonStatus(button, 'Error', 'error');
            }
            
            button.disabled = false;
            setFormEnabledCallback(true);
        }
    };
})();
