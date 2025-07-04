/**
 * Audio Player Management for Metadata Remote
 * Handles audio playback controls and state
 */

(function() {
    // Create namespace if it doesn't exist
    window.MetadataRemote = window.MetadataRemote || {};
    window.MetadataRemote.Audio = window.MetadataRemote.Audio || {};
    
    // Create shortcuts
    const State = window.MetadataRemote.State;
    const UIUtils = window.MetadataRemote.UI.Utilities;
    
    window.MetadataRemote.Audio.Player = {
        audioPlayer: null,
        
        /**
         * Initialize the audio player
         * @param {HTMLAudioElement} audioElement - The audio element from the DOM
         */
        init(audioElement) {
            this.audioPlayer = audioElement;
            this.setupEventListeners();
        },
        
        /**
         * Set up audio player event listeners
         */
        setupEventListeners() {
            this.audioPlayer.addEventListener('ended', () => this.stopPlayback());
            this.audioPlayer.addEventListener('error', (e) => {
                // Only show error if we're actually trying to play something
                if (State.currentlyPlayingFile && this.audioPlayer.src) {
                    console.error('Audio playback error:', e);
                    this.stopPlayback();
                    UIUtils.showStatus('Error playing audio file', 'error');
                }
            });
        },
        
        /**
         * Toggle playback for a file
         * @param {string} filepath - Path to the audio file
         * @param {HTMLElement} button - The play button element
         */
        togglePlayback(filepath, button) {
            if (State.currentlyPlayingFile === filepath && !this.audioPlayer.paused) {
                this.audioPlayer.pause();
                button.classList.remove('playing');
            } else {
                this.stopPlayback();
                State.currentlyPlayingFile = filepath;
                
                // ADD: Show loading state
                button.classList.add('loading');
                button.classList.remove('playing');
                
                this.audioPlayer.src = `/stream/${encodeURIComponent(filepath)}`;
                this.audioPlayer.play()
                    .then(() => {
                        // ADD: Remove loading state and show playing state
                        button.classList.remove('loading');
                        button.classList.add('playing');
                    })
                    .catch(err => {
                        console.error('Error playing audio:', err);
                        // ADD: Remove loading state on error
                        button.classList.remove('loading');
                        UIUtils.showStatus('Error playing audio file', 'error');
                        this.stopPlayback();
                    });
            }
        },
        
        /**
         * Stop all playback
         */
        stopPlayback() {
            if (!this.audioPlayer.paused) {
                this.audioPlayer.pause();
            }
            this.audioPlayer.src = '';
            State.currentlyPlayingFile = null;
            document.querySelectorAll('.play-button.playing').forEach(btn => {
                btn.classList.remove('playing');
            });
            // ADD: Also remove any loading states
            document.querySelectorAll('.play-button.loading').forEach(btn => {
                btn.classList.remove('loading');
            });
        }
    };
})();
