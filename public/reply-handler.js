// Reply with Voice Feature
// This handles recording and sending voice replies to recordings

(function() {
    // Get elements
    const replyButton = document.getElementById('reply-button');
    const replyModal = document.getElementById('reply-modal');
    const replyClose = document.getElementById('reply-close');
    const replyTitle = document.getElementById('reply-title');
    const replyTime = document.getElementById('reply-time');
    const replyWaveform = document.getElementById('reply-waveform');
    const replyRecordBtn = document.getElementById('reply-record-btn');
    const replyHint = document.getElementById('reply-hint');
    const replyActions = document.getElementById('reply-actions');
    const replyCancelBtn = document.getElementById('reply-cancel');
    const replySendBtn = document.getElementById('reply-send');
    const replyStatus = document.getElementById('reply-status');

    // Recording state
    let mediaRecorder = null;
    let recordedChunks = [];
    let recordingStartTime = 0;
    let recordingInterval = null;
    const MAX_RECORDING_TIME = 180; // 3 minutes in seconds
    let lastReplyTime = 0;
    const RATE_LIMIT_SECONDS = 5;
    let audioContext = null;
    let analyser = null;
    let animationFrame = null;

    // Generate waveform bars
    function generateReplyWaveform() {
        replyWaveform.innerHTML = '';
        for (let i = 0; i < 30; i++) {
            const bar = document.createElement('div');
            bar.className = 'reply-waveform-bar';
            bar.style.height = '20px';
            replyWaveform.appendChild(bar);
        }
    }

    // Animate waveform during recording with real audio input
    function animateReplyWaveform(stream) {
        const bars = replyWaveform.querySelectorAll('.reply-waveform-bar');

        // Setup Web Audio API for real-time visualization
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        analyser = audioContext.createAnalyser();
        const source = audioContext.createMediaStreamSource(stream);
        source.connect(analyser);

        analyser.fftSize = 64; // Smaller size for smoother animation
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);

        function animate() {
            if (mediaRecorder && mediaRecorder.state === 'recording') {
                analyser.getByteFrequencyData(dataArray);

                // Update each bar based on frequency data
                bars.forEach((bar, index) => {
                    const dataIndex = Math.floor((index / bars.length) * bufferLength);
                    const value = dataArray[dataIndex] || 0;
                    const height = Math.max(10, (value / 255) * 60); // Scale between 10-60px
                    bar.style.height = `${height}px`;
                });

                animationFrame = requestAnimationFrame(animate);
            }
        }

        animate();
    }

    // Format time MM:SS
    function formatReplyTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }

    // Open reply modal
    function openReplyModal() {
        // Check rate limiting
        const now = Date.now();
        if (lastReplyTime && (now - lastReplyTime) / 1000 < RATE_LIMIT_SECONDS) {
            const remaining = Math.ceil(RATE_LIMIT_SECONDS - (now - lastReplyTime) / 1000);
            alert(`Please wait ${remaining} seconds before sending another reply.`);
            return;
        }

        // Set the title to show what they're replying to
        const recordingTitleText = document.getElementById('recording-title').textContent;
        replyTitle.textContent = `Reply to: ${recordingTitleText}`;

        // Reset state
        recordedChunks = [];
        replyTime.textContent = '00:00';
        replyStatus.textContent = '';
        replyStatus.className = 'reply-status';
        replyActions.style.display = 'none';
        replyHint.textContent = 'Click to start recording (max 3 minutes)';
        replyRecordBtn.classList.remove('recording');

        // Generate waveform
        generateReplyWaveform();

        // Show modal
        replyModal.classList.add('active');
    }

    // Close reply modal
    function closeReplyModal() {
        if (mediaRecorder && mediaRecorder.state === 'recording') {
            mediaRecorder.stop();
        }
        if (recordingInterval) {
            clearInterval(recordingInterval);
        }
        replyModal.classList.remove('active');
    }

    // Start recording
    async function startRecording() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorder = new MediaRecorder(stream, {
                mimeType: 'audio/webm'
            });

            recordedChunks = [];
            recordingStartTime = Date.now();

            mediaRecorder.addEventListener('dataavailable', (e) => {
                if (e.data.size > 0) {
                    recordedChunks.push(e.data);
                }
            });

            mediaRecorder.addEventListener('stop', () => {
                stream.getTracks().forEach(track => track.stop());
                replyActions.style.display = 'flex';
                replyHint.textContent = 'Recording complete! Send your reply or re-record';
            });

            mediaRecorder.start();
            replyRecordBtn.classList.add('recording');
            replyHint.textContent = 'Recording... Click to stop';

            // Animate waveform with real audio input
            animateReplyWaveform(stream);

            // Update timer
            let elapsedSeconds = 0;
            recordingInterval = setInterval(() => {
                elapsedSeconds++;
                replyTime.textContent = formatReplyTime(elapsedSeconds);

                // Stop at max time
                if (elapsedSeconds >= MAX_RECORDING_TIME) {
                    stopRecording();
                }
            }, 1000);

        } catch (err) {
            console.error('Error accessing microphone:', err);
            replyStatus.textContent = 'Could not access microphone. Please allow microphone access.';
            replyStatus.className = 'reply-status error';
        }
    }

    // Stop recording
    function stopRecording() {
        if (mediaRecorder && mediaRecorder.state === 'recording') {
            mediaRecorder.stop();
            replyRecordBtn.classList.remove('recording');
            if (recordingInterval) {
                clearInterval(recordingInterval);
            }
            // Cleanup audio visualization
            if (animationFrame) {
                cancelAnimationFrame(animationFrame);
                animationFrame = null;
            }
            if (audioContext) {
                audioContext.close();
                audioContext = null;
            }
        }
    }

    // Handle record button click
    replyRecordBtn.addEventListener('click', () => {
        if (!mediaRecorder || mediaRecorder.state === 'inactive') {
            startRecording();
        } else if (mediaRecorder.state === 'recording') {
            stopRecording();
        }
    });

    // Cancel/re-record
    replyCancelBtn.addEventListener('click', () => {
        recordedChunks = [];
        replyTime.textContent = '00:00';
        replyActions.style.display = 'none';
        replyStatus.textContent = '';
        replyStatus.className = 'reply-status';
        replyHint.textContent = 'Click to start recording (max 3 minutes)';
        generateReplyWaveform();
    });

    // Send reply
    replySendBtn.addEventListener('click', async () => {
        if (recordedChunks.length === 0) {
            replyStatus.textContent = 'No recording to send';
            replyStatus.className = 'reply-status error';
            return;
        }

        try {
            replyStatus.textContent = 'Sending your reply...';
            replyStatus.className = 'reply-status';
            replySendBtn.disabled = true;
            replyCancelBtn.disabled = true;

            // Create blob from recorded chunks
            const blob = new Blob(recordedChunks, { type: 'audio/webm' });

            // Get original recording info
            let originalHash = window.location.pathname.includes('/s/')
                ? window.location.pathname.split('/s/')[1]
                : new URLSearchParams(window.location.search).get('url');

            // Extract recording ID from the current audio URL
            let recordingId = null;
            if (window.audioUrl) {
                const urlParts = window.audioUrl.split('/');
                const filename = urlParts[urlParts.length - 1].split('?')[0];
                recordingId = filename.replace(/\.[^/.]+$/, '');
            }

            // Sanitize the hash - if it's a URL, create a hash from it
            if (originalHash && (originalHash.includes('http') || originalHash.includes('/'))) {
                // Create a simple hash from the URL
                originalHash = Array.from(originalHash)
                    .reduce((hash, char) => ((hash << 5) - hash) + char.charCodeAt(0), 0)
                    .toString(36)
                    .replace('-', '');
            }

            // Generate filename with sanitized hash
            const timestamp = Date.now();
            const filename = `reply-to-${originalHash || timestamp}-${timestamp}.webm`;

            // Get upload URL from server
            const uploadResponse = await fetch('/api/get-upload-url', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    filename,
                    contentType: 'audio/webm',
                    folder: 'replies'
                })
            });

            if (!uploadResponse.ok) {
                throw new Error('Failed to get upload URL');
            }

            const { uploadUrl, key } = await uploadResponse.json();

            // Upload to S3
            const uploadS3Response = await fetch(uploadUrl, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'audio/webm'
                },
                body: blob
            });

            if (!uploadS3Response.ok) {
                throw new Error('Failed to upload recording');
            }

            // Get S3 URL
            const s3Url = uploadUrl.split('?')[0];

            // Get duration
            const duration = (Date.now() - recordingStartTime) / 1000;

            // Show success immediately - don't make user wait
            lastReplyTime = Date.now();
            replyStatus.textContent = '✓ Your reply has been sent to Mark!';
            replyStatus.className = 'reply-status success';
            replySendBtn.style.display = 'none';
            replyCancelBtn.textContent = 'Close';
            replyCancelBtn.disabled = false;
            replyCancelBtn.onclick = closeReplyModal;

            // Continue processing in background (transcription + webhook)
            // User doesn't need to wait for this
            (async () => {
                try {
                    // Transcribe in background
                    let transcriptionText = '';
                    try {
                        const transcriptionResponse = await fetch('/api/transcribe', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ audioUrl: s3Url })
                        });

                        if (transcriptionResponse.ok) {
                            const transcriptionData = await transcriptionResponse.json();
                            transcriptionText = transcriptionData.transcription || '';
                        }
                    } catch (transcriptionError) {
                        console.warn('Transcription failed, sending without transcription:', transcriptionError);
                        // Continue anyway - transcription is optional
                    }

                    // Create share link for the reply
                    let replyShareUrl = s3Url; // Fallback to S3 URL
                    try {
                        const shareResponse = await fetch('/api/create-share-link', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                url: s3Url,
                                title: 'Reply to: ' + (document.getElementById('recording-title').textContent || 'Recording'),
                                transcription: transcriptionText || null,
                                duration: Math.round(duration * 10) / 10
                            })
                        });

                        if (shareResponse.ok) {
                            const { shortUrl } = await shareResponse.json();
                            replyShareUrl = shortUrl;
                        }
                    } catch (shareError) {
                        console.warn('Failed to create share link for reply:', shareError);
                    }

                    // Add reply to thread if recordingId is available
                    if (recordingId) {
                        try {
                            await fetch(`/api/recordings/${recordingId}/replies`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    replyUrl: s3Url,
                                    replyShareUrl: replyShareUrl,
                                    transcription: transcriptionText || '',
                                    duration: Math.round(duration * 10) / 10,
                                    timestamp: new Date().toISOString()
                                })
                            });
                            console.log('Reply added to thread for recording:', recordingId);
                        } catch (threadError) {
                            console.warn('Failed to add reply to thread:', threadError);
                            // Don't fail the whole operation if thread update fails
                        }
                    }

                    // Send webhook notification
                    const originalTitle = document.getElementById('recording-title').textContent;
                    const originalUrl = window.audioUrl || '';

                    await fetch('https://promptadvisers.app.n8n.cloud/webhook/data-cleanup', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            event_type: 'voice_reply',
                            timestamp: new Date().toISOString(),
                            original_recording: {
                                title: originalTitle,
                                url: originalUrl,
                                hash: originalHash || ''
                            },
                            reply: {
                                url: replyShareUrl, // Use share link instead of S3 URL
                                s3_url: s3Url, // Keep S3 URL for reference
                                transcription: transcriptionText,
                                duration: Math.round(duration * 10) / 10,
                                timestamp: new Date().toISOString()
                            }
                        }),
                        mode: 'no-cors'
                    });
                } catch (backgroundError) {
                    console.error('Background processing error:', backgroundError);
                    // User already saw success, so don't show error
                }
            })();

        } catch (error) {
            console.error('Error sending reply:', error);
            replyStatus.textContent = 'Failed to send reply. Please try again.';
            replyStatus.className = 'reply-status error';
            replySendBtn.disabled = false;
            replyCancelBtn.disabled = false;
        }
    });

    // Event listeners
    if (replyButton) {
        replyButton.addEventListener('click', openReplyModal);
    }
    if (replyClose) {
        replyClose.addEventListener('click', closeReplyModal);
    }

    // Close modal on outside click
    replyModal.addEventListener('click', (e) => {
        if (e.target === replyModal) {
            closeReplyModal();
        }
    });
})();
