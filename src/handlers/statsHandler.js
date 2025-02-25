const { formatBytes } = require('../utils/helpers');
const { db, getTimePeriodStats } = require('../services/db');
const path = require('path');

async function handleCdnStats(command) {
  try {
    const uploads = db.get('uploads').value();
    
    const todayUploads = getTimePeriodStats(1);
    const weekUploads = getTimePeriodStats(7);
    const monthUploads = getTimePeriodStats(30);

    const totalBytes = uploads.reduce((sum, upload) => sum + upload.fileSize, 0);
    
    const userUploads = uploads.filter(upload => upload.uploader.id === command.user_id);
    const userTotalBytes = userUploads.reduce((sum, upload) => sum + upload.fileSize, 0);

    const fileTypes = {};
    uploads.forEach(upload => {
      const ext = path.extname(upload.originalFilename).toLowerCase();
      fileTypes[ext] = (fileTypes[ext] || 0) + 1;
    });

    const topFileTypes = Object.entries(fileTypes)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 3)
      .map(([ext, count]) => `${ext || 'no extension'}: ${count}`)
      .join(', ');

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
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: "*Overall Stats:*\n" +
                  `• Total files stored: ${uploads.length}\n` +
                  `• Total storage used: ${formatBytes(totalBytes)}\n` +
                  `• Most common file types: ${topFileTypes}\n` +
                  `• First upload: ${uploads[0]?.timestamp || 'No uploads yet'}`
          }
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: "*Recent Activity:*\n" +
                  `• Today: ${todayUploads.length} uploads\n` +
                  `• This week: ${weekUploads.length} uploads\n` +
                  `• This month: ${monthUploads.length} uploads`
          }
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: "*Your Stats:*\n" +
                  `• Your total uploads: ${userUploads.length}\n` +
                  `• Your storage used: ${formatBytes(userTotalBytes)}\n` +
                  `• Your last upload: ${userUploads.length > 0 ? new Date(userUploads[userUploads.length - 1].timestamp).toLocaleDateString() : 'Never'}`
          }
        }
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