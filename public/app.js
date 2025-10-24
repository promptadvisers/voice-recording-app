/**
 * Main Application
 * Coordinates all modules and manages UI interactions
 */

// Initialize modules
const recorder = new AudioRecorder();
const uploader = new S3Uploader();
let player = null;

// DOM Elements
const recordButton = document.getElementById('recordButton');
const recordingStatus = document.getElementById('recordingStatus');
const recordingTime = document.getElementById('recordingTime');
const visualizerCanvas = document.getElementById('visualizer');
const uploadProgress = document.getElementById('uploadProgress');
const progressFill = document.getElementById('progressFill');
const progressText = document.getElementById('progressText');
const errorMessage = document.getElementById('errorMessage');
const recordingsList = document.getElementById('recordingsList');
const loadingSpinner = document.getElementById('loadingSpinner');
const emptyState = document.getElementById('emptyState');
const refreshButton = document.getElementById('refreshButton');
const themeToggle = document.getElementById('themeToggle');
const playerModal = document.getElementById('playerModal');
const deleteModal = document.getElementById('deleteModal');
const toast = document.getElementById('toast');

// Transcription Elements
const transcriptionSection = document.getElementById('transcriptionSection');
const transcriptionLoading = document.getElementById('transcriptionLoading');
const transcriptionText = document.getElementById('transcriptionText');
const transcriptionActions = document.getElementById('transcriptionActions');
const transcriptionTitle = document.getElementById('transcriptionTitle');
const transcriptionTitleText = transcriptionTitle ? transcriptionTitle.querySelector('.title-text') : null;
const copyTranscriptionBtn = document.getElementById('copyTranscriptionBtn');
const downloadTranscriptionBtn = document.getElementById('downloadTranscriptionBtn');

// State
let isRecording = false;
let recordingTimer = null;
let recordingStartTime = 0;
let deleteTarget = null;
let currentTranscription = null;
let currentRecordingUrl = null;
let currentRecordingTitle = null;
let originalRecordingFilename = null;
let aiTitleEnabled = true;

/**
 * Initialize application
 */
async function init() {
  // Check browser support
  if (!AudioRecorder.isSupported()) {
    showError('Your browser does not support audio recording. Please use a modern browser like Chrome, Firefox, or Edge.');
    recordButton.disabled = true;
    return;
  }

  // Set up event listeners
  setupEventListeners();

  // Load theme preference
  loadTheme();

  // Load recordings
  await loadRecordings();
}

/**
 * Set up event listeners
 */
function setupEventListeners() {
  // Record button
  recordButton.addEventListener('click', handleRecordButtonClick);

  // Theme toggle
  themeToggle.addEventListener('click', toggleTheme);

  // Refresh recordings
  refreshButton.addEventListener('click', loadRecordings);

  // Player modal controls
  document.getElementById('closePlayer').addEventListener('click', closePlayerModal);
  playerModal.addEventListener('click', (e) => {
    if (e.target === playerModal) {
      closePlayerModal();
    }
  });

  // Delete modal controls
  document.getElementById('cancelDelete').addEventListener('click', closeDeleteModal);
  document.getElementById('confirmDelete').addEventListener('click', confirmDelete);
  deleteModal.addEventListener('click', (e) => {
    if (e.target === deleteModal) {
      closeDeleteModal();
    }
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closePlayerModal();
      closeDeleteModal();
    }
  });
}

/**
 * Handle record button click
 */
async function handleRecordButtonClick() {
  if (isRecording) {
    await stopRecording();
  } else {
    await startRecording();
  }
}

/**
 * Start recording
 */
async function startRecording() {
  try {
    hideError();

    // Start recording
    await recorder.startRecording();

    // Update UI
    isRecording = true;
    recordButton.classList.add('recording');
    recordButton.querySelector('.mic-svg').style.display = 'none';
    recordButton.querySelector('.stop-svg').style.display = 'block';
    recordingStatus.textContent = 'Recording...';
    recordingStatus.style.color = 'var(--danger-color)';

    // Start visualization
    recorder.drawVisualization(visualizerCanvas);

    // Start timer
    recordingStartTime = Date.now();
    recordingTimer = setInterval(updateRecordingTime, 100);

  } catch (error) {
    console.error('Failed to start recording:', error);
    showError(error.message);
    resetRecordingUI();
  }
}

/**
 * Stop recording
 */
async function stopRecording() {
  try {
    // Stop recording
    const result = await recorder.stopRecording();

    // Clear timer
    if (recordingTimer) {
      clearInterval(recordingTimer);
      recordingTimer = null;
    }

    // Reset UI
    resetRecordingUI();
    recordingStatus.textContent = 'Processing...';

    // Generate filename
    const extension = recorder.getFileExtension(result.mimeType);
    const filename = AudioRecorder.generateFilename(extension);

    // Upload to S3
    await uploadRecording(result.blob, filename);

  } catch (error) {
    console.error('Failed to stop recording:', error);
    showError(error.message);
    resetRecordingUI();
  }
}

/**
 * Upload recording to S3
 */
async function uploadRecording(blob, filename) {
  try {
    // Show upload progress
    uploadProgress.style.display = 'block';
    recordingStatus.textContent = 'Uploading...';

    // Upload with progress tracking
    const result = await uploader.uploadRecording(blob, filename, (progress) => {
      progressFill.style.width = `${progress}%`;
      progressText.textContent = `Uploading... ${Math.round(progress)}%`;
    });

    // Success
    recordingStatus.textContent = 'Upload complete!';
    recordingStatus.style.color = 'var(--success-color)';
    progressText.textContent = 'Upload complete!';

    // Show success toast
    showToast(`Recording saved! <a href="${result.shareableUrl}" target="_blank" style="color: inherit; text-decoration: underline;">View</a>`, 'success');

    // Store recording metadata for transcription
    currentRecordingUrl = result.shareableUrl;
    originalRecordingFilename = result.filename;

    // Automatically transcribe the recording
    setTimeout(async () => {
      await transcribeRecording(result.shareableUrl);
      loadRecordings();
      resetUploadUI();
    }, 1500);

  } catch (error) {
    console.error('Upload failed:', error);
    showError(error.message);
    resetUploadUI();
  }
}

/**
 * Load recordings from server
 */
async function loadRecordings() {
  try {
    loadingSpinner.style.display = 'block';
    emptyState.style.display = 'none';

    // Remove existing recording items
    const existingItems = recordingsList.querySelectorAll('.recording-item');
    existingItems.forEach(item => item.remove());

    // Fetch recordings
    const recordings = await uploader.getRecordings();

    loadingSpinner.style.display = 'none';

    if (recordings.length === 0) {
      emptyState.style.display = 'block';
      return;
    }

    // Display recordings
    recordings.forEach(recording => {
      const item = createRecordingItem(recording);
      recordingsList.appendChild(item);
    });

  } catch (error) {
    console.error('Failed to load recordings:', error);
    loadingSpinner.style.display = 'none';
    showToast('Failed to load recordings', 'error');
  }
}

/**
 * Create recording list item element
 */
function createRecordingItem(recording) {
  const item = document.createElement('div');
  item.className = 'recording-item';

  item.innerHTML = `
    <div class="recording-info-group">
      <div class="recording-name">${recording.filename}</div>
      <div class="recording-meta">
        <span>${S3Uploader.formatFileSize(recording.size)}</span>
        <span>${S3Uploader.formatDate(recording.lastModified)}</span>
      </div>
    </div>
    <div class="recording-actions">
      <button class="icon-button play-btn" aria-label="Play recording" title="Play">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
          <polygon points="5 3 19 12 5 21 5 3"></polygon>
        </svg>
      </button>
      <button class="icon-button share-btn" aria-label="Copy share link" title="Copy link">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"></path>
          <polyline points="16 6 12 2 8 6"></polyline>
          <line x1="12" y1="2" x2="12" y2="15"></line>
        </svg>
      </button>
      <button class="icon-button delete-btn" aria-label="Delete recording" title="Delete">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="3 6 5 6 21 6"></polyline>
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
        </svg>
      </button>
    </div>
  `;

  // Add event listeners
  const playBtn = item.querySelector('.play-btn');
  const shareBtn = item.querySelector('.share-btn');
  const deleteBtn = item.querySelector('.delete-btn');

  playBtn.addEventListener('click', () => openPlayer(recording));
  shareBtn.addEventListener('click', () => copyShareLink(recording.url));
  deleteBtn.addEventListener('click', () => openDeleteModal(recording.filename));

  return item;
}

/**
 * Open audio player modal
 */
async function openPlayer(recording) {
  try {
    playerModal.style.display = 'flex';
    document.getElementById('playerTitle').textContent = recording.filename;

    // Initialize player if not already done
    if (!player) {
      const audioElement = document.getElementById('audioPlayer');
      const waveformCanvas = document.getElementById('waveform');
      player = new AudioPlayer(audioElement, waveformCanvas);

      setupPlayerControls();
    }

    // Reset play/pause button UI to play state
    const playPauseBtn = document.getElementById('playPauseButton');
    if (playPauseBtn) {
      const playIcon = playPauseBtn.querySelector('.play-icon');
      const pauseIcon = playPauseBtn.querySelector('.pause-icon');
      if (playIcon && pauseIcon) {
        playIcon.style.display = 'block';
        pauseIcon.style.display = 'none';
      }
    }

    // Load audio (but don't auto-play - let user click play button)
    await player.loadAudio(recording.url);
    
    showToast('Audio loaded - click play to start', 'success');

  } catch (error) {
    console.error('Failed to open player:', error);
    showToast('Failed to load audio: ' + error.message, 'error');
    closePlayerModal();
  }
}

/**
 * Set up player controls
 */
function setupPlayerControls() {
  const playPauseBtn = document.getElementById('playPauseButton');
  const seekBar = document.getElementById('seekBar');
  const speedControl = document.getElementById('speedControl');
  const volumeControl = document.getElementById('volumeControl');
  const currentTimeDisplay = document.getElementById('currentTime');
  const durationDisplay = document.getElementById('duration');
  const playIcon = playPauseBtn.querySelector('.play-icon');
  const pauseIcon = playPauseBtn.querySelector('.pause-icon');

  // Play/Pause button
  playPauseBtn.addEventListener('click', async () => {
    const isPlaying = await player.togglePlayPause();
    playIcon.style.display = isPlaying ? 'none' : 'block';
    pauseIcon.style.display = isPlaying ? 'block' : 'none';
  });

  // Seek bar
  seekBar.addEventListener('input', (e) => {
    player.seekToPercent(e.target.value);
  });

  // Speed control
  speedControl.addEventListener('change', (e) => {
    player.setPlaybackRate(parseFloat(e.target.value));
  });

  // Volume control
  volumeControl.addEventListener('input', (e) => {
    player.setVolume(e.target.value);
  });

  // Time updates
  player.on('timeupdate', () => {
    currentTimeDisplay.textContent = AudioPlayer.formatTime(player.getCurrentTime());
    seekBar.value = player.getCurrentPercent();
  });

  player.on('loadedmetadata', () => {
    durationDisplay.textContent = AudioPlayer.formatTime(player.getDuration());
  });

  player.on('ended', () => {
    playIcon.style.display = 'block';
    pauseIcon.style.display = 'none';
  });
}

/**
 * Close player modal
 */
function closePlayerModal() {
  if (player) {
    player.stop();
    const playIcon = document.querySelector('.play-icon');
    const pauseIcon = document.querySelector('.pause-icon');
    playIcon.style.display = 'block';
    pauseIcon.style.display = 'none';
  }
  playerModal.style.display = 'none';
}

/**
 * Copy share link to clipboard
 */
async function copyShareLink(url) {
  const success = await S3Uploader.copyToClipboard(url);

  if (success) {
    showToast('Link copied to clipboard!', 'success');
  } else {
    showToast('Failed to copy link', 'error');
  }
}

/**
 * Open delete confirmation modal
 */
function openDeleteModal(filename) {
  deleteTarget = filename;
  deleteModal.style.display = 'flex';
}

/**
 * Close delete modal
 */
function closeDeleteModal() {
  deleteTarget = null;
  deleteModal.style.display = 'none';
}

/**
 * Confirm delete recording
 */
async function confirmDelete() {
  if (!deleteTarget) return;

  try {
    await uploader.deleteRecording(deleteTarget);
    showToast('Recording deleted', 'success');
    closeDeleteModal();
    await loadRecordings();
  } catch (error) {
    console.error('Failed to delete recording:', error);
    showToast('Failed to delete recording', 'error');
  }
}

/**
 * Update recording time display
 */
function updateRecordingTime() {
  const elapsed = Date.now() - recordingStartTime;
  recordingTime.textContent = AudioRecorder.formatTime(elapsed);
}

/**
 * Reset recording UI
 */
function resetRecordingUI() {
  isRecording = false;
  recordButton.classList.remove('recording');
  recordButton.querySelector('.mic-svg').style.display = 'block';
  recordButton.querySelector('.stop-svg').style.display = 'none';
  recordingStatus.textContent = 'Ready to record';
  recordingStatus.style.color = 'var(--text-primary)';
  recordingTime.textContent = '00:00';

  // Clear visualizer
  const ctx = visualizerCanvas.getContext('2d');
  ctx.fillStyle = getComputedStyle(document.documentElement)
    .getPropertyValue('--bg-secondary').trim();
  ctx.fillRect(0, 0, visualizerCanvas.width, visualizerCanvas.height);
}

/**
 * Reset upload UI
 */
function resetUploadUI() {
  uploadProgress.style.display = 'none';
  progressFill.style.width = '0%';
  progressText.textContent = 'Uploading... 0%';
  recordingStatus.textContent = 'Ready to record';
  recordingStatus.style.color = 'var(--text-primary)';
}

/**
 * Show error message
 */
function showError(message) {
  errorMessage.textContent = message;
  errorMessage.style.display = 'block';
}

/**
 * Hide error message
 */
function hideError() {
  errorMessage.style.display = 'none';
  errorMessage.textContent = '';
}

/**
 * Show toast notification
 */
function showToast(message, type = 'success') {
  toast.innerHTML = message;
  toast.className = `toast ${type}`;
  toast.style.display = 'block';

  setTimeout(() => {
    toast.style.display = 'none';
  }, 4000);
}

/**
 * Toggle theme
 */
function toggleTheme() {
  const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
  const newTheme = currentTheme === 'light' ? 'dark' : 'light';

  document.documentElement.setAttribute('data-theme', newTheme);
  localStorage.setItem('theme', newTheme);
}

/**
 * Load theme from localStorage
 */
function loadTheme() {
  const savedTheme = localStorage.getItem('theme') || 'light';
  document.documentElement.setAttribute('data-theme', savedTheme);
}

/**
 * Transcribe recording using OpenAI Whisper
 */
async function transcribeRecording(fileUrl) {
  try {
    // Show transcription section with loading state
    transcriptionSection.classList.add('show');
    transcriptionLoading.style.display = 'flex';
    transcriptionText.style.display = 'none';
    transcriptionActions.style.display = 'none';
    if (transcriptionTitle) {
      transcriptionTitle.style.display = 'none';
      if (transcriptionTitleText) {
        transcriptionTitleText.textContent = '';
      }
    }

    // Call transcription API
    const response = await fetch('/api/transcribe', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ fileUrl })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Transcription failed');
    }

    const result = await response.json();
    currentTranscription = result.transcription;
    currentRecordingTitle = result.title || null;

    if (result.shareableUrl) {
      currentRecordingUrl = result.shareableUrl;
    }

    if (result.filename) {
      originalRecordingFilename = result.filename;
    }

    // Display transcription
    transcriptionLoading.style.display = 'none';
    transcriptionText.style.display = 'block';
    transcriptionText.textContent = result.transcription;
    transcriptionActions.style.display = 'flex';

    if (transcriptionTitle && transcriptionTitleText) {
      if (currentRecordingTitle) {
        transcriptionTitleText.textContent = currentRecordingTitle;
        transcriptionTitle.style.display = 'inline-flex';
      } else {
        transcriptionTitle.style.display = 'none';
      }
    }

    showToast('Transcription complete!', 'success');

  } catch (error) {
    console.error('Transcription error:', error);
    transcriptionLoading.style.display = 'none';
    transcriptionText.style.display = 'block';
    transcriptionText.innerHTML = `
      <div style="color: var(--danger-color); text-align: center;">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin: 0 auto 12px;">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="8" x2="12" y2="12"></line>
          <line x1="12" y1="16" x2="12.01" y2="16"></line>
        </svg>
        <div style="font-weight: 600; margin-bottom: 8px;">Transcription Failed</div>
        <div style="font-size: 0.875rem; color: var(--text-secondary);">${error.message}</div>
        ${error.message.includes('OpenAI API key') ? '<div style="margin-top: 12px; font-size: 0.875rem; color: var(--text-secondary);">Please set the OPENAI_API_KEY environment variable and restart the server.</div>' : ''}
      </div>
    `;

    if (transcriptionTitle) {
      transcriptionTitle.style.display = 'none';
      if (transcriptionTitleText) {
        transcriptionTitleText.textContent = '';
      }
    }
  }
}

/**
 * Copy transcription to clipboard
 */
async function copyTranscription() {
  if (!currentTranscription) return;

  const success = await S3Uploader.copyToClipboard(currentTranscription);
  if (success) {
    showToast('Transcription copied to clipboard!', 'success');
  } else {
    showToast('Failed to copy transcription', 'error');
  }
}

/**
 * Download transcription as text file
 */
function downloadTranscription() {
  if (!currentTranscription) return;

  const blob = new Blob([currentTranscription], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const filename = `transcription_${new Date().toISOString().replace(/[:.]/g, '-')}.txt`;

  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  showToast('Transcription downloaded!', 'success');
}

/**
 * Set up event listeners for transcription buttons
 */
function setupTranscriptionListeners() {
  if (copyTranscriptionBtn) {
    copyTranscriptionBtn.addEventListener('click', copyTranscription);
  }

  if (downloadTranscriptionBtn) {
    downloadTranscriptionBtn.addEventListener('click', downloadTranscription);
  }
}

// Initialize app when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    init();
    setupTranscriptionListeners();
  });
} else {
  init();
  setupTranscriptionListeners();
}
