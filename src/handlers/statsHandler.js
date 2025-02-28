const { formatBytes } = require('../utils/helpers');
const { db, getTimePeriodStats } = require('../services/db');
const path = require('path');

function getFileTypeStats(uploads) {
  const fileTypes = {};
  uploads.forEach(upload => {
    const ext = path.extname(upload.originalFilename).toLowerCase();
    fileTypes[ext] = (fileTypes[ext] || 0) + 1;
  });

  return Object.entries(fileTypes)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 3)
    .map(([ext, count]) => `${ext || 'no extension'}: ${count}`)
    .join(', ');
}

function calculateTotalStats(uploads) {
  const totalBytes = uploads.reduce((sum, upload) => sum + upload.fileSize, 0);
  const topFileTypes = getFileTypeStats(uploads);

  return {
    totalFiles: uploads.length,
    totalBytes,
    topFileTypes,
    firstUpload: uploads[0]?.timestamp || 'No uploads yet'
  };
}

function calculateUserStats(uploads, userId) {
  const userUploads = uploads.filter(upload => upload.uploader.id === userId);
  const userTotalBytes = userUploads.reduce((sum, upload) => sum + upload.fileSize, 0);
  const lastUpload = userUploads.length > 0 
    ? new Date(userUploads[userUploads.length - 1].timestamp).toLocaleDateString() 
    : 'Never';

  return {
    totalUploads: userUploads.length,
    totalBytes: userTotalBytes,
    lastUpload
  };
}

function generateOverallStatsBlock(stats) {
  return {
    type: "section",
    text: {
      type: "mrkdwn",
      text: "*Overall Stats:*\n" +
            `• Total files stored: ${stats.totalFiles}\n` +
            `• Total storage used: ${formatBytes(stats.totalBytes)}\n` +
            `• Most common file types: ${stats.topFileTypes}\n` +
            `• First upload: ${stats.firstUpload}`
    }
  };
}

function generateRecentActivityBlock(recentStats) {
  return {
    type: "section",
    text: {
      type: "mrkdwn",
      text: "*Recent Activity:*\n" +
            `• Today: ${recentStats.today} uploads\n` +
            `• This week: ${recentStats.week} uploads\n` +
            `• This month: ${recentStats.month} uploads`
    }
  };
}

function generateUserStatsBlock(stats) {
  return {
    type: "section",
    text: {
      type: "mrkdwn",
      text: "*Your Stats:*\n" +
            `• Your total uploads: ${stats.totalUploads}\n` +
            `• Your storage used: ${formatBytes(stats.totalBytes)}\n` +
            `• Your last upload: ${stats.lastUpload}`
    }
  };
}

async function handleCdnStats(command) {
  try {
    const uploads = db.get('uploads').value();
    
    // Get recent activity stats
    const recentStats = {
      today: getTimePeriodStats(1).length,
      week: getTimePeriodStats(7).length,
      month: getTimePeriodStats(30).length
    };

    // Calculate overall and user stats
    const overallStats = calculateTotalStats(uploads);
    const userStats = calculateUserStats(uploads, command.user_id);

    return {
      blocks: [
        {
          type: "header",
          text: {
            type: "plain_text",
            text: "✨ CDN Statistics ✨",
            emoji: true
          }
        },
        generateOverallStatsBlock(overallStats),
        generateRecentActivityBlock(recentStats),
        generateUserStatsBlock(userStats)
      ]
    };

  } catch (error) {
    console.error('Error generating stats:', error);
    return {
      text: "😅 Oops! I had trouble getting those stats. Try again?",
      response_type: 'ephemeral'
    };
  }
}

module.exports = {
  handleCdnStats
}; 