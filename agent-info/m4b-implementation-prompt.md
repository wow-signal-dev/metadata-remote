# M4B Audiobook Support Implementation Task

## CRITICAL INSTRUCTIONS

You must implement M4B audiobook format support by making EXACTLY the changes specified in the refactoring-proposal.md document. This is a precision task that requires absolute accuracy.

## Your Task

1. **READ** the complete implementation guide at: `/home/will/deleteme/metadata-remote/agent-info/refactoring-proposal.md`

2. **IMPLEMENT** all 8 changes EXACTLY as specified in the guide:
   - Change 1: Add M4B to Supported Extensions in config.py
   - Change 2: Add M4B MIME Type in config.py  
   - Change 3: Update Format Metadata Configuration in config.py
   - Change 4: Add M4B Format Detection in file_utils.py
   - Change 5: Add M4B File Icon in utilities.js
   - Change 6: Update Format Badge Display in utilities.js
   - Change 7: Ensure Audiobook Properties for M4B Files in mutagen_handler.py
   - Change 8: Add Dynamic Narrator Label for M4B Files in editor.js

3. **CRITICAL REQUIREMENTS**:
   - Make ONLY the changes shown in the AFTER sections
   - Do NOT add any extra functionality
   - Do NOT modify any code beyond what's specified
   - Do NOT create new files
   - Do NOT add comments unless they're shown in the AFTER sections
   - Copy the AFTER sections EXACTLY as shown (including any comments marked with ADDED/MODIFIED)

## Implementation Process

For each of the 8 changes:
1. Navigate to the specified file
2. Find the EXACT code shown in the BEFORE section
3. Replace it with the EXACT code shown in the AFTER section
4. Move to the next change

## Verification Requirements

After completing all changes, you MUST:

1. **List each file modified** with the specific changes made
2. **Verify no extra changes** were made beyond the 8 specified
3. **Confirm the exact number of files modified** (should be 5 files total)
4. **Double-check each change** by comparing your edits against the refactoring-proposal.md

## Expected Outcome

After implementation:
- 5 files should be modified (config.py, file_utils.py, utilities.js, mutagen_handler.py, editor.js)
- 8 specific code changes should be made
- M4B files will be fully supported with audiobook-specific features

## Final Verification Checklist

After implementation, confirm:
- [ ] config.py has 3 changes (AUDIO_EXTENSIONS, MIME_TYPES, FORMAT_METADATA_CONFIG)
- [ ] core/file_utils.py has 1 change (get_file_format function)
- [ ] static/js/ui/utilities.js has 2 changes (FORMAT_EMOJIS, getFormatBadge)
- [ ] core/metadata/mutagen_handler.py has 1 change (write_metadata method)
- [ ] static/js/metadata/editor.js has 1 change (renderStandardFields method)
- [ ] Total: 8 changes across 5 files
- [ ] No other files were modified
- [ ] No extra code was added

**IMPORTANT**: Do not commit any changes. Only implement the code changes as specified.