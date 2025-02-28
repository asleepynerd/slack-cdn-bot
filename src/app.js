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

receiver.router.use(express.static(path.join(__dirname, '..', 'public')));
receiver.router.use(fileUpload({
  limits: { fileSize: 10 * 1024 * 1024 * 1024 }, // 10GB file max
  abortOnLimit: true
}));

receiver.router.use('/', apiRoutes);
receiver.router.use('/', metricsRoutes);

const port = process.env.PORT || 3000;
receiver.app.listen(port, () => {
  /**
   * @description Logs the API and frontend running on port
   */
  console.log(`API and frontend running on port ${port}`);
});

try {
  app.message(async ({ message, client }) => {
    /**
     * @description Handles the message event
     * @param {*} message - The message object
     * @param {*} client - The Slack client
     */
    try {
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
    } catch (error) {
      console.error('Error handling Slack message:', error);
    }
  });

  app.event('app_mention', async ({ event, client }) => {
    /**
     * @description Handles the app mention event
     * @param {*} event - The event object
     * @param {*} client - The Slack client
     */
    try {
      await handleMention(event, client);
    } catch (error) {
      console.error('Error handling Slack mention:', error);
    }
  });

  app.event('app_home_opened', async ({ event, client }) => {
    /**
     * @description Handles the app home opened event
     * @param {*} event - The event object
     * @param {*} client - The Slack client
     */
    try {
      await handleHomeOpened(event, client);
    } catch (error) {
      console.error('Error handling Slack home opened:', error);
    }
  });

  app.command('/cdn-stats', async ({ command, ack, respond }) => {
    /**
     * @description Handles the /cdn-stats command
     * @param {*} command - The command object
     * @param {*} ack 
     * @param {*} respond 
     */
    try {
      await ack();
      const response = await handleCdnStats(command);
      await respond(response);
    } catch (error) {
      console.error('Error handling Slack command:', error);
      try {
        await respond({
          text: "Sorry, I encountered an error getting the stats. Please try again later!",
          response_type: 'ephemeral'
        });
      } catch (respondError) {
        console.error('Error sending error response:', respondError);
      }
    }
  });

  (async () => {
    try {
      await app.start();
      console.log('Slack bot is running');
    } catch (error) {
      console.error('Failed to start Slack bot:', error);
      console.log('API and frontend will continue running');
    }
  })();

} catch (error) {
  console.error('Error setting up Slack handlers:', error);
  console.log('API and frontend will continue running');
} 