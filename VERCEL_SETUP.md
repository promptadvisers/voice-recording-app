# Vercel Deployment Guide

This guide will help you deploy your Voice Recording App to Vercel with all necessary environment variables.

## Prerequisites

1. **Vercel Account**: Sign up at https://vercel.com
2. **Vercel CLI**: Install globally
   ```bash
   npm install -g vercel
   ```
3. **Login to Vercel**:
   ```bash
   vercel login
   ```

## Quick Setup (Automatic)

Use the provided script to automatically set all environment variables:

```bash
./setup-vercel-env.sh
```

Then deploy:
```bash
vercel --prod
```

## Manual Setup

### Step 1: Deploy to Vercel

```bash
vercel
```

Follow the prompts:
- Set up and deploy? **Yes**
- Which scope? Select your account
- Link to existing project? **No**
- What's your project's name? **voice-recording-app** (or your preferred name)
- In which directory is your code located? **.**
- Want to override the settings? **No**

### Step 2: Add Environment Variables

You need to add these environment variables to Vercel. You can do this via:
- **Vercel Dashboard**: Project Settings → Environment Variables
- **Vercel CLI**: Use the commands below

#### Required Variables

```bash
# OpenAI API Key (from your .env file)
vercel env add OPENAI_API_KEY production
vercel env add OPENAI_API_KEY preview

# AWS Access Key ID (from your CSV file)
vercel env add AWS_ACCESS_KEY_ID production
vercel env add AWS_ACCESS_KEY_ID preview

# AWS Secret Access Key (from your CSV file)
vercel env add AWS_SECRET_ACCESS_KEY production
vercel env add AWS_SECRET_ACCESS_KEY preview

# AWS Region
vercel env add AWS_REGION production
# Enter: us-east-1
vercel env add AWS_REGION preview
# Enter: us-east-1

# AWS Default Region
vercel env add AWS_DEFAULT_REGION production
# Enter: us-east-1
vercel env add AWS_DEFAULT_REGION preview
# Enter: us-east-1
```

#### Optional Variables (AI Title Generation)

```bash
# Enable AI-powered title generation
vercel env add ENABLE_AI_TITLES production
# Enter: true
vercel env add ENABLE_AI_TITLES preview
# Enter: true

# OpenAI model for titles
vercel env add OPENAI_TITLE_MODEL production
# Enter: gpt-4.1-mini
vercel env add OPENAI_TITLE_MODEL preview
# Enter: gpt-4.1-mini

# Temperature for title generation
vercel env add AI_TITLE_TEMPERATURE production
# Enter: 0.2
vercel env add AI_TITLE_TEMPERATURE preview
# Enter: 0.2

# Max tokens for titles
vercel env add AI_TITLE_MAX_TOKENS production
# Enter: 20
vercel env add AI_TITLE_MAX_TOKENS preview
# Enter: 20

# Node environment
vercel env add NODE_ENV production
# Enter: production
vercel env add NODE_ENV preview
# Enter: development
```

### Step 3: Deploy to Production

```bash
vercel --prod
```

## Finding Your Credentials

### OpenAI API Key
Located in your `.env` file:
```
OPENAI_API_KEY=sk-proj-...
```

### AWS Credentials
Located in `voice-recording-api-user_accessKeys.csv`:
- **Access Key ID**: First column (e.g., AKIAZI2LD6ZI2DDNZ5WE)
- **Secret Access Key**: Second column

## Via Vercel Dashboard

1. Go to https://vercel.com/dashboard
2. Select your project
3. Go to **Settings** → **Environment Variables**
4. Add each variable with these settings:
   - **Production**: Check this for production deployments
   - **Preview**: Check this for preview deployments
   - **Development**: Usually not needed for serverless

## Troubleshooting

### Error: FUNCTION_INVOCATION_FAILED

**Cause**: Missing environment variables or incorrect AWS credentials

**Solution**:
1. Verify all environment variables are set in Vercel dashboard
2. Check AWS credentials are correct
3. Ensure OpenAI API key is valid
4. Check Vercel logs: `vercel logs [deployment-url]`

### Error: S3 Access Denied

**Cause**: AWS credentials don't have proper S3 permissions

**Solution**:
1. Verify IAM user has `AmazonS3FullAccess` policy
2. Check bucket name matches in server.js (default: `voice-recording-app`)
3. Ensure bucket is in `us-east-1` region

### Static Files Not Loading

**Cause**: Incorrect routing configuration

**Solution**:
Verify `vercel.json` has correct rewrites:
```json
{
  "rewrites": [
    { "source": "/api/(.*)", "destination": "/api/index.js" },
    { "source": "/(.*)", "destination": "/public/$1" }
  ]
}
```

### Transcription Fails

**Cause**: OpenAI API key not set or invalid

**Solution**:
1. Verify `OPENAI_API_KEY` is set in Vercel environment variables
2. Check you have credits in your OpenAI account
3. Test API key locally first

## Verifying Deployment

After deployment, test these endpoints:

1. **Health Check**: `https://your-app.vercel.app/api/health`
   - Should return: `{"status": "ok", ...}`

2. **Static Files**: `https://your-app.vercel.app/`
   - Should load the recording interface

3. **Recording**: Try recording and uploading audio
   - Should upload to S3
   - Should transcribe successfully

## Updating Environment Variables

To update an existing variable:

```bash
vercel env rm VARIABLE_NAME production
vercel env add VARIABLE_NAME production
```

Or use the Vercel Dashboard.

## Redeploying

After making code changes:

```bash
git add .
git commit -m "Your changes"
git push
vercel --prod
```

Or if using Vercel Git integration, just push to your connected repository.

## Cost Considerations

- **Vercel**: Free tier includes 100 GB bandwidth/month
- **AWS S3**: ~$0.023 per GB stored, $0.09 per GB transferred
- **OpenAI Whisper**: ~$0.006 per minute of audio
- **OpenAI GPT (titles)**: ~$0.15 per 1M tokens

Estimated costs for 1000 recordings (1 min each):
- S3 Storage: ~$0.02/month
- Whisper transcription: ~$6
- Title generation: ~$0.10
- **Total**: ~$6.12 for 1000 recordings

## Security Notes

1. **Never commit** `.env` or CSV files to git
2. Use environment variables for all secrets
3. Rotate AWS keys periodically
4. Monitor OpenAI usage for unexpected charges
5. Enable rate limiting (already configured in server.js)

## Support

If you encounter issues:
1. Check Vercel logs: `vercel logs [deployment-url]`
2. Review Vercel dashboard for build errors
3. Test locally first: `npm start`
4. Verify all environment variables are set

---

**Made with ❤️ for seamless serverless deployment**
