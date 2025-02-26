require('dotenv').config();
const express = require('express');
const fileUpload = require('express-fileupload');
const path = require('path');
const { app, receiver, TARGET_CHANNEL } = require('./services/slack');
const { handleFileUpload } = require('./handlers/fileHandler');
const { handleMention, handleThankYou } = require('./handlers/mentionHandler');
const { handleHomeOpened, generateHomeView } = require('./handlers/homeHandler');
const { handleCdnStats } = require('./handlers/statsHandler');
const apiRoutes = require('./routes/api');
const metricsRoutes = require('./routes/metrics');

// Configure express middleware
receiver.router.use(express.static(path.join(__dirname, '..', 'public')));
receiver.router.use(fileUpload({
  limits: { fileSize: 10 * 1024 * 1024 * 1024 }, // 10GB file max
  abortOnLimit: true
}));

// Configure routes
receiver.router.use('/', apiRoutes);
receiver.router.use('/', metricsRoutes);

// Configure Slack event handlers
app.message(async ({ message, client }) => {
  if (message.channel !== TARGET_CHANNEL) {
    return;
  }

  if (message.files && message.files.length > 0) {
    await handleFileUpload(message, client);
    return;
  }

  if (message.text && message.text.toLowerCase().match(/thank.*elysia|thanks.*elysia/i)) {
    await handleThankYou(message, client);
    return;
  }

  if (message.text && message.text.toLowerCase().includes('elysia')) {
    await handleMention(message, client);
  }
});

app.event('app_mention', async ({ event, client }) => {
  await handleMention(event, client);
});

app.event('app_home_opened', async ({ event, client }) => {
  await handleHomeOpened(event, client);
});

app.command('/cdn-stats', async ({ command, ack, respond }) => {
  await ack();
  const response = await handleCdnStats(command);
  await respond(response);
});

// Start the app
(async () => {
  const port = process.env.PORT || 3000;
  await app.start(port);
  console.log(`CDN bot is running on port ${port}`);
})(); 