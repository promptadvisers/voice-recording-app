// Get URL parameters
const urlParams = new URLSearchParams(window.location.search);
const audioUrl = urlParams.get('url');
// Make audioUrl available globally for reply-handler.js
window.audioUrl = audioUrl;
const title = urlParams.get('title');
const transcription = urlParams.get('transcription');
const durationParam = urlParams.get('duration'); // Duration in seconds

// Play tracking variables
let playTrackingTimer = null;
let hasTrackedThisSession = false;
const WEBHOOK_URL = 'https://promptadvisers.app.n8n.cloud/webhook/data-cleanup';

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
        try {
            recordingTitle.textContent = decodeURIComponent(title);
            document.title = decodeURIComponent(title);
        } catch (e) {
            // If decoding fails, use the raw title
            recordingTitle.textContent = title;
            document.title = title;
        }
    }

    // Set transcription if available
    if (transcription) {
        try {
            transcriptionText.textContent = decodeURIComponent(transcription);
            transcriptionEl.classList.add('visible');
        } catch (e) {
            // If decoding fails, use the raw transcription
            transcriptionText.textContent = transcription;
            transcriptionEl.classList.add('visible');
        }
    }

    // Always start with "Click play to start"
    recordingDate.textContent = 'Click play to start';

    // Set duration in the player if provided, but keep the friendly message
    if (durationParam && !isNaN(parseFloat(durationParam))) {
        const duration = parseFloat(durationParam);
        durationEl.textContent = formatTime(duration);
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

// Play tracking function
async function trackPlay() {
    if (hasTrackedThisSession) {
        console.log('Play already tracked for this session');
        return;
    }

    try {
        // Get user's IP address
        let ipAddress = 'unknown';
        try {
            const ipResponse = await fetch('https://api.ipify.org?format=json');
            const ipData = await ipResponse.json();
            ipAddress = ipData.ip;
        } catch (ipError) {
            console.warn('Could not fetch IP address:', ipError);
        }

        // Helper function to safely decode URI
        const safeDecode = (str) => {
            if (!str) return null;
            try {
                return decodeURIComponent(str);
            } catch (e) {
                return str;
            }
        };

        // Prepare webhook payload
        const payload = {
            event: 'recording_played',
            timestamp: new Date().toISOString(),
            recording: {
                title: title ? safeDecode(title) : 'Untitled Recording',
                url: audioUrl,
                duration: audio.duration || parseFloat(durationParam) || 0,
                transcription: transcription ? safeDecode(transcription) : null
            },
            player: {
                page_url: window.location.href,
                share_url: window.location.href
            },
            listener: {
                ip_address: ipAddress,
                user_agent: navigator.userAgent,
                timestamp_local: new Date().toString()
            }
        };

        console.log('Sending play tracking webhook:', payload);

        // Send webhook (non-blocking, with longer timeout)
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 seconds

        const response = await fetch(WEBHOOK_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
            signal: controller.signal,
            mode: 'no-cors' // Prevent CORS errors from blocking the request
        }).catch(err => {
            console.warn('Fetch error (may still have sent):', err.message);
            return { ok: true }; // Treat as success since no-cors doesn't give us response
        });

        clearTimeout(timeoutId);
        hasTrackedThisSession = true;
        console.log('Play tracking webhook sent (no-cors mode - check n8n for delivery)');
    } catch (error) {
        console.error('Error sending play tracking webhook:', error);
        // Don't mark as tracked if it failed, so it can retry
    }
}

// Play/Pause functionality
playButton.addEventListener('click', () => {
    if (audio.paused) {
        audio.play();
        playIcon.textContent = '⏸';
        animateWaveform();

        // Update the message to show duration once they start playing
        if (audio.duration && isFinite(audio.duration)) {
            recordingDate.textContent = `Duration: ${formatTime(audio.duration)}`;
        } else if (durationParam && !isNaN(parseFloat(durationParam))) {
            recordingDate.textContent = `Duration: ${formatTime(parseFloat(durationParam))}`;
        }

        // Start 3-second timer for play tracking
        if (!hasTrackedThisSession) {
            // Clear any existing timer
            if (playTrackingTimer) {
                clearTimeout(playTrackingTimer);
            }

            // Set new timer for 3 seconds
            playTrackingTimer = setTimeout(() => {
                // Check if still playing after 3 seconds
                if (!audio.paused) {
                    trackPlay();
                }
            }, 3000);
        }
    } else {
        audio.pause();
        playIcon.textContent = '▶';

        // Cancel tracking timer if paused before 3 seconds
        if (playTrackingTimer && !hasTrackedThisSession) {
            clearTimeout(playTrackingTimer);
            playTrackingTimer = null;
            console.log('Play tracking cancelled - paused before 3 seconds');
        }
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
    // Only update the duration display, keep "Click play to start" message
    if (!durationParam || durationEl.textContent === '0:00' || durationEl.textContent === '--:--') {
        if (isNaN(duration) || !isFinite(duration)) {
            // Metadata not available
            durationEl.textContent = '--:--';
        } else {
            durationEl.textContent = formatTime(duration);
        }
    }
    // Always keep "Click play to start" until they actually play
});

// Fallback: Update duration once audio starts playing if metadata wasn't available
audio.addEventListener('timeupdate', () => {
    if ((isNaN(audio.duration) || !isFinite(audio.duration)) && durationEl.textContent === '--:--') {
        // Still no duration, keep trying
        return;
    }
    if (durationEl.textContent === '--:--' || durationEl.textContent === 'Infinity:NaN') {
        durationEl.textContent = formatTime(audio.duration);
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
    // Show loading state
    const originalText = shareButton.textContent;
    shareButton.textContent = '⏳ Creating link...';
    shareButton.disabled = true;

    try {
        // Helper function to safely decode URI
        const safeDecode = (str) => {
            if (!str) return null;
            try {
                return decodeURIComponent(str);
            } catch (e) {
                return str;
            }
        };

        // Create short URL
        const response = await fetch('/api/create-share-link', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                url: audioUrl,
                title: title ? safeDecode(title) : null,
                transcription: transcription ? safeDecode(transcription) : null,
                duration: audio.duration || parseFloat(durationParam) || null
            })
        });

        if (!response.ok) {
            throw new Error('Failed to create share link');
        }

        const { shortUrl } = await response.json();

        // Restore button
        shareButton.textContent = originalText;
        shareButton.disabled = false;

        // Share or copy the short URL
        if (navigator.share) {
            try {
                await navigator.share({
                    title: title ? safeDecode(title) : 'Voice Recording',
                    text: 'Listen to this voice recording',
                    url: shortUrl
                });
            } catch (err) {
                if (err.name !== 'AbortError') {
                    copyToClipboard(shortUrl);
                }
            }
        } else {
            copyToClipboard(shortUrl);
        }
    } catch (error) {
        console.error('Error creating share link:', error);
        // Fallback to current URL if short link fails
        shareButton.textContent = originalText;
        shareButton.disabled = false;
        copyToClipboard(window.location.href);
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
