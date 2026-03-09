'use strict';

const express = require('express');
const router = express.Router();

const requireAdminAuth = require('../middlewares/admin.auth.guard');
const { requireAnyRole } = require('../middlewares/admin.rbac');
const AdminDepositController = require('../controllers/admin.deposit.controller');

// Finance visibility only
router.get(
  '/',
  requireAdminAuth,
  requireAnyRole(['super_admin', 'finance']),
  AdminDepositController.list
);

module.exports = router;
