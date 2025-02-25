const { formatBytes, formatDate } = require('../utils/helpers');
const { getUploadsByUser } = require('../services/db');
const path = require('path');

function generateHomeView(userId) {
  const userUploads = getUploadsByUser(userId);
  const userTotalBytes = userUploads.reduce((sum, upload) => sum + upload.fileSize, 0);

  const fileTypes = {};
  userUploads.forEach(upload => {
    const ext = path.extname(upload.originalFilename).toLowerCase();
    fileTypes[ext] = (fileTypes[ext] || 0) + 1;
  });

  const topFileTypes = Object.entries(fileTypes)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 3)
    .map(([ext, count]) => `${ext || 'no extension'}: ${count}`)
    .join(', ');

  const recentUploads = userUploads
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, 10);

  const blocks = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: "✨ Your CDN Dashboard ✨",
        emoji: true
      }
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: "*Your Upload Stats*\n" +
              `• Total uploads: ${userUploads.length}\n` +
              `• Total storage used: ${formatBytes(userTotalBytes)}\n` +
              `• Most used file types: ${topFileTypes || 'No uploads yet'}`
      }
    },
    {
      type: "header",
      text: {
        type: "plain_text",
        text: "📂 Recent Uploads",
        emoji: true
      }
    }
  ];

  if (recentUploads.length > 0) {
    blocks.push({ type: "divider" });
  }

  recentUploads.forEach(upload => {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*${upload.originalFilename}*\n` +
              `• Uploaded: ${formatDate(upload.timestamp)}\n` +
              `• Size: ${formatBytes(upload.fileSize)}\n` +
              `• URL: ${upload.publicUrl}`
      }
    },
    {
      type: "divider"
    });
  });

  if (recentUploads.length === 0) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: "No uploads yet! Head over to #cdn to upload some files~ ✨"
      }
    });
  }

  return {
    type: "home",
    blocks: blocks
  };
}

async function handleHomeOpened(event, client) {
  try {
    const view = generateHomeView(event.user);
    await client.views.publish({
      user_id: event.user,
      view: view
    });
  } catch (error) {
    console.error('Error publishing home view:', error);
  }
}

module.exports = {
  handleHomeOpened,
  generateHomeView
}; 