'use strict';

const router = require('express').Router();

const requireAdminAuth = require('../middlewares/admin.auth.guard');
const { requireAnyRole, requireRole } = require('../middlewares/admin.rbac');
const Controller = require('../controllers/admin.user.controller');

router.use(requireAdminAuth);

/* VIEW */
router.get(
  '/',
  requireAnyRole(['super_admin','support']),
  Controller.list
);

router.get(
  '/:id',
  requireAnyRole(['super_admin','support']),
  Controller.get
);

/* ACTIONS */
router.post(
  '/:id/suspend',
  requireAnyRole(['super_admin','support']),
  Controller.changeStatus('suspended')
);

router.post(
  '/:id/unsuspend',
  requireRole('super_admin'),
  Controller.changeStatus('active')
);

router.post(
  '/:id/ban',
  requireRole('super_admin'),
  Controller.changeStatus('banned')
);

module.exports = router;
