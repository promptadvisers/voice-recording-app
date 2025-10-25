#!/bin/bash

# Script to set up all Vercel environment variables
# Run this after deploying to Vercel: ./setup-vercel-env.sh

echo "🚀 Setting up Vercel Environment Variables..."
echo ""

# Check if vercel CLI is installed
if ! command -v vercel &> /dev/null; then
    echo "❌ Vercel CLI is not installed. Please install it first:"
    echo "   npm install -g vercel"
    exit 1
fi

# Load .env file
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
else
    echo "❌ .env file not found!"
    exit 1
fi

# Read AWS credentials from CSV
if [ -f voice-recording-api-user_accessKeys.csv ]; then
    # Skip the header and read the first data line
    AWS_CREDS=$(tail -n 1 voice-recording-api-user_accessKeys.csv)
    AWS_ACCESS_KEY_ID=$(echo $AWS_CREDS | cut -d',' -f1)
    AWS_SECRET_ACCESS_KEY=$(echo $AWS_CREDS | cut -d',' -f2)
else
    echo "❌ AWS credentials CSV file not found!"
    exit 1
fi

echo "Setting environment variables in Vercel..."
echo ""

# Set all environment variables for production, preview, and development
vercel env add OPENAI_API_KEY production <<< "$OPENAI_API_KEY"
vercel env add OPENAI_API_KEY preview <<< "$OPENAI_API_KEY"

vercel env add AWS_ACCESS_KEY_ID production <<< "$AWS_ACCESS_KEY_ID"
vercel env add AWS_ACCESS_KEY_ID preview <<< "$AWS_ACCESS_KEY_ID"

vercel env add AWS_SECRET_ACCESS_KEY production <<< "$AWS_SECRET_ACCESS_KEY"
vercel env add AWS_SECRET_ACCESS_KEY preview <<< "$AWS_SECRET_ACCESS_KEY"

vercel env add AWS_REGION production <<< "us-east-1"
vercel env add AWS_REGION preview <<< "us-east-1"

vercel env add AWS_DEFAULT_REGION production <<< "us-east-1"
vercel env add AWS_DEFAULT_REGION preview <<< "us-east-1"

vercel env add NODE_ENV production <<< "production"
vercel env add NODE_ENV preview <<< "development"

vercel env add ENABLE_AI_TITLES production <<< "${ENABLE_AI_TITLES:-true}"
vercel env add ENABLE_AI_TITLES preview <<< "${ENABLE_AI_TITLES:-true}"

vercel env add OPENAI_TITLE_MODEL production <<< "${OPENAI_TITLE_MODEL:-gpt-4.1-mini}"
vercel env add OPENAI_TITLE_MODEL preview <<< "${OPENAI_TITLE_MODEL:-gpt-4.1-mini}"

vercel env add AI_TITLE_TEMPERATURE production <<< "${AI_TITLE_TEMPERATURE:-0.2}"
vercel env add AI_TITLE_TEMPERATURE preview <<< "${AI_TITLE_TEMPERATURE:-0.2}"

vercel env add AI_TITLE_MAX_TOKENS production <<< "${AI_TITLE_MAX_TOKENS:-20}"
vercel env add AI_TITLE_MAX_TOKENS preview <<< "${AI_TITLE_MAX_TOKENS:-20}"

echo ""
echo "✅ All environment variables have been set in Vercel!"
echo ""
echo "Next steps:"
echo "1. Run: vercel --prod"
echo "2. Your app should now work on Vercel!"
