'use strict';

const express = require('express');
const router = express.Router();
 
const   {requireAuth} = require('../middlewares/auth.guard');
const NotificationController = require('../controllers/notification.controller');

router.get(
  '/',
  requireAuth,
  NotificationController.list
);

router.get(
  '/unread-count',
  requireAuth,
  NotificationController.unreadCount
);

router.post(
  '/:id/read',
  requireAuth,
  NotificationController.markRead
);

router.post(
  '/read-all',
  requireAuth,
  NotificationController.markAllRead
);

module.exports = router;
