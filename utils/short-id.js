/**
 * Short ID Generator for URL Shortening
 * Generates random short IDs using base62 encoding (a-z, A-Z, 0-9)
 *
 * With 6 characters: 62^6 = 56.8 billion possible combinations
 * Collision probability is negligible for typical use cases
 */

const BASE62_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

/**
 * Generate a random short ID
 * @param {number} length - Length of the ID (default: 6)
 * @returns {string} Random short ID
 */
function generateShortId(length = 6) {
  let id = '';
  for (let i = 0; i < length; i++) {
    const randomIndex = Math.floor(Math.random() * BASE62_CHARS.length);
    id += BASE62_CHARS[randomIndex];
  }
  return id;
}

/**
 * Generate a cryptographically secure short ID
 * Uses crypto.randomBytes for better randomness
 * @param {number} length - Length of the ID (default: 6)
 * @returns {string} Random short ID
 */
function generateSecureShortId(length = 6) {
  const crypto = require('crypto');
  let id = '';

  // Generate random bytes and convert to base62
  const bytes = crypto.randomBytes(length * 2); // Extra bytes for better distribution

  for (let i = 0; i < length; i++) {
    const randomValue = bytes[i] % BASE62_CHARS.length;
    id += BASE62_CHARS[randomValue];
  }

  return id;
}

/**
 * Validate if a string is a valid short ID
 * @param {string} id - ID to validate
 * @returns {boolean} True if valid
 */
function isValidShortId(id) {
  if (!id || typeof id !== 'string') return false;

  // Should be 6-8 characters and only contain base62 chars
  const regex = /^[0-9A-Za-z]{6,8}$/;
  return regex.test(id);
}

/**
 * Check if a string looks like a legacy base64 URL (old format)
 * @param {string} str - String to check
 * @returns {boolean} True if it looks like old format
 */
function isLegacyFormat(str) {
  if (!str || typeof str !== 'string') return false;

  // Old format is much longer (100+ chars) and contains base64url chars
  return str.length > 20 && /^[A-Za-z0-9_-]+$/.test(str);
}

module.exports = {
  generateShortId,
  generateSecureShortId,
  isValidShortId,
  isLegacyFormat
};
