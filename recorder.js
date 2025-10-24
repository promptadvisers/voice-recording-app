/**
 * Audio Recorder Module
 * Handles MediaRecorder API for recording audio with visualization
 */

class AudioRecorder {
  constructor() {
    this.mediaRecorder = null;
    this.audioChunks = [];
    this.stream = null;
    this.audioContext = null;
    this.analyser = null;
    this.dataArray = null;
    this.animationId = null;
    this.startTime = null;
    this.timerInterval = null;
  }

  /**
   * Initialize and start recording
   */
  async startRecording() {
    try {
      // Request microphone permission
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 44100
        }
      });

      // Set up audio context for visualization
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      this.analyser = this.audioContext.createAnalyser();
      const source = this.audioContext.createMediaStreamSource(this.stream);
      source.connect(this.analyser);
      this.analyser.fftSize = 256;

      const bufferLength = this.analyser.frequencyBinCount;
      this.dataArray = new Uint8Array(bufferLength);

      // Configure MediaRecorder with optimal settings
      const options = {
        mimeType: this.getSupportedMimeType(),
        audioBitsPerSecond: 128000 // 128kbps for good quality
      };

      this.mediaRecorder = new MediaRecorder(this.stream, options);
      this.audioChunks = [];

      // Handle data availability
      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };

      // Start recording
      this.mediaRecorder.start(1000); // Collect data every second
      this.startTime = Date.now();

      return true;
    } catch (error) {
      console.error('Error starting recording:', error);
      throw new Error(this.getErrorMessage(error));
    }
  }

  /**
   * Stop recording and return audio blob
   */
  async stopRecording() {
    return new Promise((resolve, reject) => {
      if (!this.mediaRecorder || this.mediaRecorder.state === 'inactive') {
        reject(new Error('No active recording'));
        return;
      }

      this.mediaRecorder.onstop = () => {
        try {
          const mimeType = this.mediaRecorder.mimeType;
          const audioBlob = new Blob(this.audioChunks, { type: mimeType });

          // Clean up
          this.cleanup();

          resolve({
            blob: audioBlob,
            duration: Date.now() - this.startTime,
            mimeType: mimeType
          });
        } catch (error) {
          reject(error);
        }
      };

      this.mediaRecorder.onerror = (error) => {
        this.cleanup();
        reject(error);
      };

      this.mediaRecorder.stop();
    });
  }

  /**
   * Get supported MIME type for recording
   */
  getSupportedMimeType() {
    const types = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/ogg;codecs=opus',
      'audio/mp4'
    ];

    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) {
        return type;
      }
    }

    return 'audio/webm'; // fallback
  }

  /**
   * Get file extension based on MIME type
   */
  getFileExtension(mimeType) {
    const mimeToExt = {
      'audio/webm': '.webm',
      'audio/webm;codecs=opus': '.webm',
      'audio/ogg': '.ogg',
      'audio/ogg;codecs=opus': '.ogg',
      'audio/mp4': '.m4a'
    };

    return mimeToExt[mimeType] || '.webm';
  }

  /**
   * Draw audio visualization on canvas
   */
  drawVisualization(canvas) {
    if (!this.analyser || !canvas) return;

    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    const draw = () => {
      this.animationId = requestAnimationFrame(draw);

      this.analyser.getByteFrequencyData(this.dataArray);

      // Clear canvas
      ctx.fillStyle = getComputedStyle(document.documentElement)
        .getPropertyValue('--bg-secondary').trim();
      ctx.fillRect(0, 0, width, height);

      // Draw bars
      const barWidth = (width / this.dataArray.length) * 2.5;
      let barHeight;
      let x = 0;

      const gradient = ctx.createLinearGradient(0, 0, width, 0);
      gradient.addColorStop(0, '#3b82f6');
      gradient.addColorStop(1, '#10b981');

      for (let i = 0; i < this.dataArray.length; i++) {
        barHeight = (this.dataArray[i] / 255) * height * 0.8;

        ctx.fillStyle = gradient;
        ctx.fillRect(x, height - barHeight, barWidth, barHeight);

        x += barWidth + 1;
      }
    };

    draw();
  }

  /**
   * Stop visualization animation
   */
  stopVisualization() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  /**
   * Get recording state
   */
  isRecording() {
    return this.mediaRecorder && this.mediaRecorder.state === 'recording';
  }

  /**
   * Clean up resources
   */
  cleanup() {
    this.stopVisualization();

    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }

    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close();
      this.audioContext = null;
    }

    this.analyser = null;
    this.dataArray = null;
    this.mediaRecorder = null;
  }

  /**
   * Get user-friendly error message
   */
  getErrorMessage(error) {
    if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
      return 'Microphone permission denied. Please allow microphone access to record audio.';
    } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
      return 'No microphone found. Please connect a microphone and try again.';
    } else if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
      return 'Microphone is already in use by another application.';
    } else if (error.name === 'OverconstrainedError') {
      return 'Could not satisfy audio constraints. Please try again.';
    } else if (error.name === 'SecurityError') {
      return 'Recording is not allowed on this page due to security restrictions.';
    }
    return `Recording error: ${error.message}`;
  }

  /**
   * Format time in MM:SS
   */
  static formatTime(milliseconds) {
    const totalSeconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }

  /**
   * Generate filename with timestamp
   */
  static generateFilename(extension = '.webm') {
    const now = new Date();
    const timestamp = now.toISOString()
      .replace(/[:.]/g, '-')
      .replace('T', '_')
      .split('.')[0];
    return `recording_${timestamp}${extension}`;
  }

  /**
   * Check if browser supports audio recording
   */
  static isSupported() {
    return !!(navigator.mediaDevices &&
              navigator.mediaDevices.getUserMedia &&
              window.MediaRecorder);
  }
}

// Export for use in other modules
window.AudioRecorder = AudioRecorder;
