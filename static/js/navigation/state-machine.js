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
 * State Machine for Metadata Remote
 * Manages navigation states and transitions
 */

(function() {
    // Create namespace if it doesn't exist
    window.MetadataRemote = window.MetadataRemote || {};
    window.MetadataRemote.Navigation = window.MetadataRemote.Navigation || {};
    
    const NavigationStates = {
        NORMAL: 'normal',              // Standard navigation
        HEADER_FOCUS: 'header_focus',  // Navigating header icons
        FILTER_ACTIVE: 'filter_active',// Filter input is active
        FORM_EDIT: 'form_edit',        // Editing metadata field
        INLINE_EDIT: 'inline_edit'     // Inline editing (filename)
    };

    const TransitionRules = {
        [NavigationStates.NORMAL]: [
            NavigationStates.HEADER_FOCUS,
            NavigationStates.FILTER_ACTIVE,
            NavigationStates.FORM_EDIT,
            NavigationStates.INLINE_EDIT
        ],
        [NavigationStates.HEADER_FOCUS]: [
            NavigationStates.NORMAL,
            NavigationStates.FILTER_ACTIVE
        ],
        [NavigationStates.FILTER_ACTIVE]: [
            NavigationStates.NORMAL
        ],
        [NavigationStates.FORM_EDIT]: [
            NavigationStates.NORMAL
        ],
        [NavigationStates.INLINE_EDIT]: [
            NavigationStates.NORMAL
        ]
    };

    class NavigationStateMachine {
        constructor() {
            this.currentState = NavigationStates.NORMAL;
            this.previousState = null;
            this.context = {};
            this.listeners = new Map();
        }

        transition(newState, context = {}) {
            if (!this.canTransition(this.currentState, newState)) {
                console.warn(`Invalid state transition: ${this.currentState} → ${newState}`);
                return false;
            }

            const oldState = this.currentState;
            this.previousState = oldState;
            this.currentState = newState;
            this.context = { ...this.context, ...context };

            this.emit('statechange', oldState, newState, this.context);
            return true;
        }

        canTransition(from, to) {
            if (!from || !to) return false;
            if (!TransitionRules[from]) return false;
            return TransitionRules[from].includes(to);
        }

        getState() {
            return this.currentState;
        }

        getPreviousState() {
            return this.previousState;
        }

        getContext() {
            return { ...this.context };
        }

        updateContext(updates) {
            this.context = { ...this.context, ...updates };
        }

        reset() {
            const oldState = this.currentState;
            this.currentState = NavigationStates.NORMAL;
            this.previousState = null;
            this.context = {};
            
            if (oldState !== NavigationStates.NORMAL) {
                this.emit('statechange', oldState, NavigationStates.NORMAL, {});
            }
        }

        on(event, callback) {
            if (!this.listeners.has(event)) {
                this.listeners.set(event, new Set());
            }
            this.listeners.get(event).add(callback);
        }

        off(event, callback) {
            if (this.listeners.has(event)) {
                this.listeners.get(event).delete(callback);
                if (this.listeners.get(event).size === 0) {
                    this.listeners.delete(event);
                }
            }
        }

        emit(event, ...args) {
            if (this.listeners.has(event)) {
                this.listeners.get(event).forEach(callback => {
                    try {
                        callback(...args);
                    } catch (error) {
                        console.error(`Error in state machine event listener for ${event}:`, error);
                    }
                });
            }
        }

        isInState(state) {
            return this.currentState === state;
        }

        isInAnyState(states) {
            return states.includes(this.currentState);
        }
    }

    // Create singleton instance
    const stateMachine = new NavigationStateMachine();
    
    window.MetadataRemote.Navigation.StateMachine = {
        // Export constants
        States: NavigationStates,
        
        // Export methods
        transition: (state, context) => stateMachine.transition(state, context),
        getState: () => stateMachine.getState(),
        getPreviousState: () => stateMachine.getPreviousState(),
        getContext: () => stateMachine.getContext(),
        updateContext: (updates) => stateMachine.updateContext(updates),
        reset: () => stateMachine.reset(),
        on: (event, callback) => stateMachine.on(event, callback),
        off: (event, callback) => stateMachine.off(event, callback),
        isInState: (state) => stateMachine.isInState(state),
        isInAnyState: (states) => stateMachine.isInAnyState(states),
        
        /**
         * Initialize the module
         */
        init() {
            // Module initialized
        }
    };

    // Also export globally for easier access
    window.NavigationStates = NavigationStates;
    window.StateMachine = window.MetadataRemote.Navigation.StateMachine;
})();