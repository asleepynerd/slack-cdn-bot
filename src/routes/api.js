const express = require('express');
const { uploadToStorage } = require('../services/storage');
const { addUpload, getUploads, getTotalStorageUsed } = require('../services/db');
const { uploadCounter, storageBytes } = require('../services/metrics');
const { uploadLimiter } = require('../middleware/rateLimiter');
const crypto = require('crypto');

const router = express.Router();

router.post('/upload', uploadLimiter, async (req, res) => {
  try {
    if (!req.files || Object.keys(req.files).length === 0) {
      return res.status(400).json({ error: 'No files were uploaded.' });
    }

    const file = req.files.file;
    const { filename, key } = await uploadToStorage(file.data, file.name);
    const publicUrl = `https://cdn.hack.ngo/slackcdn/${filename}`;

    uploadCounter.inc({ status: 'success' });
    
    addUpload({
      originalFilename: file.name,
      storedFilename: filename,
      publicUrl,
      fileSize: file.size,
      mimeType: file.mimetype,
      uploader: {
        type: 'api',
        endpoint: 'upload'
      },
      storage: {
        bucket: process.env.CLOUDFLARE_BUCKET_NAME,
        key
      }
    });

    storageBytes.set(getTotalStorageUsed());

    res.json({
      success: true,
      url: publicUrl,
      filename: filename
    });

  } catch (error) {
    console.error('Error in /upload:', error);
    uploadCounter.inc({ status: 'error' });
    res.status(500).json({ 
      error: 'Failed to upload file',
      message: error.message 
    });
  }
});

router.post('/sy-sv', uploadLimiter, async (req, res) => {
  try {
    if (!req.files || Object.keys(req.files).length === 0) {
      return res.status(400).json({ error: 'No files were uploaded.' });
    }

    const file = req.files.file;
    const { filename, key, publicUrl } = await uploadToStorage(file.data, file.name, 'sysv');

    uploadCounter.inc({ status: 'success' });
    
    addUpload({
      originalFilename: file.name,
      storedFilename: filename,
      publicUrl,
      fileSize: file.size,
      mimeType: file.mimetype,
      uploader: {
        type: 'api',
        endpoint: 'sy-sv'
      },
      storage: {
        bucket: process.env.CLOUDFLARE_BUCKET_NAME,
        key
      }
    });

    storageBytes.set(getTotalStorageUsed());

    res.json({
      success: true,
      url: publicUrl,
      filename: filename
    });

  } catch (error) {
    console.error('Error in /sy-sv upload:', error);
    uploadCounter.inc({ status: 'error' });
    res.status(500).json({ 
      error: 'Failed to upload file',
      message: error.message 
    });
  }
});

router.get('/healthz', async (req, res) => {
  try {
    const testFile = Buffer.from('Health check test file');
    const filename = `healthcheck-${Date.now()}.txt`;
    const { key } = await uploadToStorage(testFile, filename, 'healthcheck');

    const uploads = getUploads();
    const totalBytes = getTotalStorageUsed();

    res.json({
      status: 'healthy',
      uptime: process.uptime(),
      stats: {
        totalUploads: uploads.length,
        totalStorageBytes: totalBytes
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Health check failed:', error);
    res.status(500).json({
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

router.get('/', (req, res) => {
  res.redirect('https://sleepy.engineer');
});

module.exports = router; 