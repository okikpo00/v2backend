'use strict';

const crypto = require('crypto');

function generateToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('hex');
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function generateReferralCode() {
  // 8-char uppercase referral code (safe + readable)
  return crypto
    .randomBytes(4)
    .toString('hex')
    .toUpperCase();
}

module.exports = {
  generateToken,
  hashToken,
  generateReferralCode
};
