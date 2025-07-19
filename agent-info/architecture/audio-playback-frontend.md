# Audio Playback Frontend Architecture

## Table of Contents
1. [Executive Summary](#executive-summary)
2. [Architecture Overview](#architecture-overview)
3. [Component Structure](#component-structure)
4. [Audio Player Module](#audio-player-module)
5. [User Interface Components](#user-interface-components)
6. [State Management](#state-management)
7. [Event Flow and Interactions](#event-flow-and-interactions)
8. [Integration with File Manager](#integration-with-file-manager)
9. [Keyboard Navigation Support](#keyboard-navigation-support)
10. [CSS Styling and Visual States](#css-styling-and-visual-states)
11. [Error Handling](#error-handling)
12. [Performance Considerations](#performance-considerations)
13. [Browser Compatibility](#browser-compatibility)
14. [Security Aspects](#security-aspects)
15. [Code References](#code-references)
16. [Limitations and Future Improvements](#limitations-and-future-improvements)

## Executive Summary

The audio playback frontend in Metadata Remote provides a minimalist, integrated audio player for previewing audio files while editing metadata. The implementation leverages the HTML5 audio API with a custom JavaScript wrapper that manages playback state and UI synchronization. The system includes format-specific handling for WavPack transcoding and WMA playback blocking.

### Key Highlights:
- **Single-track playback**: Only one audio file can play at a time
- **Visual feedback**: Three distinct visual states (default, loading, playing)
- **Format-aware routing**: WavPack files automatically routed to transcoding endpoint
- **WMA blocking**: Windows Media Audio files have playback disabled
- **Seamless integration**: Play buttons appear inline with file listings
- **Keyboard support**: Space bar toggles playback for selected files
- **Error resilience**: Graceful handling of playback failures
- **Lightweight design**: Minimal UI footprint focusing on core functionality

## Architecture Overview

The frontend audio playback system follows a modular architecture with clear separation of concerns:

```
┌─────────────────────────────────────────────────────────────┐
│                     User Interface Layer                     │
├─────────────────┬───────────────────┬───────────────────────┤
│  Play Buttons   │  Visual States    │  Keyboard Controls    │
├─────────────────┴───────────────────┴───────────────────────┤
│                   Audio Player Module                        │
│              (Event Management & State Control)              │
├─────────────────────────────────────────────────────────────┤
│                    HTML5 Audio Element                       │
│                  (Native Browser API)                        │
├─────────────────────────────────────────────────────────────┤
│                   Network Layer (Fetch)                      │
│                 (Streaming from Backend)                     │
└─────────────────────────────────────────────────────────────┘
```

## Component Structure

### 1. HTML Structure
The audio playback system consists of minimal HTML elements:

```html
<!-- Hidden audio element (templates/index.html:155) -->
<audio id="audio-player"></audio>

<!-- Play button template (generated dynamically) -->
<div class="play-button">
    <span class="play-icon">▶</span>
    <span class="pause-icon">❚❚</span>
    <span class="play-spinner"></span>
</div>
```

### 2. JavaScript Modules
- **Audio Player Module** (`static/js/audio/player.js`): Core playback logic
- **File Manager Integration** (`static/js/files/manager.js`): Play button creation
- **Keyboard Navigation** (`static/js/navigation/contexts/list-navigation.js`): Space bar support

### 3. CSS Styling
- **Main Styles** (`static/css/main.css`): Visual states and animations

## Audio Player Module

The core audio player module (`static/js/audio/player.js`) implements a singleton pattern within the MetadataRemote namespace:

### Module Structure
```javascript
window.MetadataRemote.Audio.Player = {
    audioPlayer: null,
    
    init(audioElement) { ... },
    setupEventListeners() { ... },
    togglePlayback(filepath, button) { ... },
    stopPlayback() { ... }
};
```

### Initialization Process
1. **Module Creation** (`player.js:7-14`):
   - Creates namespace hierarchy: `window.MetadataRemote.Audio.Player`
   - Establishes shortcuts to State and UIUtils modules

2. **Player Initialization** (`player.js:22-25`):
   ```javascript
   init(audioElement) {
       this.audioPlayer = audioElement;
       this.setupEventListeners();
   }
   ```

3. **Event Listener Setup** (`player.js:30-40`):
   - `ended`: Automatically stops playback and clears UI state
   - `error`: Shows user-friendly error message if playback fails

### Playback Control Logic

The `togglePlayback` method (`player.js:47-83`) implements sophisticated state management with format-specific handling:

```javascript
togglePlayback(filepath, button) {
    // Safety check - prevent WMA playback
    if (filepath.toLowerCase().endsWith('.wma')) {
        console.warn('WMA playback attempted but blocked');
        return;
    }
    
    if (State.currentlyPlayingFile === filepath && !this.audioPlayer.paused) {
        // Currently playing this file - pause it
        this.audioPlayer.pause();
        button.classList.remove('playing');
    } else {
        // Start new playback
        this.stopPlayback();  // Stop any current playback
        State.currentlyPlayingFile = filepath;
        
        // Show loading state
        button.classList.add('loading');
        button.classList.remove('playing');
        
        // Check if it's a WavPack file
        const isWavPack = filepath.toLowerCase().endsWith('.wv');
        const streamUrl = isWavPack 
            ? `/stream/wav/${encodeURIComponent(filepath)}`
            : `/stream/${encodeURIComponent(filepath)}`;
        
        this.audioPlayer.src = streamUrl;
        this.audioPlayer.play()
            .then(() => {
                // Success - show playing state
                button.classList.remove('loading');
                button.classList.add('playing');
            })
            .catch(err => {
                // Failure - reset state and show error
                console.error('Error playing audio:', err);
                button.classList.remove('loading');
                UIUtils.showStatus('Error playing audio file', 'error');
                this.stopPlayback();
            });
    }
}
```

### Format-Specific Handling

1. **WMA Blocking**: The method immediately returns if a WMA file is detected, preventing any playback attempt
2. **WavPack Routing**: WV files are automatically routed to the transcoding endpoint (`/stream/wav/`) for on-the-fly conversion to WAV
3. **Standard Formats**: All other formats use the standard streaming endpoint (`/stream/`)

### Stop Playback Implementation

The `stopPlayback` method (`player.js:76-88`) ensures complete cleanup:

1. Pauses audio if playing
2. Clears the audio source (important for memory management)
3. Resets global playback state
4. Removes all visual states from all play buttons

## User Interface Components

### Play Button Creation

Play buttons are dynamically created for each audio file (`manager.js:342-349`):

```javascript
const playButton = document.createElement('div');
playButton.className = 'play-button';
playButton.innerHTML = '<span class="play-icon">▶</span><span class="pause-icon">❚❚</span><span class="play-spinner"></span>';
playButton.onclick = (e) => {
    e.stopPropagation();  // Prevent file selection
    AudioPlayer.togglePlayback(file.path, playButton);
};
li.appendChild(playButton);
```

### Visual State Management

The UI supports three distinct visual states:

1. **Default State**: Shows play icon (▶)
2. **Loading State**: Shows animated spinner
3. **Playing State**: Shows pause icon (❚❚)

State transitions are managed through CSS classes:
- `.play-button` - Base state
- `.play-button.loading` - Loading/buffering
- `.play-button.playing` - Currently playing

## State Management

### Global State Tracking

The system maintains playback state in the centralized State object:

```javascript
State.currentlyPlayingFile = null;  // Path of currently playing file
```

This enables:
- Prevention of multiple simultaneous playbacks
- Proper cleanup when navigating away
- Consistent state across UI components

### State Synchronization

State synchronization occurs at multiple points:

1. **On Play Start**: Sets `currentlyPlayingFile` and updates button state
2. **On Pause/Stop**: Clears `currentlyPlayingFile` and resets all buttons
3. **On Navigation**: Stops playback when loading new folders/files
4. **On Error**: Resets state to prevent inconsistencies

## Event Flow and Interactions

### User Interaction Flow

```
User clicks play button
    ↓
Event handler prevents bubbling (e.stopPropagation())
    ↓
togglePlayback() called with filepath and button reference
    ↓
Check if already playing this file?
    ├─ Yes → Pause and update UI
    └─ No → Stop any current playback
            ↓
        Set loading state
            ↓
        Set audio source to streaming endpoint
            ↓
        Attempt playback
            ├─ Success → Update to playing state
            └─ Failure → Show error and reset
```

### Event Propagation Control

The system carefully manages event propagation:

1. **Click Events** (`manager.js:345-348`):
   - Play button clicks stop propagation to prevent file selection
   - File row clicks check if target is play button before proceeding

2. **Audio Events** (`player.js:31-39`):
   - `ended` event triggers automatic cleanup
   - `error` event only shows message if actively playing

## Integration with File Manager

### File List Rendering

During file list rendering (`manager.js:298-357`), the system:

1. Creates a list item for each audio file
2. Adds file information (name, format badge, metadata)
3. Appends play button with proper event handlers
4. Sets up click handler that respects play button clicks

### Navigation Integration

The file manager stops playback in several scenarios:

1. **Loading New Folder** (`manager.js:190`):
   ```javascript
   AudioPlayer.stopPlayback();
   ```

2. **Loading Individual File** (implicit through state changes)

3. **Applying Filters** (maintains current playback)

## Keyboard Navigation Support

### Space Bar Control

The keyboard navigation system (`list-navigation.js:65-74`) implements space bar toggling:

```javascript
if (window.MetadataRemote.State.focusedPane === 'files' && window.MetadataRemote.State.selectedListItem) {
    const filepath = window.MetadataRemote.State.selectedListItem.dataset.filepath;
    if (filepath) {
        const playButton = window.MetadataRemote.State.selectedListItem.querySelector('.play-button');
        if (playButton) {
            window.MetadataRemote.Audio.Player.togglePlayback(filepath, playButton);
        }
    }
}
```

This enables:
- Keyboard-only navigation and playback control
- Accessibility for users who prefer keyboard interaction
- Consistency with file selection behavior

## CSS Styling and Visual States

### Base Button Styling (`main.css:1089-1103`)

```css
.play-button {
    width: 25px;
    height: 25px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    display: none;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.2s;
    flex-shrink: 0;
    margin-left: 1rem;
}
```

### State-Based Styling

1. **Hover State** (`main.css:1105-1109`):
   ```css
   .play-button:hover {
       background: rgba(74, 127, 255, 0.2);
       border-color: rgba(74, 127, 255, 0.4);
       transform: scale(1.1);
   }
   ```

2. **Playing State** (`main.css:1111-1114`):
   ```css
   .play-button.playing {
       background: rgba(74, 127, 255, 0.3);
       border-color: var(--accent-primary);
   }
   ```

3. **Loading Animation** (`main.css:1144-1160`):
   ```css
   .play-spinner {
       width: 12px;
       height: 12px;
       border: 2px solid rgba(255,255,255,.2);
       border-top-color: rgba(255,255,255,.8);
       border-radius: 50%;
       display: none;
       animation: spin 0.8s linear infinite;
   }
   ```

### Icon Positioning

Precise positioning ensures visual consistency:

- **Play Icon**: Offset by `left: 1px` for optical centering
- **Pause Icon**: Smaller font size (10px) for balanced appearance
- **Spinner**: Centered with 12px dimensions

## Error Handling

### Playback Error Management

The system handles errors at multiple levels:

1. **Promise Rejection** (`player.js:64-69`):
   - Catches play() promise rejections
   - Logs error to console for debugging
   - Shows user-friendly status message
   - Resets player state

2. **Audio Element Errors** (`player.js:32-39`):
   - Only shows error if actively playing
   - Prevents spurious error messages
   - Maintains consistent UI state

3. **Network Errors**:
   - Backend returns 404 for missing files
   - Frontend handles through promise rejection

### Error Recovery

The system automatically recovers from errors by:
- Stopping playback
- Clearing visual states
- Resetting global state
- Allowing immediate retry

## Performance Considerations

### Memory Management

1. **Source Clearing** (`player.js:80`):
   ```javascript
   this.audioPlayer.src = '';
   ```
   Prevents memory leaks by releasing audio buffer references

2. **Single Instance**: Only one audio element exists, reused for all playback

3. **Event Delegation**: No per-file event listeners for audio events

### Network Optimization

1. **Lazy Loading**: Audio streams only when requested
2. **Range Support**: Enables efficient seeking without full download
3. **Chunked Streaming**: 8KB chunks prevent large memory allocation

### UI Performance

1. **CSS Transitions**: Hardware-accelerated transforms for hover effects
2. **Class-Based States**: Efficient state changes through className manipulation
3. **Minimal Reflows**: Button creation happens during initial render

## Browser Compatibility

### HTML5 Audio Support

The system relies on standard HTML5 audio features:
- `<audio>` element support (all modern browsers)
- Promise-based play() API (Chrome 50+, Firefox 52+, Safari 10+)
- Standard audio formats (MP3, OGG, WAV universally supported)

### Progressive Enhancement

The implementation gracefully handles:
- Browsers without Promise support (falls back to error event)
- Missing audio codec support (shows error message)
- Disabled JavaScript (buttons don't appear)

### Format Support Matrix

| Format | Chrome | Firefox | Safari | Edge | Playback Method |
|--------|--------|---------|--------|------|------------------|
| MP3    | ✓      | ✓       | ✓      | ✓    | Direct stream |
| FLAC   | ✓      | ✓       | ✓      | ✓    | Direct stream |
| WAV    | ✓      | ✓       | ✓      | ✓    | Direct stream |
| OGG    | ✓      | ✓       | ✗      | ✓    | Direct stream |
| OPUS   | ✓      | ✓       | ✗      | ✓    | Direct stream |
| M4A    | ✓      | ✓       | ✓      | ✓    | Direct stream |
| WMA    | ✗      | ✗       | ✗      | ✗*   | Blocked in UI |
| WV     | ✓†     | ✓†      | ✓†     | ✓†   | Transcoded to WAV |

* Edge technically supports WMA but playback is blocked in the application
† WavPack support achieved through server-side transcoding to WAV

## Security Aspects

### XSS Prevention

1. **Path Encoding** (`player.js:58`):
   ```javascript
   this.audioPlayer.src = `/stream/${encodeURIComponent(filepath)}`;
   ```
   Prevents injection through file paths

2. **No Dynamic HTML**: Uses `textContent` and `classList` APIs

3. **Event Handler Isolation**: Closures prevent external access

### Content Security

1. **Same-Origin**: Audio streams from same domain
2. **No External Resources**: All assets served locally
3. **Path Validation**: Backend validates all file paths

## Code References

1. **Audio Player Module**: Complete implementation (`static/js/audio/player.js:1-91`)
2. **Module Initialization**: App startup (`static/js/app.js:87`)
3. **WMA Blocking Logic**: Format check (`static/js/audio/player.js:48-51`)
4. **WavPack Routing**: Transcoding URL logic (`static/js/audio/player.js:59-62`)
5. **Play Button Creation**: File list rendering (`static/js/files/manager.js:342-358`)
6. **WMA Button Disabling**: UI prevention (`static/js/files/manager.js:344-357`)
7. **Click Event Handling**: Playback toggle (`static/js/files/manager.js:345-348`)
8. **File Row Click Handler**: Play button detection (`static/js/files/manager.js:351-355`)
9. **Keyboard Control**: Space bar support (`static/js/navigation/contexts/list-navigation.js:65-74`)
10. **HTML Audio Element**: Hidden player (`templates/index.html:155`)
11. **CSS Base Styles**: Button appearance (`static/css/main.css:1089-1103`)
12. **CSS Hover Effects**: Interactive feedback (`static/css/main.css:1105-1109`)
13. **CSS Playing State**: Active indication (`static/css/main.css:1111-1114`)
14. **CSS Disabled State**: WMA buttons (`static/css/main.css:1172-1180`)
15. **CSS Icon Styles**: Visual elements (`static/css/main.css:1120-1139`)
16. **CSS Loading Animation**: Spinner (`static/css/main.css:1144-1169`)
17. **Playback Stop on Navigation**: Folder loading (`static/js/files/manager.js:190`)
18. **Error Event Handler**: Graceful failure (`static/js/audio/player.js:32-39`)
19. **Promise-Based Playback**: Modern API usage (`static/js/audio/player.js:63-73`)

## Limitations and Future Improvements

### Current Limitations

1. **No Advanced Controls**:
   - No volume adjustment (uses system volume)
   - No seek bar or progress indication
   - No time display (current/total)
   - No playback rate control

2. **Limited Keyboard Support**:
   - Only Space bar for play/pause
   - No keyboard shortcuts for volume/seeking
   - No media key support

3. **Basic Visual Feedback**:
   - No waveform visualization
   - No spectrum analyzer
   - No album art display

4. **Single Track Only**:
   - No playlist functionality
   - No queue management
   - No continuous playback

5. **Mobile Limitations**:
   - Requires user interaction to start playback
   - No background playback support
   - Limited format support on iOS

6. **Format-Specific Limitations**:
   - WMA files cannot be played (UI disabled)
   - WavPack files cannot be seeked during playback
   - No range request support for transcoded streams

### Recommended Improvements

1. **Enhanced Controls**:
   ```javascript
   // Add seek bar with progress
   <input type="range" class="seek-bar" min="0" max="100">
   
   // Add time display
   <span class="time-display">0:00 / 3:45</span>
   
   // Add volume control
   <input type="range" class="volume-control" min="0" max="100">
   ```

2. **Keyboard Shortcuts**:
   - Arrow keys for seeking
   - +/- for volume control
   - M for mute toggle
   - Media key integration via MediaSession API

3. **Playlist Support**:
   - Queue management system
   - Auto-advance to next track
   - Shuffle and repeat modes

4. **Visual Enhancements**:
   - Progress bar integrated into button
   - Mini waveform display
   - Album art from metadata

5. **Performance Optimizations**:
   - Web Audio API for precise control
   - AudioWorklet for processing
   - Preloading next track in playlist

6. **Accessibility Improvements**:
   - ARIA labels for all controls
   - Screen reader announcements
   - Keyboard focus indicators

The current implementation prioritizes simplicity and reliability for the primary use case of previewing audio files while editing metadata. The format-specific handling for WavPack and WMA demonstrates the system's flexibility in dealing with browser limitations. The modular architecture allows for incremental enhancement without disrupting core functionality.

### Format Handling Summary

- **Native Browser Support**: MP3, FLAC, WAV, M4A, OGG, OPUS
- **Server-Side Transcoding**: WV (WavPack → WAV)
- **Playback Disabled**: WMA (no browser support)