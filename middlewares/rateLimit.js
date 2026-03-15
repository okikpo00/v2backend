const Redis = require('ioredis');
const env = require('../config/env.js');
const { AUTH_CODES } = require('../config/security.js');

let redis;
let redisAvailable = false;

/* =========================
   INIT REDIS (SAFE)
========================= */
if (env.NODE_ENV === 'production') {
  redis = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: 2,
    enableOfflineQueue: false
  });

  redis.on('connect', () => {
    redisAvailable = true;
    console.log('[RATE_LIMIT] Redis connected');
  });

  redis.on('error', (err) => {
    redisAvailable = false;
    console.warn('[RATE_LIMIT] Redis error:', err.message);
  });
}

/* =========================
   LIMITER FACTORY
========================= */
function createLimiter({ prefix, limit, windowSec }) {
  return async function (req, res, next) {
    // ✅ DEV MODE: NEVER RATE LIMIT
    if (env.NODE_ENV !== 'production') {
      return next();
    }

    // ⛔ PROD MODE + REDIS DOWN = FAIL CLOSED
    if (!redisAvailable) {
      return res.status(429).json({
        success: false,
        code: AUTH_CODES.RATE_LIMITED,
        data: null
      });
    }

    const key = `${prefix}:${req.ip}`;

    try {
      const count = await redis.incr(key);

      if (count === 1) {
        await redis.expire(key, windowSec);
      }

      if (count > limit) {
        return res.status(429).json({
          success: false,
          code: AUTH_CODES.RATE_LIMITED,
          data: null
        });
      }

      return next();
    } catch (err) {
      console.error('[RATE_LIMIT_ERROR]', err);

      // Fail closed in production
      return res.status(429).json({
        success: false,
        code: AUTH_CODES.RATE_LIMITED,
        data: null
      });
    }
  };
}

/* =========================
   EXPORTED LIMITERS
========================= */
const loginLimiter = createLimiter({
  prefix: 'rl:login',
  limit: 5,
  windowSec: 600
});

const forgotPasswordLimiter = createLimiter({
  prefix: 'rl:forgot',
  limit: 3,
  windowSec: 900
});

const resendVerificationLimiter = createLimiter({
  prefix: 'rl:verify',
  limit: 3,
  windowSec: 900
});

module.exports = {
  loginLimiter,
  forgotPasswordLimiter,
  resendVerificationLimiter
};