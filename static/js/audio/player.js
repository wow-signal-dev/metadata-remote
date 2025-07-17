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
            // Safety check - prevent WMA playback
            if (filepath.toLowerCase().endsWith('.wma')) {
                console.warn('WMA playback attempted but blocked');
                return;
            }
            
            if (State.currentlyPlayingFile === filepath && !this.audioPlayer.paused) {
                this.audioPlayer.pause();
                button.classList.remove('playing');
            } else {
                this.stopPlayback();
                State.currentlyPlayingFile = filepath;
                
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
                        button.classList.remove('loading');
                        button.classList.add('playing');
                    })
                    .catch(err => {
                        console.error('Error playing audio:', err);
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
            document.querySelectorAll('.play-button.loading').forEach(btn => {
                btn.classList.remove('loading');
            });
        }
    };
})();
