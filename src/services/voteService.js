const crypto = require('crypto');
const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');

const adapter = new FileSync('votes.json');
const voteDb = low(adapter);

// Initialize votes database with default structure
voteDb.defaults({ votes: {} }).write();

/**
 * Hash the user ID to ensure anonymity
 * @param {string} userId - The user's ID
 * @param {string} messageId - The message ID (used as salt)
 * @returns {string} - Hashed user ID
 */
function hashUserId(userId, messageId) {
  return crypto
    .createHash('sha256')
    .update(`${userId}-${messageId}-${process.env.VOTE_SECRET || 'anonymous-voting-salt'}`)
    .digest('hex');
}

/**
 * Record a vote for a message
 * @param {string} messageId - The message ID (channel-timestamp)
 * @param {string} userId - The user's ID
 * @param {string} voteType - Either 'upvote' or 'downvote'
 * @returns {object} - Updated vote counts
 */
function recordVote(messageId, userId, voteType) {
  // Initialize message entry if it doesn't exist
  if (!voteDb.get('votes').has(messageId).value()) {
    voteDb.get('votes')
      .set(messageId, { 
        upvotes: 0, 
        downvotes: 0, 
        voters: {} 
      })
      .write();
  }

  const hashedUserId = hashUserId(userId, messageId);
  const messageVotes = voteDb.get(`votes.${messageId}`).value();
  const previousVote = messageVotes.voters[hashedUserId];

  // If user already voted the same way, do nothing
  if (previousVote === voteType) {
    return {
      upvotes: messageVotes.upvotes,
      downvotes: messageVotes.downvotes
    };
  }

  // Remove previous vote if it exists
  if (previousVote) {
    voteDb.get(`votes.${messageId}.${previousVote}s`)
      .update(n => n - 1)
      .write();
  }

  // Add new vote
  voteDb.get(`votes.${messageId}.${voteType}s`)
    .update(n => n + 1)
    .write();

  // Record user's vote type
  voteDb.get(`votes.${messageId}.voters`)
    .set(hashedUserId, voteType)
    .write();

  // Return updated counts
  const updatedVotes = voteDb.get(`votes.${messageId}`).value();
  return {
    upvotes: updatedVotes.upvotes,
    downvotes: updatedVotes.downvotes
  };
}

/**
 * Get vote counts for a message
 * @param {string} messageId - The message ID
 * @returns {object} - Vote counts
 */
function getVoteCounts(messageId) {
  const messageVotes = voteDb.get(`votes.${messageId}`).value();
  
  if (!messageVotes) {
    return { upvotes: 0, downvotes: 0 };
  }
  
  return {
    upvotes: messageVotes.upvotes,
    downvotes: messageVotes.downvotes
  };
}

/**
 * Check if a user has voted on a message
 * @param {string} messageId - The message ID
 * @param {string} userId - The user's ID
 * @returns {string|null} - The vote type or null if no vote
 */
function getUserVote(messageId, userId) {
  const messageVotes = voteDb.get(`votes.${messageId}`).value();
  
  if (!messageVotes) {
    return null;
  }
  
  const hashedUserId = hashUserId(userId, messageId);
  return messageVotes.voters[hashedUserId] || null;
}

module.exports = {
  recordVote,
  getVoteCounts,
  getUserVote
}; 