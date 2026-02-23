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
            
            // For errors, also show a dialog since the status element is hidden
            if (type === 'error') {
                const Dialog = window.MetadataRemote.UI.Dialog;
                if (Dialog && !Dialog.isOpen()) {
                    Dialog.alert({
                        title: 'Error',
                        message: message,
                        confirmText: 'OK'
                    });
                }
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
                'm4b': '📚',
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
            
            // Check for audiobook format
            const isAudiobook = ext === 'M4B';
            
            let badgeHtml = `<span style="
                font-size: 0.7rem;
                padding: 0.2rem 0.4rem;
                border-radius: 4px;
                background: ${isAudiobook ? 'rgba(139, 92, 246, 0.2)' : (isLossless ? 'rgba(74, 222, 128, 0.2)' : 'rgba(255, 169, 77, 0.2)')};
                color: ${isAudiobook ? '#8b5cf6' : (isLossless ? '#4ade80' : '#ffa94d')};
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
        },

        setupActionsMenuGlobalClose() {
            if (this._actionsMenuListenerAdded) {
                return;
            }

            document.addEventListener('click', () => {
                this.closeActionsMenus();
            });

            this._actionsMenuListenerAdded = true;
        },

        closeActionsMenus(exceptMenu = null) {
            document.querySelectorAll('.item-actions-menu.active').forEach(menu => {
                if (!exceptMenu || menu !== exceptMenu) {
                    menu.classList.remove('active');
                }
            });
        },

        positionActionsMenu(menuEl, x, y) {
            menuEl.style.top = `${y}px`;
            menuEl.style.left = `${Math.max(8, x - 140)}px`;

            requestAnimationFrame(() => {
                const menuRect = menuEl.getBoundingClientRect();

                const maxLeft = window.innerWidth - menuRect.width - 8;
                const maxTop = window.innerHeight - menuRect.height - 8;

                const finalLeft = Math.min(Math.max(8, x - menuRect.width), maxLeft);
                const finalTop = Math.min(Math.max(8, y), maxTop);

                menuEl.style.left = `${finalLeft}px`;
                menuEl.style.top = `${finalTop}px`;
            });
        },

        openActionsMenu(menuEl, x, y) {
            this.closeActionsMenus(menuEl);
            menuEl.classList.add('active');
            this.positionActionsMenu(menuEl, x, y);
        },

        toggleActionsMenu(buttonEl, menuEl) {
            const shouldOpen = !menuEl.classList.contains('active');

            this.closeActionsMenus(menuEl);
            menuEl.classList.toggle('active');

            if (!shouldOpen) {
                return;
            }

            const rect = buttonEl.getBoundingClientRect();
            this.positionActionsMenu(menuEl, rect.right, rect.bottom - 2);
        },

        showBulkProgress({ label, done, total }) {
            const container = document.getElementById('bulk-progress');
            const textEl = document.getElementById('bulk-progress-text');
            const barEl = document.getElementById('bulk-progress-bar-fill');

            if (!container || !textEl || !barEl) {
                return;
            }

            container.style.display = '';
            textEl.textContent = `${label} (${done}/${total})`;
            barEl.style.width = `${Math.floor((done / Math.max(1, total)) * 100)}%`;

            // Prevent the fixed bar from covering bottom content.
            document.body.style.paddingBottom = '44px';
        },

        hideBulkProgress() {
            const container = document.getElementById('bulk-progress');
            const textEl = document.getElementById('bulk-progress-text');
            const barEl = document.getElementById('bulk-progress-bar-fill');

            if (container) {
                container.style.display = 'none';
            }

            if (textEl) {
                textEl.textContent = '';
            }

            if (barEl) {
                barEl.style.width = '0%';
            }

            document.body.style.paddingBottom = '';
        },

        async runBulkOperation({ label, items, onItem }) {
            const total = Array.isArray(items) ? items.length : 0;
            if (total === 0) {
                return;
            }

            const isBulk = total > 1;
            let progressShown = false;

            try {
                if (isBulk) {
                    this.showBulkProgress({ label, done: 0, total });
                    progressShown = true;
                }

                for (let i = 0; i < total; i++) {
                    await onItem(items[i], i);

                    if (isBulk) {
                        this.showBulkProgress({ label, done: i + 1, total });
                    }
                }
            } finally {
                if (progressShown) {
                    this.hideBulkProgress();
                }
            }
        },

        setDragImage(event, icon, text, offsetX = 10, offsetY = 10, badgeText = '') {
            if (!event || !event.dataTransfer || !event.dataTransfer.setDragImage) {
                return;
            }

            const el = document.createElement('div');
            el.className = 'drag-image';

            const iconSpan = document.createElement('span');
            iconSpan.className = 'drag-image-icon';
            iconSpan.textContent = icon;

            const textSpan = document.createElement('span');
            textSpan.className = 'drag-image-text';
            textSpan.textContent = text;

            el.appendChild(iconSpan);
            el.appendChild(textSpan);

            if (badgeText) {
                const badgeSpan = document.createElement('span');
                badgeSpan.className = 'drag-image-badge';
                badgeSpan.textContent = badgeText;
                el.appendChild(badgeSpan);
            }

            document.body.appendChild(el);

            event.dataTransfer.setDragImage(el, offsetX, offsetY);

            requestAnimationFrame(() => {
                if (el.parentNode) {
                    el.remove();
                }
            });
        }
    };
})();
