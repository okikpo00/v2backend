'use strict';

const pool = require('../config/db');
const { verifyPassword } = require('../utils/password.util');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');

/* =========================
   HELPERS
========================= */

function authError(code) {
  const err = new Error(code);
  err.code = code;
  return err;
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

/* =========================
   ADMIN LOGIN
========================= */

exports.login = async ({ email, password, ip, user_agent }) => {
  console.log('[ADMIN_LOGIN_SERVICE] start', { email, ip });

  const emailNorm = String(email || '').trim().toLowerCase();
  if (!emailNorm || !password) {
    throw authError('INVALID_CREDENTIALS');
  }

  const [[admin]] = await pool.query(
    `SELECT
       id,
       uuid,
       email,
       password_hash,
       role,
       status,
       security_version
     FROM admin_users
     WHERE email = ?
     LIMIT 1`,
    [emailNorm]
  );

  console.log('[ADMIN_LOGIN_SERVICE] admin lookup', {
    found: !!admin,
    status: admin?.status,
    role: admin?.role
  });

  if (!admin || admin.status !== 'active') {
    await pool.query(
      `INSERT INTO admin_audit_logs
       (admin_id, actor_role, action, ip_address, user_agent)
       VALUES (NULL, 'system', 'ADMIN_LOGIN_FAIL', ?, ?)`,
      [ip, user_agent]
    );

    throw authError('INVALID_CREDENTIALS');
  }

  const passwordOk = await verifyPassword(password, admin.password_hash);
  if (!passwordOk) {
    await pool.query(
      `INSERT INTO admin_audit_logs
       (admin_id, actor_role, action, ip_address, user_agent)
       VALUES (?, ?, 'ADMIN_LOGIN_FAIL', ?, ?)`,
      [admin.id, admin.role, ip, user_agent]
    );

    throw authError('INVALID_CREDENTIALS');
  }

  const sessionId = uuidv4();
  const refreshRaw = generateToken();
  const refreshHash = hashToken(refreshRaw);

  await pool.query(
    `INSERT INTO admin_sessions
     (session_id, admin_id, refresh_token_hash, ip_address, user_agent, expires_at)
     VALUES (?, ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL 30 DAY))`,
    [sessionId, admin.id, refreshHash, ip, user_agent]
  );

  await pool.query(
    `INSERT INTO admin_audit_logs
     (admin_id, actor_role, action, target_type, target_id, ip_address, user_agent)
     VALUES (?, ?, 'ADMIN_LOGIN_SUCCESS', 'session', ?, ?, ?)`,
    [admin.id, admin.role, sessionId, ip, user_agent]
  );

  console.log('[ADMIN_LOGIN_SERVICE] success', {
    adminId: admin.id,
    sessionId
  });

  return {
    admin: {
      id: admin.id,
      uuid: admin.uuid,
      email: admin.email,
      role: admin.role,
      security_version: admin.security_version
    },
    sessionId,
    refreshToken: refreshRaw
  };
};
