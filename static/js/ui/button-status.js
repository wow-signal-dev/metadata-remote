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
 * Button Status Management for Metadata Remote
 * Handles button state transitions and status messages
 */

(function() {
    // Create namespace if it doesn't exist
    window.MetadataRemote = window.MetadataRemote || {};
    window.MetadataRemote.UI = window.MetadataRemote.UI || {};
    
    window.MetadataRemote.UI.ButtonStatus = {
        /**
         * Show status on a button with animation
         * @param {HTMLElement} button - The button element
         * @param {string} message - Status message to display
         * @param {string} type - Status type: 'processing', 'success', 'error', 'warning'
         * @param {number} duration - Auto-clear duration in ms (0 = no auto-clear)
         */
        showButtonStatus(button, message, type = 'processing', duration = 3000) {
            if (!button || !button.classList.contains('btn-status')) return;
            
            // Clear any existing timeout
            if (button._statusTimeout) {
                clearTimeout(button._statusTimeout);
            }
            
            // Clear any existing timeout
            if (button._statusTimeout) {
                clearTimeout(button._statusTimeout);
            }
            
            // Store original width if not already stored
            if (!button._originalWidth) {
                button._originalWidth = window.getComputedStyle(button).width;
            }
            
            // Remove all status classes
            button.classList.remove('processing', 'success', 'error', 'warning');
            
            // Add new status class
            button.classList.add(type);
            
            // Check if this is an apply-field button (File/Folder buttons)
            const isApplyFieldBtn = button.classList.contains('apply-field-btn');
            
            // Truncate very long messages
            const maxLength = 30;
            const displayMessage = message.length > maxLength ? 
                message.substring(0, maxLength - 3) + '...' : message;
            
            // Update message
            const messageEl = button.querySelector('.btn-status-message');
            if (messageEl) {
                if (isApplyFieldBtn) {
                    // For File/Folder buttons, show only icons
                    messageEl.textContent = '';
                    if (type === 'processing') {
                        const spinner = document.createElement('span');
                        spinner.className = 'spinner';
                        messageEl.appendChild(spinner);
                    } else {
                        const icons = {
                            success: '✓',
                            error: '✕',
                            warning: '⚠'
                        };
                        const iconSpan = document.createElement('span');
                        iconSpan.className = `status-icon ${type}`;
                        iconSpan.textContent = icons[type] || '';
                        messageEl.appendChild(iconSpan);
                    }
                    // Add tooltip with the actual message
                    button.title = message;
                } else {
                    // For other buttons, show icon + text as before
                    if (type === 'processing') {
                        messageEl.textContent = '';
                        const spinner = document.createElement('span');
                        spinner.className = 'spinner';
                        messageEl.appendChild(spinner);
                        messageEl.appendChild(document.createTextNode(' ' + displayMessage));
                    } else {
                        const icons = {
                            success: '✓',
                            error: '✕',
                            warning: '⚠'
                        };
                        messageEl.textContent = '';
                        const iconSpan = document.createElement('span');
                        iconSpan.className = `status-icon ${type}`;
                        iconSpan.textContent = icons[type] || '';
                        messageEl.appendChild(iconSpan);
                        messageEl.appendChild(document.createTextNode(' ' + displayMessage));
                    }
                    
                    // Add title attribute for full message if truncated
                    if (message.length > maxLength) {
                        button.title = message;
                    }
                }
            }
            
            // Auto-clear status after duration (except for processing)
            if (type !== 'processing' && duration > 0) {
                button._statusTimeout = setTimeout(() => {
                    window.MetadataRemote.UI.ButtonStatus.clearButtonStatus(button);
                }, duration);
            }
        },
        
        /**
         * Clear button status and restore original state
         * @param {HTMLElement} button - The button element
         */
        clearButtonStatus(button) {
            if (!button || !button.classList.contains('btn-status')) return;
                    
            if (button._statusTimeout) {
                clearTimeout(button._statusTimeout);
                delete button._statusTimeout;
            }
            
            button.classList.remove('processing', 'success', 'error', 'warning');
            button.title = ''; // Clear tooltip
            
            // Ensure the original content is visible
            const contentEl = button.querySelector('.btn-status-content');
            if (contentEl) {
                contentEl.style.opacity = '';  // Remove any inline opacity
            }
            
            // Reset message content
            const messageEl = button.querySelector('.btn-status-message');
            if (messageEl) {
                messageEl.textContent = '';
                messageEl.innerHTML = '';
            }
            
            // Don't restore width for apply-field buttons
            if (!button.classList.contains('apply-field-btn') && button._originalWidth) {
                setTimeout(() => {
                    button.style.width = '';
                    delete button._originalWidth;
                }, 300);
            }
        },
        
        /**
         * Clear all button statuses on the page
         */
        clearAllButtonStatuses() {
            // Clear ALL btn-status buttons, not just ones with active status classes
            document.querySelectorAll('.btn-status').forEach(button => {
                // Clear any pending timeouts first
                if (button._statusTimeout) {
                    clearTimeout(button._statusTimeout);
                    delete button._statusTimeout;
                }
                
                // Remove all status classes
                button.classList.remove('processing', 'success', 'error', 'warning');
                button.title = '';
                
                // Reset message content
                const messageEl = button.querySelector('.btn-status-message');
                if (messageEl) {
                    messageEl.textContent = '';
                    messageEl.innerHTML = '';
                }
                
                // Ensure the original content is visible
                const contentEl = button.querySelector('.btn-status-content');
                if (contentEl) {
                    contentEl.style.opacity = '';  // Remove any inline opacity
                }
                
                // Clear any width modifications
                if (button._originalWidth) {
                    button.style.width = '';
                    delete button._originalWidth;
                }
            });
        }
    };
})();
