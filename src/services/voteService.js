const crypto = require('crypto');
const fs = require('fs');

const voteStorage = {
  votes: {}
};

const VOTES_FILE_PATH = 'votes.json';

try {
  if (fs.existsSync(VOTES_FILE_PATH)) {
    const data = fs.readFileSync(VOTES_FILE_PATH, 'utf8');
    const parsed = JSON.parse(data);
    voteStorage.votes = parsed.votes || {};
  }
} catch (error) {
  console.error('Error loading votes file:', error);
}

function saveVotes() {
  try {
    fs.writeFileSync(VOTES_FILE_PATH, JSON.stringify(voteStorage, null, 2), 'utf8');
  } catch (error) {
    console.error('Error saving votes file:', error);
  }
}

/**
 * Hash the user ID to ensure anonymity
 * @param {string} userId - The user's ID
 * @param {string} messageId - The message ID (used as salt)
 * @returns {string} - Hashed user ID
 */
function hashUserId(userId, messageId) {
  return crypto
    .createHash('sha256')
    .update(`${userId}-${messageId}-${process.env.VOTE_SECRET || '§1234567890-0987654321§1234567890-0987654321§'}`)
    .digest('hex');
}

/**
 * Record a vote for a message
 * @param {string} messageId - The message ID (channel-timestamp)
 * @param {string} userId - The user's ID
 * @param {string|null} voteType - Either 'upvote', 'downvote', or null to remove vote
 * @param {string} [value] - Optional value for system flags
 * @returns {object} - Updated vote counts
 */
function recordVote(messageId, userId, voteType, value) {
  if (!voteStorage.votes[messageId]) {
    voteStorage.votes[messageId] = {
      upvotes: 0,
      downvotes: 0,
      voters: {},
      processed: false,
      reply_ts: null
    };
  }

  if (voteType === 'processed') {
    voteStorage.votes[messageId].processed = true;
    saveVotes();
    return getVoteCounts(messageId);
  }
  
  if (voteType === 'reply_ts') {
    voteStorage.votes[messageId].reply_ts = value;
    saveVotes();
    return getVoteCounts(messageId);
  }

  const hashedUserId = hashUserId(userId, messageId);
  const previousVote = voteStorage.votes[messageId].voters[hashedUserId];

  if (previousVote === voteType && voteType !== null) {
    return voteStorage.votes[messageId];
  }

  if (previousVote === 'upvote') {
    voteStorage.votes[messageId].upvotes--;
  } else if (previousVote === 'downvote') {
    voteStorage.votes[messageId].downvotes--;
  }

  if (voteType === 'upvote') {
    voteStorage.votes[messageId].upvotes++;
    voteStorage.votes[messageId].voters[hashedUserId] = voteType;
  } else if (voteType === 'downvote') {
    voteStorage.votes[messageId].downvotes++;
    voteStorage.votes[messageId].voters[hashedUserId] = voteType;
  } else if (voteType === null) {
    delete voteStorage.votes[messageId].voters[hashedUserId];
  }

  saveVotes();

  return voteStorage.votes[messageId];
}

/**
 * Get vote counts for a message
 * @param {string} messageId - The message ID
 * @returns {object} - Vote counts
 */
function getVoteCounts(messageId) {
  if (!voteStorage.votes[messageId]) {
    return { 
      upvotes: 0, 
      downvotes: 0,
      processed: false,
      reply_ts: null
    };
  }
  
  return {
    upvotes: voteStorage.votes[messageId].upvotes || 0,
    downvotes: voteStorage.votes[messageId].downvotes || 0,
    processed: voteStorage.votes[messageId].processed || false,
    reply_ts: voteStorage.votes[messageId].reply_ts || null
  };
}

/**
 * Check if a user has voted on a message
 * @param {string} messageId - The message ID
 * @param {string} userId - The user's ID
 * @returns {string|null} - The vote type or null if no vote
 */
function getUserVote(messageId, userId) {
  if (!voteStorage.votes[messageId] || !voteStorage.votes[messageId].voters) {
    return null;
  }
  
  const hashedUserId = hashUserId(userId, messageId);
  return voteStorage.votes[messageId].voters[hashedUserId] || null;
}

module.exports = {
  recordVote,
  getVoteCounts,
  getUserVote
}; 