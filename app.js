/**
 * Main Application - WITH FOLDER HIERARCHY v2025-10-26
 * Coordinates all modules and manages UI interactions
 */

// Initialize modules
const recorder = new AudioRecorder();
const uploader = new S3Uploader();
let player = null;

console.log('🚀 NEW CODE LOADED - FOLDER HIERARCHY VERSION - 2025-10-26 16:57');

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
const searchInput = document.getElementById('searchInput');
const clearSearchBtn = document.getElementById('clearSearchBtn');
const collapseAllBtn = document.getElementById('collapseAllBtn');

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

// Folder organization state
let allRecordings = [];
let expandedFolders = new Set();
let isSearchMode = false;
let searchQuery = '';
let transcriptionCache = new Map(); // Cache for transcriptions

/**
 * Date organization utilities
 */

// Get calendar week bounds (Sunday to Saturday)
function getCalendarWeekBounds(date) {
  const d = new Date(date);
  const day = d.getDay(); // 0 = Sunday

  // Start of week (Sunday)
  const weekStart = new Date(d);
  weekStart.setDate(d.getDate() - day);
  weekStart.setHours(0, 0, 0, 0);

  // End of week (Saturday)
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);

  return { start: weekStart, end: weekEnd };
}

// Format date labels
function getYearLabel(date) {
  return new Date(date).getFullYear().toString();
}

function getMonthLabel(date) {
  const d = new Date(date);
  const monthName = d.toLocaleDateString('en-US', { month: 'long' });
  const year = d.getFullYear();
  return `${monthName} ${year}`;
}

function getWeekLabel(date) {
  const { start, end } = getCalendarWeekBounds(date);
  const startMonth = start.toLocaleDateString('en-US', { month: 'short' });
  const endMonth = end.toLocaleDateString('en-US', { month: 'short' });
  const startDay = start.getDate();
  const endDay = end.getDate();
  const year = start.getFullYear();

  if (startMonth === endMonth) {
    return `Week of ${startMonth} ${startDay}-${endDay}, ${year}`;
  } else {
    return `Week of ${startMonth} ${startDay}-${endMonth} ${endDay}, ${year}`;
  }
}

function getDayLabel(date) {
  const d = new Date(date);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  // Reset time parts for comparison
  d.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);
  yesterday.setHours(0, 0, 0, 0);

  if (d.getTime() === today.getTime()) {
    return 'Today';
  } else if (d.getTime() === yesterday.getTime()) {
    return 'Yesterday';
  } else {
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }
}

// Get unique key for each hierarchy level
function getYearKey(date) {
  return `year-${getYearLabel(date)}`;
}

function getMonthKey(date) {
  const d = new Date(date);
  return `month-${d.getFullYear()}-${d.getMonth()}`;
}

function getWeekKey(date) {
  const { start } = getCalendarWeekBounds(date);
  return `week-${start.getTime()}`;
}

function getDayKey(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return `day-${d.getTime()}`;
}

/**
 * Organize recordings into hierarchical date structure
 */
function organizeRecordingsByDate(recordings) {
  const hierarchy = {};

  recordings.forEach(recording => {
    const date = new Date(recording.lastModified);

    const yearLabel = getYearLabel(date);
    const monthLabel = getMonthLabel(date);
    const weekLabel = getWeekLabel(date);
    const dayLabel = getDayLabel(date);

    const yearKey = getYearKey(date);
    const monthKey = getMonthKey(date);
    const weekKey = getWeekKey(date);
    const dayKey = getDayKey(date);

    // Build nested structure
    if (!hierarchy[yearKey]) {
      hierarchy[yearKey] = {
        label: yearLabel,
        key: yearKey,
        months: {}
      };
    }

    if (!hierarchy[yearKey].months[monthKey]) {
      hierarchy[yearKey].months[monthKey] = {
        label: monthLabel,
        key: monthKey,
        weeks: {}
      };
    }

    if (!hierarchy[yearKey].months[monthKey].weeks[weekKey]) {
      hierarchy[yearKey].months[monthKey].weeks[weekKey] = {
        label: weekLabel,
        key: weekKey,
        days: {}
      };
    }

    if (!hierarchy[yearKey].months[monthKey].weeks[weekKey].days[dayKey]) {
      hierarchy[yearKey].months[monthKey].weeks[weekKey].days[dayKey] = {
        label: dayLabel,
        key: dayKey,
        recordings: []
      };
    }

    hierarchy[yearKey].months[monthKey].weeks[weekKey].days[dayKey].recordings.push(recording);
  });

  return hierarchy;
}

/**
 * Count recordings in a hierarchy node
 */
function countRecordings(node) {
  if (Array.isArray(node)) {
    return node.length;
  }

  if (node.recordings) {
    return node.recordings.length;
  }

  let count = 0;

  if (node.days) {
    Object.values(node.days).forEach(day => {
      count += countRecordings(day);
    });
  } else if (node.weeks) {
    Object.values(node.weeks).forEach(week => {
      count += countRecordings(week);
    });
  } else if (node.months) {
    Object.values(node.months).forEach(month => {
      count += countRecordings(month);
    });
  }

  return count;
}

/**
 * Find the most recent day with recordings
 */
function findMostRecentDay(hierarchy) {
  let mostRecentDate = null;
  let mostRecentPath = [];

  Object.values(hierarchy).forEach(year => {
    Object.values(year.months).forEach(month => {
      Object.values(month.weeks).forEach(week => {
        Object.values(week.days).forEach(day => {
          if (day.recordings && day.recordings.length > 0) {
            const firstRecording = day.recordings[0];
            const recordingDate = new Date(firstRecording.lastModified);

            if (!mostRecentDate || recordingDate > mostRecentDate) {
              mostRecentDate = recordingDate;
              mostRecentPath = [year.key, month.key, week.key, day.key];
            }
          }
        });
      });
    });
  });

  return mostRecentPath;
}

/**
 * Initialize default expanded folders (most recent day + its parent week)
 */
function initializeDefaultExpandedFolders(hierarchy) {
  const mostRecentPath = findMostRecentDay(hierarchy);

  if (mostRecentPath.length === 4) {
    const [yearKey, monthKey, weekKey, dayKey] = mostRecentPath;
    expandedFolders.add(yearKey);
    expandedFolders.add(monthKey);
    expandedFolders.add(weekKey);
    expandedFolders.add(dayKey);
  }
}

/**
 * Initialize application
 */
async function init() {
  console.log('[DEBUG] ========== INITIALIZING APP WITH FOLDER HIERARCHY ==========');

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
  console.log('[DEBUG] About to call loadRecordings()...');
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

  // Search input
  if (searchInput) {
    searchInput.addEventListener('input', handleSearch);
  }

  // Clear search button
  if (clearSearchBtn) {
    clearSearchBtn.addEventListener('click', clearSearch);
  }

  // Collapse all button
  if (collapseAllBtn) {
    collapseAllBtn.addEventListener('click', collapseAll);
  }

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

    // Remove existing recording items and folders
    const existingItems = recordingsList.querySelectorAll('.recording-item, .folder-item');
    existingItems.forEach(item => item.remove());

    // Fetch recordings
    const recordings = await uploader.getRecordings();
    allRecordings = recordings;

    loadingSpinner.style.display = 'none';

    if (recordings.length === 0) {
      emptyState.style.display = 'block';
      return;
    }

    // If in search mode, render search results
    if (isSearchMode) {
      renderSearchResults(recordings);
      return;
    }

    // Organize and render hierarchy
    console.log('[DEBUG] Organizing recordings into hierarchy, count:', recordings.length);
    const hierarchy = organizeRecordingsByDate(recordings);
    console.log('[DEBUG] Hierarchy created:', hierarchy);

    // Initialize default expanded folders on first load
    if (expandedFolders.size === 0) {
      initializeDefaultExpandedFolders(hierarchy);
      console.log('[DEBUG] Expanded folders initialized:', expandedFolders);
    }

    console.log('[DEBUG] Rendering hierarchy...');
    renderHierarchy(hierarchy);
    console.log('[DEBUG] Hierarchy rendering complete');

  } catch (error) {
    console.error('Failed to load recordings:', error);
    loadingSpinner.style.display = 'none';
    showToast('Failed to load recordings', 'error');
  }
}

/**
 * Render hierarchical folder structure
 */
function renderHierarchy(hierarchy) {
  // Sort years in descending order (most recent first)
  const years = Object.values(hierarchy).sort((a, b) => b.label.localeCompare(a.label));

  years.forEach(year => {
    const yearElement = createFolderItem(year.key, year.label, 'year', null);
    recordingsList.appendChild(yearElement);

    const yearContainer = yearElement.querySelector('.folder-children');

    // Sort months in descending order (most recent first)
    const months = Object.values(year.months).sort((a, b) => {
      const [monthA, yearA] = [a.label.split(' ')[0], a.label.split(' ')[1]];
      const [monthB, yearB] = [b.label.split(' ')[0], b.label.split(' ')[1]];
      const dateA = new Date(`${monthA} 1, ${yearA}`);
      const dateB = new Date(`${monthB} 1, ${yearB}`);
      return dateB - dateA;
    });

    months.forEach(month => {
      const monthElement = createFolderItem(month.key, month.label, 'month', null);
      yearContainer.appendChild(monthElement);

      const monthContainer = monthElement.querySelector('.folder-children');

      // Sort weeks in descending order (most recent first)
      const weeks = Object.values(month.weeks).sort((a, b) => {
        const weekAKey = parseInt(a.key.split('-')[1]);
        const weekBKey = parseInt(b.key.split('-')[1]);
        return weekBKey - weekAKey;
      });

      weeks.forEach(week => {
        const weekCount = countRecordings(week);
        const weekElement = createFolderItem(week.key, week.label, 'week', weekCount);
        monthContainer.appendChild(weekElement);

        const weekContainer = weekElement.querySelector('.folder-children');

        // Sort days in descending order (most recent first)
        const days = Object.values(week.days).sort((a, b) => {
          const dayAKey = parseInt(a.key.split('-')[1]);
          const dayBKey = parseInt(b.key.split('-')[1]);
          return dayBKey - dayAKey;
        });

        days.forEach(day => {
          const dayCount = day.recordings.length;
          const dayElement = createFolderItem(day.key, day.label, 'day', dayCount);
          weekContainer.appendChild(dayElement);

          const dayContainer = dayElement.querySelector('.folder-children');

          // Add recordings to day
          day.recordings.forEach(recording => {
            const recordingItem = createRecordingItem(recording);
            dayContainer.appendChild(recordingItem);
          });
        });
      });
    });
  });
}

/**
 * Create folder item element
 */
function createFolderItem(key, label, level, count) {
  const isExpanded = expandedFolders.has(key);
  const folderItem = document.createElement('div');
  folderItem.className = `folder-item ${level}-folder`;
  folderItem.setAttribute('data-level', level);
  folderItem.setAttribute('data-key', key);

  const countBadge = count !== null ? `<span class="recording-count">(${count})</span>` : '';
  const arrowIcon = isExpanded ? '▼' : '▶';

  folderItem.innerHTML = `
    <button class="folder-toggle ${isExpanded ? 'expanded' : 'collapsed'}" data-key="${key}">
      <span class="folder-icon">${arrowIcon}</span>
      <span class="folder-label">${label}</span>
      ${countBadge}
    </button>
    <div class="folder-children" style="display: ${isExpanded ? 'block' : 'none'};"></div>
  `;

  // Add toggle event listener
  const toggleButton = folderItem.querySelector('.folder-toggle');
  toggleButton.addEventListener('click', () => toggleFolder(key));

  return folderItem;
}

/**
 * Toggle folder expand/collapse
 */
function toggleFolder(folderKey) {
  const folderItem = document.querySelector(`.folder-item[data-key="${folderKey}"]`);
  if (!folderItem) return;

  const toggleButton = folderItem.querySelector('.folder-toggle');
  const childrenContainer = folderItem.querySelector('.folder-children');
  const folderIcon = toggleButton.querySelector('.folder-icon');

  if (expandedFolders.has(folderKey)) {
    // Collapse
    expandedFolders.delete(folderKey);
    toggleButton.classList.remove('expanded');
    toggleButton.classList.add('collapsed');
    childrenContainer.style.display = 'none';
    folderIcon.textContent = '▶';
  } else {
    // Expand
    expandedFolders.add(folderKey);
    toggleButton.classList.remove('collapsed');
    toggleButton.classList.add('expanded');
    childrenContainer.style.display = 'block';
    folderIcon.textContent = '▼';
  }
}

/**
 * Collapse all folders
 */
function collapseAll() {
  // Clear all expanded folders
  expandedFolders.clear();

  // Collapse all folder items in the DOM
  const allFolders = document.querySelectorAll('.folder-item');
  allFolders.forEach(folderItem => {
    const toggleButton = folderItem.querySelector('.folder-toggle');
    const childrenContainer = folderItem.querySelector('.folder-children');
    const folderIcon = toggleButton.querySelector('.folder-icon');

    toggleButton.classList.remove('expanded');
    toggleButton.classList.add('collapsed');
    childrenContainer.style.display = 'none';
    folderIcon.textContent = '▶';
  });

  showToast('All folders collapsed', 'success');
}

/**
 * Render search results (flat list)
 */
function renderSearchResults(recordings) {
  if (recordings.length === 0) {
    const noResults = document.createElement('div');
    noResults.className = 'empty-state';
    noResults.innerHTML = `
      <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="11" cy="11" r="8"></circle>
        <path d="m21 21-4.35-4.35"></path>
      </svg>
      <p>No recordings found</p>
      <p class="empty-state-subtitle">Try a different search term</p>
    `;
    recordingsList.appendChild(noResults);
    return;
  }

  recordings.forEach(recording => {
    const item = createRecordingItem(recording);
    recordingsList.appendChild(item);
  });
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
 * Generate player URL from S3 URL
 */
async function generatePlayerUrl(s3Url, title = null, transcription = null, duration = null) {
  const baseUrl = window.location.origin;

  try {
    // Try to create a short URL
    const response = await fetch('/api/create-share-link', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: s3Url,
        title: title || null,
        transcription: transcription || null,
        duration: duration || null
      })
    });

    if (response.ok) {
      const { shortUrl } = await response.json();
      return shortUrl;
    }

    // Fallback to long URL if short URL creation fails
    console.warn('Short URL creation failed, using long URL');
  } catch (error) {
    console.warn('Error creating short URL, using long URL:', error);
  }

  // Fallback: generate traditional long URL
  const params = new URLSearchParams();
  params.append('url', s3Url);
  if (title) params.append('title', title);
  if (transcription) params.append('transcription', transcription);
  if (duration && !isNaN(duration) && isFinite(duration)) params.append('duration', duration);

  return `${baseUrl}/player.html?${params.toString()}`;
}

/**
 * Copy share link to clipboard
 */
async function copyShareLink(url) {
  try {
    // Generate pretty player URL instead of raw S3 link
    const filename = url.split('/').pop().split('?')[0];
    const title = filename.replace(/\.[^/.]+$/, '').replace(/_/g, ' ').replace(/-/g, ' ');

    // Try to get duration from the audio player if available
    let duration = null;
    try {
      const audioElement = document.getElementById('audioPlayer');
      if (currentRecordingUrl === url && audioElement && audioElement.duration && !isNaN(audioElement.duration) && isFinite(audioElement.duration)) {
        duration = audioElement.duration;
      }
    } catch (e) {
      console.log('Could not get duration:', e);
    }

    console.log('Generating player URL for:', { url, title, duration });
    const playerUrl = await generatePlayerUrl(url, title, currentTranscription, duration);
    console.log('Generated player URL:', playerUrl);

    if (!playerUrl) {
      throw new Error('Failed to generate player URL');
    }

    // Copy directly to clipboard
    const success = await S3Uploader.copyToClipboard(playerUrl);

    if (success) {
      showToast('Link copied to clipboard!', 'success');
    } else {
      showToast('Failed to copy link', 'error');
    }
  } catch (error) {
    console.error('Error in copyShareLink:', error);
    showToast('Failed to copy link: ' + error.message, 'error');
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
 * Handle search input
 */
let searchTimeout;
async function handleSearch(e) {
  const query = e.target.value.trim();

  // Show/hide clear button
  if (clearSearchBtn) {
    clearSearchBtn.style.display = query ? 'flex' : 'none';
  }

  // Debounce search
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(async () => {
    searchQuery = query;

    if (!query) {
      // Clear search, show hierarchy
      isSearchMode = false;
      await loadRecordings();
      return;
    }

    // Enter search mode
    isSearchMode = true;

    // Search recordings
    const results = await searchRecordings(query);

    // Render results
    loadingSpinner.style.display = 'none';
    emptyState.style.display = 'none';

    const existingItems = recordingsList.querySelectorAll('.recording-item, .folder-item');
    existingItems.forEach(item => item.remove());

    renderSearchResults(results);
  }, 300);
}

/**
 * Clear search
 */
async function clearSearch() {
  if (searchInput) {
    searchInput.value = '';
  }
  if (clearSearchBtn) {
    clearSearchBtn.style.display = 'none';
  }
  searchQuery = '';
  isSearchMode = false;
  await loadRecordings();
}

/**
 * Search recordings by filename
 * Note: Transcription search can be added when transcriptions are stored
 */
async function searchRecordings(query) {
  const lowerQuery = query.toLowerCase();
  const results = [];

  for (const recording of allRecordings) {
    // Search filename
    if (recording.filename.toLowerCase().includes(lowerQuery)) {
      results.push(recording);
    }
  }

  return results;
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
