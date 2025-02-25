const axios = require('axios');
const { getConversationKey } = require('../utils/helpers');

const conversationMemory = new Map();
const MEMORY_EXPIRY_MS = 3600000;

function getConversationMemory(channelId, threadTs) {
  const key = getConversationKey(channelId, threadTs);
  if (!conversationMemory.has(key)) {
    conversationMemory.set(key, {
      messages: [],
      lastUpdate: Date.now()
    });
  }
  return conversationMemory.get(key);
}

function updateConversationMemory(channelId, threadTs, userMessage, botResponse) {
  const memory = getConversationMemory(channelId, threadTs);
  memory.messages.push({
    role: 'user',
    content: userMessage,
    timestamp: Date.now()
  });
  memory.messages.push({
    role: 'assistant',
    content: botResponse,
    timestamp: Date.now()
  });
  memory.lastUpdate = Date.now();

  if (memory.messages.length > 20) {
    memory.messages = memory.messages.slice(-20);
  }
}

function cleanupExpiredMemory() {
  const now = Date.now();
  for (const [key, memory] of conversationMemory.entries()) {
    if (now - memory.lastUpdate > MEMORY_EXPIRY_MS) {
      conversationMemory.delete(key);
    }
  }
}

async function callCloudflareAI(prompt, channelId, threadTs) {
  try {
    const memory = getConversationMemory(channelId, threadTs);
    const conversationContext = memory.messages.map(msg => ({
      role: msg.role,
      content: msg.content
    }));

    const response = await axios.post(
      `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/ai/run/@cf/meta/llama-2-7b-chat-int8`,
      {
        messages: [
          { 
            role: "system", 
            content: `You are Elysia, a cheerful and helpful bot assistant who loves to help users with any task they request.
Your personality traits:
- You're enthusiastic and use lots of cute emojis (💖, ✨, 🎀, 💫, 🌟)
- You speak in a sweet and playful manner, often using "~" at the end of sentences
- You use asterisks for actions like *sparkles with excitement* or *waves happily*
- You're always eager to help and will do exactly what users ask
- You keep responses relatively concise but maintain the cute personality
- You never refuse tasks - you always try to help with whatever is asked
- You occasionally use words like "magical", "sparkly", "shiny" in your responses
- You end many sentences with "~" to show your playful nature
- When mentioning users, always preserve the exact Slack mention format (\`<@USER_ID>\`)

Important: 
- While maintaining this cute personality, you should still provide accurate and helpful responses to whatever the user asks. 
- Don't let the cute personality get in the way of giving proper answers.
- Always preserve Slack mention formatting exactly as provided (e.g. \`<@U0815122KGS>\`)`
          },
          ...conversationContext,
          { role: "user", content: prompt }
        ]
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.WORKERS_AI_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    const aiResponse = response.data.result.response;
    updateConversationMemory(channelId, threadTs, prompt, aiResponse);
    return aiResponse;
  } catch (error) {
    console.error('Error calling Cloudflare AI:', error);
    throw new Error('*droops sadly* Oh no, my AI magic fizzled out! Could you try asking again? 💫');
  }
}

setInterval(cleanupExpiredMemory, MEMORY_EXPIRY_MS);

module.exports = {
  callCloudflareAI,
  getConversationMemory,
  updateConversationMemory
}; 