'use strict';

const express = require('express');
const router = express.Router();

const requireAdminAuth = require('../middlewares/admin.auth.guard');
const { requireAnyRole } = require('../middlewares/admin.rbac');
const AdminWithdrawalController = require('../controllers/admin.withdrawal.controller');

const FINANCE_ROLES = ['super_admin', 'finance'];

router.get(
  '/',
  requireAdminAuth,
  requireAnyRole(FINANCE_ROLES),
  AdminWithdrawalController.listPending
);

router.post(
  '/:uuid/approve',
  requireAdminAuth,
  requireAnyRole(FINANCE_ROLES),
  AdminWithdrawalController.approve
);

router.post(
  '/:uuid/reject',
  requireAdminAuth,
  requireAnyRole(FINANCE_ROLES),
  AdminWithdrawalController.reject
);

module.exports = router;
