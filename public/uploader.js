/**
 * S3 Uploader Module
 * Handles uploading audio files to AWS S3 with progress tracking
 */

class S3Uploader {
  constructor(apiBaseUrl = '/api') {
    this.apiBaseUrl = apiBaseUrl;
    this.uploadInProgress = false;
    this.abortController = null;
  }

  /**
   * Upload audio blob to S3
   * @param {Blob} audioBlob - The audio file to upload
   * @param {string} filename - The filename for the recording
   * @param {Function} onProgress - Progress callback (percentage)
   * @returns {Promise<Object>} Upload result with shareable URL
   */
  async uploadRecording(audioBlob, filename, onProgress = null) {
    if (this.uploadInProgress) {
      throw new Error('Upload already in progress');
    }

    this.uploadInProgress = true;
    this.abortController = new AbortController();

    try {
      // Step 1: Get presigned upload URL from server
      const uploadUrlData = await this.getUploadUrl(filename, audioBlob.type);

      // Step 2: Upload to S3 using presigned URL
      await this.uploadToS3(
        uploadUrlData.uploadUrl,
        audioBlob,
        onProgress,
        this.abortController.signal
      );

      // Step 3: Move file to shared folder and get shareable URL
      const result = await this.moveToShared(uploadUrlData.filename);

      this.uploadInProgress = false;
      return result;
    } catch (error) {
      this.uploadInProgress = false;

      if (error.name === 'AbortError') {
        throw new Error('Upload cancelled');
      }

      console.error('Upload error:', error);
      throw new Error(this.getErrorMessage(error));
    }
  }

  /**
   * Get presigned upload URL from backend
   */
  async getUploadUrl(filename, contentType) {
    try {
      const response = await fetch(`${this.apiBaseUrl}/get-upload-url`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          filename: filename,
          contentType: contentType
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Server error: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error getting upload URL:', error);
      throw error;
    }
  }

  /**
   * Upload file to S3 using presigned URL
   */
  async uploadToS3(presignedUrl, blob, onProgress, signal) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      // Track upload progress
      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable && onProgress) {
          const percentComplete = (event.loaded / event.total) * 100;
          onProgress(percentComplete);
        }
      });

      // Handle completion
      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve();
        } else {
          reject(new Error(`Upload failed with status ${xhr.status}`));
        }
      });

      // Handle errors
      xhr.addEventListener('error', () => {
        reject(new Error('Network error during upload'));
      });

      xhr.addEventListener('abort', () => {
        reject(new Error('Upload cancelled'));
      });

      // Support abort signal
      if (signal) {
        signal.addEventListener('abort', () => {
          xhr.abort();
        });
      }

      // Send the request
      xhr.open('PUT', presignedUrl);
      xhr.setRequestHeader('Content-Type', blob.type);
      xhr.send(blob);
    });
  }

  /**
   * Move file from uploads/ to shared/ folder
   */
  async moveToShared(filename) {
    try {
      const response = await fetch(`${this.apiBaseUrl}/move-to-shared`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ filename })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to finalize upload: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error moving to shared:', error);
      throw error;
    }
  }

  /**
   * Get list of recordings from server
   */
  async getRecordings() {
    try {
      const response = await fetch(`${this.apiBaseUrl}/recordings`);

      if (!response.ok) {
        throw new Error(`Failed to fetch recordings: ${response.status}`);
      }

      const data = await response.json();
      return data.recordings || [];
    } catch (error) {
      console.error('Error fetching recordings:', error);
      throw error;
    }
  }

  /**
   * Delete a recording
   */
  async deleteRecording(filename) {
    try {
      const response = await fetch(`${this.apiBaseUrl}/recordings/${encodeURIComponent(filename)}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to delete recording: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error deleting recording:', error);
      throw error;
    }
  }

  /**
   * Cancel ongoing upload
   */
  cancelUpload() {
    if (this.abortController) {
      this.abortController.abort();
      this.uploadInProgress = false;
    }
  }

  /**
   * Check if upload is in progress
   */
  isUploading() {
    return this.uploadInProgress;
  }

  /**
   * Get user-friendly error message
   */
  getErrorMessage(error) {
    const message = error.message || String(error);

    if (message.includes('NetworkError') || message.includes('Network error')) {
      return 'Network error. Please check your internet connection and try again.';
    } else if (message.includes('timeout')) {
      return 'Upload timed out. Please try again.';
    } else if (message.includes('403') || message.includes('Forbidden')) {
      return 'Access denied. Please check your AWS credentials.';
    } else if (message.includes('404') || message.includes('Not Found')) {
      return 'Server endpoint not found. Please check your server configuration.';
    } else if (message.includes('500') || message.includes('Server error')) {
      return 'Server error. Please try again later.';
    } else if (message.includes('cancelled') || message.includes('abort')) {
      return 'Upload cancelled.';
    }

    return message || 'Upload failed. Please try again.';
  }

  /**
   * Format file size for display
   */
  static formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  }

  /**
   * Format date for display
   */
  static formatDate(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) {
      return 'Just now';
    } else if (diffMins < 60) {
      return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
    } else if (diffHours < 24) {
      return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    } else if (diffDays < 7) {
      return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    } else {
      return date.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    }
  }

  /**
   * Copy text to clipboard
   */
  static async copyToClipboard(text) {
    try {
      // On mobile browsers, especially in non-HTTPS contexts, always use fallback
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      const isHTTPS = window.location.protocol === 'https:';

      // Try modern Clipboard API first (only on HTTPS or localhost)
      if (!isMobile && navigator.clipboard && navigator.clipboard.writeText && (isHTTPS || window.location.hostname === 'localhost')) {
        try {
          await navigator.clipboard.writeText(text);
          return true;
        } catch (clipError) {
          console.log('Clipboard API failed, using fallback:', clipError);
          return S3Uploader.fallbackCopyToClipboard(text);
        }
      }

      // Fallback for browsers that don't support Clipboard API
      // This is more reliable on mobile browsers
      return S3Uploader.fallbackCopyToClipboard(text);
    } catch (error) {
      console.error('Copy to clipboard failed:', error);
      // If modern API fails (common on mobile), try fallback
      return S3Uploader.fallbackCopyToClipboard(text);
    }
  }

  /**
   * Fallback method to copy text to clipboard
   * Works better on mobile browsers
   */
  static fallbackCopyToClipboard(text) {
    try {
      // Create a temporary textarea element
      const textarea = document.createElement('textarea');
      textarea.value = text;

      // Make it invisible but ensure it's in the viewport for mobile
      textarea.style.position = 'fixed';
      textarea.style.top = '0';
      textarea.style.left = '0';
      textarea.style.width = '2em';
      textarea.style.height = '2em';
      textarea.style.padding = '0';
      textarea.style.border = 'none';
      textarea.style.outline = 'none';
      textarea.style.boxShadow = 'none';
      textarea.style.background = 'transparent';
      textarea.style.opacity = '0';

      // Prevent zoom on iOS
      textarea.style.fontSize = '16px';

      document.body.appendChild(textarea);

      // Select the text - mobile-optimized
      textarea.focus();

      // For iOS and mobile devices - enhanced selection
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

      if (isMobile) {
        // Make readonly to prevent keyboard on mobile
        textarea.setAttribute('readonly', '');
        // iOS specific selection
        const range = document.createRange();
        range.selectNodeContents(textarea);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        textarea.setSelectionRange(0, text.length);
      } else {
        textarea.select();
      }

      // Execute copy command
      let success = false;
      try {
        success = document.execCommand('copy');
      } catch (execError) {
        console.error('execCommand failed:', execError);
      }

      // Clean up
      document.body.removeChild(textarea);

      return success;
    } catch (error) {
      console.error('Fallback copy failed:', error);
      return false;
    }
  }

  /**
   * Download file from URL
   */
  static downloadFile(url, filename) {
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}

// Export for use in other modules
window.S3Uploader = S3Uploader;
