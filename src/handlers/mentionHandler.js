const { addReaction, removeReaction, sendMessage, updateMessage } = require('../services/slack');
const { callCloudflareAI } = require('../services/ai');
const { getRandomResponse } = require('../utils/helpers');
const { MENTION_RESPONSES, AI_RESPONSES, THANK_YOU_RESPONSES } = require('../config/constants');

const recentlyProcessedMentions = new Set();
const DEDUP_EXPIRY_MS = 60000;

function clearMentionFromDedup(messageId) {
  setTimeout(() => {
    recentlyProcessedMentions.delete(messageId);
  }, DEDUP_EXPIRY_MS);
}

function isValidMention(event, botUserId = 'U08CVEZ5D4K') {
  if (event.bot_id) return false;
  
  const botMention = `<@${botUserId}>`;
  if (!event.text.startsWith(botMention)) return false;
  
  const messageKey = `${event.channel}-${event.ts}`;
  if (recentlyProcessedMentions.has(messageKey)) return false;
  
  return { messageKey, botMention };
}

async function handleSimpleMention(client, event, botMention) {
  if (event.text === botMention) {
    await sendMessage(client, {
      channel: event.channel,
      thread_ts: event.thread_ts || event.ts,
      text: "*sparkles excitedly* Hi there~ What can I help you with today? I'm ready to assist with any task! ✨"
    });
    return true;
  }
  return false;
}

async function processAIResponse(client, event, query) {
  const thinkingResponse = getRandomResponse(AI_RESPONSES);
  const initialMessage = await sendMessage(client, {
    channel: event.channel,
    thread_ts: event.thread_ts || event.ts,
    text: thinkingResponse
  });

  const aiResponse = await callCloudflareAI(
    query,
    event.channel,
    event.thread_ts || event.ts
  );

  await updateMessage(client, {
    channel: event.channel,
    ts: initialMessage.ts,
    text: aiResponse
  });
}

async function updateReactions(client, event, success = true) {
  if (success) {
    await removeReaction(client, event.channel, event.ts, 'thinking_face');
    await addReaction(client, event.channel, event.ts, 'white_check_mark');
  } else {
    await removeReaction(client, event.channel, event.ts, 'thinking_face');
    await addReaction(client, event.channel, event.ts, 'x');
  }
}

async function handleMention(event, client) {
  try {
    const validation = isValidMention(event);
    if (!validation) return;

    const { messageKey, botMention } = validation;
    recentlyProcessedMentions.add(messageKey);
    clearMentionFromDedup(messageKey);

    const query = event.text;
    
    // Handle simple mention without query
    if (await handleSimpleMention(client, event, botMention)) return;

    // Process AI response
    await addReaction(client, event.channel, event.ts, 'thinking_face');
    await processAIResponse(client, event, query);
    await updateReactions(client, event, true);

  } catch (error) {
    console.error('Error handling mention:', error);
    
    try {
      await sendMessage(client, {
        channel: event.channel,
        thread_ts: event.thread_ts || event.ts,
        text: "*droops sadly* My magical circuits got a bit tangled~ Could you try asking again? 🎀"
      });
      
      await updateReactions(client, event, false);
    } catch (reactionError) {
      console.error('Error updating reactions:', reactionError);
    }
  }
}

async function handleThankYou(message, client) {
  if (message.bot_id || message.files) return;

  await addReaction(client, message.channel, message.ts, 'heart');
  
  await sendMessage(client, {
    channel: message.channel,
    thread_ts: message.ts,
    text: getRandomResponse(THANK_YOU_RESPONSES)
  });
}

module.exports = {
  handleMention,
  handleThankYou
}; 