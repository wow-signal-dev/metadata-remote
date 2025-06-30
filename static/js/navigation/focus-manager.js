/**
 * Focus Manager for Metadata Remote
 * Manages focus state, indicators, history, and visibility
 */

(function() {
    // Create namespace if it doesn't exist
    window.MetadataRemote = window.MetadataRemote || {};
    window.MetadataRemote.Navigation = window.MetadataRemote.Navigation || {};
    
    // Create shortcuts
    const State = window.MetadataRemote.State;
    const ScrollManager = window.MetadataRemote.Navigation.ScrollManager;
    
    /**
     * Focus Manager - Handles all focus-related operations
     */
    const FocusManager = {
        // Focus history stack
        focusHistory: [],
        
        /**
         * Add keyboard focus indicator to an element
         * @param {HTMLElement} element - Element to add focus to
         */
        addKeyboardFocus(element) {
            if (element) {
                element.classList.add('keyboard-focus');
            }
        },
        
        /**
         * Remove keyboard focus indicator from an element
         * @param {HTMLElement} element - Element to remove focus from
         */
        removeKeyboardFocus(element) {
            if (element) {
                element.classList.remove('keyboard-focus');
            }
        },
        
        /**
         * Clear all keyboard focus indicators
         */
        clearAllKeyboardFocus() {
            document.querySelectorAll('.keyboard-focus').forEach(el => {
                el.classList.remove('keyboard-focus');
            });
        },
        
        /**
         * Transfer keyboard focus from one element to another
         * @param {HTMLElement} from - Element to remove focus from
         * @param {HTMLElement} to - Element to add focus to
         */
        transferKeyboardFocus(from, to) {
            if (from) {
                this.removeKeyboardFocus(from);
            }
            if (to) {
                this.addKeyboardFocus(to);
            }
        },
        
        /**
         * Push current focus to history stack
         * @param {HTMLElement} element - Element to save in history
         */
        pushFocus(element) {
            if (element) {
                // Avoid duplicates at the top of the stack
                if (this.focusHistory.length === 0 || this.focusHistory[this.focusHistory.length - 1] !== element) {
                    this.focusHistory.push(element);
                    // Limit history size to prevent memory leaks
                    if (this.focusHistory.length > 50) {
                        this.focusHistory.shift();
                    }
                }
            }
        },
        
        /**
         * Pop and restore previous focus from history
         * @returns {HTMLElement|null} The restored element or null if history is empty
         */
        popFocus() {
            // Remove current focus if it's in history
            const currentFocus = document.activeElement;
            if (this.focusHistory.length > 0 && this.focusHistory[this.focusHistory.length - 1] === currentFocus) {
                this.focusHistory.pop();
            }
            
            // Get previous focus
            const previousFocus = this.focusHistory.pop();
            if (previousFocus && previousFocus.offsetParent !== null) {
                previousFocus.focus();
                this.addKeyboardFocus(previousFocus);
                return previousFocus;
            }
            
            return null;
        },
        
        /**
         * Clear focus history
         */
        clearHistory() {
            this.focusHistory = [];
        },
        
        /**
         * Ensure an element is visible within its scrollable container
         * @param {HTMLElement} element - The element to make visible
         */
        ensureElementVisible(element) {
            if (!element) return;
            
            // Find the scrollable container (metadata-content)
            const scrollContainer = element.closest('.metadata-content');
            if (!scrollContainer) return;
            
            // Get element and container positions
            const elementRect = element.getBoundingClientRect();
            const containerRect = scrollContainer.getBoundingClientRect();
            
            // Calculate dynamic bottom padding based on history panel
            const historyHeader = document.querySelector('.history-header');
            let paddingBottom = 80; // Default padding
            
            if (historyHeader) {
                const historyRect = historyHeader.getBoundingClientRect();
                // If history header is visible within the viewport, adjust padding
                if (historyRect.top < window.innerHeight) {
                    // Add extra padding to ensure element is above the history bar
                    paddingBottom = Math.max(80, window.innerHeight - historyRect.top + 20);
                }
            }
            
            // Calculate visible boundaries with padding
            const paddingTop = 20; // Padding from top edge
            const visibleTop = containerRect.top + paddingTop;
            const visibleBottom = containerRect.bottom - paddingBottom;
            
            // Check if element is above visible area
            if (elementRect.top < visibleTop) {
                // Scroll up to show element with padding
                const scrollAmount = elementRect.top - visibleTop;
                scrollContainer.scrollTop += scrollAmount;
            }
            // Check if element is below visible area
            else if (elementRect.bottom > visibleBottom) {
                // Scroll down to show element with padding
                const scrollAmount = elementRect.bottom - visibleBottom;
                scrollContainer.scrollTop += scrollAmount;
            }
        },
        
        /**
         * Set focus to an element and ensure it's visible
         * @param {HTMLElement} element - Element to focus
         * @param {boolean} addToHistory - Whether to add current focus to history
         */
        setFocus(element, addToHistory = true) {
            if (!element) return;
            
            // Save current focus to history if requested
            if (addToHistory && document.activeElement) {
                this.pushFocus(document.activeElement);
            }
            
            // Clear all keyboard focus indicators first
            this.clearAllKeyboardFocus();
            
            // Set focus and add indicator
            element.focus();
            this.addKeyboardFocus(element);
            
            // Ensure element is visible
            this.ensureElementVisible(element);
        },
        
        /**
         * Get the currently focused element (with keyboard-focus class)
         * @returns {HTMLElement|null} The focused element or null
         */
        getCurrentFocus() {
            return document.querySelector('.keyboard-focus');
        },
        
        /**
         * Check if an element has keyboard focus
         * @param {HTMLElement} element - Element to check
         * @returns {boolean} True if element has keyboard focus
         */
        hasKeyboardFocus(element) {
            return element && element.classList.contains('keyboard-focus');
        },
        
        /**
         * Focus the first focusable element in a container
         * @param {HTMLElement} container - Container to search in
         * @param {string} selector - Optional selector to narrow focus targets
         * @returns {HTMLElement|null} The focused element or null
         */
        focusFirst(container, selector = 'button, input, [tabindex]:not([tabindex="-1"])') {
            if (!container) return null;
            
            const focusableElements = container.querySelectorAll(selector);
            const visibleElements = Array.from(focusableElements).filter(el => 
                el.offsetParent !== null && !el.disabled
            );
            
            if (visibleElements.length > 0) {
                this.setFocus(visibleElements[0]);
                return visibleElements[0];
            }
            
            return null;
        },
        
        /**
         * Focus the last focusable element in a container
         * @param {HTMLElement} container - Container to search in
         * @param {string} selector - Optional selector to narrow focus targets
         * @returns {HTMLElement|null} The focused element or null
         */
        focusLast(container, selector = 'button, input, [tabindex]:not([tabindex="-1"])') {
            if (!container) return null;
            
            const focusableElements = container.querySelectorAll(selector);
            const visibleElements = Array.from(focusableElements).filter(el => 
                el.offsetParent !== null && !el.disabled
            );
            
            if (visibleElements.length > 0) {
                const lastElement = visibleElements[visibleElements.length - 1];
                this.setFocus(lastElement);
                return lastElement;
            }
            
            return null;
        },
        
        /**
         * Move focus to the next focusable element
         * @param {HTMLElement} currentElement - Current focused element
         * @param {HTMLElement} container - Container to search within
         * @param {string} selector - Selector for focusable elements
         * @returns {HTMLElement|null} The newly focused element or null
         */
        focusNext(currentElement, container, selector = 'button, input, [tabindex]:not([tabindex="-1"])') {
            if (!container) return null;
            
            const focusableElements = Array.from(container.querySelectorAll(selector))
                .filter(el => el.offsetParent !== null && !el.disabled);
            
            const currentIndex = focusableElements.indexOf(currentElement);
            const nextIndex = (currentIndex + 1) % focusableElements.length;
            
            if (focusableElements[nextIndex]) {
                this.setFocus(focusableElements[nextIndex]);
                return focusableElements[nextIndex];
            }
            
            return null;
        },
        
        /**
         * Move focus to the previous focusable element
         * @param {HTMLElement} currentElement - Current focused element
         * @param {HTMLElement} container - Container to search within
         * @param {string} selector - Selector for focusable elements
         * @returns {HTMLElement|null} The newly focused element or null
         */
        focusPrevious(currentElement, container, selector = 'button, input, [tabindex]:not([tabindex="-1"])') {
            if (!container) return null;
            
            const focusableElements = Array.from(container.querySelectorAll(selector))
                .filter(el => el.offsetParent !== null && !el.disabled);
            
            const currentIndex = focusableElements.indexOf(currentElement);
            const prevIndex = currentIndex <= 0 ? focusableElements.length - 1 : currentIndex - 1;
            
            if (focusableElements[prevIndex]) {
                this.setFocus(focusableElements[prevIndex]);
                return focusableElements[prevIndex];
            }
            
            return null;
        }
    };
    
    // Export to namespace
    window.MetadataRemote.Navigation.FocusManager = FocusManager;
    
})();