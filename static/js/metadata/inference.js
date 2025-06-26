/**
 * Metadata Inference UI Module for Metadata Remote
 * Handles inference suggestions UI and interactions
 */

(function() {
    // Create namespace if it doesn't exist
    window.MetadataRemote = window.MetadataRemote || {};
    window.MetadataRemote.Metadata = window.MetadataRemote.Metadata || {};
    
    // Create shortcuts
    const State = window.MetadataRemote.State;
    const API = window.MetadataRemote.API;
    
    window.MetadataRemote.Metadata.Inference = {
        /**
         * Setup inference handlers for all metadata fields
         * @param {Object} callbacks - Object containing callback functions
         */
        setupInferenceHandlers(callbacks) {
            const fields = ['title', 'artist', 'album', 'albumartist', 'date', 'genre', 'composer', 'track', 'disc'];
            
            fields.forEach(field => {
                const input = document.getElementById(field);
                const suggestions = document.getElementById(`${field}-suggestions`);
                
                // Click handler for empty fields
                input.addEventListener('click', (e) => {
                    if (input.value.trim() === '' && !input.disabled && State.currentFile) {
                        this.showInferenceSuggestions(field);
                    }
                });
                
                // Input handler to hide suggestions when typing
                input.addEventListener('input', (e) => {
                    this.hideInferenceSuggestions(field);
                });
                
                // Click outside to hide suggestions
                document.addEventListener('click', (e) => {
                    if (!e.target.closest(`#${field}`) && !e.target.closest(`#${field}-suggestions`)) {
                        this.hideInferenceSuggestions(field);
                    }
                });
            });
        },
        
        /**
         * Show inference suggestions for a field
         * @param {string} field - Field name to show suggestions for
         */
        async showInferenceSuggestions(field) {
            if (State.inferenceActive[field]) return;
            
            const loading = document.getElementById(`${field}-loading`);
            const suggestions = document.getElementById(`${field}-suggestions`);
            
            // Cancel any existing request
            if (State.inferenceAbortControllers[field]) {
                State.inferenceAbortControllers[field].abort();
            }
            
            // Create new abort controller
            const abortController = new AbortController();
            State.inferenceAbortControllers[field] = abortController;
            
            // Show loading
            loading.classList.add('active');
            State.inferenceActive[field] = true;
            
            try {
                const response = await fetch(`/infer/${encodeURIComponent(State.currentFile)}/${field}`, {
                    signal: abortController.signal
                });
                
                if (!response.ok) {
                    throw new Error('Failed to get suggestions');
                }
                
                const data = await response.json();
                
                // Hide loading
                loading.classList.remove('active');
                
                // Display suggestions if still active
                if (State.inferenceActive[field]) {
                    this.displaySuggestions(field, data.suggestions);
                }
            } catch (error) {
                if (error.name !== 'AbortError') {
                    console.error(`Error getting suggestions for ${field}:`, error);
                    loading.classList.remove('active');
                    
                    // Show error state
                    suggestions.innerHTML = '<div class="no-suggestions">Error loading suggestions</div>';
                    suggestions.classList.add('active');
                    
                    setTimeout(() => {
                        this.hideInferenceSuggestions(field);
                    }, 2000);
                }
            }
            
            State.inferenceActive[field] = false;
        },
        
        /**
         * Display suggestions dropdown
         * @param {string} field - Field name
         * @param {Array} suggestions - Array of suggestion objects
         */
        displaySuggestions(field, suggestions) {
            const container = document.getElementById(`${field}-suggestions`);
            container.innerHTML = '';
            
            if (!suggestions || suggestions.length === 0) {
                container.innerHTML = '<div class="no-suggestions">No suggestions available</div>';
            } else {
                suggestions.forEach(suggestion => {
                    const item = document.createElement('div');
                    item.className = 'suggestion-item';
                    
                    const value = document.createElement('div');
                    value.className = 'suggestion-value';
                    value.textContent = suggestion.value;
                    
                    const confidence = document.createElement('div');
                    confidence.className = 'suggestion-confidence';
                    
                    const bar = document.createElement('div');
                    bar.className = 'confidence-bar';
                    
                    const fill = document.createElement('div');
                    fill.className = 'confidence-fill';
                    fill.style.width = `${suggestion.confidence}%`;
                    
                    bar.appendChild(fill);
                    
                    const text = document.createElement('div');
                    text.className = 'confidence-text';
                    text.textContent = `${suggestion.confidence}%`;
                    
                    confidence.appendChild(bar);
                    confidence.appendChild(text);
                    
                    item.appendChild(value);
                    item.appendChild(confidence);
                    
                    // Click handler
                    item.addEventListener('click', () => {
                        document.getElementById(field).value = suggestion.value;
                        this.hideInferenceSuggestions(field);
                        
                        // Trigger input event to update apply controls
                        const event = new Event('input', { bubbles: true });
                        document.getElementById(field).dispatchEvent(event);
                    });
                    
                    container.appendChild(item);
                });
            }
            
            container.classList.add('active');
        },
        
        /**
         * Hide inference suggestions for a field
         * @param {string} field - Field name
         */
        hideInferenceSuggestions(field) {
            const loading = document.getElementById(`${field}-loading`);
            const suggestions = document.getElementById(`${field}-suggestions`);
            
            // Cancel any ongoing request
            if (State.inferenceAbortControllers[field]) {
                State.inferenceAbortControllers[field].abort();
                delete State.inferenceAbortControllers[field];
            }
            
            loading.classList.remove('active');
            suggestions.classList.remove('active');
            State.inferenceActive[field] = false;
        }
    };
})();
