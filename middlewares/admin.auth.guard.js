'use strict';

const pool = require('../config/db');
const { verifyAdminAccessToken } = require('../utils/admin.jwt.util');
const { AUTH_CODES } = require('../config/security');

module.exports = async function requireAdminAuth(req, res, next) {
  const header = req.headers.authorization;

  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      code: AUTH_CODES.UNAUTHORIZED
    });
  }

  try {
    const token = header.slice(7);
    const payload = verifyAdminAccessToken(token);

    const [[row]] = await pool.query(
      `
      SELECT 
        s.admin_id,
        s.session_id,
        s.expires_at,
        a.uuid,
        r.name AS role,
        a.status,
        a.security_version
      FROM admin_sessions s
      JOIN admin_users a ON a.id = s.admin_id
      JOIN admin_roles r ON r.id = a.role_id
      WHERE s.session_id = ?
        AND s.revoked_at IS NULL
        AND s.expires_at > NOW()
      LIMIT 1
      `,
      [payload.sid]
    );

    if (!row) {
      return res.status(401).json({
        success: false,
        code: AUTH_CODES.SESSION_EXPIRED
      });
    }

    if (row.status !== 'active') {
      return res.status(403).json({
        success: false,
        code: AUTH_CODES.UNAUTHORIZED
      });
    }

    if (payload.sv !== row.security_version) {
      return res.status(401).json({
        success: false,
        code: AUTH_CODES.SESSION_EXPIRED
      });
    }

    req.admin = {
      adminId: row.admin_id,
      adminUuid: row.uuid,
      role: row.role, // ← now from admin_roles
      sessionId: row.session_id
    };

    return next();
  } catch (err) {
    console.error('[ADMIN_AUTH_GUARD_ERROR]', err);

    return res.status(401).json({
      success: false,
      code: AUTH_CODES.UNAUTHORIZED
    });
  }
};