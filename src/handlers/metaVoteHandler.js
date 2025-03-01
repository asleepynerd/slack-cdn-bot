const { recordVote, getVoteCounts, getUserVote } = require('../services/voteService');
const { sendMessage, updateMessage } = require('../services/slack');

// Meta channel ID
const META_CHANNEL_ID = 'C0188CY57PZ';

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
    // Skip messages that already have vote buttons
    if (message.blocks && message.blocks.some(block => block.block_id === "vote_buttons")) {
      return;
    }
    
    // Skip bot messages and messages with subtypes (like thread_broadcast)
    if (message.bot_id || message.subtype) {
      return;
    }
    
    // Get initial vote counts (should be 0 for new messages)
    const messageId = `${message.channel}-${message.ts}`;
    const voteCounts = getVoteCounts(messageId);
    
    // Create blocks for the message
    const blocks = [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: message.text
        }
      },
      generateVoteCountDisplay(voteCounts),
      generateVoteButtons(voteCounts)
    ];
    
    // Update the message with vote buttons
    await updateMessage(client, {
      channel: message.channel,
      ts: message.ts,
      blocks: blocks,
      text: message.text // Fallback text
    });
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
    const messageId = `${container.channel_id}-${container.message_ts}`;
    const voteType = action.action_id === "upvote_action" ? "upvote" : "downvote";
    
    // Get previous vote to check if user is changing their vote
    const previousVote = getUserVote(messageId, user.id);
    
    // Record the vote
    const updatedCounts = recordVote(messageId, user.id, voteType);
    
    // Update the message with new vote counts
    const updatedBlocks = message.blocks.map(block => {
      if (block.block_id === "vote_buttons") {
        return generateVoteButtons(updatedCounts);
      } else if (block.block_id === "vote_stats") {
        return generateVoteCountDisplay(updatedCounts);
      }
      return block;
    });
    
    await updateMessage(client, {
      channel: container.channel_id,
      ts: container.message_ts,
      blocks: updatedBlocks,
      text: message.text // Fallback text
    });
    
    // Send ephemeral confirmation to the user
    let confirmationText;
    if (previousVote === voteType) {
      confirmationText = `You've already ${voteType}d this message. Your vote remains unchanged.`;
    } else if (previousVote) {
      confirmationText = `Your vote has been changed from ${previousVote} to ${voteType}. This action is anonymous.`;
    } else {
      confirmationText = `Your ${voteType} has been recorded anonymously.`;
    }
    
    // Send ephemeral confirmation message
    await client.chat.postEphemeral({
      channel: container.channel_id,
      user: user.id,
      text: confirmationText
    });
    
  } catch (error) {
    console.error('Error handling vote action:', error);
    
    // Send error message to user
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