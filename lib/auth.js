'use strict';

/**
 * Password hashing + token helpers built on Node's crypto.
 * Passwords are never stored in plaintext — only a scrypt hash + salt.
 */

const crypto = require('crypto');

const KEY_LEN = 64;
const SALT_BYTES = 16;

function hashPassword(password, salt) {
  const useSalt = salt || crypto.randomBytes(SALT_BYTES).toString('hex');
  const hash = crypto.scryptSync(String(password), useSalt, KEY_LEN).toString('hex');
  return { salt: useSalt, hash };
}

function verifyPassword(password, salt, expectedHash) {
  if (!password || !salt || !expectedHash) return false;
  let candidate;
  try {
    candidate = crypto.scryptSync(String(password), salt, KEY_LEN);
  } catch {
    return false;
  }
  let expected;
  try {
    expected = Buffer.from(expectedHash, 'hex');
  } catch {
    return false;
  }
  if (candidate.length !== expected.length) return false;
  return crypto.timingSafeEqual(candidate, expected);
}

function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('hex');
}

function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

module.exports = { hashPassword, verifyPassword, randomToken, safeEqual };
