// Get URL parameters
const urlParams = new URLSearchParams(window.location.search);
const audioUrl = urlParams.get('url');
const title = urlParams.get('title');
const transcription = urlParams.get('transcription');
const durationParam = urlParams.get('duration'); // Duration in seconds

// Get elements
const audio = document.getElementById('audio');
const playButton = document.getElementById('play-button');
const playIcon = document.getElementById('play-icon');
const progressBar = document.getElementById('progress-bar');
const progressFill = document.getElementById('progress-fill');
const currentTimeEl = document.getElementById('current-time');
const durationEl = document.getElementById('duration');
const speedButtons = document.querySelectorAll('.speed-button');
const downloadButton = document.getElementById('download-button');
const shareButton = document.getElementById('share-button');
const waveformBars = document.getElementById('waveform-bars');
const recordingTitle = document.getElementById('recording-title');
const recordingDate = document.getElementById('recording-date');
const transcriptionEl = document.getElementById('transcription');
const transcriptionText = document.getElementById('transcription-text');

// Initialize
if (!audioUrl) {
    document.querySelector('.player-container').innerHTML = '<div class="error">No audio URL provided</div>';
} else {
    // Try direct S3 URL first (faster), fall back to proxy if CORS fails
    audio.src = audioUrl;

    // If direct load fails, try proxy as fallback
    audio.addEventListener('error', () => {
        if (audio.src === audioUrl) {
            console.log('Direct S3 load failed, trying proxy...');
            const proxyUrl = `/api/audio-proxy?url=${encodeURIComponent(audioUrl)}`;
            audio.src = proxyUrl;
        }
    }, { once: true });

    // Set title
    if (title) {
        recordingTitle.textContent = decodeURIComponent(title);
        document.title = decodeURIComponent(title);
    }

    // Set transcription if available
    if (transcription) {
        transcriptionText.textContent = decodeURIComponent(transcription);
        transcriptionEl.classList.add('visible');
    }

    // Set duration immediately if provided in URL
    if (durationParam && !isNaN(parseFloat(durationParam))) {
        const duration = parseFloat(durationParam);
        durationEl.textContent = formatTime(duration);
        recordingDate.textContent = `Duration: ${formatTime(duration)}`;
    }

    // Generate waveform bars
    generateWaveform();
}

// Generate visual waveform
function generateWaveform() {
    const barCount = 50;
    waveformBars.innerHTML = '';

    for (let i = 0; i < barCount; i++) {
        const bar = document.createElement('div');
        bar.className = 'waveform-bar';
        const height = Math.random() * 60 + 20; // Random height between 20-80%
        bar.style.height = `${height}%`;
        waveformBars.appendChild(bar);
    }
}

// Format time (seconds to mm:ss)
function formatTime(seconds) {
    if (isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Play/Pause functionality
playButton.addEventListener('click', () => {
    if (audio.paused) {
        audio.play();
        playIcon.textContent = '⏸';
        animateWaveform();
    } else {
        audio.pause();
        playIcon.textContent = '▶';
    }
});

// Update progress bar
audio.addEventListener('timeupdate', () => {
    const progress = (audio.currentTime / audio.duration) * 100;
    progressFill.style.width = `${progress}%`;
    currentTimeEl.textContent = formatTime(audio.currentTime);

    // Update waveform
    updateWaveformProgress(progress);
});

// Set duration when metadata loads
audio.addEventListener('loadedmetadata', () => {
    const duration = audio.duration;
    // Only update if we don't already have duration from URL params
    if (!durationParam || durationEl.textContent === 'Loading...' || durationEl.textContent === '--:--') {
        if (isNaN(duration) || !isFinite(duration)) {
            // Metadata not available, try to get it from playing
            durationEl.textContent = '--:--';
            recordingDate.textContent = 'Loading...';
        } else {
            durationEl.textContent = formatTime(duration);
            recordingDate.textContent = `Duration: ${formatTime(duration)}`;
        }
    }
});

// Fallback: Update duration once audio starts playing if metadata wasn't available
audio.addEventListener('timeupdate', () => {
    if ((isNaN(audio.duration) || !isFinite(audio.duration)) && durationEl.textContent === '--:--') {
        // Still no duration, keep trying
        return;
    }
    if (durationEl.textContent === '--:--' || durationEl.textContent === 'Infinity:NaN') {
        durationEl.textContent = formatTime(audio.duration);
        recordingDate.textContent = `Duration: ${formatTime(audio.duration)}`;
    }
}, { once: false });

// Handle audio end
audio.addEventListener('ended', () => {
    playIcon.textContent = '▶';
    progressFill.style.width = '0%';
    resetWaveform();
});

// Seek functionality
progressBar.addEventListener('click', (e) => {
    const rect = progressBar.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    audio.currentTime = percent * audio.duration;
});

// Playback speed controls
speedButtons.forEach(button => {
    button.addEventListener('click', () => {
        const speed = parseFloat(button.dataset.speed);
        audio.playbackRate = speed;

        // Update active state
        speedButtons.forEach(btn => btn.classList.remove('active'));
        button.classList.add('active');
    });
});

// Download functionality
downloadButton.addEventListener('click', () => {
    const link = document.createElement('a');
    link.href = audioUrl;
    link.download = title ? `${decodeURIComponent(title)}.webm` : 'recording.webm';
    link.click();
});

// Share functionality
shareButton.addEventListener('click', async () => {
    const shareUrl = window.location.href;

    if (navigator.share) {
        try {
            await navigator.share({
                title: title ? decodeURIComponent(title) : 'Voice Recording',
                text: 'Listen to this voice recording',
                url: shareUrl
            });
        } catch (err) {
            if (err.name !== 'AbortError') {
                copyToClipboard(shareUrl);
            }
        }
    } else {
        copyToClipboard(shareUrl);
    }
});

// Copy to clipboard helper
function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        const originalText = shareButton.textContent;
        shareButton.textContent = '✓ Copied!';
        setTimeout(() => {
            shareButton.textContent = originalText;
        }, 2000);
    });
}

// Animate waveform
function animateWaveform() {
    const bars = document.querySelectorAll('.waveform-bar');
    bars.forEach((bar, index) => {
        setInterval(() => {
            if (!audio.paused) {
                const height = Math.random() * 60 + 20;
                bar.style.height = `${height}%`;
            }
        }, 200 + index * 20);
    });
}

// Update waveform progress
function updateWaveformProgress(progress) {
    const bars = document.querySelectorAll('.waveform-bar');
    const activeCount = Math.floor((progress / 100) * bars.length);

    bars.forEach((bar, index) => {
        if (index < activeCount) {
            bar.classList.add('playing');
        } else {
            bar.classList.remove('playing');
        }
    });
}

// Reset waveform
function resetWaveform() {
    const bars = document.querySelectorAll('.waveform-bar');
    bars.forEach(bar => bar.classList.remove('playing'));
}

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
        e.preventDefault();
        playButton.click();
    } else if (e.code === 'ArrowLeft') {
        audio.currentTime = Math.max(0, audio.currentTime - 5);
    } else if (e.code === 'ArrowRight') {
        audio.currentTime = Math.min(audio.duration, audio.currentTime + 5);
    }
});
