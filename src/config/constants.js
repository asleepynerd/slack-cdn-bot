const TARGET_CHANNEL = 'C08EKUY7QVA';

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

const AI_RESPONSES = [
  "Let me think about that... ✨",
  "Processing your request with AI magic~ 🌟",
  "One moment while I ponder... 💭",
  "Analyzing with my AI powers... 🎀",
  "Computing a response for you... 💫",
  "Let me consult my AI knowledge... 🔮",
  "Thinking cap on! Processing... 🎩✨"
];

const PUBLIC_URLS = [
  'https://cdn.hackclubber.dev/slackcdn',
  'https://cdn.hack.pet/slackcdn',
  'https://cdn.hack.ngo/slackcdn',
  'https://cdn.fluff.pw/slackcdn',
];

const DEDUP_EXPIRY_MS = 60000;
const MEMORY_EXPIRY_MS = 3600000;

module.exports = {
  TARGET_CHANNEL,
  SINGLE_FILE_RESPONSES,
  MULTI_FILE_RESPONSES,
  MENTION_RESPONSES,
  THANK_YOU_RESPONSES,
  AI_RESPONSES,
  PUBLIC_URLS,
  DEDUP_EXPIRY_MS,
  MEMORY_EXPIRY_MS
}; 