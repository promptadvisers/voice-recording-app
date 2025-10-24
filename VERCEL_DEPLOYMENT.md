# Vercel Deployment Guide

## Environment Variables

Before deploying to Vercel, you need to configure the following environment variables in your Vercel project settings:

### Required Variables

1. **AWS_ACCESS_KEY_ID**
   - Your AWS access key ID for S3 access
   - Found in your `voice-recording-api-user_accessKeys.csv` file

2. **AWS_SECRET_ACCESS_KEY**
   - Your AWS secret access key for S3 access
   - Found in your `voice-recording-api-user_accessKeys.csv` file

3. **AWS_REGION**
   - Set to: `us-east-1`
   - The AWS region where your S3 bucket is located

4. **OPENAI_API_KEY**
   - Your OpenAI API key for transcription and AI features
   - Get from: https://platform.openai.com/api-keys

### Optional Variables

5. **OPENAI_TITLE_MODEL** (default: `gpt-4.1-mini`)
   - The OpenAI model to use for generating titles

6. **ENABLE_AI_TITLES** (default: `true`)
   - Set to `false` to disable AI-generated titles

7. **AI_TITLE_TEMPERATURE** (default: `0.2`)
   - Controls creativity of title generation (0.0 to 2.0)

8. **AI_TITLE_MAX_TOKENS** (default: `20`)
   - Maximum tokens for title generation

9. **AI_TITLE_PROMPT** (default: `"Summarize the following transcript in 1 to 4 words. Return only the concise title."`)
   - Custom prompt for title generation

10. **ENABLE_AUDIO_ENHANCEMENT** (default: `false`)
    - Set to `true` to enable audio enhancement (requires Python setup)

## Deployment Steps

1. **Install Vercel CLI** (if not already installed):
   ```bash
   npm install -g vercel
   ```

2. **Login to Vercel**:
   ```bash
   vercel login
   ```

3. **Set Environment Variables**:
   ```bash
   vercel env add AWS_ACCESS_KEY_ID
   vercel env add AWS_SECRET_ACCESS_KEY
   vercel env add AWS_REGION
   vercel env add OPENAI_API_KEY
   ```

   Or add them through the Vercel dashboard:
   - Go to your project settings
   - Navigate to "Environment Variables"
   - Add each variable for Production, Preview, and Development

4. **Deploy**:
   ```bash
   vercel --prod
   ```

## Important Notes

### Limitations on Vercel

1. **Serverless Function Timeout**: Functions have a maximum execution time of 30 seconds (configurable in vercel.json)

2. **File System**: The `/tmp` directory is the only writable location in serverless functions. The transcription endpoint uses this for temporary file storage.

3. **CSV Credentials**: The `voice-recording-api-user_accessKeys.csv` file is used locally but should NOT be deployed. Instead, use environment variables in Vercel.

4. **Audio Enhancement**: The Python-based audio enhancement feature may not work in Vercel's serverless environment without additional configuration. Consider using a separate service for this feature.

### Security Recommendations

1. **Never commit** your `.env` file or `voice-recording-api-user_accessKeys.csv` to version control

2. **Use Vercel's environment variable encryption** for sensitive data

3. **Rotate your API keys** periodically

4. **Consider using AWS IAM roles** instead of long-lived access keys for production

## Testing Your Deployment

After deployment, test the following endpoints:

1. **Health Check**: `https://your-app.vercel.app/api/health`
2. **Frontend**: `https://your-app.vercel.app/`
3. **Test Recording**: Try recording and transcribing audio

## Troubleshooting

### Build Fails
- Check that all dependencies are listed in `package.json`
- Ensure Node.js version matches (>=18.0.0)

### 500 Errors
- Check Vercel function logs in the dashboard
- Verify all environment variables are set correctly
- Ensure AWS credentials have proper S3 permissions

### Static Files Not Loading
- Verify the `public/` directory exists and contains your frontend files
- Check the `vercel.json` routes configuration

## Rollback

If you need to rollback to a previous deployment:

```bash
vercel rollback
```

Or use the Vercel dashboard to promote a previous deployment.
