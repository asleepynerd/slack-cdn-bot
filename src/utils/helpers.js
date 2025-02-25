const crypto = require('crypto');
const path = require('path');

function generateRandomFilename(originalFilename) {
  const ext = path.extname(originalFilename);
  const randomName = crypto.randomBytes(16).toString('hex');
  return `${randomName}${ext}`;
}

function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

function formatDate(date) {
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function getRandomResponse(responses) {
  return responses[Math.floor(Math.random() * responses.length)];
}

function getConversationKey(channelId, threadTs) {
  return threadTs ? `${channelId}-${threadTs}` : channelId;
}

module.exports = {
  generateRandomFilename,
  formatBytes,
  formatDate,
  getRandomResponse,
  getConversationKey
}; 