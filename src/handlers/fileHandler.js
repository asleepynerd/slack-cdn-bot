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

async function processUpload(file) {
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
        channelId: file.channel,
        messageTs: file.message_ts,
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
}

async function sendUploadResponse(client, channel, thread_ts, successfulUrls) {
  if (successfulUrls.length === 0) return;

  const isMultiFile = successfulUrls.length > 1;
  const responses = isMultiFile ? MULTI_FILE_RESPONSES : SINGLE_FILE_RESPONSES;
  const quip = getRandomResponse(responses);
  const urls = isMultiFile ? successfulUrls.join('\n') : successfulUrls[0];
  
  await sendMessage(client, {
    channel,
    thread_ts,
    text: `${quip}\n${urls}`
  });
}

async function sendErrorResponse(client, channel, thread_ts, failedCount) {
  if (failedCount === 0) return;

  const errorMessage = failedCount === 1
    ? "😅 Oops! One file didn't make it through. Let's try again?"
    : `😅 Uh-oh! ${failedCount} files didn't make it. Want to try those again?`;

  await sendMessage(client, {
    channel,
    thread_ts,
    text: errorMessage
  });
}

async function handleFileUpload(message, client) {
  if (!message.files || message.files.length === 0) return;

  try {
    await addReaction(client, message.channel, message.ts, 'loading');

    const newFiles = message.files.filter(file => !recentlyProcessedFiles.has(file.id));
    if (newFiles.length === 0) {
      await removeReaction(client, message.channel, message.ts, 'loading');
      return;
    }

    // Add context to files for processing
    newFiles.forEach(file => {
      file.channel = message.channel;
      file.message_ts = message.ts;
      recentlyProcessedFiles.add(file.id);
      clearFileFromDedup(file.id);
    });

    // Process uploads
    const startTime = process.hrtime();
    const results = await Promise.allSettled(newFiles.map(processUpload));
    const duration = process.hrtime(startTime);
    uploadLatency.observe(duration[0] + duration[1] / 1e9);

    // Update reactions
    await removeReaction(client, message.channel, message.ts, 'loading');
    const hasErrors = results.some(result => result.status === 'rejected');
    await addReaction(client, message.channel, message.ts, hasErrors ? 'warning' : 'white_check_mark');

    // Send responses
    const successfulUrls = results
      .filter(result => result.status === 'fulfilled')
      .map(result => result.value);
    
    await sendUploadResponse(client, message.channel, message.ts, successfulUrls);
    
    const failedCount = results.filter(result => result.status === 'rejected').length;
    await sendErrorResponse(client, message.channel, message.ts, failedCount);

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