/**
 * Audio Player Module
 * Handles audio playback with waveform visualization and controls
 */

class AudioPlayer {
  constructor(audioElement, waveformCanvas) {
    this.audio = audioElement;
    this.canvas = waveformCanvas;
    this.ctx = waveformCanvas.getContext('2d');
    this.audioContext = null;
    this.analyser = null;
    this.dataArray = null;
    this.animationId = null;
    this.isPlaying = false;
    this.currentUrl = null;
  }

  /**
   * Load and prepare audio file for playback
   */
  async loadAudio(url) {
    try {
      // Clean up previous audio
      this.stop();

      this.currentUrl = url;
      
      // Add crossOrigin attribute to handle CORS
      this.audio.crossOrigin = 'anonymous';
      this.audio.src = url;

      // Wait for metadata to load
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Audio loading timeout'));
        }, 10000); // 10 second timeout

        this.audio.onloadedmetadata = () => {
          clearTimeout(timeout);
          resolve();
        };
        
        this.audio.onerror = (e) => {
          clearTimeout(timeout);
          console.error('Audio loading error:', e);
          reject(new Error('Failed to load audio file'));
        };
        
        // Start loading
        this.audio.load();
      });

      // Set up audio context for visualization only once
      if (!this.audioContext) {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        this.analyser = this.audioContext.createAnalyser();
        this.source = this.audioContext.createMediaElementSource(this.audio);
        this.source.connect(this.analyser);
        this.analyser.connect(this.audioContext.destination);
        this.analyser.fftSize = 256;

        const bufferLength = this.analyser.frequencyBinCount;
        this.dataArray = new Uint8Array(bufferLength);
      }
      
      // Resume audio context if suspended (required by browser autoplay policies)
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }

      return true;
    } catch (error) {
      console.error('Error loading audio:', error);
      throw new Error('Failed to load audio file: ' + error.message);
    }
  }

  /**
   * Play audio
   */
  async play() {
    try {
      // Resume audio context if suspended
      if (this.audioContext && this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }
      
      await this.audio.play();
      this.isPlaying = true;
      this.startVisualization();
      return true;
    } catch (error) {
      console.error('Error playing audio:', error);
      throw new Error('Failed to play audio: ' + error.message);
    }
  }

  /**
   * Pause audio
   */
  pause() {
    this.audio.pause();
    this.isPlaying = false;
    this.stopVisualization();
  }

  /**
   * Stop audio and reset
   */
  stop() {
    this.audio.pause();
    this.audio.currentTime = 0;
    this.isPlaying = false;
    this.stopVisualization();
    this.clearCanvas();
  }

  /**
   * Toggle play/pause
   */
  async togglePlayPause() {
    if (this.isPlaying) {
      this.pause();
    } else {
      await this.play();
    }
    return this.isPlaying;
  }

  /**
   * Seek to specific time
   */
  seekTo(time) {
    this.audio.currentTime = time;
  }

  /**
   * Seek by percentage (0-100)
   */
  seekToPercent(percent) {
    const time = (percent / 100) * this.audio.duration;
    this.seekTo(time);
  }

  /**
   * Set playback speed
   */
  setPlaybackRate(rate) {
    this.audio.playbackRate = rate;
  }

  /**
   * Set volume (0-100)
   */
  setVolume(volume) {
    this.audio.volume = Math.max(0, Math.min(100, volume)) / 100;
  }

  /**
   * Get current time in seconds
   */
  getCurrentTime() {
    return this.audio.currentTime;
  }

  /**
   * Get duration in seconds
   */
  getDuration() {
    return this.audio.duration || 0;
  }

  /**
   * Get current time as percentage
   */
  getCurrentPercent() {
    const duration = this.getDuration();
    if (duration === 0) return 0;
    return (this.getCurrentTime() / duration) * 100;
  }

  /**
   * Start waveform visualization
   */
  startVisualization() {
    if (!this.analyser || !this.canvas) return;

    const draw = () => {
      this.animationId = requestAnimationFrame(draw);
      this.drawWaveform();
    };

    draw();
  }

  /**
   * Stop visualization
   */
  stopVisualization() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  /**
   * Draw waveform visualization
   */
  drawWaveform() {
    if (!this.analyser || !this.canvas) return;

    const width = this.canvas.width;
    const height = this.canvas.height;

    this.analyser.getByteFrequencyData(this.dataArray);

    // Clear canvas
    this.ctx.fillStyle = getComputedStyle(document.documentElement)
      .getPropertyValue('--bg-secondary').trim();
    this.ctx.fillRect(0, 0, width, height);

    // Draw waveform bars
    const barWidth = (width / this.dataArray.length) * 2.5;
    let barHeight;
    let x = 0;

    const gradient = this.ctx.createLinearGradient(0, 0, width, 0);
    gradient.addColorStop(0, '#3b82f6');
    gradient.addColorStop(0.5, '#8b5cf6');
    gradient.addColorStop(1, '#ec4899');

    for (let i = 0; i < this.dataArray.length; i++) {
      barHeight = (this.dataArray[i] / 255) * height * 0.9;

      this.ctx.fillStyle = gradient;

      // Draw bar from center
      const centerY = height / 2;
      const halfBarHeight = barHeight / 2;

      this.ctx.fillRect(x, centerY - halfBarHeight, barWidth, barHeight);

      x += barWidth + 1;
    }

    // Draw progress indicator
    const progressX = (this.getCurrentPercent() / 100) * width;
    this.ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
    this.ctx.fillRect(0, 0, progressX, height);
  }

  /**
   * Clear canvas
   */
  clearCanvas() {
    if (!this.canvas) return;

    const width = this.canvas.width;
    const height = this.canvas.height;

    this.ctx.fillStyle = getComputedStyle(document.documentElement)
      .getPropertyValue('--bg-secondary').trim();
    this.ctx.fillRect(0, 0, width, height);
  }

  /**
   * Add event listener to audio element
   */
  on(event, callback) {
    this.audio.addEventListener(event, callback);
  }

  /**
   * Remove event listener from audio element
   */
  off(event, callback) {
    this.audio.removeEventListener(event, callback);
  }

  /**
   * Format time in MM:SS
   */
  static formatTime(seconds) {
    if (isNaN(seconds) || !isFinite(seconds)) {
      return '0:00';
    }

    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  /**
   * Clean up resources
   */
  cleanup() {
    this.stop();

    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close();
      this.audioContext = null;
    }

    this.source = null;
    this.analyser = null;
    this.dataArray = null;
    this.currentUrl = null;
  }
}

// Export for use in other modules
window.AudioPlayer = AudioPlayer;
