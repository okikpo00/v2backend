'use strict';

const express = require('express');
const router = express.Router();

const requireAdminAuth = require('../middlewares/admin.auth.guard');
const { requireAnyRole } = require('../middlewares/admin.rbac');

const Controller = require('../controllers/admin.wallet.transactions.controller');

/* =========================
   FINANCE LEDGER READ
========================= */

router.get(
  '/',
  requireAdminAuth,
  requireAnyRole(['super_admin', 'finance']),
  Controller.list
);

module.exports = router;
