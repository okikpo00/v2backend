'use strict';

const { redis, isRedisAvailable } = require('../config/redis');

const WINDOW_SECONDS = 60 * 60; // 1 hour
const MAX_REQUESTS = 3;

/* =========================
   HELPERS
========================= */

function rateLimitError(res) {
  return res.status(429).json({
    success: false,
    code: 'RATE_LIMITED',
    message: 'Too many withdrawal attempts. Try again later.'
  });
}

/* =========================
   WITHDRAWAL RATE LIMITER
========================= */

module.exports = async function withdrawalRateLimit(req, res, next) {
  /* -------------------------------------------------
     DEV MODE: DISABLE RATE LIMITING
     (developer experience)
  -------------------------------------------------- */
  if (process.env.NODE_ENV !== 'production') {
    return next();
  }

  /* -------------------------------------------------
     AUTH REQUIRED
  -------------------------------------------------- */
  const userId = req.auth?.userId;
  if (!userId) {
    return res.status(401).json({
      success: false,
      code: 'UNAUTHORIZED'
    });
  }

  /* -------------------------------------------------
     REDIS MUST BE AVAILABLE (SECURITY > AVAILABILITY)
  -------------------------------------------------- */
  if (!isRedisAvailable()) {
    console.error('[WITHDRAW_RATE_LIMIT] Redis unavailable');
    return rateLimitError(res);
  }

  /* -------------------------------------------------
     RATE LIMIT LOGIC
  -------------------------------------------------- */
  const key = `rl:withdraw:${userId}`;

  try {
    const count = await redis.incr(key);

    if (count === 1) {
      await redis.expire(key, WINDOW_SECONDS);
    }

    if (count > MAX_REQUESTS) {
      console.warn('[WITHDRAW_RATE_LIMIT_BLOCK]', {
        userId,
        ip: req.ip,
        count
      });

      return rateLimitError(res);
    }

    return next();
  } catch (err) {
    console.error('[WITHDRAW_RATE_LIMIT_ERROR]', err);
    return rateLimitError(res);
  }
};