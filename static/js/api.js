/**
 * API Communication Layer for Metadata Remote
 * Handles all HTTP requests to the backend
 */

// Create namespace if it doesn't exist
window.MetadataRemote = window.MetadataRemote || {};

// API module
window.MetadataRemote.API = {
    /**
     * Make an API call with centralized error handling
     * @param {string} url - The API endpoint
     * @param {Object} options - Fetch options
     * @returns {Promise} Response data
     */
    async call(url, options = {}) {
        try {
            const response = await fetch(url, options);
            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || 'Request failed');
            }
            return await response.json();
        } catch (error) {
            console.error(`API error for ${url}:`, error);
            throw error;
        }
    },
    
    // Tree and folder operations
    async loadTree() {
        return this.call('/tree/');
    },
    
    async loadTreeChildren(path) {
        return this.call(`/tree/${encodeURIComponent(path)}`);
    },
    
    async loadFiles(folderPath) {
        return this.call(`/files/${encodeURIComponent(folderPath)}`);
    },
    
    // File operations
    async renameFile(oldPath, newName) {
        return this.call('/rename', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                oldPath: oldPath,
                newName: newName
            })
        });
    },
    
    async renameFolder(oldPath, newName) {
        return this.call('/rename-folder', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                oldPath: oldPath,
                newName: newName
            })
        });
    },
    
    // Metadata operations
    async getMetadata(filepath) {
        return this.call(`/metadata/${encodeURIComponent(filepath)}`);
    },
    
    async setMetadata(filepath, data) {
        return this.call(`/metadata/${encodeURIComponent(filepath)}`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(data)
        });
    },
    
    // Batch operations
    async applyArtToFolder(folderPath, art) {
        return this.call('/apply-art-to-folder', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                folderPath: folderPath,
                art: art
            })
        });
    },
    
    async applyFieldToFolder(folderPath, field, value) {
        return this.call('/apply-field-to-folder', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                folderPath: folderPath,
                field: field,
                value: value
            })
        });
    },
    
    // Inference operations
    async inferField(filepath, field) {
        return this.call(`/infer/${encodeURIComponent(filepath)}/${field}`);
    },
    
    // History operations
    async loadHistory() {
        return this.call('/history');
    },
    
    async getHistoryAction(actionId) {
        return this.call(`/history/${actionId}`);
    },
    
    async undoAction(actionId) {
        return this.call(`/history/${actionId}/undo`, {
            method: 'POST'
        });
    },
    
    async redoAction(actionId) {
        return this.call(`/history/${actionId}/redo`, {
            method: 'POST'
        });
    },
    
    async clearHistory() {
        return this.call('/history/clear', {
            method: 'POST'
        });
    },
    
    // Delete metadata field
    async deleteMetadataField(filepath, fieldId) {
        const url = `/metadata/${encodeURIComponent(filepath)}/${fieldId.replace(/\//g, '__')}`;
        return this.call(url, {
            method: 'DELETE'
        });
    },
    
    // Create new metadata field
    async createField(filepath, fieldName, fieldValue) {
        return this.call('/metadata/create-field', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                filepath: filepath,
                field_name: fieldName,
                field_value: fieldValue
            })
        });
    }
};
