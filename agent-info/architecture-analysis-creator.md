  # Comprehensive Software Analysis Subagent Architecture

  You are tasked with creating a powerful subagent architecture to perform deep, comprehensive analyses of the local software
  codebase. Each subagent will be responsible for analyzing a specific aspect of the software and producing a detailed markdown
  specification document.

  ## Primary Directive

  Launch multiple concurrent subagents using the Task tool, each focused on a specific analysis topic. Each subagent MUST:

  1. **Perform exhaustive analysis** of their assigned topic
  2. **Create a comprehensive markdown document** saved to:
  `/home/will/deleteme/metadata-remote/agent-info/architecture/[topic-name].md`
  3. **Include detailed code references** with file paths and line numbers (format: `file_path:line_number`)
  4. **Document all relevant code blocks** with explanations
  5. **Verify completeness** before concluding their work

  ## Subagent Topics

  Launch the following subagents concurrently:

  ### Topic 1: General Software Architecture of Metadata Remote
  - Analyze the overall application structure (Flask backend + vanilla JS frontend)
  - Document the modular namespace architecture in `window.MetadataRemote`
  - Map the RESTful API design and routing structure in `app.py`
  - Examine the core module organization under `/core/`
  - Document the separation of concerns between backend and frontend
  - Analyze the configuration management system
  - Document the Docker containerization approach
  - Map the data flow patterns between components

  ### Topic 2: Keyboard Controls
  - Analyze the complete keyboard navigation system in `static/js/navigation/keyboard.js`
  - Document the state machine implementation for navigation contexts
  - Map all keyboard shortcuts and their actions
  - Examine focus management and tab order handling
  - Document the navigation context system (pane, form, list, header)
  - Analyze the integration with UI components
  - Document accessibility features and ARIA support
  - Map keyboard event propagation and handling

  ### Topic 3: Editing History System Backend
  - Analyze the history module at `core/history.py`
  - Document the action tracking system and data structures
  - Examine the undo/redo implementation
  - Map the different action types (metadata, album art, batch operations)
  - Document the history storage and persistence mechanisms
  - Analyze the batch operation tracking
  - Document the history API endpoints in `app.py`
  - Examine error handling and rollback strategies

  ### Topic 4: Editing History System Frontend
  - Analyze the history UI manager at `static/js/history/manager.js`
  - Document the history panel implementation and user interactions
  - Map the API communication for history operations
  - Examine the UI state synchronization with backend history
  - Document the visual feedback for undo/redo operations
  - Analyze the integration with other UI components
  - Document the keyboard shortcuts for history navigation
  - Map error handling and user notifications

  ### Topic 5: File Loading in Metadata Pane Frontend
  - Analyze the metadata editor module at `static/js/metadata/editor.js`
  - Document the file selection handling and metadata display
  - Examine the field rendering and dynamic form generation
  - Map the integration with the state management system
  - Document the UI components for different metadata field types
  - Analyze the loading states and progress indicators
  - Document the error handling for invalid metadata
  - Examine the performance optimizations for large metadata sets

  ### Topic 6: File Loading in Metadata Pane Backend
  - Analyze the metadata reading logic in `core/metadata/reader.py`
  - Document the Mutagen integration in `core/metadata/mutagen_handler.py`
  - Map the format-specific handling for different audio types
  - Examine the metadata normalization in `core/metadata/normalizer.py`
  - Document the API endpoint for metadata retrieval
  - Analyze the caching and performance optimizations
  - Document error handling for corrupted files
  - Map the metadata field discovery process

  ### Topic 7: General UI Structure and Functionality
  - Analyze the main HTML template at `templates/index.html`
  - Document the three-pane layout (folders, files, metadata)
  - Examine the responsive design and pane resizing system
  - Map the UI utility functions in `static/js/ui/utilities.js`
  - Document the button status animation system
  - Analyze the modal and notification systems
  - Document the CSS architecture and styling approach
  - Map the accessibility features and semantic HTML

  ### Topic 8: Folders Pane Codebase Structure and Functionality
  - Analyze the tree navigation module at `static/js/navigation/tree.js`
  - Document the folder tree rendering and state management
  - Examine the folder expansion/collapse handling
  - Map the API integration for directory listing
  - Document the folder selection and navigation logic
  - Analyze the performance optimizations for large directory trees
  - Document the keyboard navigation within the folders pane
  - Map the integration with file listing updates

  ### Topic 9: Files Pane Codebase Structure and Functionality
  - Analyze the file manager module at `static/js/files/manager.js`
  - Document the file listing display and sorting logic
  - Examine the multi-select functionality
  - Map the filtering and search implementation
  - Document the file type detection and icon display
  - Analyze the drag-and-drop support
  - Document the context menu integration
  - Map the batch operation triggers

  ### Topic 10: Metadata Pane Codebase Structure and Functionality
  - Analyze the metadata editor architecture and field management
  - Document the form generation and validation system
  - Examine the album art integration
  - Map the inference system integration
  - Document the save/cancel workflow
  - Analyze the field type handling (text, numeric, etc.)
  - Document the custom field creation UI
  - Map the batch editing mode

  ### Topic 11: Saving Changes to Filenames Frontend
  - Analyze the filename editing UI implementation
  - Document the inline editing functionality
  - Examine the validation and error display
  - Map the UI state updates during rename operations
  - Document the confirmation dialogs and user feedback
  - Analyze the integration with file listing refresh
  - Document the keyboard shortcuts for rename operations
  - Map the error recovery mechanisms

  ### Topic 12: Saving Changes to Filenames Backend
  - Analyze the file renaming logic in `app.py`
  - Document the file system operations and validation
  - Examine the path handling and security measures
  - Map the atomic rename operations
  - Document the history tracking for rename operations
  - Analyze the error handling for permission issues
  - Document the response format and status codes
  - Map the integration with metadata updates

  ### Topic 13: Saving Changes to Metadata Fields in an Individual File Frontend
  - Analyze the individual field save logic in metadata editor
  - Document the field validation and formatting
  - Examine the save button states and feedback
  - Map the API call construction and execution
  - Document the optimistic UI updates
  - Analyze the error handling and rollback
  - Document the success notifications
  - Map the history panel updates

  ### Topic 14: Saving Changes to Metadata Fields in an Individual File Backend
  - Analyze the metadata writing logic in `core/metadata/writer.py`
  - Document the format-specific tag writing
  - Examine the field mapping and conversion
  - Map the file locking and atomic writes
  - Document the validation and sanitization
  - Analyze the error handling for write failures
  - Document the history action creation
  - Map the response generation

  ### Topic 15: Saving Changes to Metadata Fields in an Entire Folder of Files Frontend
  - Analyze the batch editing UI in metadata editor
  - Document the folder selection and batch mode activation
  - Examine the batch progress display
  - Map the concurrent API calls management
  - Document the error aggregation and reporting
  - Analyze the partial success handling
  - Document the batch history display
  - Map the UI state management during batch operations

  ### Topic 16: Saving Changes to Metadata Fields in an Entire Folder of Files Backend
  - Analyze the batch processing logic in `core/batch/`
  - Document the parallel processing implementation
  - Examine the transaction management
  - Map the progress tracking and reporting
  - Document the error isolation and recovery
  - Analyze the performance optimizations
  - Document the batch history creation
  - Map the file locking strategies

  ### Topic 17: Deleting a Metadata Field Entirely from an Individual File Frontend
  - Analyze the field deletion UI controls
  - Document the confirmation dialogs
  - Examine the UI updates after deletion
  - Map the API call for field removal
  - Document the visual feedback during deletion
  - Analyze the undo functionality integration
  - Document the keyboard shortcuts for deletion
  - Map the field list refresh logic

  ### Topic 18: Deleting a Metadata Field Entirely from an Individual File Backend
  - Analyze the field deletion logic in metadata writer
  - Document the format-specific field removal
  - Examine the tag structure updates
  - Map the validation for required fields
  - Document the atomic update process
  - Analyze the rollback mechanisms
  - Document the history action creation
  - Map the file integrity checks

  ### Topic 19: Deleting a Metadata Field Entirely from an Entire Folder of Files Frontend
  - Analyze the batch field deletion UI
  - Document the folder-wide field selection
  - Examine the batch confirmation process
  - Map the progress tracking display
  - Document the error reporting for batch deletion
  - Analyze the partial success handling
  - Document the batch undo functionality
  - Map the UI refresh after batch deletion

  ### Topic 20: Deleting a Metadata Field Entirely from an Entire Folder of Files Backend
  - Analyze the batch field deletion implementation
  - Document the parallel deletion processing
  - Examine the consistency guarantees
  - Map the transaction boundaries
  - Document the error isolation strategies
  - Analyze the performance considerations
  - Document the batch history tracking
  - Map the cleanup operations

  ### Topic 21: Adding New Metadata Fields to Files Frontend
  - Analyze the custom field creation UI
  - Document the field name validation
  - Examine the field type selection
  - Map the UI form generation
  - Document the field addition workflow
  - Analyze the duplicate field prevention
  - Document the immediate edit capability
  - Map the field list updates

  ### Topic 22: Adding New Metadata Fields to Files Backend
  - Analyze the custom field creation logic
  - Document the format-specific field support
  - Examine the field name normalization
  - Map the tag structure updates
  - Document the validation rules
  - Analyze the compatibility checks
  - Document the history tracking
  - Map the response formatting

  ### Topic 23: Adding New Metadata Fields to an Entire Folder of Files Frontend
  - Analyze the batch field creation UI
  - Document the folder-wide field addition
  - Examine the batch validation display
  - Map the progress indicators
  - Document the conflict resolution UI
  - Analyze the batch preview functionality
  - Document the rollback options
  - Map the success reporting

  ### Topic 24: Adding New Metadata Fields to an Entire Folder of Files Backend
  - Analyze the batch field creation implementation
  - Document the parallel processing logic
  - Examine the format compatibility checks
  - Map the transaction management
  - Document the conflict resolution strategies
  - Analyze the performance optimizations
  - Document the batch history creation
  - Map the error aggregation

  ### Topic 25: Saving All Fields to an Individual File Frontend
  - Analyze the save-all functionality in metadata editor
  - Document the field collection and validation
  - Examine the save button states
  - Map the comprehensive API payload construction
  - Document the progress feedback
  - Analyze the error highlighting
  - Document the success confirmation
  - Map the UI state reset

  ### Topic 26: Saving All Fields to an Individual File Backend
  - Analyze the comprehensive metadata update logic
  - Document the atomic multi-field writes
  - Examine the format-specific optimizations
  - Map the validation pipeline
  - Document the transaction handling
  - Analyze the rollback capabilities
  - Document the history action grouping
  - Map the performance considerations

  ## Subagent Instructions Template

  Each subagent MUST follow this process:

  1. Initial Discovery Phase
    - Use Grep, Glob, and search tools extensively
    - Read all relevant files thoroughly
    - Build a comprehensive understanding of the topic area
    - Take notes on all findings
  2. Deep Analysis Phase
    - Analyze code implementations in detail
    - Trace execution flows
    - Identify patterns and anti-patterns
    - Document all interconnections
    - Include specific code examples with full context
  3. Documentation Phase
    - Create markdown file at: /home/will/deleteme/metadata-remote/agent-info/architecture/[topic-name].md
    - Structure document with clear sections
    - Include table of contents
    - Add code blocks with syntax highlighting
    - Reference specific files and line numbers
    - Include diagrams where applicable
  4. Verification Phase
    - Re-read the entire document
    - Verify all code references are accurate
    - Ensure no important aspects are missing
    - Check that explanations are clear and comprehensive
    - Confirm the document provides actionable insights

  ## Markdown Document Structure

  Each analysis document MUST include:

  ```markdown
  # [Topic Name] Analysis

  ## Table of Contents
  [Auto-generated TOC]

  ## Executive Summary
  [High-level overview of findings]

  ## Detailed Analysis

  ### Component Overview
  [List and describe all relevant components]

  ### Implementation Details
  [Deep dive into code implementation with examples]

  ### Code References
  [Organized list of all relevant code locations]

  ### Patterns and Practices
  [Identified patterns, best practices, and areas for improvement]

  ### Dependencies and Interactions
  [How this topic area interacts with other parts of the system]

  ### Key Findings
  [Important discoveries and insights]

  ### Recommendations
  [Actionable recommendations based on analysis]

  ## Appendix
  [Additional code examples, diagrams, or reference material]

  Quality Requirements

  Each subagent MUST ensure their document:
  - Contains at least 20 specific code references with file paths and line numbers
  - Includes actual code snippets (not just descriptions)
  - Provides comprehensive coverage leaving no stone unturned
  - Uses clear, technical language appropriate for developers
  - Includes visual aids (diagrams, flowcharts) where beneficial
  - Is immediately actionable for someone unfamiliar with the codebase

  Execution Instructions

  1. Launch all subagents concurrently using multiple Task tool invocations in a single message
  2. Each subagent should work autonomously and save their completed analysis
  3. After all subagents complete, create an index file at:
  /home/will/deleteme/metadata-remote/agent-info/architecture/index.md
  listing all completed analyses with brief summaries

  Critical Success Factors

  - Depth over breadth: Each topic must be analyzed exhaustively
  - Accuracy: All code references must be verified and correct
  - Completeness: No significant aspect of the topic should be omitted
  - Clarity: Documents must be understandable without prior system knowledge
  - Actionability: Findings must lead to concrete insights or improvements

  Remember: The goal is to create a comprehensive knowledge base that fully documents and explains every aspect of the software
  system. Each subagent must think deeply, analyze thoroughly, and document meticulously.
  ```
