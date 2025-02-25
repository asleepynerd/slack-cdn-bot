const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const https = require('https');
const { generateRandomFilename } = require('../utils/helpers');
const { PUBLIC_URLS } = require('../config/constants');

const s3Client = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.CLOUDFLARE_ACCESS_KEY_ID,
    secretAccessKey: process.env.CLOUDFLARE_SECRET_ACCESS_KEY,
  }
});

async function downloadFile(url, headers) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => resolve(Buffer.concat(chunks)));
      response.on('error', reject);
    }).on('error', reject);
  });
}

async function uploadToStorage(fileData, originalFilename, prefix = 'slackcdn') {
  const filename = generateRandomFilename(originalFilename);
  const key = `${prefix}/${filename}`;

  await s3Client.send(new PutObjectCommand({
    Bucket: process.env.CLOUDFLARE_BUCKET_NAME,
    Key: key,
    Body: fileData,
    ContentType: fileData.mimetype || 'application/octet-stream'
  }));

  const publicUrlPrefix = PUBLIC_URLS[Math.floor(Math.random() * PUBLIC_URLS.length)];
  const publicUrl = `${publicUrlPrefix}/${filename}`;

  return {
    filename,
    key,
    publicUrl
  };
}

async function uploadFromSlack(file) {
  const fileData = await downloadFile(
    file.url_private,
    { Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}` }
  );

  return uploadToStorage(fileData, file.name);
}

module.exports = {
  s3Client,
  downloadFile,
  uploadToStorage,
  uploadFromSlack
}; 