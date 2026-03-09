'use strict';

const pool = require('../config/db');

exports.createNotification = async ({
  userId,
  type,
  title,
  message,
  reference_type = null,
  reference_id = null
}) => {
  if (!userId || !type || !title || !message) return;

  try {
    await pool.query(
      `INSERT INTO user_notifications
       (user_id, type, title, message, reference_type, reference_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        userId,
        type,
        title,
        message,
        reference_type,
        reference_id
      ]
    );
  } catch (e) {
    // Notifications must NEVER break money flows
    console.error('[NOTIFICATION_CREATE_ERROR]', e.message);
  }
};
exports.listUserNotifications = async ({
  userId,
  cursor,
  limit = 20,
  unread = false
}) => {
  const params = [userId];
  let where = `WHERE user_id = ?`;

  if (unread) {
    where += ` AND read_at IS NULL`;
  }

  if (cursor) {
    where += ` AND id < ?`;
    params.push(cursor);
  }

  const [rows] = await pool.query(
    `
    SELECT id, type, title, message, is_read, created_at
    FROM user_notifications
    ${where}
    ORDER BY id DESC
    LIMIT ?
    `,
    [...params, Number(limit) + 1]
  );

  let next_cursor = null;
  let items = rows;

  if (rows.length > limit) {
    next_cursor = rows[limit - 1].id;
    items = rows.slice(0, limit);
  }

  return { items, next_cursor };
};

exports.getUnreadCount = async ({ userId }) => {
  const [[row]] = await pool.query(
    `
    SELECT COUNT(*) AS count
    FROM user_notifications
    WHERE user_id = ?
      AND read_at IS NULL
    `,
    [userId]
  );

  return Number(row.count);
};

exports.markAsRead = async ({ userId, notificationId }) => {
  await pool.query(
    `
    UPDATE user_notifications
    SET read_at = NOW()
    WHERE id = ?
      AND user_id = ?
    `,
    [notificationId, userId]
  );
};

exports.markAllAsRead = async ({ userId }) => {
  await pool.query(
    `
    UPDATE user_notifications
    SET read_at = NOW()
    WHERE user_id = ?
      AND read_at IS NULL
    `,
    [userId]
  );
};
