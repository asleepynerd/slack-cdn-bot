const { recordVote, getVoteCounts, getUserVote } = require('../services/voteService');


const META_CHANNEL_ID = 'C0188CY57PZ';
//const META_CHANNEL_ID = 'C08F7GZU1Q9';

/**
 * Generate the vote buttons block
 * @param {object} voteCounts - Current vote counts
 * @returns {object} - Block kit button element
 */
function generateVoteButtons(voteCounts) {
  return {
    type: "actions",
    block_id: "vote_buttons",
    elements: [
      {
        type: "button",
        text: {
          type: "plain_text",
          text: `👍 Upvote (${voteCounts.upvotes})`,
          emoji: true
        },
        style: "primary",
        action_id: "upvote_action"
      },
      {
        type: "button",
        text: {
          type: "plain_text",
          text: `👎 Downvote (${voteCounts.downvotes})`,
          emoji: true
        },
        style: "danger",
        action_id: "downvote_action"
      }
    ]
  };
}

/**
 * Generate the vote count display block
 * @param {object} voteCounts - Current vote counts
 * @returns {object} - Block kit context element
 */
function generateVoteCountDisplay(voteCounts) {
  const score = voteCounts.upvotes - voteCounts.downvotes;
  const scoreEmoji = score > 0 ? "📈" : score < 0 ? "📉" : "⚖️";
  const scoreColor = score > 0 ? "green" : score < 0 ? "red" : "gray";
  
  return {
    type: "context",
    block_id: "vote_stats",
    elements: [
      {
        type: "mrkdwn",
        text: `*Anonymous Voting* | ${scoreEmoji} Score: \`${score}\` | 👍 \`${voteCounts.upvotes}\` | 👎 \`${voteCounts.downvotes}\``
      }
    ]
  };
}

/**
 * Add vote buttons to a message in the meta channel
 * @param {object} message - The message object
 * @param {object} client - The Slack client
 */
async function addVoteButtonsToMessage(message, client) {
  try {

    if (message.thread_ts) {
      return;
    }

    if (message.subtype) {
      return;
    }
    
    const messageId = `${message.channel}-${message.ts}`;
    
    const voteCounts = getVoteCounts(messageId);
    if (voteCounts.processed) {
      return;
    }
    
    
    const blocks = [
      generateVoteCountDisplay(voteCounts),
      generateVoteButtons(voteCounts)
    ];
    
    const reply = await client.chat.postMessage({
      channel: message.channel,
      thread_ts: message.ts,
      blocks: blocks,
      text: "Vote on this message"
    });
    
    
    recordVote(messageId, 'SYSTEM', 'processed');
    recordVote(messageId, 'SYSTEM', 'reply_ts', reply.ts);
    
  } catch (error) {
    console.error('Error adding vote buttons:', error);
  }
}

/**
 * Handle vote button clicks
 * @param {object} body - The action payload
 * @param {object} client - The Slack client
 */
async function handleVoteAction(body, client) {
  try {
    const { user, actions, container, message } = body;
    const action = actions[0];
    
    const messageId = `${container.channel_id}-${message.thread_ts}`;
    const voteType = action.action_id === "upvote_action" ? "upvote" : "downvote";
    
    const previousVote = getUserVote(messageId, user.id);
    
    if (previousVote === voteType) {
      const updatedCounts = recordVote(messageId, user.id, null);
      
      const updatedBlocks = [
        generateVoteCountDisplay(updatedCounts),
        generateVoteButtons(updatedCounts)
      ];
      
      await client.chat.update({
        channel: container.channel_id,
        ts: message.ts,
        blocks: updatedBlocks,
        text: "Vote on this message"
      });
      
      return;
    }
    
    const updatedCounts = recordVote(messageId, user.id, voteType);
    
    const updatedBlocks = [
      generateVoteCountDisplay(updatedCounts),
      generateVoteButtons(updatedCounts)
    ];
    
    await client.chat.update({
      channel: container.channel_id,
      ts: message.ts,
      blocks: updatedBlocks,
      text: "Vote on this message"
    });
    
    
  } catch (error) {
    console.error('Error handling vote action:', error);
    
    try {
      await client.chat.postEphemeral({
        channel: body.container.channel_id,
        user: body.user.id,
        text: "There was an error recording your vote. Please try again."
      });
    } catch (ephemeralError) {
      console.error('Error sending ephemeral message:', ephemeralError);
    }
  }
}

/**
 * Check if a message is in the meta channel
 * @param {object} message - The message object
 * @returns {boolean} - True if in meta channel
 */
function isMetaChannelMessage(message) {
  return message.channel === META_CHANNEL_ID;
}

module.exports = {
  META_CHANNEL_ID,
  isMetaChannelMessage,
  addVoteButtonsToMessage,
  handleVoteAction
}; 