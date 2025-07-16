/**
 * UI Utility Functions for Metadata Remote
 * General UI helpers and formatting utilities
 */

(function() {
    // Create namespace if it doesn't exist
    window.MetadataRemote = window.MetadataRemote || {};
    window.MetadataRemote.UI = window.MetadataRemote.UI || {};
    
    window.MetadataRemote.UI.Utilities = {
        /**
         * Show status message (legacy function - kept for compatibility)
         * @param {string} message - Status message
         * @param {string} type - Status type
         */
        showStatus(message, type) {
            // Legacy function - kept for compatibility but hidden - status is now hidden by CSS
            const status = document.getElementById('status');
            if (status) {
                status.textContent = message;
                status.className = `status ${type}`;
            }
            
            // For errors, also show an alert since the status element is hidden
            if (type === 'error') {
                alert(`Error: ${message}`);
            }
        },
    
        /**
         * Hide status message (legacy function - kept for compatibility)
         */
        hideStatus() {
            // Legacy function - kept for compatibility
            const status = document.getElementById('status');
            status.style.display = 'none';
        },
    
        /**
         * Enable or disable all form inputs and buttons
         * @param {boolean} enabled - Whether to enable or disable
         */
        setFormEnabled(enabled) {
            const inputs = document.querySelectorAll('#metadata-form input');
            const buttons = document.querySelectorAll('button');
            
            inputs.forEach(input => input.disabled = !enabled);
            buttons.forEach(button => {
                // Skip history panel buttons
                if (button.classList.contains('history-btn') || 
                    button.classList.contains('history-clear-btn')) {
                    return;
                }
                if (!button.classList.contains('btn-status') || !button.classList.contains('processing')) {
                    // Don't re-enable buttons that are disabled due to format restrictions
                    if (enabled && button.title && button.title.includes('does not support embedded album art')) {
                        return; // Skip re-enabling this button
                    }
                    button.disabled = !enabled;
                }
            });
        },
    
        /**
         * Get emoji icon for file format
         * @param {string} filename - The filename
         * @returns {string} Emoji character
         */
        getFormatEmoji(filename) {
            const ext = filename.split('.').pop().toLowerCase();
            const FORMAT_EMOJIS = {
                'mp3': '🎵',
                'flac': '💿',
                'm4a': '🎶',
                'wav': '🌊',
                'wma': '🪟',
                'wv': '📦',
                'ogg': '🎼',
                'opus': '🎹'
            };
            return FORMAT_EMOJIS[ext] || '🎵';
        },
    
        /**
         * Get format badge HTML with visual indicators
         * @param {string} filename - The filename
         * @returns {string} HTML string for format badge
         */
        getFormatBadge(filename) {
            const ext = filename.split('.').pop().toUpperCase();
            const lossless = ['FLAC', 'WAV', 'WV', 'OGG', 'OPUS'];
            const limitedMetadata = ['WAV', 'WV'];
            const noAlbumArt = ['WAV', 'WV'];
            
            const isLossless = lossless.includes(ext);
            const hasLimitations = limitedMetadata.includes(ext) || noAlbumArt.includes(ext);
            
            let badgeHtml = `<span style="
                font-size: 0.7rem;
                padding: 0.2rem 0.4rem;
                border-radius: 4px;
                background: ${isLossless ? 'rgba(74, 222, 128, 0.2)' : 'rgba(255, 169, 77, 0.2)'};
                color: ${isLossless ? '#4ade80' : '#ffa94d'};
                margin-left: 0.5rem;
                font-weight: 500;
            ">${ext}</span>`;
            
            if (hasLimitations) {
                const limitations = [];
                if (limitedMetadata.includes(ext)) {
                    limitations.push('limited metadata');
                }
                if (noAlbumArt.includes(ext)) {
                    limitations.push('no album art');
                }
                
                badgeHtml += `<span style="
                    font-size: 0.65rem;
                    padding: 0.15rem 0.3rem;
                    border-radius: 4px;
                    background: rgba(255, 107, 107, 0.2);
                    color: #ff6b6b;
                    margin-left: 0.3rem;
                    font-weight: 400;
                " title="${limitations.join(', ')}">⚠</span>`;
            }
            
            return badgeHtml;
        }
    };
})();
