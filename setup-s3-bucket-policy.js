#!/usr/bin/env node

/**
 * Setup S3 Bucket Policy for Public Access to Replies Folder
 * Allows public read access to files in the replies/ folder
 */

const { S3Client, PutBucketPolicyCommand, GetBucketPolicyCommand } = require('@aws-sdk/client-s3');
const { parse } = require('csv-parse/sync');
const fs = require('fs');
const path = require('path');

const BUCKET_NAME = 'voice-recording-app';
const REGION = 'us-east-1';

// Bucket policy that allows public read access to replies folder
const bucketPolicy = {
  Version: '2012-10-17',
  Statement: [
    {
      Sid: 'PublicReadGetObjectForReplies',
      Effect: 'Allow',
      Principal: '*',
      Action: 's3:GetObject',
      Resource: `arn:aws:s3:::${BUCKET_NAME}/replies/*`
    },
    {
      Sid: 'PublicReadGetObjectForShared',
      Effect: 'Allow',
      Principal: '*',
      Action: 's3:GetObject',
      Resource: `arn:aws:s3:::${BUCKET_NAME}/shared/*`
    }
  ]
};

// Load AWS credentials from CSV
function loadAWSCredentials() {
  try {
    const csvPath = path.join(__dirname, 'voice-recording-api-user_accessKeys.csv');

    if (!fs.existsSync(csvPath)) {
      throw new Error('AWS credentials CSV file not found');
    }

    const csvContent = fs.readFileSync(csvPath, 'utf-8');
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

    return new S3Client({
      region: REGION,
      credentials: {
        accessKeyId: accessKeyId,
        secretAccessKey: secretAccessKey
      }
    });
  } catch (error) {
    console.error('❌ Error loading AWS credentials:', error.message);
    process.exit(1);
  }
}

// Setup bucket policy
async function setupBucketPolicy() {
  console.log('\n🔒 Setting up S3 Bucket Policy');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const s3Client = loadAWSCredentials();

  try {
    // Check existing bucket policy
    console.log('📋 Checking existing bucket policy...');
    try {
      const getCommand = new GetBucketPolicyCommand({ Bucket: BUCKET_NAME });
      const existingPolicy = await s3Client.send(getCommand);
      console.log('✓ Current bucket policy found');
      console.log(existingPolicy.Policy);
      console.log();
    } catch (error) {
      if (error.name === 'NoSuchBucketPolicy') {
        console.log('ℹ No existing bucket policy found');
      } else {
        throw error;
      }
    }

    // Apply new bucket policy
    console.log('🔧 Applying new bucket policy...');
    const putCommand = new PutBucketPolicyCommand({
      Bucket: BUCKET_NAME,
      Policy: JSON.stringify(bucketPolicy)
    });

    await s3Client.send(putCommand);

    console.log('✅ Bucket policy applied successfully!\n');
    console.log('Configuration details:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Bucket:', BUCKET_NAME);
    console.log('Region:', REGION);
    console.log('Public Access:');
    console.log('  - replies/* (voice replies)');
    console.log('  - shared/* (shared recordings)');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('✓ Reply recordings will now be publicly accessible!');
    console.log('✓ Files in replies/ folder can be accessed without authentication.\n');

  } catch (error) {
    console.error('❌ Failed to setup bucket policy:', error.message);
    console.error('\nTroubleshooting:');
    console.error('1. Ensure your AWS credentials have s3:PutBucketPolicy permission');
    console.error('2. Verify the bucket name is correct');
    console.error('3. Check that Block Public Access settings allow this policy');
    console.error('4. You may need to disable "Block all public access" in S3 console\n');
    process.exit(1);
  }
}

// Run the setup
setupBucketPolicy();
