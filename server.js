const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const { S3Client, PutObjectCommand, CopyObjectCommand, DeleteObjectCommand, ListObjectsV2Command, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const rateLimit = require('express-rate-limit');
const OpenAI = require('openai');

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
const BUCKET_NAME = 'voice-recording-app';
const REGION = 'us-east-1';

// Read AWS credentials from CSV file
function loadAWSCredentials() {
  try {
    const csvPath = path.join(__dirname, 'voice-recording-api-user_accessKeys.csv');
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

    console.log('✓ AWS credentials loaded successfully');
    return true;
  } catch (error) {
    console.error('Error loading AWS credentials:', error.message);
    return false;
  }
}

// Initialize AWS on startup
if (!loadAWSCredentials()) {
  console.error('Failed to load AWS credentials. Server will not start.');
  process.exit(1);
}

// Utility function to sanitize filenames
function sanitizeFilename(filename) {
  return filename
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_{2,}/g, '_')
    .substring(0, 255);
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
    const { filename, contentType } = req.body;

    if (!filename) {
      return res.status(400).json({ error: 'Filename is required' });
    }

    if (!isValidAudioFile(filename)) {
      return res.status(400).json({ error: 'Invalid file type. Only audio files are allowed.' });
    }

    const sanitizedFilename = sanitizeFilename(filename);
    const key = `uploads/${sanitizedFilename}`;

    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      ContentType: contentType || 'audio/webm'
    });

    const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 900 }); // 15 minutes

    res.json({
      uploadUrl,
      key,
      filename: sanitizedFilename
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
    const filename = path.basename(fileUrl);
    const tempFilePath = path.join('/tmp', filename);
    fs.writeFileSync(tempFilePath, audioFile);

    // Transcribe using OpenAI Whisper
    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(tempFilePath),
      model: 'whisper-1',
      language: 'en' // Helps with accuracy for English
    });

    // Clean up temp file
    fs.unlinkSync(tempFilePath);

    res.json({
      success: true,
      transcription: transcription.text,
      language: 'en',
      duration: null
    });

  } catch (error) {
    console.error('Transcription error:', error);
    res.status(500).json({
      error: error.message || 'Failed to transcribe audio'
    });
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

// Start server
app.listen(PORT, () => {
  console.log(`\n🎙️  Voice Recording App Server`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`🌐 Server running at: http://localhost:${PORT}`);
  console.log(`📦 S3 Bucket: ${BUCKET_NAME}`);
  console.log(`🌍 Region: ${REGION}`);
  console.log(`✓ Ready to accept requests`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
});
