/**
 * Keyboard Navigation Utilities
 * Provides reusable keyboard handling, scrolling, and event utilities
 */

(function() {
    // Create namespace if it doesn't exist
    window.MetadataRemote = window.MetadataRemote || {};
    window.MetadataRemote.Navigation = window.MetadataRemote.Navigation || {};
    
    // Create shortcuts
    const State = window.MetadataRemote.State;
    
    /**
     * KeyRepeatHandler - Manages custom key repeat behavior
     */
    class KeyRepeatHandler {
        constructor() {
            this.keyHeldDown = null;
            this.isRepeating = false;
            this.delayTimer = null;
            this.repeatTimer = null;
            this.repeatDelay = State.keyRepeatDelay || 500;
            this.repeatInterval = State.keyRepeatInterval || 50;
        }
        
        /**
         * Start key repeat for a given key
         * @param {string} key - The key to repeat
         * @param {Function} callback - Function to call on each repeat
         * @param {Object} options - Optional settings
         */
        start(key, callback, options = {}) {
            // Clear any existing timers
            this.stop();
            
            // Store which key is being held
            this.keyHeldDown = key;
            this.isRepeating = false;
            
            // Use provided options or defaults
            const delay = options.delay || this.repeatDelay;
            const interval = options.interval || this.repeatInterval;
            
            // Perform the initial action
            callback();
            
            // Set up custom repeat with initial delay
            this.delayTimer = setTimeout(() => {
                // Only start repeating if the same key is still held down
                if (this.keyHeldDown === key) {
                    this.isRepeating = true;
                    this.repeatTimer = setInterval(() => {
                        if (this.keyHeldDown === key) {
                            callback();
                        }
                    }, interval);
                }
            }, delay);
        }
        
        /**
         * Stop key repeat
         */
        stop() {
            this.keyHeldDown = null;
            this.isRepeating = false;
            
            if (this.delayTimer) {
                clearTimeout(this.delayTimer);
                this.delayTimer = null;
            }
            if (this.repeatTimer) {
                clearInterval(this.repeatTimer);
                this.repeatTimer = null;
            }
        }
        
        /**
         * Check if a key is currently repeating
         * @param {string} key - Optional key to check, if not provided checks any key
         * @returns {boolean} True if key is repeating
         */
        isRepeating(key = null) {
            if (key) {
                return this.isRepeating && this.keyHeldDown === key;
            }
            return this.isRepeating;
        }
        
        /**
         * Get the currently held key
         * @returns {string|null} The key being held down
         */
        getCurrentKey() {
            return this.keyHeldDown;
        }
    }
    
    /**
     * ScrollManager - Handles scrolling operations
     */
    class ScrollManager {
        /**
         * Scroll item to center of container with smooth scrolling
         * @param {HTMLElement} item - Item to scroll to
         * @param {HTMLElement} container - Container element
         */
        static scrollItemToCenter(item, container) {
            const containerRect = container.getBoundingClientRect();
            const itemRect = item.getBoundingClientRect();
            
            // Calculate the center position of the container
            const containerCenter = containerRect.top + (containerRect.height / 2);
            
            // Calculate where the item currently is
            const itemCenter = itemRect.top + (itemRect.height / 2);
            
            // Calculate how much we need to scroll
            const scrollOffset = itemCenter - containerCenter;
            
            // Get current scroll position
            const currentScroll = container.scrollTop;
            
            // Calculate new scroll position
            const newScroll = currentScroll + scrollOffset;
            
            // Check boundaries
            const maxScroll = container.scrollHeight - container.clientHeight;
            
            // Use instant scrolling during key repeat for smooth performance
            // Only use smooth scrolling for single key presses
            // Check both new KeyRepeatHandler and legacy State for backward compatibility
            const isRepeating = (window.MetadataRemote.Navigation.keyRepeatHandler && 
                               window.MetadataRemote.Navigation.keyRepeatHandler.isRepeating()) || 
                               State.isKeyRepeating;
            
            if (isRepeating) {
                container.scrollTop = Math.max(0, Math.min(newScroll, maxScroll));
            } else {
                container.scrollTo({
                    top: Math.max(0, Math.min(newScroll, maxScroll)),
                    behavior: 'smooth'
                });
            }
        }

        /**
         * Immediate centering without animation
         * @param {HTMLElement} item - Item to scroll to
         * @param {HTMLElement} container - Container element
         */
        static immediateScrollToCenter(item, container) {
            const containerRect = container.getBoundingClientRect();
            const itemRect = item.getBoundingClientRect();
            
            const containerTop = containerRect.top;
            const containerBottom = containerRect.bottom;
            const itemTop = itemRect.top;
            const itemBottom = itemRect.bottom;
            
            // Define a margin (e.g., 30% of container height)
            const margin = containerRect.height * 0.3;
            
            let scrollAdjustment = 0;
            
            // If item is above the visible area (with margin)
            if (itemTop < containerTop + margin) {
                scrollAdjustment = itemTop - containerTop - margin;
            }
            // If item is below the visible area (with margin)
            else if (itemBottom > containerBottom - margin) {
                scrollAdjustment = itemBottom - containerBottom + margin;
            }
            
            if (scrollAdjustment !== 0) {
                const currentScroll = container.scrollTop;
                const newScroll = currentScroll + scrollAdjustment;
                const maxScroll = container.scrollHeight - container.clientHeight;
                container.scrollTop = Math.max(0, Math.min(newScroll, maxScroll));
            }
        }
        
        /**
         * Ensure element is visible within its container
         * @param {HTMLElement} element - The element to make visible
         * @param {HTMLElement} container - The container element (optional, will find scrollable parent)
         */
        static ensureVisible(element, container = null) {
            // Find the scrollable container if not provided
            if (!container) {
                container = element.closest('.metadata-content, .folders-scroll-area, .files-scroll-area');
            }
            if (!container) return;
            
            // Get element and container positions
            const elementRect = element.getBoundingClientRect();
            const containerRect = container.getBoundingClientRect();
            
            // Calculate padding based on container type
            let paddingTop = 20;
            let paddingBottom = 80;
            
            // For metadata content, adjust for history panel
            if (container.classList.contains('metadata-content')) {
                const historyHeader = document.querySelector('.history-header');
                if (historyHeader) {
                    const historyRect = historyHeader.getBoundingClientRect();
                    if (historyRect.top < window.innerHeight) {
                        paddingBottom = Math.max(80, window.innerHeight - historyRect.top + 20);
                    }
                }
            }
            
            // Calculate visible boundaries with padding
            const visibleTop = containerRect.top + paddingTop;
            const visibleBottom = containerRect.bottom - paddingBottom;
            
            // Check if element is above visible area
            if (elementRect.top < visibleTop) {
                const scrollAmount = elementRect.top - visibleTop;
                container.scrollTop += scrollAmount;
            }
            // Check if element is below visible area
            else if (elementRect.bottom > visibleBottom) {
                const scrollAmount = elementRect.bottom - visibleBottom;
                container.scrollTop += scrollAmount;
            }
        }
    }
    
    /**
     * Event utilities for keyboard navigation
     */
    const EventUtils = {
        /**
         * Check if a key is a navigation key
         * @param {string} key - The key to check
         * @returns {boolean} True if it's a navigation key
         */
        isNavigationKey(key) {
            const navigationKeys = [
                'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
                'Tab', 'Enter', 'Escape', 'PageUp', 'PageDown',
                'Home', 'End'
            ];
            return navigationKeys.includes(key);
        },
        
        /**
         * Check if default behavior should be prevented for this event
         * @param {KeyboardEvent} event - The keyboard event
         * @returns {boolean} True if preventDefault should be called
         */
        shouldPreventDefault(event) {
            // Always prevent default for navigation keys
            if (this.isNavigationKey(event.key)) {
                return true;
            }
            
            // Prevent default for filter shortcuts
            if (event.key === '/' && !event.ctrlKey && !event.shiftKey) {
                return true;
            }
            if (event.ctrlKey && event.key === 'f') {
                return true;
            }
            if (event.ctrlKey && event.shiftKey && event.key === 'S') {
                return true;
            }
            
            return false;
        },
        
        /**
         * Normalize key values from keyboard events
         * @param {KeyboardEvent} event - The keyboard event
         * @returns {string} Normalized key value
         */
        getKeyFromEvent(event) {
            // Handle special key combinations
            if (event.ctrlKey && event.key === 'f') {
                return 'Ctrl+f';
            }
            if (event.ctrlKey && event.shiftKey && event.key === 'S') {
                return 'Ctrl+Shift+S';
            }
            
            // Return the key as-is for most cases
            return event.key;
        },
        
        /**
         * Check if the event target is an input element
         * @param {Event} event - The event
         * @returns {boolean} True if target is an input element
         */
        isInputElement(event) {
            const target = event.target;
            return target && (
                target.tagName === 'INPUT' || 
                target.tagName === 'TEXTAREA' ||
                target.contentEditable === 'true'
            );
        }
    };
    
    // Export to namespace
    window.MetadataRemote.Navigation.KeyRepeatHandler = KeyRepeatHandler;
    window.MetadataRemote.Navigation.ScrollManager = ScrollManager;
    window.MetadataRemote.Navigation.EventUtils = EventUtils;
    
})();