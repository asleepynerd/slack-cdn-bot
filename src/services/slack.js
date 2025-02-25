const { App, ExpressReceiver } = require('@slack/bolt');
const { TARGET_CHANNEL } = require('../config/constants');

const receiver = new ExpressReceiver({
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  processBeforeResponse: true
});

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  receiver
});

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

async function sendMessage(client, { channel, thread_ts = null, text }) {
  return client.chat.postMessage({
    channel,
    thread_ts,
    text
  });
}

async function updateMessage(client, { channel, ts, text }) {
  return client.chat.update({
    channel,
    ts,
    text
  });
}

async function publishHomeView(client, userId, view) {
  return client.views.publish({
    user_id: userId,
    view
  });
}

module.exports = {
  app,
  receiver,
  TARGET_CHANNEL,
  addReaction,
  removeReaction,
  sendMessage,
  updateMessage,
  publishHomeView
}; 