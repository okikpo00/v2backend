'use strict';

const express = require('express');
const router = express.Router();

const  { requireAuth }  = require('../middlewares/auth.guard');
const requireEmailVerified = require('../middlewares/email.verified.guard');
const DepositController = require('../controllers/wallet.deposit.controller');

/**
 * INIT DEPOSIT
 */

router.post(
  '/deposit/init',
  requireAuth,
  requireEmailVerified,
  DepositController.init
);
/**
 * LIST USER DEPOSITS
 */
router.get(
  '/deposit',
  requireAuth,
  requireEmailVerified,
  DepositController.list
);
router.post(
  '/payments/flutterwave/verify',
   requireAuth,
  requireEmailVerified,
  DepositController.verify
);
module.exports = router;
