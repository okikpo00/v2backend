'use strict';

const express = require('express');
const router = express.Router();

/* =========================
   MIDDLEWARES
========================= */

const { requireAuth }  = require('../middlewares/auth.guard');
const requireEmailVerified =
  require('../middlewares/email.verified.guard');
const withdrawalRateLimit =
  require('../middlewares/withdrawal.rate.limit');

/* =========================
   CONTROLLER
========================= */

const WithdrawalController =
  require('../controllers/withdrawal.controller');

/* =========================
   ROUTES
========================= */

/**
 * ---------------------------------------------------------
 * REQUEST WITHDRAWAL
 * - Creates withdrawal request
 * - Locks wallet funds
 * - Sends OTP via email
 * ---------------------------------------------------------
 */
router.post(
  '/withdraw',
  requireAuth,
  requireEmailVerified,
  withdrawalRateLimit,
  WithdrawalController.request
);

/**
 * ---------------------------------------------------------
 * VERIFY WITHDRAWAL OTP
 * ---------------------------------------------------------
 */
router.post(
  '/verify-otp',
  requireAuth,
  requireEmailVerified,
  withdrawalRateLimit,
  WithdrawalController.verifyOtp
);
router.post(
  '/resend-otp',
  requireAuth,
  requireEmailVerified,
  withdrawalRateLimit, // reuse same limiter
  WithdrawalController.resendOtp
);

/**
 * ---------------------------------------------------------
 * CANCEL WITHDRAWAL (OTP_PENDING ONLY)
 * ---------------------------------------------------------
 */
router.post(
  '/:uuid/cancel',
  requireAuth,
  requireEmailVerified,
  withdrawalRateLimit,
  WithdrawalController.cancel
);

/**
 * ---------------------------------------------------------
 * LIST USER WITHDRAWALS
 * ---------------------------------------------------------
 */
router.get(
  '/',
  requireAuth,
  requireEmailVerified,
  WithdrawalController.listMine
);

module.exports = router;
