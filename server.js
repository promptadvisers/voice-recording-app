const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const { S3Client, PutObjectCommand, CopyObjectCommand, DeleteObjectCommand, ListObjectsV2Command, GetObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const rateLimit = require('express-rate-limit');
const OpenAI = require('openai');
const { spawn } = require('child_process');

// Load environment variables from .env file if it exists
if (fs.existsSync('.env')) {
  require('dotenv').config();
}

const app = express();
const PORT = process.env.PORT || 3001;

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});

// Middleware
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Range'],
  exposedHeaders: ['Content-Range', 'Accept-Ranges', 'Content-Length']
}));
app.use(express.json());
app.use(limiter);

// Disable caching for static files during development
app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, Range');
  next();
});

app.use(express.static('public', {
  setHeaders: (res, path) => {
    // Set CORS headers for static files
    res.set('Access-Control-Allow-Origin', '*');
  }
}));

// AWS Configuration
let s3Client;
let awsCredentials = null;
const BUCKET_NAME = 'voice-recording-app';
const REGION = 'us-east-1';
const DEFAULT_TITLE_MODEL = process.env.OPENAI_TITLE_MODEL || 'gpt-4.1-mini';
const AI_TITLE_ENABLED = process.env.ENABLE_AI_TITLES !== 'false';
const AI_TITLE_TEMPERATURE = process.env.AI_TITLE_TEMPERATURE ? Number(process.env.AI_TITLE_TEMPERATURE) : 0.2;
const AI_TITLE_MAX_TOKENS = process.env.AI_TITLE_MAX_TOKENS ? Number(process.env.AI_TITLE_MAX_TOKENS) : 20;
const DEFAULT_TITLE_PROMPT = process.env.AI_TITLE_PROMPT || 'Summarize the following transcript in 1 to 4 words. Return only the concise title.';
const AUDIO_ENHANCEMENT_ENABLED = process.env.ENABLE_AUDIO_ENHANCEMENT === 'true';
const AUDIO_ENHANCEMENT_SCRIPT = process.env.AUDIO_ENHANCEMENT_SCRIPT || path.join(__dirname, 'scripts', 'enhance_audio.py');
const AUDIO_ENHANCEMENT_OUTPUT_SUFFIX = process.env.AUDIO_ENHANCEMENT_OUTPUT_SUFFIX || '-enhanced';

// Read AWS credentials from CSV file or environment variables
function loadAWSCredentials() {
  try {
    // First, try to load from environment variables (Vercel, production)
    if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
      console.log('✓ Using AWS credentials from environment variables');

      s3Client = new S3Client({
        region: process.env.AWS_REGION || REGION,
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
        }
      });

      awsCredentials = {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
      };

      if (!process.env.AWS_REGION) {
        process.env.AWS_REGION = REGION;
      }
      if (!process.env.AWS_DEFAULT_REGION) {
        process.env.AWS_DEFAULT_REGION = REGION;
      }

      console.log('✓ AWS credentials loaded successfully from environment');
      return true;
    }

    // Fall back to CSV file (local development)
    const csvPath = path.join(__dirname, 'voice-recording-api-user_accessKeys.csv');

    if (!fs.existsSync(csvPath)) {
      throw new Error('AWS credentials not found in environment variables or CSV file');
    }

    const csvContent = fs.readFileSync(csvPath, 'utf-8');

    // Remove BOM if present
    const cleanContent = csvContent.replace(/^\uFEFF/, '');

    const records = parse(cleanContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true
    });

    if (records.length === 0) {
      throw new Error('No credentials found in CSV file');
    }

    const credentials = records[0];
    const accessKeyId = credentials['Access key ID'];
    const secretAccessKey = credentials['Secret access key'];

    if (!accessKeyId || !secretAccessKey) {
      throw new Error('Invalid CSV format: missing Access key ID or Secret access key');
    }

    s3Client = new S3Client({
      region: REGION,
      credentials: {
        accessKeyId: accessKeyId,
        secretAccessKey: secretAccessKey
      }
    });

    awsCredentials = { accessKeyId, secretAccessKey };

    if (!process.env.AWS_ACCESS_KEY_ID) {
      process.env.AWS_ACCESS_KEY_ID = accessKeyId;
    }
    if (!process.env.AWS_SECRET_ACCESS_KEY) {
      process.env.AWS_SECRET_ACCESS_KEY = secretAccessKey;
    }
    if (!process.env.AWS_REGION) {
      process.env.AWS_REGION = REGION;
    }
    if (!process.env.AWS_DEFAULT_REGION) {
      process.env.AWS_DEFAULT_REGION = REGION;
    }

    console.log('✓ AWS credentials loaded successfully from CSV');
    return true;
  } catch (error) {
    console.error('Error loading AWS credentials:', error.message);
    return false;
  }
}

// Initialize AWS on startup
// In serverless environments (Vercel), we still try to initialize but don't exit
const awsInitialized = loadAWSCredentials();
if (!awsInitialized && !process.env.VERCEL) {
  console.error('Failed to load AWS credentials. Server will not start.');
  process.exit(1);
} else if (!awsInitialized && process.env.VERCEL) {
  console.error('⚠️  AWS credentials not configured. Please set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY in Vercel environment variables.');
}

// Utility function to sanitize filenames
function sanitizeFilename(filename) {
  return filename
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_{2,}/g, '_')
    .substring(0, 255);
}

function normalizeTitleForFilename(title) {
  if (!title) {
    return '';
  }

  return String(title)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .toLowerCase()
    .trim();
}

function cleanGeneratedTitle(title) {
  if (!title) {
    return '';
  }

  const cleaned = String(title)
    .replace(/["'`“”‘’]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  const words = cleaned.split(' ').filter(Boolean).slice(0, 4);
  return words.join(' ');
}

function buildCandidateFilename(baseName, extension) {
  const candidate = baseName ? `${baseName}${extension}` : `recording${extension}`;
  const sanitized = sanitizeFilename(candidate);
  return sanitized || `recording${Date.now()}${extension}`;
}

async function objectExists(key) {
  try {
    await s3Client.send(new HeadObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key
    }));
    return true;
  } catch (error) {
    const status = error.$metadata?.httpStatusCode;
    if (status === 404 || status === 400 || error.name === 'NotFound' || error.Code === 'NotFound') {
      return false;
    }

    // If access is denied or another error occurs, rethrow to surface the issue
    throw error;
  }
}

async function generateFilenameFromTitle(title, extension, currentKey) {
  const normalizedBase = normalizeTitleForFilename(title) || 'recording';
  let attempt = 0;
  let candidateBase = normalizedBase;
  let candidateFilename = buildCandidateFilename(candidateBase, extension);

  while (await objectExists(`shared/${candidateFilename}`) && `shared/${candidateFilename}` !== currentKey) {
    attempt += 1;
    if (attempt > 20) {
      candidateBase = `${normalizedBase}-${Date.now()}`;
      candidateFilename = buildCandidateFilename(candidateBase, extension);
      break;
    }

    candidateBase = `${normalizedBase}-${attempt}`;
    candidateFilename = buildCandidateFilename(candidateBase, extension);
  }

  return candidateFilename;
}

function spawnAudioEnhancer(options) {
  return new Promise((resolve, reject) => {
    const {
      key,
      bucket,
      region,
      outputSuffix = AUDIO_ENHANCEMENT_OUTPUT_SUFFIX,
      contentType,
      overwrite = false
    } = options;

    if (!AUDIO_ENHANCEMENT_ENABLED) {
      return resolve({ success: false, reason: 'disabled' });
    }

    if (!fs.existsSync(AUDIO_ENHANCEMENT_SCRIPT)) {
      console.warn('Audio enhancement script not found:', AUDIO_ENHANCEMENT_SCRIPT);
      return resolve({ success: false, reason: 'script_missing' });
    }

    const pythonExecutable = process.env.PYTHON || 'python3';
    const args = [
      AUDIO_ENHANCEMENT_SCRIPT,
      '--bucket', bucket,
      '--region', region,
      '--key', key,
      '--output-suffix', outputSuffix,
      '--overwrite', overwrite ? 'true' : 'false'
    ];

    if (contentType) {
      args.push('--content-type', contentType);
    }

    const child = spawn(pythonExecutable, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, AUDIO_ENHANCEMENT: '1' }
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('error', (spawnError) => {
      console.error('Failed to start audio enhancement process:', spawnError);
      reject(spawnError);
    });

    child.on('close', (code) => {
      if (code === 0) {
        try {
          const parsed = stdout ? JSON.parse(stdout) : {};
          resolve({ success: true, output: parsed, raw: stdout });
        } catch (parseError) {
          console.warn('Audio enhancement JSON parse error:', parseError);
          resolve({ success: true, output: null, raw: stdout });
        }
      } else {
        console.error('Audio enhancement failed:', { code, stdout, stderr });
        resolve({ success: false, reason: 'process_failed', code, stdout, stderr });
      }
    });
  });
}

// Utility function to validate audio file type
function isValidAudioFile(filename) {
  const validExtensions = ['.webm', '.mp3', '.wav', '.ogg', '.m4a'];
  const ext = path.extname(filename).toLowerCase();
  return validExtensions.includes(ext);
}

// API Routes

// Generate presigned URL for upload
app.post('/api/get-upload-url', async (req, res) => {
  try {
    const { filename, contentType, folder } = req.body;

    if (!filename) {
      return res.status(400).json({ error: 'Filename is required' });
    }

    if (!isValidAudioFile(filename)) {
      return res.status(400).json({ error: 'Invalid file type. Only audio files are allowed.' });
    }

    const sanitizedFilename = sanitizeFilename(filename);

    // Support both 'uploads' (default) and 'replies' folders
    const folderPath = folder === 'replies' ? 'replies' : 'uploads';
    const key = `${folderPath}/${sanitizedFilename}`;

    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      ContentType: contentType || 'audio/webm'
    });

    const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 900 }); // 15 minutes

    // Generate public URL for replies
    const publicUrl = folder === 'replies'
      ? `https://${BUCKET_NAME}.s3.amazonaws.com/${key}`
      : null;

    res.json({
      uploadUrl,
      key,
      filename: sanitizedFilename,
      publicUrl // Include public URL for replies
    });
  } catch (error) {
    console.error('Error generating upload URL:', error);
    res.status(500).json({ error: 'Failed to generate upload URL' });
  }
});

// Move file from uploads/ to shared/ after successful upload
app.post('/api/move-to-shared', async (req, res) => {
  try {
    const { filename } = req.body;

    if (!filename) {
      return res.status(400).json({ error: 'Filename is required' });
    }

    const sanitizedFilename = sanitizeFilename(filename);
    const sourceKey = `uploads/${sanitizedFilename}`;
    const destinationKey = `shared/${sanitizedFilename}`;

    // Copy to shared folder (bucket policy handles public access)
    const copyCommand = new CopyObjectCommand({
      Bucket: BUCKET_NAME,
      CopySource: `${BUCKET_NAME}/${sourceKey}`,
      Key: destinationKey
    });

    await s3Client.send(copyCommand);

    // Delete from uploads folder
    const deleteCommand = new DeleteObjectCommand({
      Bucket: BUCKET_NAME,
      Key: sourceKey
    });

    await s3Client.send(deleteCommand);

    const shareableUrl = `https://${BUCKET_NAME}.s3.amazonaws.com/${destinationKey}`;

    res.json({
      success: true,
      shareableUrl,
      filename: sanitizedFilename
    });

    // Fire-and-forget audio enhancement
  if (AUDIO_ENHANCEMENT_ENABLED) {
    spawnAudioEnhancer({
      key: destinationKey,
      bucket: BUCKET_NAME,
      region: REGION,
      overwrite: false
    }).then((result) => {
      if (!result.success) {
        console.warn('Audio enhancement skipped or failed for', destinationKey, result.reason || result);
      } else {
        console.log('Audio enhancement triggered for', destinationKey);
      }
    }).catch((enhancementError) => {
      console.error('Audio enhancement error for', destinationKey, enhancementError);
    });
  }
  } catch (error) {
    console.error('Error moving file to shared:', error);
    res.status(500).json({ error: 'Failed to move file to shared folder' });
  }
});

// List recordings in shared folder
app.get('/api/recordings', async (req, res) => {
  try {
    const command = new ListObjectsV2Command({
      Bucket: BUCKET_NAME,
      Prefix: 'shared/'
    });

    const response = await s3Client.send(command);

    const recordings = (response.Contents || [])
      .filter(item => item.Key !== 'shared/') // Filter out the folder itself
      .map(item => ({
        filename: path.basename(item.Key),
        key: item.Key,
        size: item.Size,
        lastModified: item.LastModified,
        url: `https://${BUCKET_NAME}.s3.amazonaws.com/${item.Key}`
      }))
      .sort((a, b) => b.lastModified - a.lastModified); // Most recent first

    res.json({ recordings });
  } catch (error) {
    console.error('Error listing recordings:', error);
    res.status(500).json({ error: 'Failed to list recordings' });
  }
});

// Delete recording
app.delete('/api/recordings/:filename', async (req, res) => {
  try {
    const { filename } = req.params;

    if (!filename) {
      return res.status(400).json({ error: 'Filename is required' });
    }

    const sanitizedFilename = sanitizeFilename(filename);
    const key = `shared/${sanitizedFilename}`;

    const command = new DeleteObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key
    });

    await s3Client.send(command);

    res.json({
      success: true,
      message: 'Recording deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting recording:', error);
    res.status(500).json({ error: 'Failed to delete recording' });
  }
});

// Transcribe audio using OpenAI Whisper API
app.post('/api/transcribe', async (req, res) => {
  try {
    const { fileUrl } = req.body;

    if (!fileUrl) {
      return res.status(400).json({ error: 'File URL is required' });
    }

    // Check if OpenAI API key is set
    const openaiApiKey = process.env.OPENAI_API_KEY;
    if (!openaiApiKey) {
      return res.status(500).json({
        error: 'OpenAI API key not configured. Please set OPENAI_API_KEY environment variable.'
      });
    }

    // Initialize OpenAI client
    const openai = new OpenAI({ apiKey: openaiApiKey });

    // Download audio file from URL
    const response = await fetch(fileUrl);
    if (!response.ok) {
      throw new Error('Failed to download audio file');
    }

    const buffer = await response.arrayBuffer();
    const audioFile = Buffer.from(buffer);

    // Create a temporary file
    const urlObject = new URL(fileUrl);
    const originalFilename = path.basename(urlObject.pathname);
    const tempFilePath = path.join('/tmp', originalFilename);
    fs.writeFileSync(tempFilePath, audioFile);

    let transcription;

    try {
      // Transcribe using OpenAI Whisper
      transcription = await openai.audio.transcriptions.create({
        file: fs.createReadStream(tempFilePath),
        model: 'whisper-1',
        language: 'en' // Helps with accuracy for English
      });
    } finally {
      try {
        if (fs.existsSync(tempFilePath)) {
          fs.unlinkSync(tempFilePath);
        }
      } catch (cleanupError) {
        console.error('Failed to clean up temp file:', cleanupError);
      }
    }

    let generatedTitle = null;
    let updatedShareableUrl = fileUrl;
    let updatedFilename = path.basename(urlObject.pathname);

  if (AI_TITLE_ENABLED && transcription?.text) {
      try {
        const prompt = `${DEFAULT_TITLE_PROMPT}\n\nTranscript:\n${transcription.text}`;
        const titleResponse = await openai.responses.create({
          model: DEFAULT_TITLE_MODEL,
          input: prompt,
          max_output_tokens: AI_TITLE_MAX_TOKENS,
          temperature: AI_TITLE_TEMPERATURE
        });

        const rawTitle = titleResponse.output_text || titleResponse.outputText || titleResponse.output?.[0]?.content?.[0]?.text || null;
        generatedTitle = cleanGeneratedTitle(rawTitle);

        if (generatedTitle) {
          const currentKey = decodeURIComponent(urlObject.pathname.startsWith('/') ? urlObject.pathname.slice(1) : urlObject.pathname);

          if (currentKey.startsWith('shared/')) {
            const extension = path.extname(currentKey) || '.webm';
            const newFilename = await generateFilenameFromTitle(generatedTitle, extension, currentKey);
            const newKey = `shared/${newFilename}`;

            if (newKey !== currentKey) {
              try {
                await s3Client.send(new CopyObjectCommand({
                  Bucket: BUCKET_NAME,
                  CopySource: `${BUCKET_NAME}/${currentKey}`,
                  Key: newKey,
                  MetadataDirective: 'COPY'
                }));

                await s3Client.send(new DeleteObjectCommand({
                  Bucket: BUCKET_NAME,
                  Key: currentKey
                }));

                updatedShareableUrl = `https://${BUCKET_NAME}.s3.amazonaws.com/${newKey}`;
                updatedFilename = newFilename;
              } catch (renameError) {
                console.error('Failed to rename recording with AI title:', renameError);
              }
            }
          }
        }
      } catch (titleError) {
        console.error('Title generation error:', titleError);
      }
    }

    res.json({
      success: true,
      transcription: transcription?.text || '',
      language: 'en',
      duration: null,
      title: generatedTitle,
      filename: updatedFilename,
      shareableUrl: updatedShareableUrl
    });

  } catch (error) {
    console.error('Transcription error:', error);
    res.status(500).json({
      error: error.message || 'Failed to transcribe audio'
    });
  }
});

// Proxy endpoint for audio files with CORS headers
app.get('/api/audio-proxy', async (req, res) => {
  try {
    const { url } = req.query;

    if (!url) {
      return res.status(400).json({ error: 'URL parameter is required' });
    }

    // Get range header from request
    const range = req.headers.range;

    // Build fetch options
    const fetchOptions = {};
    if (range) {
      fetchOptions.headers = { Range: range };
    }

    // Fetch the audio file with range support
    const response = await fetch(url, fetchOptions);

    if (!response.ok && response.status !== 206) {
      return res.status(response.status).json({ error: 'Failed to fetch audio' });
    }

    // Set CORS headers
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Range, Accept-Ranges, Content-Length, Content-Type');
    res.set('Access-Control-Expose-Headers', 'Content-Length, Content-Type, Content-Range, Accept-Ranges');

    // Set content type
    const contentType = response.headers.get('content-type') || 'audio/webm';
    res.set('Content-Type', contentType);

    // Forward range response headers
    const contentLength = response.headers.get('content-length');
    const contentRange = response.headers.get('content-range');
    const acceptRanges = response.headers.get('accept-ranges');

    if (contentLength) {
      res.set('Content-Length', contentLength);
    }

    if (contentRange) {
      res.set('Content-Range', contentRange);
      res.status(206); // Partial Content
    }

    if (acceptRanges || !contentRange) {
      res.set('Accept-Ranges', 'bytes');
    }

    // Stream the audio
    const buffer = await response.arrayBuffer();
    res.send(Buffer.from(buffer));
  } catch (error) {
    console.error('Audio proxy error:', error);
    res.status(500).json({ error: 'Failed to proxy audio' });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    bucket: BUCKET_NAME,
    region: REGION,
    features: {
      transcription: !!process.env.OPENAI_API_KEY
    }
  });
});

// Create short share link
app.post('/api/create-share-link', async (req, res) => {
  try {
    const { url, title, transcription, duration } = req.body;

    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    // Create a compact data object
    const data = {
      u: url,
      t: title || undefined,
      tr: transcription || undefined,
      d: duration || undefined
    };

    // Remove undefined values
    Object.keys(data).forEach(key => data[key] === undefined && delete data[key]);

    // Encode to base64
    const encoded = Buffer.from(JSON.stringify(data)).toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');

    // Return the short URL
    const origin = req.headers.origin || req.headers.host || req.protocol + '://' + req.get('host');
    const baseUrl = origin.startsWith('http') ? origin : `https://${origin}`;
    const shortUrl = `${baseUrl}/s/${encoded}`;

    res.status(200).json({
      shortUrl,
      hash: encoded
    });
  } catch (error) {
    console.error('Error creating share link:', error);
    res.status(500).json({ error: 'Failed to create share link' });
  }
});

// Get share link data
app.get('/api/get-share-link', async (req, res) => {
  try {
    const { hash } = req.query;

    if (!hash) {
      return res.status(400).json({ error: 'Hash is required' });
    }

    // Decode from base64
    const base64 = hash
      .replace(/-/g, '+')
      .replace(/_/g, '/');

    // Add padding if needed
    const padded = base64 + '='.repeat((4 - base64.length % 4) % 4);

    const decoded = Buffer.from(padded, 'base64').toString('utf-8');
    const data = JSON.parse(decoded);

    // Convert back to full format
    const result = {
      url: data.u,
      title: data.t || null,
      transcription: data.tr || null,
      duration: data.d || null
    };

    res.status(200).json(result);
  } catch (error) {
    console.error('Error retrieving share link:', error);
    res.status(400).json({ error: 'Invalid or corrupted share link' });
  }
});

// Start server (only in non-serverless environments)
if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`\n🎙️  Voice Recording App Server`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`🌐 Server running at: http://localhost:${PORT}`);
    console.log(`📦 S3 Bucket: ${BUCKET_NAME}`);
    console.log(`🌍 Region: ${REGION}`);
    console.log(`✓ Ready to accept requests`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
  });
}

// Export for Vercel serverless
module.exports = app;
