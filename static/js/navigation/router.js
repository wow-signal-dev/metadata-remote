/**
 * Keyboard Event Router
 * Handles routing of keyboard events to appropriate handlers based on
 * key, state, context, and target matching.
 */

class KeyboardRouter {
    constructor() {
        this.routes = new Map();
        this.defaultPriority = 50;
    }

    /**
     * Register a keyboard route
     * @param {Object} pattern - Route pattern to match
     * @param {string} pattern.key - Key to match (e.g., 'Enter', 'Tab', '?')
     * @param {string} pattern.state - Navigation state to match (or '*' for any)
     * @param {string} pattern.context - Context to match (e.g., 'folders', 'files', '*')
     * @param {string} pattern.target - Target element to match (tag name, class, or '*')
     * @param {Object} pattern.modifiers - Modifier keys to match {ctrl, shift, alt}
     * @param {Function} handler - Handler function(event, routeContext)
     * @param {Object} options - Route options
     * @param {number} options.priority - Route priority (higher = checked first)
     * @param {boolean} options.preventDefault - Whether to prevent default
     */
    register(pattern, handler, options = {}) {
        const priority = options.priority || this.defaultPriority;
        const preventDefault = options.preventDefault !== false; // Default true

        // Build route key for quick lookup
        const routeKey = this.buildPatternKey(pattern);
        
        // Store route with metadata
        const route = {
            pattern,
            handler,
            priority,
            preventDefault,
            key: routeKey
        };

        // Get routes for this priority level
        if (!this.routes.has(priority)) {
            this.routes.set(priority, []);
        }
        
        this.routes.get(priority).push(route);
    }

    /**
     * Build a route key from pattern
     */
    buildPatternKey(pattern) {
        const key = pattern.key || '*';
        const state = pattern.state || '*';
        const context = pattern.context || '*';
        const target = pattern.target || '*';
        const modifiers = pattern.modifiers || {};
        
        const modifierStr = [
            modifiers.ctrl ? 'ctrl' : '',
            modifiers.shift ? 'shift' : '',
            modifiers.alt ? 'alt' : ''
        ].filter(Boolean).join('+') || 'none';
        
        return `${key}|${state}|${context}|${target}|${modifierStr}`;
    }

    /**
     * Build a route key from current event context
     */
    buildRouteKey(event, state, context) {
        const key = event.key;
        const modifierStr = [
            event.ctrlKey ? 'ctrl' : '',
            event.shiftKey ? 'shift' : '',
            event.altKey ? 'alt' : ''
        ].filter(Boolean).join('+') || 'none';
        
        return `${key}|${state}|${context.pane}|${context.elementType}|${modifierStr}`;
    }

    /**
     * Get current context from event
     */
    getCurrentContext(event) {
        const target = event.target;
        
        // Determine current pane
        let pane = 'unknown';
        const activeElement = document.activeElement;
        
        if (activeElement) {
            if (activeElement.closest('#folders-list') || activeElement.closest('#folders-filter')) {
                pane = 'folders';
            } else if (activeElement.closest('#files-list') || activeElement.closest('#files-filter')) {
                pane = 'files';
            } else if (activeElement.closest('#metadata-section')) {
                pane = 'metadata';
            }
        }
        
        // Also check MetadataRemote.State.focusedPane as fallback
        if (pane === 'unknown' && window.MetadataRemote?.State?.focusedPane) {
            pane = window.MetadataRemote.State.focusedPane;
        }

        // Determine element type
        const tagName = target.tagName.toLowerCase();
        let elementType = tagName;
        
        if (tagName === 'input' || tagName === 'textarea') {
            elementType = 'input';
        } else if (tagName === 'button') {
            elementType = 'button';
        } else if (target.classList.contains('list-item')) {
            elementType = 'list';
        } else if (tagName === 'div') {
            elementType = 'div';
        }

        const result = {
            pane,
            elementType,
            elementId: target.id || null,
            tagName,
            classList: Array.from(target.classList),
            hasModifier: {
                ctrl: event.ctrlKey,
                shift: event.shiftKey,
                alt: event.altKey
            }
        };
        
        return result;
    }

    /**
     * Find matching route for event
     */
    findMatchingRoute(event) {
        const context = this.getCurrentContext(event);
        const state = window.StateMachine?.getState() || '*';
        
        // Sort priorities in descending order
        const priorities = Array.from(this.routes.keys()).sort((a, b) => b - a);
        
        for (const priority of priorities) {
            const routes = this.routes.get(priority);
            
            for (const route of routes) {
                if (this.matchesRoute(event, state, context, route.pattern)) {
                    return route;
                }
            }
        }
        
        return null;
    }

    /**
     * Check if event matches route pattern
     */
    matchesRoute(event, state, context, pattern) {
        // Check key match
        if (pattern.key !== '*' && pattern.key !== event.key) {
            return false;
        }

        // Check state match
        if (pattern.state !== '*' && pattern.state !== state) {
            return false;
        }

        // Check context match
        if (pattern.context !== '*') {
            let contextMatches = false;
            
            if (typeof pattern.context === 'string') {
                // Simple string match
                contextMatches = pattern.context === context.pane;
            } else if (typeof pattern.context === 'object' && pattern.context.pane) {
                // Object with pane array
                if (Array.isArray(pattern.context.pane)) {
                    contextMatches = pattern.context.pane.includes(context.pane);
                } else {
                    contextMatches = pattern.context.pane === context.pane;
                }
            }
            
            if (!contextMatches) {
                return false;
            }
        }

        // Check target match
        if (pattern.target !== '*' && pattern.target !== undefined) {
            if (pattern.target !== context.elementType && 
                pattern.target !== context.tagName &&
                !context.classList.includes(pattern.target)) {
                return false;
            }
        }

        // Check modifiers
        if (pattern.modifiers) {
            if (pattern.modifiers.ctrl !== undefined && pattern.modifiers.ctrl !== event.ctrlKey) {
                return false;
            }
            if (pattern.modifiers.shift !== undefined && pattern.modifiers.shift !== event.shiftKey) {
                return false;
            }
            if (pattern.modifiers.alt !== undefined && pattern.modifiers.alt !== event.altKey) {
                return false;
            }
        }

        return true;
    }

    /**
     * Route keyboard event
     * @returns {boolean} True if route was handled
     */
    route(event) {
        const context = this.getCurrentContext(event);
        const currentState = window.StateMachine?.getState() || '*';
        
        
        const route = this.findMatchingRoute(event);
        
        if (route) {
            if (route.preventDefault) {
                event.preventDefault();
            }
            
            route.handler(event, context);
            return true;
        }
        
        return false;
    }

    /**
     * Clear all routes
     */
    clear() {
        this.routes.clear();
    }

    /**
     * Get all registered routes
     */
    getRoutes() {
        const allRoutes = [];
        const priorities = Array.from(this.routes.keys()).sort((a, b) => b - a);
        
        for (const priority of priorities) {
            const routes = this.routes.get(priority);
            allRoutes.push(...routes.map(r => ({ ...r, priority })));
        }
        
        return allRoutes;
    }
}

// Export singleton instance
const Router = new KeyboardRouter();

// Make available globally
window.KeyboardRouter = Router;