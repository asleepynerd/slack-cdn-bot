const { uploadFromSlack } = require('../services/storage');
const { addUpload } = require('../services/db');
const { addReaction, removeReaction, sendMessage } = require('../services/slack');
const { getRandomResponse } = require('../utils/helpers');
const { SINGLE_FILE_RESPONSES, MULTI_FILE_RESPONSES } = require('../config/constants');
const { uploadLatency, uploadCounter, storageBytes } = require('../services/metrics');

const recentlyProcessedFiles = new Set();
const DEDUP_EXPIRY_MS = 60000;

function clearFileFromDedup(fileId) {
  setTimeout(() => {
    recentlyProcessedFiles.delete(fileId);
  }, DEDUP_EXPIRY_MS);
}

async function handleFileUpload(message, client) {
  if (!message.files || message.files.length === 0) {
    return;
  }

  try {
    await addReaction(client, message.channel, message.ts, 'loading');

    const newFiles = message.files.filter(file => !recentlyProcessedFiles.has(file.id));
    
    if (newFiles.length === 0) {
      await removeReaction(client, message.channel, message.ts, 'loading');
      return;
    }

    newFiles.forEach(file => {
      recentlyProcessedFiles.add(file.id);
      clearFileFromDedup(file.id);
    });

    const startTime = process.hrtime();
    const results = await Promise.allSettled(newFiles.map(async (file) => {
      try {
        const { filename, key, publicUrl } = await uploadFromSlack(file);

        addUpload({
          originalFilename: file.name,
          storedFilename: filename,
          publicUrl,
          fileSize: file.size,
          mimeType: file.mimetype,
          uploader: {
            id: file.user,
            team: file.user_team
          },
          slack: {
            channelId: message.channel,
            messageTs: message.ts,
            fileId: file.id
          },
          storage: {
            bucket: process.env.CLOUDFLARE_BUCKET_NAME,
            key
          }
        });

        uploadCounter.inc({ status: 'success' });
        return publicUrl;
      } catch (error) {
        uploadCounter.inc({ status: 'error' });
        throw error;
      }
    }));

    const duration = process.hrtime(startTime);
    uploadLatency.observe(duration[0] + duration[1] / 1e9);

    await removeReaction(client, message.channel, message.ts, 'loading');

    const hasErrors = results.some(result => result.status === 'rejected');
    await addReaction(client, message.channel, message.ts, hasErrors ? 'warning' : 'white_check_mark');

    const successfulUrls = results
      .filter(result => result.status === 'fulfilled')
      .map(result => result.value);

    if (successfulUrls.length > 0) {
      const isMultiFile = successfulUrls.length > 1;
      const responses = isMultiFile ? MULTI_FILE_RESPONSES : SINGLE_FILE_RESPONSES;
      const quip = getRandomResponse(responses);
      const urls = isMultiFile ? successfulUrls.join('\n') : successfulUrls[0];
      
      await sendMessage(client, {
        channel: message.channel,
        thread_ts: message.ts,
        text: `${quip}\n${urls}`
      });
    }

    const failedCount = results.filter(result => result.status === 'rejected').length;
    if (failedCount > 0) {
      const errorMessage = failedCount === 1
        ? "😅 Oops! One file didn't make it through. Let's try again?"
        : `😅 Uh-oh! ${failedCount} files didn't make it. Want to try those again?`;

      await sendMessage(client, {
        channel: message.channel,
        thread_ts: message.ts,
        text: errorMessage
      });
    }

  } catch (error) {
    console.error('Error handling file upload:', error);
    try {
      await removeReaction(client, message.channel, message.ts, 'loading');
      await addReaction(client, message.channel, message.ts, 'x');
      
      await sendMessage(client, {
        channel: message.channel,
        thread_ts: message.ts,
        text: "😳 Oh no! Something went wrong on my end. Could you try again?"
      });
    } catch (reactionError) {
      console.error('Error updating reactions:', reactionError);
    }
  }
}

module.exports = {
  handleFileUpload
}; 