// List of banned words and their variations
const BANNED_WORDS = [
  'nigger', 'n1gger', 'ni99er', 'n!gger', 'n1gg3r', 'nigg3r',
  'nigga', 'n1gga', 'ni99a', 'n!gga', 'n1gg4', 'nigg4',
  'bitch', 'b1tch', 'b!tch', 'b1tc4', 'b!tc4',
  'fuck', 'f*ck', 'f**k', 'f***', 'fuk', 'fu*k', 'fvck', 'f@ck'
];

// Create regex patterns with word boundaries for each banned word
const BANNED_WORD_PATTERNS = BANNED_WORDS.map(word => 
  new RegExp(`\\b${word.replace(/[*!@1]/g, '.')}\\b`, 'i')
);

/**
 * Checks if a message contains banned words
 * @param message The message to check
 * @returns True if the message contains banned words, false otherwise
 */
export function containsBannedWords(message: string): boolean {
  return BANNED_WORD_PATTERNS.some(pattern => pattern.test(message));
}

/**
 * Filters out banned words from a message, replacing them with asterisks
 * @param message The message to filter
 * @returns The filtered message
 */
export function filterMessage(message: string): string {
  let filteredMessage = message;
  
  BANNED_WORD_PATTERNS.forEach(pattern => {
    filteredMessage = filteredMessage.replace(pattern, match => '*'.repeat(match.length));
  });
  
  return filteredMessage;
}

/**
 * Checks if a username contains banned words
 * @param username The username to check
 * @returns True if the username contains banned words, false otherwise
 */
export function isUsernameSafe(username: string): boolean {
  return !containsBannedWords(username);
}