'use strict';

const express = require('express');
const router = express.Router();

const requireAdminAuth = require('../middlewares/admin.auth.guard');
const {
  requireRole,
  requireAnyRole
} = require('../middlewares/admin.rbac');

const AdminSystemController = require('../controllers/admin.system.controller');

/* =========================
   READ SYSTEM SETTINGS
   super_admin + finance (read-only allowed)
========================= */
router.get(
  '/settings',
  requireAdminAuth,
  requireAnyRole(['super_admin', 'finance']),
  AdminSystemController.getAll
);

/* =========================
   UPDATE SYSTEM SETTING
   super_admin ONLY
========================= */
router.patch(
  '/settings/:key',
  requireAdminAuth,
  requireRole('super_admin'),
  AdminSystemController.update
);

/* =========================
   FORCE CACHE REFRESH
   super_admin ONLY
========================= */
router.post(
  '/cache/refresh',
  requireAdminAuth,
  requireRole('super_admin'),
  AdminSystemController.refreshCache
);

module.exports = router;
