import pool from '../config/db.js';

export async function audit({
  userId = null,
  action,
  ip,
  userAgent,
  metadata = {}
}) {
  try {
    await pool.query(
      `INSERT INTO user_audit_logs
       (user_id, actor_type, action, ip_address, user_agent, metadata)
       VALUES (?, 'user', ?, ?, ?, ?)`,
      [userId, action, ip, userAgent, JSON.stringify(metadata)]
    );
  } catch {
    // audit must NEVER block auth
  }
}
