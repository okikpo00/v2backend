'use strict';

const pool = require('../config/db');

function userError(code, message) {
  const e = new Error(message || code);
  e.code = code;
  return e;
}

/* =========================================================
   FETCH USERS (PAGINATED)
========================================================= */
exports.fetchUsers = async ({ status, email, cursor, limit = 50 }) => {
  const params = [];
  let where = 'WHERE 1=1';

  if (status) {
    where += ' AND u.status = ?';
    params.push(status);
  }

  if (email) {
    where += ' AND u.email LIKE ?';
    params.push(`%${email}%`);
  }

  if (cursor) {
    where += ' AND u.id < ?';
    params.push(cursor);
  }

  const [rows] = await pool.query(
    `
    SELECT
      u.id,
      u.uuid,
      u.email,
      u.username,
      u.first_name,
      u.last_name,
      u.status,
      u.email_verified_at,
      u.last_login_at,
      u.created_at,
COALESCE(w.balance, 0)        AS balance,
COALESCE(w.locked_balance, 0) AS locked_balance

    FROM users u
    LEFT JOIN wallets w
  ON w.user_id = u.id
 AND w.currency = 'NGN'
    ${where}
    ORDER BY u.id DESC
    LIMIT ?
    `,
    [...params, limit + 1]
  );

  let nextCursor = null;
  let items = rows;

  if (rows.length > limit) {
    nextCursor = rows[limit - 1].id;
    items = rows.slice(0, limit);
  }

  return { items, next_cursor: nextCursor };
};

/* =========================================================
   FETCH SINGLE USER (FULL PROFILE)
========================================================= */
exports.getUser = async (userId) => {
  const [[user]] = await pool.query(
    `
    SELECT
      u.*,
      w.balance,
      w.locked_balance
    FROM users u
    LEFT JOIN wallets w ON w.id = u.default_wallet_id
    WHERE u.id = ?
    LIMIT 1
    `,
    [userId]
  );

  if (!user) throw userError('USER_NOT_FOUND');
  return user;
};

/* =========================================================
   CHANGE USER STATUS (ATOMIC)
========================================================= */
exports.changeStatus = async ({
  userId,
  newStatus,
  reason,
  admin
}) => {
  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    const [[user]] = await conn.query(
      `SELECT status FROM users WHERE id = ? FOR UPDATE`,
      [userId]
    );

    if (!user) throw userError('USER_NOT_FOUND');

    if (user.status === newStatus) {
      throw userError('NO_STATUS_CHANGE');
    }

    await conn.query(
      `UPDATE users SET status = ? WHERE id = ?`,
      [newStatus, userId]
    );

    await conn.query(
      `INSERT INTO user_status_history
       (user_id, old_status, new_status, reason, admin_id)
       VALUES (?, ?, ?, ?, ?)`,
      [userId, user.status, newStatus, reason, admin.adminId]
    );

    await conn.query(
      `INSERT INTO admin_audit_logs
       (admin_id, actor_role, action, target_type, target_id, metadata)
       VALUES (?, ?, ?, 'user', ?, ?)`,
      [
        admin.adminId,
        admin.role,
        `USER_${newStatus.toUpperCase()}`,
        String(userId),
        JSON.stringify({ reason })
      ]
    );

    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
};
