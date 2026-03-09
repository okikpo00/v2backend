'use strict';

const jwt = require('jsonwebtoken');
const env = require('../config/env');

if (!env.ADMIN_JWT_SECRET) {
  console.error('❌ ADMIN_JWT_SECRET is missing');
  process.exit(1); // fail fast, production-safe
}

exports.signAdminAccessToken = (payload) => {
  return jwt.sign(payload, env.ADMIN_JWT_SECRET, {
    expiresIn: env.ADMIN_JWT_EXPIRES_IN,
    issuer: 'trebetta-admin'
  });
};

exports.verifyAdminAccessToken = (token) => {
  return jwt.verify(token, env.ADMIN_JWT_SECRET, {
    issuer: 'trebetta-admin'
  });
};
