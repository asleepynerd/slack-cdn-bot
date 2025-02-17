require('dotenv').config();
const { App, ExpressReceiver } = require('@slack/bolt');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const https = require('https');
const crypto = require('crypto');
const path = require('path');
const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');
const promClient = require('prom-client');

const register = new promClient.Registry();
promClient.collectDefaultMetrics({ register });

const uploadLatency = new promClient.Histogram({
  name: 'cdn_upload_duration_seconds',
  help: 'Time taken to upload files to R2',
  buckets: [0.1, 0.5, 1, 2, 5],
  registers: [register]
});

const uploadCounter = new promClient.Counter({
  name: 'cdn_uploads_total',
  help: 'Total number of file uploads',
  labelNames: ['status'],
  registers: [register]
});

const storageBytes = new promClient.Gauge({
  name: 'cdn_storage_bytes',
  help: 'Total storage used in bytes',
  registers: [register]
});

const healthCheckStatus = new promClient.Gauge({
  name: 'cdn_health_check_status',
  help: 'Status of the last health check (1 = success, 0 = failure)',
  registers: [register]
});

const healthCheckLatency = new promClient.Gauge({
  name: 'cdn_health_check_latency_seconds',
  help: 'Latency of the last health check in seconds',
  registers: [register]
});

const TARGET_CHANNEL = 'C016DEDUL87';

const SINGLE_FILE_RESPONSES = [
  "Here's your shiny new URL~",
  "All wrapped up and ready to go!",
  "Magic complete! Here's your link:",
  "Ta-da! Your file has a new home:",
  "Upload successful! Here you go:",
  "Another file safely stored! Here's your link:",
  "Mission accomplished! Your URL awaits:",
  "Special delivery! Here's your link:",
  "Poof! Your file is now available at:",
  "Upload complete! Find your file here:"
];

const MULTI_FILE_RESPONSES = [
  "Your files are all cozy in their new home~",
  "Multiple files, all wrapped up nicely!",
  "Magic complete! Here are your links:",
  "Ta-da! All your files are ready:",
  "Bulk upload successful! Here you go:",
  "All files safely stored! Here are your links:",
  "Mission accomplished! Your URLs await:",
  "Special delivery! Here are your links:",
  "Poof! All your files are now available:",
  "Upload complete! Find your files here:"
];

const MENTION_RESPONSES = [
  "Did someone call? 💖",
  "*perks up* Yes? How can I help? ✨",
  "Present! Ready to help with files and fun! 🎀",
  "*waves excitedly* Hi there! 👋",
  "Elysia at your service! 💫",
  "*sparkles with excitement* Hi! 🌟",
  "Need something? I'm here to help! 💝"
];

const THANK_YOU_RESPONSES = [
  "You're welcome! Always happy to help! 💝",
  "Aww, it's my pleasure! 🌸",
  "*blushes* Just doing my best to help! ✨",
  "No problem at all! Come back anytime! 🎀",
  "Glad I could help! Keep being awesome! 💫",
  "*happy bot noises* 💖",
  "Thank YOU for being so nice! 🌟"
];

const adapter = new FileSync('db.json');
const db = low(adapter);

// Add deduplication tracking
const recentlyProcessedFiles = new Set();
const DEDUP_EXPIRY_MS = 60000; // Clear file IDs after 1 minute

function clearFileFromDedup(fileId) {
  setTimeout(() => {
    recentlyProcessedFiles.delete(fileId);
  }, DEDUP_EXPIRY_MS);
}

db.defaults({ uploads: [] }).write();

const receiver = new ExpressReceiver({
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  processBeforeResponse: true 
});

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  receiver
});

receiver.router.get('/health', (req, res) => {
  res.status(200).send('OK');
});

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

function generateRandomFilename(originalFilename) {
  const ext = path.extname(originalFilename);
  const randomName = crypto.randomBytes(16).toString('hex');
  return `${randomName}${ext}`;
}

async function addReaction(client, channel, timestamp, name) {
  try {
    await client.reactions.add({
      channel,
      timestamp,
      name
    });
  } catch (error) {
    console.log(`Failed to add reaction ${name}:`, error.data.error || error.message);
  }
}

async function removeReaction(client, channel, timestamp, name) {
  try {
    await client.reactions.remove({
      channel,
      timestamp,
      name
    });
  } catch (error) {
    if (error.data.error !== 'no_reaction') {
      console.log(`Failed to remove reaction ${name}:`, error.data.error || error.message);
    }
  }
}

async function processFile(file, event, client) {
  const startTime = process.hrtime();
  try {
    const filename = generateRandomFilename(file.name);
    const key = `slackcdn/${filename}`;

    const fileData = await downloadFile(
      file.url_private,
      { Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}` }
    );

    await s3Client.send(new PutObjectCommand({
      Bucket: process.env.CLOUDFLARE_BUCKET_NAME,
      Key: key,
      Body: fileData,
      ContentType: file.mimetype
    }));

    const publicUrls = [
      'https://cdn.hackclubber.dev/slackcdn',
      'https://cdn.hack.pet/slackcdn',
    ];
    const publicUrlPrefix = publicUrls[Math.floor(Math.random() * publicUrls.length)];
    const publicUrl = `${publicUrlPrefix}/${filename}`;

    const duration = process.hrtime(startTime);
    uploadLatency.observe(duration[0] + duration[1] / 1e9);
    uploadCounter.inc({ status: 'success' });
    
    const uploads = db.get('uploads').value();
    const totalBytes = uploads.reduce((sum, upload) => sum + upload.fileSize, 0);
    storageBytes.set(totalBytes);

    db.get('uploads')
      .push({
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        originalFilename: file.name,
        storedFilename: filename,
        publicUrl: publicUrl,
        fileSize: file.size,
        mimeType: file.mimetype,
        uploader: {
          id: file.user,
          team: file.user_team
        },
        slack: {
          channelId: event.channel,
          messageTs: event.ts,
          fileId: file.id
        },
        storage: {
          bucket: process.env.CLOUDFLARE_BUCKET_NAME,
          key: key
        }
      })
      .write();

    return publicUrl;
  } catch (error) {
    uploadCounter.inc({ status: 'error' });
    throw error;
  }
}

function getRandomResponse(isMultiFile) {
  const responses = isMultiFile ? MULTI_FILE_RESPONSES : SINGLE_FILE_RESPONSES;
  return responses[Math.floor(Math.random() * responses.length)];
}

app.message(async ({ message, client, ack }) => {
  if (ack) await ack();

  if (message.channel !== TARGET_CHANNEL || !message.files || message.files.length === 0) {
    return;
  }

  try {
    await addReaction(client, message.channel, message.ts, 'loading');

    // Filter out already processed files
    const newFiles = message.files.filter(file => !recentlyProcessedFiles.has(file.id));
    
    if (newFiles.length === 0) {
      await removeReaction(client, message.channel, message.ts, 'loading');
      return;
    }

    // Add files to dedup tracking
    newFiles.forEach(file => {
      recentlyProcessedFiles.add(file.id);
      clearFileFromDedup(file.id);
    });

    const results = await Promise.allSettled(newFiles.map(file => processFile(file, message, client)));

    await removeReaction(client, message.channel, message.ts, 'loading');

    const hasErrors = results.some(result => result.status === 'rejected');
    
    await addReaction(client, message.channel, message.ts, hasErrors ? 'warning' : 'white_check_mark');

    const successfulUrls = results
      .filter(result => result.status === 'fulfilled')
      .map(result => result.value);

    if (successfulUrls.length > 0) {
      const isMultiFile = successfulUrls.length > 1;
      const quip = getRandomResponse(isMultiFile);
      const urls = isMultiFile ? successfulUrls.join('\n') : successfulUrls[0];
      const responseText = `${quip}\n${urls}`;

      await client.chat.postMessage({
        channel: message.channel,
        thread_ts: message.ts,
        text: responseText
      });

      const view = await generateHomeView(message.user);
      await client.views.publish({
        user_id: message.user,
        view: view
      });
    }

    const failedCount = results.filter(result => result.status === 'rejected').length;
    if (failedCount > 0) {
      const errorMessage = failedCount === 1
        ? "😅 Oops! One file didn't make it through. Let's try again?"
        : `😅 Uh-oh! ${failedCount} files didn't make it. Want to try those again?`;

      await client.chat.postMessage({
        channel: message.channel,
        thread_ts: message.ts,
        text: errorMessage
      });
    }

  } catch (error) {
    console.error('Error handling message with files:', error);
    try {
      await removeReaction(client, message.channel, message.ts, 'loading');
      await addReaction(client, message.channel, message.ts, 'x');
      
      await client.chat.postMessage({
        channel: message.channel,
        thread_ts: message.ts,
        text: "😳 Oh no! Something went wrong on my end. Could you try again?"
      });
    } catch (reactionError) {
      console.error('Error updating reactions:', reactionError);
    }
  }
});

function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

function getTimePeriodStats(uploads, days) {
  const now = new Date();
  const period = new Date(now - days * 24 * 60 * 60 * 1000);
  return uploads.filter(upload => new Date(upload.timestamp) > period);
}

app.command('/cdn-stats', async ({ command, ack, respond }) => {
  await ack();

  try {
    const uploads = db.get('uploads').value();
    
    const todayUploads = getTimePeriodStats(uploads, 1);
    const weekUploads = getTimePeriodStats(uploads, 7);
    const monthUploads = getTimePeriodStats(uploads, 30);

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

    const response = {
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
                  `• Most common file types: ${topFileTypes}`
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

    await respond(response);
  } catch (error) {
    console.error('Error generating stats:', error);
    await respond({
      text: "😅 Oops! I had trouble getting those stats. Try again?",
      response_type: 'ephemeral'
    });
  }
});

app.message(/elysia/i, async ({ message, client }) => {
  if (message.bot_id || message.files) return;
  
  if (message.text.toLowerCase().match(/thank.*elysia|thanks.*elysia/i)) return;
  
  await client.chat.postMessage({
    channel: message.channel,
    thread_ts: message.ts,
    text: MENTION_RESPONSES[Math.floor(Math.random() * MENTION_RESPONSES.length)]
  });
});

app.message(/thank.*elysia|thanks.*elysia/i, async ({ message, client }) => {
  if (message.bot_id || message.files) return;

  await addReaction(client, message.channel, message.ts, 'heart');
  
  await client.chat.postMessage({
    channel: message.channel,
    thread_ts: message.ts,
    text: THANK_YOU_RESPONSES[Math.floor(Math.random() * THANK_YOU_RESPONSES.length)]
  });
});

function formatDate(date) {
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

async function generateHomeView(userId) {
  const uploads = db.get('uploads').value();
  const userUploads = uploads.filter(upload => upload.uploader.id === userId);
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

app.event('app_home_opened', async ({ event, client }) => {
  try {
    const view = await generateHomeView(event.user);
    await client.views.publish({
      user_id: event.user,
      view: view
    });
  } catch (error) {
    console.error('Error publishing home view:', error);
  }
});

receiver.router.get('/metrics', async (req, res) => {
  try {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  } catch (err) {
    res.status(500).end(err);
  }
});

receiver.router.get('/healthz', async (req, res) => {
  try {
    const testFile = Buffer.from('Health check test file');
    const filename = `healthcheck-${Date.now()}.txt`;
    const key = `slackcdn/healthcheck/${filename}`;

    await s3Client.send(new PutObjectCommand({
      Bucket: process.env.CLOUDFLARE_BUCKET_NAME,
      Key: key,
      Body: testFile,
      ContentType: 'text/plain'
    }));

    const uploads = db.get('uploads').value();
    const totalBytes = uploads.reduce((sum, upload) => sum + upload.fileSize, 0);

    res.json({
      status: 'healthy',
      uptime: process.uptime(),
      stats: {
        totalUploads: uploads.length,
        totalStorageBytes: totalBytes,
        totalStorageFormatted: formatBytes(totalBytes)
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

(async () => {
  const port = process.env.PORT || 3000;
  await app.start(port);
  console.log(`CDN bot is running on port ${port}`);
})(); 