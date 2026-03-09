'use strict';

const pool = require('../config/db');
const { AUTH_CODES } = require('../config/security');

/* =========================
   REQUIRE EMAIL VERIFIED + ACTIVE USER
========================= */
async function requireEmailVerified(req, res, next) {
  if (!req.auth?.userId) {
    console.error('[POLICY_GUARD] Missing auth context');
    return res.status(401).json({
      success: false,
      code: AUTH_CODES.UNAUTHORIZED,
      data: null
    });
  }

  try {
    const [[user]] = await pool.query(
      `SELECT email_verified_at, status
       FROM users
       WHERE id = ?
       LIMIT 1`,
      [req.auth.userId]
    );

    if (!user) {
      console.warn('[POLICY_GUARD] User not found', req.auth.userId);
      return res.status(401).json({
        success: false,
        code: AUTH_CODES.UNAUTHORIZED,
        data: null
      });
    }

    if (!user.email_verified_at) {
      return res.status(403).json({
        success: false,
        code: AUTH_CODES.EMAIL_NOT_VERIFIED,
        data: null
      });
    }

    if (user.status !== 'active') {
      console.warn('[POLICY_GUARD] User not active', {
        userId: req.auth.userId,
        status: user.status
      });

      return res.status(403).json({
        success: false,
        code: AUTH_CODES.UNAUTHORIZED,
        data: null
      });
    }

    return next();
  } catch (err) {
    console.error('[POLICY_GUARD_ERROR]', err);

    return res.status(500).json({
      success: false,
      code: AUTH_CODES.INTERNAL_ERROR,
      data: null
    });
  }
}

module.exports = {
  requireEmailVerified
};
