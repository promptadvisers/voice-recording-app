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

        // Copy the short URL directly to clipboard
        copyToClipboard(shortUrl);
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

// Thread Management
let currentReplyAudio = null;

// Extract recording ID from audioUrl
function extractRecordingId() {
    if (!audioUrl) return null;
    const urlParts = audioUrl.split('/');
    const filename = urlParts[urlParts.length - 1].split('?')[0];
    return filename.replace(/\.[^/.]+$/, '');
}

// Load thread replies
async function loadThread() {
    const recordingId = extractRecordingId();
    if (!recordingId) {
        console.log('No recording ID found, skipping thread load');
        return;
    }

    try {
        const response = await fetch(`/api/recordings/${encodeURIComponent(recordingId)}/replies`);

        if (!response.ok) {
            console.warn('Failed to load thread:', response.status);
            return;
        }

        const data = await response.json();
        const replies = data.replies || [];

        if (replies.length > 0) {
            displayThread(replies);
        }
    } catch (error) {
        console.error('Error loading thread:', error);
    }
}

// Display thread
function displayThread(replies) {
    const threadSection = document.getElementById('thread-section');
    const threadTimeline = document.getElementById('thread-timeline');
    const threadEmpty = document.getElementById('thread-empty');
    const replyCount = document.getElementById('reply-count');

    if (!threadSection || !threadTimeline) return;

    // Update reply count
    replyCount.textContent = replies.length;

    // Clear existing replies
    threadTimeline.innerHTML = '';

    // Add each reply
    replies.forEach((reply, index) => {
        const replyItem = createReplyItem(reply, index);
        threadTimeline.appendChild(replyItem);
    });

    // Show thread section
    threadSection.classList.add('visible');
    threadTimeline.classList.add('visible');
    threadEmpty.classList.add('hidden');
}

// Create reply item element
function createReplyItem(reply, index) {
    const item = document.createElement('div');
    item.className = 'reply-item';
    item.dataset.replyId = reply.id;

    // Format timestamp
    const timestamp = new Date(reply.timestamp);
    const timeAgo = getTimeAgo(timestamp);

    const replyType = reply.type || 'voice'; // Default to voice for backward compatibility

    if (replyType === 'text') {
        // Text reply rendering
        const textContent = reply.transcription || '';
        const renderedMarkdown = renderMarkdown(textContent);

        item.innerHTML = `
            <div class="reply-header">
                <span class="reply-timestamp">💬 ${timeAgo}</span>
            </div>
            <div class="text-message-bubble" id="reply-msg-${reply.id}">
                ${renderedMarkdown}
            </div>
            <div class="reply-actions">
                <button class="reply-share-btn" onclick="copyTextMessage('${reply.id}')">
                    📋 Copy
                </button>
            </div>
        `;
    } else {
        // Voice reply rendering (existing code)
        const durationText = reply.duration ? formatTime(reply.duration) : '--:--';
        const hasTranscription = reply.transcription && reply.transcription.trim().length > 0;

        item.innerHTML = `
            <div class="reply-header">
                <span class="reply-timestamp">🎙️ ${timeAgo}</span>
                <span class="reply-duration">${durationText}</span>
            </div>
            ${hasTranscription ? `
                <div class="reply-transcription" id="reply-trans-${reply.id}">
                    ${reply.transcription}
                </div>
                ${reply.transcription.length > 150 ? `
                    <div class="reply-transcription-toggle" onclick="toggleTranscription('${reply.id}')">
                        Show more
                    </div>
                ` : ''}
            ` : ''}
            <div class="reply-actions">
                <button class="reply-play-btn" onclick="playReply('${reply.shareUrl || reply.url}', '${reply.id}')">
                    ▶ Play Reply
                </button>
                <button class="reply-share-btn" onclick="shareReply('${reply.shareUrl || reply.url}')">
                    📤 Share
                </button>
                ${hasTranscription ? `
                    <button class="reply-share-btn" onclick="copyReplyTranscription('${reply.id}')">
                        📋 Copy
                    </button>
                ` : ''}
            </div>
        `;
    }

    return item;
}

// Render markdown safely
function renderMarkdown(text) {
    if (!text) return '';

    // Use marked.js to parse markdown
    if (typeof marked !== 'undefined') {
        const rawHtml = marked.parse(text);
        // Use DOMPurify to sanitize the HTML
        if (typeof DOMPurify !== 'undefined') {
            return DOMPurify.sanitize(rawHtml);
        }
        return rawHtml;
    }

    // Fallback if marked.js not loaded
    return text.replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Copy text message
window.copyTextMessage = async function(replyId) {
    const messageEl = document.getElementById(`reply-msg-${replyId}`);
    if (!messageEl) return;

    const text = messageEl.textContent;
    if (!text) return;

    try {
        await navigator.clipboard.writeText(text);

        // Find the copy button for this reply
        const replyItem = messageEl.closest('.reply-item');
        const copyBtn = replyItem.querySelector('.reply-share-btn');

        if (copyBtn) {
            const originalText = copyBtn.innerHTML;
            copyBtn.innerHTML = '✓ Copied!';
            copyBtn.style.borderColor = '#38a169';
            copyBtn.style.color = '#38a169';

            setTimeout(() => {
                copyBtn.innerHTML = originalText;
                copyBtn.style.borderColor = '';
                copyBtn.style.color = '';
            }, 2000);
        }
    } catch (err) {
        console.error('Failed to copy text message:', err);
        alert('Failed to copy to clipboard');
    }
};

// Get time ago string
function getTimeAgo(date) {
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) {
        return 'Just now';
    } else if (diffMins < 60) {
        return `${diffMins} min${diffMins > 1 ? 's' : ''} ago`;
    } else if (diffHours < 24) {
        return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    } else if (diffDays < 7) {
        return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    } else {
        return date.toLocaleDateString();
    }
}

// Play reply
window.playReply = function(replyUrl, replyId) {
    // Stop any currently playing reply
    if (currentReplyAudio) {
        currentReplyAudio.pause();
        currentReplyAudio = null;
        // Reset all play buttons
        document.querySelectorAll('.reply-play-btn').forEach(btn => {
            btn.classList.remove('playing');
            btn.innerHTML = '▶ Play Reply';
        });
    }

    // Pause main audio if playing
    if (!audio.paused) {
        audio.pause();
        playIcon.textContent = '▶';
    }

    // Create and play reply audio
    currentReplyAudio = new Audio(replyUrl);
    const playBtn = document.querySelector(`[data-reply-id="${replyId}"] .reply-play-btn`);

    if (playBtn) {
        playBtn.classList.add('playing');
        playBtn.innerHTML = '⏸ Pause';
    }

    currentReplyAudio.play();

    // Handle reply audio end
    currentReplyAudio.addEventListener('ended', () => {
        if (playBtn) {
            playBtn.classList.remove('playing');
            playBtn.innerHTML = '▶ Play Reply';
        }
        currentReplyAudio = null;
    });

    // Handle pause
    currentReplyAudio.addEventListener('pause', () => {
        if (playBtn && currentReplyAudio.currentTime < currentReplyAudio.duration - 0.1) {
            playBtn.classList.remove('playing');
            playBtn.innerHTML = '▶ Play Reply';
        }
    });

    // Toggle play/pause on button click
    playBtn.addEventListener('click', (e) => {
        e.preventDefault();
        if (currentReplyAudio && !currentReplyAudio.paused) {
            currentReplyAudio.pause();
        } else if (currentReplyAudio && currentReplyAudio.paused) {
            currentReplyAudio.play();
            playBtn.classList.add('playing');
            playBtn.innerHTML = '⏸ Pause';
        }
    }, { once: true });
};

// Share reply
window.shareReply = async function(replyUrl) {
    // Copy to clipboard directly (skip native share menu)
    try {
        await navigator.clipboard.writeText(replyUrl);
        alert('Link copied to clipboard!');
    } catch (err) {
        console.error('Failed to copy:', err);
        alert('Failed to copy link');
    }
};

// Toggle transcription expansion
window.toggleTranscription = function(replyId) {
    const transcriptionEl = document.getElementById(`reply-trans-${replyId}`);
    const toggleBtn = transcriptionEl.nextElementSibling;

    if (transcriptionEl.classList.contains('expanded')) {
        transcriptionEl.classList.remove('expanded');
        toggleBtn.textContent = 'Show more';
    } else {
        transcriptionEl.classList.add('expanded');
        toggleBtn.textContent = 'Show less';
    }
};

// Copy reply transcription
window.copyReplyTranscription = async function(replyId) {
    const transcriptionEl = document.getElementById(`reply-trans-${replyId}`);
    if (!transcriptionEl) return;

    const text = transcriptionEl.textContent;
    if (!text) return;

    try {
        await navigator.clipboard.writeText(text);
        // Find the copy button for this reply
        const replyItem = transcriptionEl.closest('.reply-item');
        const copyBtns = replyItem.querySelectorAll('.reply-share-btn');
        const copyBtn = Array.from(copyBtns).find(btn => btn.textContent.includes('📋'));

        if (copyBtn) {
            const originalText = copyBtn.innerHTML;
            copyBtn.innerHTML = '✓ Copied!';
            copyBtn.style.borderColor = '#38a169';
            copyBtn.style.color = '#38a169';

            setTimeout(() => {
                copyBtn.innerHTML = originalText;
                copyBtn.style.borderColor = '';
                copyBtn.style.color = '';
            }, 2000);
        }
    } catch (err) {
        console.error('Failed to copy reply transcription:', err);
        alert('Failed to copy to clipboard');
    }
};

// Load thread on page load
if (audioUrl) {
    loadThread();
}

// Text Reply Modal Management
const textReplyButton = document.getElementById('text-reply-button');
const textReplyModal = document.getElementById('text-reply-modal');
const textReplyClose = document.getElementById('text-reply-close');
const textReplyTextarea = document.getElementById('text-reply-textarea');
const charCounter = document.getElementById('char-counter');
const sendTextReplyBtn = document.getElementById('send-text-reply');
const textReplyStatus = document.getElementById('text-reply-status');

// Open text reply modal
if (textReplyButton) {
    textReplyButton.addEventListener('click', () => {
        textReplyModal.classList.add('active');
        textReplyTextarea.value = '';
        charCounter.textContent = '0/500';
        textReplyStatus.textContent = '';
        textReplyStatus.className = 'text-reply-status';
        sendTextReplyBtn.disabled = false;
    });
}

// Close text reply modal
if (textReplyClose) {
    textReplyClose.addEventListener('click', () => {
        textReplyModal.classList.remove('active');
    });
}

// Close modal on outside click
if (textReplyModal) {
    textReplyModal.addEventListener('click', (e) => {
        if (e.target === textReplyModal) {
            textReplyModal.classList.remove('active');
        }
    });
}

// Character counter
if (textReplyTextarea) {
    textReplyTextarea.addEventListener('input', () => {
        const length = textReplyTextarea.value.length;
        charCounter.textContent = `${length}/500`;

        if (length > 450) {
            charCounter.classList.add('warning');
        } else {
            charCounter.classList.remove('warning');
        }

        if (length >= 500) {
            charCounter.classList.add('error');
        } else {
            charCounter.classList.remove('error');
        }
    });
}

// Send text reply
if (sendTextReplyBtn) {
    sendTextReplyBtn.addEventListener('click', async () => {
        const message = textReplyTextarea.value.trim();

        if (!message) {
            textReplyStatus.textContent = 'Please enter a message';
            textReplyStatus.className = 'text-reply-status error';
            return;
        }

        if (message.length > 500) {
            textReplyStatus.textContent = 'Message is too long (max 500 characters)';
            textReplyStatus.className = 'text-reply-status error';
            return;
        }

        try {
            textReplyStatus.textContent = 'Sending your reply...';
            textReplyStatus.className = 'text-reply-status';
            sendTextReplyBtn.disabled = true;

            // Extract recording ID
            const recordingId = extractRecordingId();
            if (!recordingId) {
                throw new Error('Could not determine recording ID');
            }

            // Send text reply to server
            const response = await fetch(`/api/recordings/${encodeURIComponent(recordingId)}/replies`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: 'text',
                    textMessage: message,
                    timestamp: new Date().toISOString()
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to send reply');
            }

            const result = await response.json();

            // Show success
            textReplyStatus.textContent = '✓ Your reply has been sent!';
            textReplyStatus.className = 'text-reply-status success';

            // Send webhook in background
            sendTextReplyWebhook(message, recordingId);

            // Wait a moment then close modal and reload thread
            setTimeout(() => {
                textReplyModal.classList.remove('active');
                loadThread();
            }, 1500);

        } catch (error) {
            console.error('Error sending text reply:', error);
            textReplyStatus.textContent = `Failed to send reply: ${error.message}`;
            textReplyStatus.className = 'text-reply-status error';
            sendTextReplyBtn.disabled = false;
        }
    });
}

// Send webhook for text reply
async function sendTextReplyWebhook(message, recordingId) {
    try {
        const originalTitle = document.getElementById('recording-title').textContent;
        const originalUrl = window.audioUrl || '';

        await fetch('https://promptadvisers.app.n8n.cloud/webhook/data-cleanup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                event_type: 'text_reply',
                timestamp: new Date().toISOString(),
                original_recording: {
                    title: originalTitle,
                    url: originalUrl,
                    recordingId: recordingId
                },
                reply: {
                    type: 'text',
                    message: message,
                    timestamp: new Date().toISOString()
                }
            }),
            mode: 'no-cors'
        });
    } catch (error) {
        console.warn('Failed to send webhook for text reply:', error);
    }
}

// Transcription copy and download functionality
const copyTranscriptionBtn = document.getElementById('copy-transcription');
const downloadTranscriptionBtn = document.getElementById('download-transcription');
const transcriptionTextEl = document.getElementById('transcription-text');

if (copyTranscriptionBtn) {
    copyTranscriptionBtn.addEventListener('click', async () => {
        const text = transcriptionTextEl.textContent;
        if (!text) return;

        try {
            await navigator.clipboard.writeText(text);
            const originalText = copyTranscriptionBtn.innerHTML;
            copyTranscriptionBtn.innerHTML = '✓ Copied!';
            copyTranscriptionBtn.style.borderColor = '#38a169';
            copyTranscriptionBtn.style.color = '#38a169';

            setTimeout(() => {
                copyTranscriptionBtn.innerHTML = originalText;
                copyTranscriptionBtn.style.borderColor = '';
                copyTranscriptionBtn.style.color = '';
            }, 2000);
        } catch (err) {
            console.error('Failed to copy:', err);
            alert('Failed to copy to clipboard');
        }
    });
}

if (downloadTranscriptionBtn) {
    downloadTranscriptionBtn.addEventListener('click', () => {
        const text = transcriptionTextEl.textContent;
        if (!text) return;

        // Create blob with transcription
        const blob = new Blob([text], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);

        // Get recording title for filename
        const recordingTitleEl = document.getElementById('recording-title');
        const titleText = recordingTitleEl ? recordingTitleEl.textContent : 'recording';
        const filename = `${titleText.replace(/[^a-z0-9]/gi, '-').toLowerCase()}-transcription.txt`;

        // Create download link
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        // Visual feedback
        const originalText = downloadTranscriptionBtn.innerHTML;
        downloadTranscriptionBtn.innerHTML = '✓ Downloaded!';
        downloadTranscriptionBtn.style.borderColor = '#38a169';
        downloadTranscriptionBtn.style.color = '#38a169';

        setTimeout(() => {
            downloadTranscriptionBtn.innerHTML = originalText;
            downloadTranscriptionBtn.style.borderColor = '';
            downloadTranscriptionBtn.style.color = '';
        }, 2000);
    });
}
