'use strict';

const NotificationService = require('../services/notification.service');

/* =========================
   LIST NOTIFICATIONS
========================= */
exports.list = async (req, res) => {
  try {
    const { cursor, limit, unread } = req.query;

    const result = await NotificationService.listUserNotifications({
      userId: req.auth.userId,
      cursor,
      limit,
      unread: unread === 'true'
    });

    return res.json({
      success: true,
      data: result
    });
  } catch (e) {
    console.error('[NOTIFICATION_LIST_ERROR]', e);
    return res.status(500).json({
      success: false,
      message: 'Failed to load notifications'
    });
  }
};

/* =========================
   UNREAD COUNT
========================= */
exports.unreadCount = async (req, res) => {
  try {
    const count = await NotificationService.getUnreadCount({
      userId: req.auth.userId
    });

    return res.json({
      success: true,
      data: { count }
    });
  } catch (e) {
    console.error('[NOTIFICATION_UNREAD_COUNT_ERROR]', e);
    return res.status(500).json({
      success: false
    });
  }
};

/* =========================
   MARK ONE AS READ
========================= */
exports.markRead = async (req, res) => {
  try {
    await NotificationService.markAsRead({
      userId: req.auth.userId,
      notificationId: req.params.id
    });

    return res.json({ success: true });
  } catch (e) {
    console.error('[NOTIFICATION_MARK_READ_ERROR]', e);
    return res.status(400).json({
      success: false,
      message: 'Failed to mark notification as read'
    });
  }
};

/* =========================
   MARK ALL AS READ
========================= */
exports.markAllRead = async (req, res) => {
  try {
    await NotificationService.markAllAsRead({
      userId: req.auth.userId
    });

    return res.json({ success: true });
  } catch (e) {
    console.error('[NOTIFICATION_MARK_ALL_READ_ERROR]', e);
    return res.status(500).json({
      success: false
    });
  }
};
