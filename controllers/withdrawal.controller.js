'use strict';
const pool = require('../config/db');
const WithdrawalService = require('../services/withdrawal.service');
const sendEmail = require('../utils/sendEmail');
const env = require('../config/env');

/* =========================================================
   REQUEST WITHDRAWAL
========================================================= */
exports.request = async (req, res) => {
  try {
    const {
      amount,
      bank_name,
      account_number,
      account_name
    } = req.body;

    /* ---------- HARD INPUT VALIDATION (FAST FAIL) ---------- */

    if (amount === undefined || amount === null || isNaN(Number(amount))) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_AMOUNT',
        message: 'Amount must be a valid number'
      });
    }

    if (
      typeof bank_name !== 'string' ||
      typeof account_number !== 'string' ||
      typeof account_name !== 'string'
    ) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_BANK_DETAILS',
        message: 'Invalid bank details'
      });
    }
const [[user]] = await pool.query(
  `SELECT email FROM users WHERE id = ? LIMIT 1`,
  [req.auth.userId]
);

if (!user?.email) {
  throw new Error('USER_EMAIL_NOT_FOUND');
}
    /* ---------- SERVICE CALL ---------- */

    const result = await WithdrawalService.requestWithdrawal({
      userId: req.auth.userId,
      walletId: req.auth.walletId, // REQUIRED
      amount: Number(amount),
      bank_name: bank_name.trim(),
      account_number: account_number.trim(),
      account_name: account_name.trim(),
      ip: req.ip,
      user_agent: req.headers['user-agent']
    });

    /* ---------- OTP DELIVERY ---------- */

    if (env.NODE_ENV === 'development') {
     await sendEmail(
  user.email,
  'Trebetta Withdrawal Verification',
        `
          <p>Your withdrawal verification code is:</p>
          <h2>${result.otp}</h2>
          <p>This code expires in 10 minutes.</p>
        `
      );

      // Never expose OTP in prod
      delete result.otp;
    }

    return res.json({
      success: true,
      data: result
    });
  } catch (err) {
    console.error('[WITHDRAW_REQUEST_CONTROLLER_ERROR]', err);

    return res.status(400).json({
      success: false,
      code: err.code || 'WITHDRAW_REQUEST_FAILED',
      message: err.message
    });
  }
};

/* =========================================================
   VERIFY WITHDRAWAL OTP
========================================================= */
exports.verifyOtp = async (req, res) => {
  try {
    const { withdrawal_uuid, otp } = req.body;

    if (
      typeof withdrawal_uuid !== 'string' ||
      typeof otp !== 'string'
    ) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_INPUT',
        message: 'Invalid verification data'
      });
    }

    const result = await WithdrawalService.verifyWithdrawalOTP({
      userId: req.auth.userId,
      withdrawal_uuid,
      otp,
      ip: req.ip,
      user_agent: req.headers['user-agent']
    });

    return res.json({
      success: true,
      data: result
    });
  } catch (err) {
    console.error('[WITHDRAW_VERIFY_OTP_CONTROLLER_ERROR]', err);

    return res.status(400).json({
      success: false,
      code: err.code || 'OTP_VERIFICATION_FAILED',
      message: err.message
    });
  }
};
exports.resendOtp = async (req, res) => {
  try {
    const { withdrawal_uuid } = req.body;

    if (!withdrawal_uuid || typeof withdrawal_uuid !== 'string') {
      return res.status(400).json({
        success: false,
        code: 'INVALID_INPUT'
      });
    }

    const result = await WithdrawalService.resendWithdrawalOTP({
      userId: req.auth.userId,
      withdrawal_uuid,
      ip: req.ip,
      user_agent: req.headers['user-agent']
    });

    // 📧 Send OTP via email
    const [[user]] = await pool.query(
  `SELECT email
   FROM users
   WHERE id = ?
   LIMIT 1`,
  [req.auth.userId]
);

if (!user?.email) {
  throw new Error('USER_EMAIL_NOT_FOUND');
}
    await sendEmail(
      user.email,
      'Trebetta Withdrawal OTP (Resent)',
      `
        <p>Your new withdrawal verification code is:</p>
        <h2>${result.otp}</h2>
        <p>This code expires in 10 minutes.</p>
      `
    );

    if (process.env.NODE_ENV !== 'development') {
      delete result.otp;
    }

    return res.json({
      success: true,
      message: 'OTP resent successfully'
    });
  } catch (err) {
    console.error('[WITHDRAW_RESEND_OTP_ERROR]', err);

    return res.status(400).json({
      success: false,
      code: err.code || 'RESEND_FAILED',
      message: err.message
    });
  }
};

/* =========================================================
   CANCEL WITHDRAWAL
========================================================= */
exports.cancel = async (req, res) => {
  try {
    const { uuid } = req.params;

    if (!uuid || typeof uuid !== 'string') {
      return res.status(400).json({
        success: false,
        code: 'INVALID_WITHDRAWAL_ID'
      });
    }

    await WithdrawalService.cancelWithdrawal({
      userId: req.auth.userId,
      withdrawal_uuid: uuid
    });

    return res.json({
      success: true
    });
  } catch (err) {
    console.error('[WITHDRAW_CANCEL_CONTROLLER_ERROR]', err);

    return res.status(400).json({
      success: false,
      code: err.code || 'CANCEL_FAILED',
      message: err.message
    });
  }
};

/* =========================================================
   LIST USER WITHDRAWALS
========================================================= */
exports.listMine = async (req, res) => {
  try {
    const withdrawals = await WithdrawalService.listUserWithdrawals({
      userId: req.auth.userId
    });

    return res.json({
      success: true,
      data: withdrawals
    });
  } catch (err) {
    console.error('[WITHDRAW_LIST_CONTROLLER_ERROR]', err);

    return res.status(500).json({
      success: false,
      message: 'Failed to load withdrawals'
    });
  }
};
