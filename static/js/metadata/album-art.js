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
         * Calculate image metadata from an image element or data URL
         * @param {string} imageSrc - The image source (data URL or base64)
         * @returns {Promise<Object>} - Object with width, height, size, and format
         */
        async calculateImageMetadata(imageSrc) {
            return new Promise((resolve) => {
                const img = new Image();
                img.onload = function() {
                    const metadata = {
                        width: this.naturalWidth || 0,
                        height: this.naturalHeight || 0,
                        size: 0,
                        format: 'Unknown'
                    };
                    
                    // Calculate size and format from data URL
                    if (imageSrc && imageSrc.startsWith('data:')) {
                        const matches = imageSrc.match(/data:image\/(\w+);base64,(.+)/);
                        if (matches) {
                            metadata.format = matches[1].toUpperCase();
                            const base64 = matches[2];
                            // Calculate actual file size from base64 (accounting for padding)
                            const padding = (base64.match(/=+$/) || [''])[0].length;
                            metadata.size = Math.floor((base64.length * 3) / 4) - padding;
                        }
                    }
                    
                    resolve(metadata);
                };
                img.onerror = () => {
                    resolve({ width: 0, height: 0, size: 0, format: 'Unknown' });
                };
                img.src = imageSrc;
            });
        },
        
        /**
         * Format file size in human-readable format
         * @param {number} bytes - Size in bytes
         * @returns {string} - Formatted size string
         */
        formatFileSize(bytes) {
            if (bytes === 0) return '0B';
            const k = 1024;
            const sizes = ['B', 'KB', 'MB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return Math.round(bytes / Math.pow(k, i)) + sizes[i];
        },
        
        /**
         * Display album art with metadata overlay
         * @param {string} imageSrc - The image source
         * @param {HTMLElement} artDisplay - The art display container
         */
        async displayAlbumArtWithMetadata(imageSrc, artDisplay) {
            if (!artDisplay) return;
            
            const metadata = await this.calculateImageMetadata(imageSrc);
            const metadataText = metadata.width && metadata.height 
                ? `${metadata.width}x${metadata.height}, ${this.formatFileSize(metadata.size)}, ${metadata.format}`
                : '';
            
            artDisplay.innerHTML = `
                <img src="${imageSrc}" class="album-art" aria-describedby="art-metadata">
                <div class="album-art-metadata" id="art-metadata">
                    <span>${metadataText}</span>
                </div>
            `;
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
                this.displayAlbumArtWithMetadata(State.pendingAlbumArt, artDisplay);
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
