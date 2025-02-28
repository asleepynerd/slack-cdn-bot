const { formatBytes, formatDate } = require('../utils/helpers');
const { getUploadsByUser } = require('../services/db');
const path = require('path');

function generateUserStats(userUploads) {
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

  return {
    totalUploads: userUploads.length,
    totalBytes: userTotalBytes,
    topFileTypes: topFileTypes || 'No uploads yet'
  };
}

function generateStatsSection(stats) {
  return {
    type: "section",
    text: {
      type: "mrkdwn",
      text: "*Your Upload Stats*\n" +
            `• Total uploads: ${stats.totalUploads}\n` +
            `• Total storage used: ${formatBytes(stats.totalBytes)}\n` +
            `• Most used file types: ${stats.topFileTypes}`
    }
  };
}

function generateUploadItem(upload) {
  return {
    type: "section",
    text: {
      type: "mrkdwn",
      text: `*${upload.originalFilename}*\n` +
            `• Uploaded: ${formatDate(upload.timestamp)}\n` +
            `• Size: ${formatBytes(upload.fileSize)}\n` +
            `• URL: ${upload.publicUrl}`
    }
  };
}

function generateRecentUploadsSection(userUploads) {
  const blocks = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: "📂 Recent Uploads",
        emoji: true
      }
    }
  ];

  const recentUploads = userUploads
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, 10);

  if (recentUploads.length === 0) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: "No uploads yet! Head over to #cdn to upload some files~ ✨"
      }
    });
    return blocks;
  }

  blocks.push({ type: "divider" });
  
  recentUploads.forEach(upload => {
    blocks.push(generateUploadItem(upload));
    blocks.push({ type: "divider" });
  });

  return blocks;
}

function generateHomeView(userId) {
  const userUploads = getUploadsByUser(userId);
  const stats = generateUserStats(userUploads);

  const blocks = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: "✨ Your CDN Dashboard ✨",
        emoji: true
      }
    },
    generateStatsSection(stats),
    ...generateRecentUploadsSection(userUploads)
  ];

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