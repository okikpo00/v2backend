'use strict';

const pool = require('../config/db');
const { verifyAccessToken } = require('../utils/jwt.util');
const { AUTH_CODES } = require('../config/security');

/* =========================
   REQUIRE AUTH (JWT + SESSION)
========================= */
async function requireAuth(req, res, next) {
  const header = req.headers.authorization;

  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      code: AUTH_CODES.UNAUTHORIZED,
      data: null
    });
  }

  const token = header.slice(7);

  try {
    const payload = verifyAccessToken(token);

    if (!payload?.sid || !payload?.sub || !payload?.sv) {
      console.error('[AUTH_GUARD] Invalid JWT payload', payload);
      throw new Error('invalid_jwt_payload');
    }

    const [[row]] = await pool.query(
      `SELECT s.user_id, u.security_version
       FROM user_sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.session_id = ?
         AND s.revoked_at IS NULL
         AND s.expires_at > NOW()
       LIMIT 1`,
      [payload.sid]
    );

    if (!row) {
      console.warn('[AUTH_GUARD] Session not found or expired', payload.sid);
      throw new Error('session_not_found');
    }

    if (Number(payload.sv) !== Number(row.security_version)) {
      console.warn('[AUTH_GUARD] Security version mismatch', {
        jwt: payload.sv,
        db: row.security_version
      });
      throw new Error('security_version_mismatch');
    }

    req.auth = {
      userId: row.user_id,
      sessionId: payload.sid,
      userUuid: payload.sub
    };

/* =========================
   LOAD USER CONTEXT (ADD THIS BLOCK)
========================= */
const [[user]] = await pool.query(
  `
  SELECT
    u.id,
    u.username,
    w.id AS wallet_id
  FROM users u
  LEFT JOIN wallets w
    ON w.user_id = u.id
    AND w.currency = 'NGN'
  WHERE u.id = ?
  LIMIT 1
  `,
  [row.user_id]
);

if (!user) {
  console.error('[AUTH_GUARD] User context not found', row.user_id);
  throw new Error('user_context_not_found');
}

/* =========================
   ATTACH USER CONTEXT
========================= */
req.user = {
  id: user.id,
  username: user.username,
  wallet_id: user.wallet_id
};

    return next();
  } catch (err) {
    console.error('[AUTH_GUARD_ERROR]', err.message);

    return res.status(401).json({
      success: false,
      code: AUTH_CODES.SESSION_EXPIRED,
      data: null
    });
  }
}

module.exports = {
  requireAuth
};
