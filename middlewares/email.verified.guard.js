'use strict';

const pool = require('../config/db');
const { AUTH_CODES } = require('../config/security');

/**
 * =========================================================
 * REQUIRE EMAIL VERIFIED
 * =========================================================
 * Must be used AFTER requireAuth
 * Relies on req.auth.userId
 * =========================================================
 */

module.exports = async function requireEmailVerified(req, res, next) {
  try {
    if (!req.auth || !req.auth.userId) {
      return res.status(401).json({
        success: false,
        code: AUTH_CODES.UNAUTHORIZED
      });
    }

    const [[user]] = await pool.query(
      `SELECT email_verified_at, status
       FROM users
       WHERE id = ?
       LIMIT 1`,
      [req.auth.userId]
    );

    if (!user) {
      return res.status(401).json({
        success: false,
        code: AUTH_CODES.UNAUTHORIZED
      });
    }

    if (!user.email_verified_at) {
      return res.status(403).json({
        success: false,
        code: AUTH_CODES.EMAIL_NOT_VERIFIED
      });
    }

    if (user.status !== 'active') {
      return res.status(403).json({
        success: false,
        code: AUTH_CODES.UNAUTHORIZED
      });
    }

    return next();
  } catch (err) {
    console.error('[EMAIL_VERIFIED_GUARD_ERROR]', err);

    return res.status(500).json({
      success: false,
      message: 'Email verification check failed'
    });
  }
};
