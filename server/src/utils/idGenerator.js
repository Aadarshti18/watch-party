const crypto = require('crypto');

// Excludes visually ambiguous characters (0/O, 1/I/L) so codes are easy to
// read aloud or type in by hand.
const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function generateRoomCode(length = 6) {
  let code = '';
  for (let i = 0; i < length; i += 1) {
    const index = crypto.randomInt(0, ROOM_CODE_ALPHABET.length);
    code += ROOM_CODE_ALPHABET[index];
  }
  return code;
}

function generateId() {
  return crypto.randomUUID();
}

module.exports = { generateRoomCode, generateId };
