const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');
const crypto = require('crypto');

const adapter = new FileSync('db.json');
const db = low(adapter);

db.defaults({ uploads: [] }).write();

function addUpload({
  originalFilename,
  storedFilename,
  publicUrl,
  fileSize,
  mimeType,
  uploader,
  slack = null,
  storage
}) {
  return db.get('uploads')
    .push({
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      originalFilename,
      storedFilename,
      publicUrl,
      fileSize,
      mimeType,
      uploader,
      slack,
      storage
    })
    .write();
}

function getUploads() {
  return db.get('uploads').value();
}

function getUploadsByUser(userId) {
  return db.get('uploads')
    .filter(upload => upload.uploader.id === userId)
    .value();
}

function getTimePeriodStats(days) {
  const now = new Date();
  const period = new Date(now - days * 24 * 60 * 60 * 1000);
  return db.get('uploads')
    .filter(upload => new Date(upload.timestamp) > period)
    .value();
}

function getTotalStorageUsed() {
  return db.get('uploads')
    .reduce((sum, upload) => sum + upload.fileSize, 0)
    .value();
}

module.exports = {
  db,
  addUpload,
  getUploads,
  getUploadsByUser,
  getTimePeriodStats,
  getTotalStorageUsed
}; 