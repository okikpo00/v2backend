'use strict';

const express = require('express');
const router = express.Router();

const requireAdminAuth = require('../middlewares/admin.auth.guard');
const {
  requireAnyRole
} = require('../middlewares/admin.rbac');

const AdminWalletController = require('../controllers/admin.wallet.controller');

/**
 * =========================================================
 * ADMIN WALLET ROUTES
 * =========================================================
 * - Auth required
 * - RBAC enforced
 * - Only finance & super_admin can move money
 * =========================================================
 */

const MONEY_ROLES = ['super_admin', 'finance'];

router.post(
  '/credit',
  requireAdminAuth,
  requireAnyRole(MONEY_ROLES),
  AdminWalletController.credit
);

router.post(
  '/debit',
  requireAdminAuth,
  requireAnyRole(MONEY_ROLES),
  AdminWalletController.debit
);

module.exports = router;