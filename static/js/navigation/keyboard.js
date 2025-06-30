/**
 * Keyboard Navigation Management for Metadata Remote
 * Handles all keyboard interactions and navigation
 */

(function() {
    // Create namespace if it doesn't exist
    window.MetadataRemote = window.MetadataRemote || {};
    window.MetadataRemote.Navigation = window.MetadataRemote.Navigation || {};
    
    // Create shortcuts
    const State = window.MetadataRemote.State;
    const TreeNav = window.MetadataRemote.Navigation.Tree;
    const KeyRepeatHandler = window.MetadataRemote.Navigation.KeyRepeatHandler;
    const ScrollManager = window.MetadataRemote.Navigation.ScrollManager;
    const FocusManager = window.MetadataRemote.Navigation.FocusManager;
    const EventUtils = window.MetadataRemote.Navigation.EventUtils;
    const StateMachine = window.MetadataRemote.Navigation.StateMachine;
    const Router = window.KeyboardRouter;
    
    // Create a global key repeat handler instance
    let keyRepeatHandler = null;
    
    // Store callbacks that will be set during initialization
    let selectTreeItemCallback = null;
    let selectFileItemCallback = null;
    let loadFileCallback = null;
    let loadFilesCallback = null;
    
    window.MetadataRemote.Navigation.Keyboard = {
        /**
         * Initialize keyboard navigation with required callbacks
         * @param {Object} callbacks - Object containing callback functions
         * @param {Function} callbacks.selectTreeItem - Callback for selecting tree items
         * @param {Function} callbacks.selectFileItem - Callback for selecting file items
         * @param {Function} callbacks.loadFile - Callback for loading a file
         * @param {Function} callbacks.loadFiles - Callback for loading files in a folder
         */
        init(callbacks) {
            selectTreeItemCallback = callbacks.selectTreeItem;
            selectFileItemCallback = callbacks.selectFileItem;
            loadFileCallback = callbacks.loadFile;
            loadFilesCallback = callbacks.loadFiles;
            
            // Initialize the key repeat handler
            keyRepeatHandler = new KeyRepeatHandler();
            
            // Make keyRepeatHandler globally available for utilities
            window.MetadataRemote.Navigation.keyRepeatHandler = keyRepeatHandler;
            
            // Initialize state machine
            StateMachine.init();
            
            // Initialize PaneNavigation
            window.MetadataRemote.Navigation.PaneNavigation.init({
                selectTreeItem: selectTreeItemCallback,
                selectFileItem: selectFileItemCallback,
                loadFile: loadFileCallback
            });
            window.MetadataRemote.Navigation.PaneNavigation.registerRoutes();
            
            // Initialize ListNavigation
            if (window.MetadataRemote.Navigation.ListNavigation) {
                window.MetadataRemote.Navigation.ListNavigation.init({
                    selectTreeItem: selectTreeItemCallback,
                    selectFileItem: selectFileItemCallback,
                    loadFile: loadFileCallback,
                    loadFiles: loadFilesCallback
                });
            } else {
                console.error('[Keyboard] ListNavigation module not found');
            }
            
            
            this.setupKeyboardNavigation();
        },
        
        /**
         * Set up all keyboard event handlers
         */
        setupKeyboardNavigation() {
            
            // Register keyboard routes
            this.registerKeyboardRoutes();
            
            // Handle blur events for filename editing
            document.addEventListener('blur', (e) => {
                if (e.target.id === 'current-filename' && e.target.contentEditable === 'true') {
                    // Save filename when losing focus
                    this.saveFilenameInPlace(e.target);
                }
            }, true);
            
            // Handle click events on metadata input fields to immediately activate editing
            document.addEventListener('click', (e) => {
                if (e.target.tagName === 'INPUT' && e.target.type === 'text' && 
                    e.target.closest('.metadata') && e.target.dataset.editing === 'false') {
                    
                    // Clear focus from any other metadata input fields first
                    document.querySelectorAll('.metadata input[type="text"]').forEach(input => {
                        if (input !== e.target) {
                            input.blur();
                            input.dataset.editing = 'false';
                            input.readOnly = true;
                        }
                    });
                    
                    // Transition to form edit state
                    StateMachine.transition(StateMachine.States.FORM_EDIT, {
                        fieldId: e.target.id,
                        fieldType: 'metadata'
                    });
                    
                    // Set focusedPane to metadata when clicking metadata fields
                    State.focusedPane = 'metadata';
                    
                    // Immediately activate editing mode on click
                    e.target.dataset.editing = 'true';
                    e.target.readOnly = false;
                    
                    // Position cursor at the click location (default behavior)
                    // Show inference suggestions if field is empty and we have a current file
                    if (e.target.value.trim() === '' && State.currentFile && 
                        window.MetadataRemote.Metadata.Inference) {
                        setTimeout(() => {
                            window.MetadataRemote.Metadata.Inference.showInferenceSuggestions(e.target.id);
                        }, 0);
                    }
                }
            });
            
            // Global keyboard handler with custom repeat
            document.addEventListener('keydown', (e) => {
                // Check for active sort dropdown
                const activeSortDropdown = document.querySelector('.sort-dropdown.active');

                
                // Try routing first
                if (Router && Router.route(e)) {
                    return; // Route handled the event
                }
                
                
                // Check if sort dropdown is active and handle its navigation first
                if (activeSortDropdown && State.sortDropdownActive) {
                    if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'Tab' || e.key === 'Enter' || e.key === 'Escape') {
                        e.preventDefault();
                        this.handleSortDropdownNavigation(e.key, activeSortDropdown);
                        return;
                    }
                }
                
                // Handle header icon navigation
                if (this.isHeaderIconFocused()) {
                    if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'Enter') {
                        e.preventDefault();
                        this.handleHeaderNavigation(e.key);
                        return;
                    }
                }
                
                // Handle metadata pane navigation
                if (State.focusedPane === 'metadata') {
                    // Tab key now handled by Router (removed from here)
                    
                    // Handle Enter key on filename - MUST come before arrow key navigation
                    if (e.key === 'Enter' && e.target.id === 'current-filename') {
                        e.preventDefault();
                        if (window.AudioMetadataEditor && window.AudioMetadataEditor.handleFilenameEditClick) {
                            window.AudioMetadataEditor.handleFilenameEditClick();
                        }
                        return;
                    }
                    
                    // Handle Enter key on buttons
                    if (e.key === 'Enter' && e.target.tagName === 'BUTTON') {
                        e.preventDefault();
                        e.target.click();
                        return;
                    }
                    
                    // Handle navigation on buttons and non-editable elements
                    if ((e.target.tagName === 'BUTTON' || e.target.id === 'current-filename') &&
                        (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
                        e.preventDefault();
                        this.navigateMetadata(e.key);
                        return;
                    }
                    
                    // Handle input fields
                    if (e.target.tagName === 'INPUT' && e.target.type === 'text') {
                        // Check if field is in edit mode
                        const isEditing = e.target.dataset.editing === 'true';
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            if (isEditing) {
                                // Transition back to normal state
                                StateMachine.transition(StateMachine.States.NORMAL);
                                
                                // Exit edit mode - keep focus without blur/refocus cycle
                                e.target.dataset.editing = 'false';
                                e.target.readOnly = true;
                                // Keep the element focused for navigation without creating a focus cycle
                            } else {
                                // Transition to form edit state
                                StateMachine.transition(StateMachine.States.FORM_EDIT, {
                                    fieldId: e.target.id,
                                    fieldType: 'metadata'
                                });
                                
                                // Enter edit mode
                                e.target.dataset.editing = 'true';
                                e.target.readOnly = false;
                                // Position cursor at end of text instead of selecting all
                                setTimeout(() => {
                                    e.target.setSelectionRange(e.target.value.length, e.target.value.length);
                                }, 0);
                                
                                // Show inference suggestions if field is empty and we have a current file
                                if (e.target.value.trim() === '' && State.currentFile && 
                                    window.MetadataRemote.Metadata.Inference) {
                                    window.MetadataRemote.Metadata.Inference.showInferenceSuggestions(e.target.id);
                                }
                            }
                            return;
                        } else if (e.key === 'Escape' && isEditing) {
                            e.preventDefault();
                            // Transition back to normal state
                            StateMachine.transition(StateMachine.States.NORMAL);
                            
                            // Exit edit mode - keep focus without blur/refocus cycle
                            e.target.dataset.editing = 'false';
                            e.target.readOnly = true;
                            // Keep the element focused for navigation without creating a focus cycle
                            return;
                        } else if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && isEditing) {
                            e.preventDefault();
                            // Transition back to normal state
                            StateMachine.transition(StateMachine.States.NORMAL);
                            
                            // Exit edit mode and navigate
                            e.target.dataset.editing = 'false';
                            e.target.readOnly = true;
                            // Navigate in the specified direction
                            this.navigateMetadata(e.key);
                            return;
                        } else if ((e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !isEditing) {
                            // Navigate only when not in edit mode
                            e.preventDefault();
                            this.navigateMetadata(e.key);
                            return;
                        } else if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && isEditing) {
                            return;
                        }
                        // When in edit mode, allow normal arrow key behavior for cursor movement
                    }
                    
                    // Handle special case for current filename (contentEditable span)
                    if (e.target.id === 'current-filename') {
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            if (e.target.contentEditable === 'true') {
                                // Exit edit mode and save
                                this.saveFilenameInPlace(e.target);
                            } else {
                                // Enter edit mode
                                this.navigateMetadata('Enter');
                            }
                            return;
                        } else if (e.key === 'Escape' && e.target.contentEditable === 'true') {
                            e.preventDefault();
                            // Transition back to normal state
                            StateMachine.transition(StateMachine.States.NORMAL);
                            
                            // Exit edit mode without saving
                            e.target.textContent = State.originalFilename;
                            e.target.contentEditable = false;
                            e.target.dataset.editing = 'false';
                            e.target.focus();
                            return;
                        } else if (e.target.contentEditable === 'true' && 
                                   (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
                            // Allow normal text editing in contentEditable mode
                            return;
                        }
                    }
                }
                
                // Handle filter input arrow key behavior
                if (State.filterInputActive && e.target.classList.contains('filter-input')) {
                    if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                        e.preventDefault();
                        // Store the pane before clearing state
                        const currentPane = State.filterInputActive;
                        // Transition back to normal state
                        StateMachine.transition(StateMachine.States.NORMAL);
                        
                        // Close the filter
                        const filterBtn = document.getElementById(`${currentPane}-filter-btn`);
                        if (filterBtn) {
                            filterBtn.click(); // Close filter
                        }
                        State.filterInputActive = null;
                        
                        // Navigate based on the arrow key
                        if (e.key === 'ArrowDown') {
                            // Go to topmost item in the pane
                            this.returnToPaneFromHeader(currentPane);
                        } else if (e.key === 'ArrowUp') {
                            // Go to help icon
                            this.navigateToHeaderIcon('metadata', 'help');
                        } else if (e.key === 'ArrowLeft') {
                            // Go to filter icon (stay where we are conceptually)
                            this.navigateToHeaderIcon(currentPane, 'filter');
                        } else if (e.key === 'ArrowRight') {
                            // Go to sort icon
                            this.navigateToHeaderIcon(currentPane, 'sort');
                        }
                        return;
                    } else if (e.key === 'Escape' || e.key === 'Enter') {
                        e.preventDefault();
                        // Store the pane before clearing state
                        const currentPane = State.filterInputActive;
                        // Transition back to normal state
                        StateMachine.transition(StateMachine.States.NORMAL);
                        
                        // Close the filter
                        const filterBtn = document.getElementById(`${currentPane}-filter-btn`);
                        if (filterBtn) {
                            filterBtn.click(); // Close filter
                        }
                        State.filterInputActive = null;
                        
                        // Move focus to the topmost item in the pane
                        this.returnToPaneFromHeader(currentPane);
                        return;
                    }
                }

                // Normal input field behavior - skip keyboard navigation
                if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
                    return;
                }

                // Filter shortcuts now handled by Router
                // Removed: / and Ctrl+F shortcuts (see registerKeyboardRoutes)
                
                // Sort reverse: Ctrl+Shift+S
                if (e.ctrlKey && e.shiftKey && e.key === 'S') {
                    e.preventDefault();
                    const dirBtn = document.getElementById(`${State.focusedPane}-sort-direction`);
                    if (dirBtn) dirBtn.click();
                }
                
                // Arrow keys, PageUp/PageDown, and Enter are now handled by ListNavigation module via Router
                // No direct handling needed here - ListNavigation routes will take precedence
                // Tab key now handled by Router (see registerKeyboardRoutes)
                
            });
            
            // Keyup handler to stop custom repeat
            document.addEventListener('keyup', (e) => {
                if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
                    return;
                }
                
                // If this key was being held down, stop the repeat
                if (State.keyHeldDown === e.key) {
                    keyRepeatHandler.stop();
                    State.keyHeldDown = null;
                    State.isKeyRepeating = false;
                    
                    // Remove keyboard navigating class
                    document.querySelector('.folders').classList.remove('keyboard-navigating');
                    document.querySelector('.files').classList.remove('keyboard-navigating');
                }
                // Handle PageUp/PageDown keyup to ensure clean state
                if (e.key === 'PageUp' || e.key === 'PageDown') {
                    // Remove keyboard navigating class if it's still there
                    document.querySelector('.folders').classList.remove('keyboard-navigating');
                    document.querySelector('.files').classList.remove('keyboard-navigating');
                }
            });
                            
            // Clear key state on window blur to prevent stuck keys
            window.addEventListener('blur', () => {
                keyRepeatHandler.stop();
                State.keyHeldDown = null;
                State.isKeyRepeating = false;
            });
            
            // Set filename-input to editing mode when focused
            document.addEventListener('focus', (e) => {
                if (e.target.id === 'filename-input') {
                    e.target.dataset.editing = 'true';
                    e.target.readOnly = false;
                }
                
                // Ensure focusedPane is set correctly when focusing on metadata fields
                if (e.target.tagName === 'INPUT' && e.target.type === 'text' && 
                    e.target.closest('.metadata')) {
                    // Set focusedPane to metadata if it's not already
                    if (State.focusedPane !== 'metadata') {
                        State.focusedPane = 'metadata';
                    }
                }
            }, true);
        },

        
        /**
         * Register keyboard routes with the router
         */
        registerKeyboardRoutes() {
            // Help shortcut - ? key (handled in app.js, so we skip it here)
            // The ? key is already handled by app.js showHelp function
            
            // Filter shortcuts - / and Ctrl+F
            Router.register(
                { key: '/', state: '*' },
                (event, context) => {
                    // Don't activate if in input/textarea
                    if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') {
                        return;
                    }
                    const filterBtn = document.getElementById(`${State.focusedPane}-filter-btn`);
                    if (filterBtn) filterBtn.click();
                }
            );
            
            Router.register(
                { key: 'f', state: '*', modifiers: { ctrl: true } },
                (event, context) => {
                    const filterBtn = document.getElementById(`${State.focusedPane}-filter-btn`);
                    if (filterBtn) filterBtn.click();
                }
            );
            
            // Tab key routing
            const tabState = window.NavigationStates?.NORMAL || 'normal';
            // Tab routing now handled by PaneNavigation module
        },
        
        
        

        
        /**
         * Navigate within the metadata pane using arrow keys
         * @param {string} key - The arrow key pressed
         */
        navigateMetadata(key) {
            const activeElement = document.activeElement;
            const metadataSection = document.getElementById('metadata-section');
            if (!metadataSection) return;
            
            
            // Define the navigation order
            const navigableElements = [
                'current-filename',
                'filename-input',
                'filename-save',
                'filename-reset',
                'filename-cancel',
                '.upload-btn',
                '.save-image-btn',
                '.apply-folder-btn',
                '.delete-art-btn',
                'title',
                'artist', 
                'album',
                'albumartist',
                'composer',
                'genre',
                'track',
                'disc',
                'date',
                '.save-btn',
                '.clear-btn'
            ];
            
            // Build list of visible focusable elements
            const focusableElements = [];
            
            navigableElements.forEach(selector => {
                let elements;
                if (selector.startsWith('.')) {
                    elements = metadataSection.querySelectorAll(selector);
                } else if (selector.startsWith('#')) {
                    const el = metadataSection.querySelector(selector);
                    elements = el ? [el] : [];
                } else {
                    const el = document.getElementById(selector);
                    elements = el ? [el] : [];
                }
                
                elements.forEach(el => {
                    if (el && el.offsetParent !== null && !el.disabled) {
                        focusableElements.push(el);
                    }
                });
            });
            
            
            // Add dynamically visible File/Folder buttons for Track #, Disc #, and Year fields
            // These buttons appear when the user modifies these fields, allowing them to apply
            // changes to either the current file or all files in the folder
            const groupedApplyItems = metadataSection.querySelectorAll('.grouped-apply-item');
            
            const visibleGroupedItems = Array.from(groupedApplyItems).filter(item => {
                return item.style.display !== 'none';
            });
            
            // Build a map of field -> buttons for proper insertion order
            const fieldButtonMap = new Map();
            
            visibleGroupedItems.forEach(item => {
                const fieldName = item.dataset.field;
                const applyControls = item.querySelector('.apply-field-controls');
                if (applyControls) {
                    const fileBtn = applyControls.querySelector('.apply-file-btn');
                    const folderBtn = applyControls.querySelector('.apply-folder-btn-new');
                    
                    if (fileBtn || folderBtn) {
                        fieldButtonMap.set(fieldName, { fileBtn, folderBtn });
                    }
                    
                }
            });
            
            // Insert buttons in the correct positions after Track, Disc, and Date fields
            // This ensures proper keyboard navigation order
            const groupedFields = ['track', 'disc', 'date'];
            
            // Process in reverse order to maintain correct indices when inserting
            for (let i = groupedFields.length - 1; i >= 0; i--) {
                const fieldId = groupedFields[i];
                const fieldIndex = focusableElements.findIndex(el => el.id === fieldId);
                
                if (fieldIndex !== -1 && fieldButtonMap.has(fieldId)) {
                    const { fileBtn, folderBtn } = fieldButtonMap.get(fieldId);
                    const buttonsToInsert = [];
                    
                    if (fileBtn && !fileBtn.disabled) {
                        buttonsToInsert.push(fileBtn);
                    }
                    if (folderBtn && !folderBtn.disabled) {
                        buttonsToInsert.push(folderBtn);
                    }
                    
                    
                    // Insert buttons after the field
                    buttonsToInsert.forEach((btn, idx) => {
                        focusableElements.splice(fieldIndex + 1 + idx, 0, btn);
                    });
                }
            }
            
            // Final check of what buttons were added
            const finalButtonCount = focusableElements.filter(el => 
                el.classList?.contains('apply-file-btn') || 
                el.classList?.contains('apply-folder-btn-new')
            ).length;
            
            const currentIndex = focusableElements.indexOf(activeElement);
            let nextIndex = -1;
            
            
            if (key === 'ArrowUp') {
                // Check if we're on the filename (topmost element) and go to help icon
                if (activeElement.id === 'current-filename') {
                    this.navigateToHeaderIcon('metadata', 'help');
                    return;
                }
                
                // Check if we're on a grouped apply button (Track/Disc/Year)
                // These buttons require special handling for vertical navigation to maintain
                // File->File and Folder->Folder alignment when moving up/down
                if (activeElement.closest('.grouped-apply-item')) {
                    
                    // Find all visible grouped buttons
                    const allGroupedButtons = focusableElements.filter(el => 
                        el.closest('.grouped-apply-item') && 
                        (el.classList?.contains('apply-file-btn') || el.classList?.contains('apply-folder-btn-new'))
                    );
                    
                    const currentButtonIndex = allGroupedButtons.indexOf(activeElement);
                    
                    if (currentButtonIndex === 0 || currentButtonIndex === 1) {
                        // We're on one of the topmost buttons (File or Folder), go to Track #
                        const trackField = document.getElementById('track');
                        if (trackField) {
                            trackField.focus();
                            trackField.dataset.editing = 'false';
                            trackField.readOnly = true;
                            FocusManager.ensureElementVisible(trackField);
                            return;
                        }
                    } else if (currentButtonIndex > 1) {
                        // Move to the button directly above (maintaining File->File, Folder->Folder alignment)
                        const isFileButton = activeElement.classList.contains('apply-file-btn');
                        // Look for button above with same type
                        for (let i = currentButtonIndex - 1; i >= 0; i--) {
                            const targetButton = allGroupedButtons[i];
                            const targetIsFile = targetButton.classList.contains('apply-file-btn');
                            if (isFileButton === targetIsFile) {
                                nextIndex = focusableElements.indexOf(targetButton);
                                break;
                            }
                        }
                    }
                }
                // Check if we're on other text field's apply button - treat as same unit
                else if (activeElement.closest('.apply-field-controls')) {
                    const field = activeElement.closest('.form-group-with-button')?.querySelector('input');
                    if (field) {
                        const fieldIndex = focusableElements.indexOf(field);
                        if (fieldIndex > 0) {
                            nextIndex = fieldIndex - 1;
                        } else {
                            nextIndex = focusableElements.length - 1;
                        }
                    }
                } else if (activeElement.classList.contains('save-btn')) {
                    // Special handling for Save button - UP navigates to bottommost File button if any exist,
                    // otherwise goes to Track # field
                    // Find all File/Folder buttons that come before the Save button
                    const buttonsBeforeSave = focusableElements.filter((el, idx) => {
                        return idx < currentIndex && 
                               (el.classList?.contains('apply-file-btn') || 
                                el.classList?.contains('apply-folder-btn-new'));
                    });
                    
                    if (buttonsBeforeSave.length > 0) {
                        // Find the last File button (bottommost)
                        const lastFileButton = buttonsBeforeSave.reverse().find(btn => btn.classList.contains('apply-file-btn')) || buttonsBeforeSave[0];
                        const buttonIndex = focusableElements.indexOf(lastFileButton);
                        nextIndex = buttonIndex;
                    } else {
                        // No buttons visible, go to Track # field
                        const trackField = document.getElementById('track');
                        if (trackField) {
                            trackField.focus();
                            trackField.dataset.editing = 'false';
                            trackField.readOnly = true;
                            FocusManager.ensureElementVisible(trackField);
                            return;
                        }
                    }
                } else if (activeElement.id === 'track' || activeElement.id === 'disc' || activeElement.id === 'date') {
                    // Special handling for Track #, Disc #, and Year fields - UP goes to GENRE
                    const genreField = document.getElementById('genre');
                    if (genreField) {
                        genreField.focus();
                        genreField.dataset.editing = 'false';
                        genreField.readOnly = true;
                        FocusManager.ensureElementVisible(genreField);
                        return;
                    }
                } else if (activeElement.classList.contains('clear-btn')) {
                    // Special handling for Reset button - UP navigates to bottommost File button if any exist,
                    // otherwise uses default behavior (goes to Save button)
                    // Find all File/Folder buttons that come before the Reset button
                    const buttonsBeforeReset = focusableElements.filter((el, idx) => {
                        return idx < currentIndex && 
                               el.closest('.grouped-apply-item') &&
                               (el.classList?.contains('apply-file-btn') || 
                                el.classList?.contains('apply-folder-btn-new'));
                    });
                    
                    if (buttonsBeforeReset.length > 0) {
                        // Find the last File button (bottommost)
                        const lastFileButton = buttonsBeforeReset.reverse().find(btn => btn.classList.contains('apply-file-btn'));
                        if (lastFileButton) {
                            const buttonIndex = focusableElements.indexOf(lastFileButton);
                            nextIndex = buttonIndex;
                        } else {
                            // No File buttons, just use default behavior
                            nextIndex = currentIndex > 0 ? currentIndex - 1 : focusableElements.length - 1;
                        }
                    } else {
                        // No buttons visible, use default behavior (go to Save button)
                        nextIndex = currentIndex > 0 ? currentIndex - 1 : focusableElements.length - 1;
                    }
                } else {
                    // Default behavior only if no special handling was applied
                    nextIndex = currentIndex > 0 ? currentIndex - 1 : focusableElements.length - 1;
                }
            } else if (key === 'ArrowDown') {
                // Check if we're on a text field that has visible apply buttons - skip over them
                if (activeElement.tagName === 'INPUT' && activeElement.type === 'text') {
                    const formGroup = activeElement.closest('.form-group-with-button');
                    if (formGroup) {
                        const applyControls = formGroup.querySelector('.apply-field-controls.visible');
                        if (applyControls) {
                            // Count how many buttons follow this field
                            let buttonsAfterField = 0;
                            for (let i = currentIndex + 1; i < focusableElements.length; i++) {
                                if (focusableElements[i].closest('.apply-field-controls') && 
                                    focusableElements[i].closest('.form-group-with-button')?.querySelector('input') === activeElement) {
                                    buttonsAfterField++;
                                } else {
                                    break;
                                }
                            }
                            if (buttonsAfterField > 0) {
                                nextIndex = currentIndex + buttonsAfterField + 1;
                                if (nextIndex >= focusableElements.length) {
                                    nextIndex = 0;
                                }
                            }
                        }
                    }
                }
                
                // Check if we're on a grouped apply button (Track/Disc/Year)
                // DOWN navigation maintains vertical alignment (File->File, Folder->Folder)
                // From bottommost button, goes directly to Save button
                if (!nextIndex || nextIndex === -1) {
                    if (activeElement.closest('.grouped-apply-item')) {
                        
                        // Find all visible grouped buttons
                        const allGroupedButtons = focusableElements.filter(el => 
                            el.closest('.grouped-apply-item') && 
                            (el.classList?.contains('apply-file-btn') || el.classList?.contains('apply-folder-btn-new'))
                        );
                        
                        const currentButtonIndex = allGroupedButtons.indexOf(activeElement);
                        const isLastButton = currentButtonIndex === allGroupedButtons.length - 1;
                        
                        if (isLastButton) {
                            // We're on the bottommost button, go to Save button
                            const saveButton = document.querySelector('.save-btn');
                            if (saveButton) {
                                saveButton.focus();
                                FocusManager.ensureElementVisible(saveButton);
                                return;
                            }
                        } else {
                            // Move to the button directly below (maintaining File->File, Folder->Folder alignment)
                            const isFileButton = activeElement.classList.contains('apply-file-btn');
                            
                            // Look for button below with same type
                            let foundAlignedButton = false;
                            for (let i = currentButtonIndex + 1; i < allGroupedButtons.length; i++) {
                                const targetButton = allGroupedButtons[i];
                                const targetIsFile = targetButton.classList.contains('apply-file-btn');
                                if (isFileButton === targetIsFile) {
                                    nextIndex = focusableElements.indexOf(targetButton);
                                    foundAlignedButton = true;
                                    break;
                                }
                            }
                            
                            if (!foundAlignedButton && isFileButton) {
                                // We're on a File button with no File button below - go to Save
                                const saveButton = document.querySelector('.save-btn');
                                if (saveButton) {
                                    saveButton.focus();
                                    FocusManager.ensureElementVisible(saveButton);
                                    return;
                                }
                            }
                        }
                    }
                    // Check if we're on other text field's apply button - treat as same unit
                    else if (activeElement.closest('.apply-field-controls')) {
                        const field = activeElement.closest('.form-group-with-button')?.querySelector('input');
                        if (field) {
                            // Find the field's index and skip to after all its buttons
                            const fieldIndex = focusableElements.indexOf(field);
                            // Count how many buttons follow this field
                            let buttonsAfterField = 0;
                            for (let i = fieldIndex + 1; i < focusableElements.length; i++) {
                                if (focusableElements[i].closest('.apply-field-controls') && 
                                    focusableElements[i].closest('.form-group-with-button')?.querySelector('input') === field) {
                                    buttonsAfterField++;
                                } else {
                                    break;
                                }
                            }
                            nextIndex = fieldIndex + buttonsAfterField + 1;
                            if (nextIndex >= focusableElements.length) {
                                nextIndex = 0;
                            }
                        }
                    }
                }
                
                // Special handling for Track #, Disc #, and Year fields
                // DOWN from these fields always goes to the topmost File button if any exist
                if ((!nextIndex || nextIndex === -1) && (activeElement.id === 'track' || activeElement.id === 'disc' || activeElement.id === 'date')) {
                    // Find ALL grouped File/Folder buttons (not just those after current position)
                    const allGroupedButtons = focusableElements.filter(el => {
                        return el.closest('.grouped-apply-item') && 
                               (el.classList?.contains('apply-file-btn') || 
                                el.classList?.contains('apply-folder-btn-new'));
                    });
                    
                    if (allGroupedButtons.length > 0) {
                        // Navigate to the first (topmost) File button
                        const firstFileButton = allGroupedButtons.find(btn => btn.classList.contains('apply-file-btn'));
                        if (firstFileButton) {
                            const buttonIndex = focusableElements.indexOf(firstFileButton);
                            nextIndex = buttonIndex;
                        } else {
                            // No File buttons, use first button available
                            nextIndex = focusableElements.indexOf(allGroupedButtons[0]);
                        }
                    } else {
                        // No buttons visible, go directly to Save button
                        const saveButton = document.querySelector('.save-btn');
                        if (saveButton) {
                            saveButton.focus();
                            FocusManager.ensureElementVisible(saveButton);
                            return;
                        }
                    }
                }
                
                // Default behavior only if no special handling was applied
                if (!nextIndex || nextIndex === -1) {
                    nextIndex = currentIndex < focusableElements.length - 1 ? currentIndex + 1 : 0;
                }
            } else if (key === 'ArrowLeft' || key === 'ArrowRight') {
                // Check if we're on a grouped apply button (Track/Disc/Year)
                // LEFT/RIGHT navigation between File and Folder buttons in the same row
                if (activeElement.closest('.grouped-apply-item')) {
                    const currentItem = activeElement.closest('.grouped-apply-item');
                    const fileBtn = currentItem.querySelector('.apply-file-btn');
                    const folderBtn = currentItem.querySelector('.apply-folder-btn-new');
                    
                    if (key === 'ArrowLeft' && activeElement === folderBtn && fileBtn) {
                        // From Folder button, go to File button
                        fileBtn.focus();
                        FocusManager.ensureElementVisible(fileBtn);
                        return;
                    } else if (key === 'ArrowRight' && activeElement === fileBtn && folderBtn) {
                        // From File button, go to Folder button
                        folderBtn.focus();
                        FocusManager.ensureElementVisible(folderBtn);
                        return;
                    } else if (key === 'ArrowLeft' && activeElement === fileBtn) {
                        // From File button, do nothing (no element to the left spatially)
                        return;
                    }
                    // If we're on Folder button and Right is pressed, do nothing (no element to the right)
                    return;
                }
                
                // Check if we're on a text field with visible apply buttons (for non-grouped fields)
                if (activeElement.tagName === 'INPUT' && activeElement.type === 'text') {
                    const formGroup = activeElement.closest('.form-group-with-button');
                    if (formGroup) {
                        const applyControls = formGroup.querySelector('.apply-field-controls.visible');
                        if (applyControls && key === 'ArrowRight') {
                            const fileBtn = applyControls.querySelector('.apply-file-btn');
                            if (fileBtn && !fileBtn.disabled) {
                                fileBtn.focus();
                                FocusManager.ensureElementVisible(fileBtn);
                                return;
                            }
                        }
                    }
                }
                
                // Handle horizontal navigation for grouped fields
                const parentGroup = activeElement.closest('.form-group-three-column');
                if (parentGroup) {
                    const inputs = Array.from(parentGroup.querySelectorAll('input'));
                    const inputIndex = inputs.indexOf(activeElement);
                    
                    if (key === 'ArrowLeft' && inputIndex > 0) {
                        inputs[inputIndex - 1].focus();
                        // Position cursor at end instead of selecting all
                        setTimeout(() => {
                            const input = inputs[inputIndex - 1];
                            input.setSelectionRange(input.value.length, input.value.length);
                        }, 0);
                    } else if (key === 'ArrowRight' && inputIndex < inputs.length - 1) {
                        inputs[inputIndex + 1].focus();
                        // Position cursor at end instead of selecting all
                        setTimeout(() => {
                            const input = inputs[inputIndex + 1];
                            input.setSelectionRange(input.value.length, input.value.length);
                        }, 0);
                    }
                    return; // Exit early to prevent other navigation
                }
                
                // Handle horizontal navigation for buttons in same row
                const buttonParent = activeElement.closest('.filename-edit, .album-art-controls, .apply-field-controls, .buttons');
                if (buttonParent) {
                    const buttons = Array.from(buttonParent.querySelectorAll('button:not([disabled])'))
                        .filter(btn => btn.offsetParent !== null);
                    const buttonIndex = buttons.indexOf(activeElement);
                    
                    // Special handling for apply-field-controls buttons
                    if (buttonParent.classList.contains('apply-field-controls')) {
                        // For File button (index 0), Left arrow goes back to text field
                        if (key === 'ArrowLeft' && buttonIndex === 0) {
                            const field = buttonParent.closest('.form-group-with-button')?.querySelector('input');
                            if (field) {
                                field.focus();
                                field.dataset.editing = 'false';
                                field.readOnly = true;
                                FocusManager.ensureElementVisible(field);
                                return;
                            }
                        }
                    }
                    
                    if (key === 'ArrowLeft' && buttonIndex > 0) {
                        buttons[buttonIndex - 1].focus();
                    } else if (key === 'ArrowRight' && buttonIndex < buttons.length - 1) {
                        buttons[buttonIndex + 1].focus();
                    }
                }
                return;
            }
            
            if (nextIndex !== -1 && focusableElements[nextIndex]) {
                focusableElements[nextIndex].focus();
                if (focusableElements[nextIndex].tagName === 'INPUT') {
                    // Set to non-edit mode when navigating to input
                    focusableElements[nextIndex].dataset.editing = 'false';
                    focusableElements[nextIndex].readOnly = true;
                }
                
                // Auto-scroll to ensure the focused element is visible
                FocusManager.ensureElementVisible(focusableElements[nextIndex]);
            } else {
            }
        },
        
        /**
         * Save filename when edited in place
         * @param {HTMLElement} filenameElement - The filename display element
         */
        async saveFilenameInPlace(filenameElement) {
            const newName = filenameElement.textContent.trim();
            const originalName = State.originalFilename;
            
            // Transition back to normal state
            StateMachine.transition(StateMachine.States.NORMAL);
            
            // Exit edit mode
            filenameElement.contentEditable = false;
            filenameElement.dataset.editing = 'false';
            
            // If no change, just return
            if (newName === originalName || !newName) {
                filenameElement.textContent = originalName;
                return;
            }
            
            try {
                const API = window.MetadataRemote.API;
                const result = await API.renameFile(State.currentFile, newName);
                
                if (result.status === 'success') {
                    State.currentFile = result.newPath;
                    State.originalFilename = newName;
                    filenameElement.textContent = newName;
                    
                    // Reload files and history
                    if (window.AudioMetadataEditor && window.AudioMetadataEditor.loadFiles) {
                        window.AudioMetadataEditor.loadFiles(State.currentPath);
                    }
                    if (window.MetadataRemote.History && window.MetadataRemote.History.Manager) {
                        window.MetadataRemote.History.Manager.loadHistory();
                    }
                } else {
                    // Revert on error
                    filenameElement.textContent = originalName;
                    console.error('Error renaming file:', result.error);
                }
            } catch (err) {
                // Revert on error
                filenameElement.textContent = originalName;
                console.error('Error renaming file:', err);
            }
        },

        /**
         * Check if a header icon currently has focus
         * @returns {boolean} True if a header icon is focused
         */
        isHeaderIconFocused() {
            return StateMachine.isInState(StateMachine.States.HEADER_FOCUS);
        },

        /**
         * Navigate to a specific header icon
         * @param {string} pane - 'folders', 'files', or 'metadata'
         * @param {string} iconType - 'filter', 'sort', 'sort-direction', or 'help'
         */
        navigateToHeaderIcon(pane, iconType) {
            // Clear any existing keyboard focus from list items
            FocusManager.clearAllKeyboardFocus();

            let targetElement;
            
            if (iconType === 'help') {
                // Store previous focus state before navigating to help
                if (State.headerFocus) {
                    State.previousFocusBeforeHelp = { ...State.headerFocus };
                }
                targetElement = document.getElementById('help-button');
            } else if (pane === 'folders') {
                if (iconType === 'filter') {
                    targetElement = document.getElementById('folders-filter-btn');
                } else if (iconType === 'sort') {
                    targetElement = document.getElementById('folders-sort-btn');
                } else if (iconType === 'sort-direction') {
                    targetElement = document.getElementById('folders-sort-direction');
                }
            } else if (pane === 'files') {
                if (iconType === 'filter') {
                    targetElement = document.getElementById('files-filter-btn');
                } else if (iconType === 'sort') {
                    targetElement = document.getElementById('files-sort-btn');
                } else if (iconType === 'sort-direction') {
                    targetElement = document.getElementById('files-sort-direction');
                }
            }

            if (targetElement) {
                // Only transition to header focus state if we're not already in it
                if (StateMachine.getState() !== StateMachine.States.HEADER_FOCUS) {
                    StateMachine.transition(StateMachine.States.HEADER_FOCUS, { 
                        pane, 
                        iconType, 
                        element: targetElement.id 
                    });
                } else {
                    // Update context without transitioning
                    StateMachine.updateContext({ 
                        pane, 
                        iconType, 
                        element: targetElement.id 
                    });
                }
                
                // Add keyboard focus indicator
                FocusManager.addKeyboardFocus(targetElement);
                // Focus the element so it can receive keyboard events
                targetElement.focus();
                // Store current header focus state (for backward compatibility)
                State.headerFocus = { pane, iconType };
            }
        },

        /**
         * Handle keyboard navigation within header icons
         * @param {string} key - The key that was pressed
         */
        handleHeaderNavigation(key) {
            // If State.headerFocus is not set, try to determine it from the active element
            if (!State.headerFocus) {
                const activeElement = document.activeElement;
                if (!activeElement) return;
                
                // Check if it's the help button
                if (activeElement.id === 'help-button') {
                    State.headerFocus = { pane: 'metadata', iconType: 'help' };
                } 
                // Check folders pane icons
                else if (activeElement.id === 'folders-filter-btn') {
                    State.headerFocus = { pane: 'folders', iconType: 'filter' };
                } else if (activeElement.id === 'folders-sort-btn') {
                    State.headerFocus = { pane: 'folders', iconType: 'sort' };
                } else if (activeElement.id === 'folders-sort-direction') {
                    State.headerFocus = { pane: 'folders', iconType: 'sort-direction' };
                }
                // Check files pane icons
                else if (activeElement.id === 'files-filter-btn') {
                    State.headerFocus = { pane: 'files', iconType: 'filter' };
                } else if (activeElement.id === 'files-sort-btn') {
                    State.headerFocus = { pane: 'files', iconType: 'sort' };
                } else if (activeElement.id === 'files-sort-direction') {
                    State.headerFocus = { pane: 'files', iconType: 'sort-direction' };
                }
                // If we still don't have a match, return
                else {
                    return;
                }
            }

            const { pane, iconType } = State.headerFocus;

            if (key === 'Enter') {
                if (iconType === 'filter') {
                    // Activate filter and close filter on arrow keys
                    this.activateFilter(pane);
                } else if (iconType === 'help') {
                    // Activate help box directly
                    if (window.MetadataRemote && window.MetadataRemote.showHelp) {
                        window.MetadataRemote.showHelp();
                    } else {
                        // Fallback to button click
                        const helpButton = document.getElementById('help-button');
                        if (helpButton) {
                            // Create and dispatch a click event
                            const clickEvent = new MouseEvent('click', {
                                bubbles: true,
                                cancelable: true,
                                view: window
                            });
                            helpButton.dispatchEvent(clickEvent);
                        }
                    }
                } else if (iconType === 'sort') {
                    // For sort button, handle dropdown navigation
                    const sortBtn = document.getElementById(`${pane}-sort-btn`);
                    const sortDropdown = document.getElementById(`${pane}-sort-dropdown`);
                    if (sortBtn && sortDropdown) {
                        // Click the sort button to toggle dropdown
                        sortBtn.click();
                        
                        // If dropdown is now active, set up keyboard navigation
                        setTimeout(() => {
                            if (sortDropdown.classList.contains('active')) {
                                // Mark dropdown as active for keyboard navigation
                                State.sortDropdownActive = pane;
                                
                                // Focus the first sort option
                                const sortOptions = sortDropdown.querySelectorAll('.sort-option');
                                if (sortOptions.length > 0) {
                                    // Find the currently active option or default to first
                                    let activeOption = sortDropdown.querySelector('.sort-option.active') || sortOptions[0];
                                    
                                    // Add keyboard focus indicator
                                    FocusManager.addKeyboardFocus(activeOption);
                                    activeOption.setAttribute('tabindex', '0');
                                    activeOption.focus();
                                    
                                    // Set tabindex on all options for keyboard navigation
                                    sortOptions.forEach(opt => {
                                        opt.setAttribute('tabindex', '0');
                                    });
                                }
                            }
                        }, 50);
                    }
                } else if (iconType === 'sort-direction') {
                    // For sort-direction button, click and update focus after re-sort
                    document.activeElement.click();
                    
                    // Move focus to the topmost item after sorting completes
                    // Use requestAnimationFrame to wait for DOM updates
                    requestAnimationFrame(() => {
                        requestAnimationFrame(() => {
                            this.returnToPaneFromHeader(pane);
                        });
                    });
                } else {
                    // For other buttons, just click them
                    document.activeElement.click();
                }
                return;
            }


            // Handle directional navigation
            if (key === 'ArrowUp') {
                if (iconType !== 'help') {
                    this.navigateToHeaderIcon('metadata', 'help');
                }
            } else if (key === 'ArrowDown') {
                // If we're on the help icon and have a previous focus state, return to it
                if (iconType === 'help' && State.previousFocusBeforeHelp) {
                    const { pane: prevPane, iconType: prevIconType } = State.previousFocusBeforeHelp;
                    this.navigateToHeaderIcon(prevPane, prevIconType);
                    State.previousFocusBeforeHelp = null; // Clear the stored state
                } else {
                    // Go back to the appropriate pane's top item
                    this.returnToPaneFromHeader(pane);
                }
            } else if (key === 'ArrowLeft') {
                if (pane === 'folders') {
                    if (iconType === 'sort') {
                        this.navigateToHeaderIcon(pane, 'filter');
                    } else if (iconType === 'sort-direction') {
                        this.navigateToHeaderIcon(pane, 'sort');
                    }
                } else if (pane === 'files') {
                    if (iconType === 'sort') {
                        this.navigateToHeaderIcon(pane, 'filter');
                    } else if (iconType === 'sort-direction') {
                        this.navigateToHeaderIcon(pane, 'sort');
                    }
                }
            } else if (key === 'ArrowRight') {
                if (pane === 'folders') {
                    if (iconType === 'filter') {
                        this.navigateToHeaderIcon(pane, 'sort');
                    } else if (iconType === 'sort') {
                        this.navigateToHeaderIcon(pane, 'sort-direction');
                    }
                } else if (pane === 'files') {
                    if (iconType === 'filter') {
                        this.navigateToHeaderIcon(pane, 'sort');
                    } else if (iconType === 'sort') {
                        this.navigateToHeaderIcon(pane, 'sort-direction');
                    }
                }
            }
        },

        /**
         * Activate filter and set up arrow key handling
         * @param {string} pane - 'folders' or 'files'
         */
        activateFilter(pane) {
            const filterBtn = document.getElementById(`${pane}-filter-btn`);
            if (filterBtn) {
                // Transition to filter active state
                StateMachine.transition(StateMachine.States.FILTER_ACTIVE, { 
                    pane,
                    inputId: `${pane}-filter-input`
                });
                
                // Clear header focus
                this.clearHeaderFocus();
                // Set state BEFORE clicking to avoid race condition (for backward compatibility)
                State.filterInputActive = pane;
                // Click the filter button to open it
                filterBtn.click();
                // Set up the filter input focus with delay to ensure DOM is ready
                setTimeout(() => {
                    const filterInput = document.getElementById(`${pane}-filter-input`);
                    if (filterInput) {
                        // Focus the input
                        filterInput.focus();
                    }
                }, 50);
            }
        },

        /**
         * Return focus to the appropriate pane's topmost item
         * @param {string} pane - 'folders', 'files', or 'metadata'
         */
        returnToPaneFromHeader(pane) {
            this.clearHeaderFocus();
            
            if (pane === 'folders') {
                State.focusedPane = 'folders';
                const visibleFolders = document.querySelectorAll('#folder-tree .tree-item');
                if (visibleFolders.length > 0) {
                    const firstFolder = visibleFolders[0];
                    selectTreeItemCallback(firstFolder, true);
                }
            } else if (pane === 'files') {
                State.focusedPane = 'files';
                const fileItems = Array.from(document.querySelectorAll('#file-list li:not([aria-hidden="true"])'))
                    .filter(item => item.dataset.filepath);
                if (fileItems.length > 0) {
                    const firstFile = fileItems[0];
                    selectFileItemCallback(firstFile, true);
                }
            } else if (pane === 'metadata') {
                State.focusedPane = 'metadata';
                const filenameElement = document.getElementById('current-filename');
                if (filenameElement) {
                    filenameElement.focus();
                    // Ensure the filename element is visible
                    FocusManager.ensureElementVisible(filenameElement);
                }
            }
        },

        /**
         * Clear header focus indicators and state
         */
        clearHeaderFocus() {
            // Transition back to normal state if we're in header focus
            if (StateMachine.isInState(StateMachine.States.HEADER_FOCUS)) {
                StateMachine.transition(StateMachine.States.NORMAL);
            }
            
            // Remove keyboard-focus class from all header elements and blur the active one
            document.querySelectorAll('.control-icon, .help-button').forEach(el => {
                FocusManager.removeKeyboardFocus(el);
                // If this element currently has DOM focus, blur it
                if (document.activeElement === el) {
                    el.blur();
                }
            });
            // Clear state
            State.headerFocus = null;
        },
        
        /**
         * Handle keyboard navigation within sort dropdown menu
         * @param {string} key - The key that was pressed
         * @param {HTMLElement} dropdown - The active dropdown element
         */
        handleSortDropdownNavigation(key, dropdown) {
            const sortOptions = Array.from(dropdown.querySelectorAll('.sort-option'));
            const currentFocus = document.activeElement;
            const currentIndex = sortOptions.indexOf(currentFocus);
            const pane = State.sortDropdownActive;
            
            if (key === 'ArrowDown') {
                // Move to next option
                let nextIndex = currentIndex + 1;
                if (nextIndex >= sortOptions.length) {
                    nextIndex = 0; // Wrap to first option
                }
                FocusManager.removeKeyboardFocus(currentFocus);
                FocusManager.addKeyboardFocus(sortOptions[nextIndex]);
                sortOptions[nextIndex].focus();
            } else if (key === 'ArrowUp') {
                if (currentIndex === 0) {
                    // Close dropdown and return focus to sort icon
                    this.closeSortDropdown(dropdown, pane);
                    const sortBtn = document.getElementById(`${pane}-sort-btn`);
                    if (sortBtn) {
                        FocusManager.addKeyboardFocus(sortBtn);
                        sortBtn.focus();
                    }
                } else {
                    // Move to previous option
                    const prevIndex = currentIndex - 1;
                    FocusManager.removeKeyboardFocus(currentFocus);
                    FocusManager.addKeyboardFocus(sortOptions[prevIndex]);
                    sortOptions[prevIndex].focus();
                }
            } else if (key === 'Enter') {
                // Select the current option
                if (currentFocus && currentFocus.classList.contains('sort-option')) {
                    currentFocus.click();
                    // The click handler will close the dropdown
                    State.sortDropdownActive = null;
                    
                    // Move focus to the topmost item in the pane after sorting completes
                    // Use requestAnimationFrame to wait for DOM updates
                    requestAnimationFrame(() => {
                        requestAnimationFrame(() => {
                            this.returnToPaneFromHeader(pane);
                        });
                    });
                }
            } else if (key === 'Escape') {
                // Close dropdown and return focus to sort icon
                this.closeSortDropdown(dropdown, pane);
                const sortBtn = document.getElementById(`${pane}-sort-btn`);
                if (sortBtn) {
                    FocusManager.addKeyboardFocus(sortBtn);
                    sortBtn.focus();
                }
            } else if (key === 'Tab') {
                // Close dropdown and move to next pane
                this.closeSortDropdown(dropdown, pane);
                State.sortDropdownActive = null;
                
                // Let the Tab navigation handle moving to next pane
                // Need to re-dispatch the Tab event
                setTimeout(() => {
                    const tabEvent = new KeyboardEvent('keydown', {
                        key: 'Tab',
                        keyCode: 9,
                        which: 9,
                        bubbles: true,
                        cancelable: true
                    });
                    document.dispatchEvent(tabEvent);
                }, 50);
            }
        },
        
        /**
         * Close sort dropdown and clean up state
         * @param {HTMLElement} dropdown - The dropdown to close
         * @param {string} pane - The pane name
         */
        closeSortDropdown(dropdown, pane) {
            dropdown.classList.remove('active');
            State.sortDropdownActive = null;
            
            // Remove keyboard focus from all options
            dropdown.querySelectorAll('.sort-option').forEach(opt => {
                FocusManager.removeKeyboardFocus(opt);
                opt.removeAttribute('tabindex');
            });
        },
        
    };
})();
