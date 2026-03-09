'use strict';

const redis = require('../config/redis');
const env = require('../config/env');

const WINDOW_SEC = 10 * 60; // 10 minutes
const LIMIT = 5;

module.exports = async function adminLoginLimiter(req, res, next) {
  // ✅ DEV MODE BYPASS (DO NOT REMOVE)
  if (env.NODE_ENV !== 'production') {
    return next();
  }

  const key = `rl:admin:login:${req.ip}`;

  try {
    const count = await redis.incr(key);

    if (count === 1) {
      await redis.expire(key, WINDOW_SEC);
    }

    if (count > LIMIT) {
      return res.status(429).json({
        success: false,
        code: 'ADMIN_RATE_LIMITED'
      });
    }

    return next();
  } catch (err) {
    // 🔒 Fail-closed in production
    return res.status(429).json({
      success: false,
      code: 'ADMIN_RATE_LIMITED'
    });
  }
};
