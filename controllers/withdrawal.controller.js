'use strict';

const pool = require('../config/db');
const WithdrawalService = require('../services/withdrawal.service');
const sendEmail = require('../utils/sendEmail');
const env = require('../config/env');

/* =========================================================
   HELPERS
========================================================= */
function fail(res, code, message = code, status = 400) {
  return res.status(status).json({
    success: false,
    code,
    message
  });
}

function ok(res, data = null) {
  return res.json({
    success: true,
    data
  });
}

/* =========================================================
   REQUEST WITHDRAWAL
========================================================= */
exports.request = async (req, res) => {
  try {
    const { amount, bank_name, account_number, account_name } = req.body;

    /* ---------- VALIDATION ---------- */
    if (amount === undefined || amount === null || isNaN(Number(amount))) {
      return fail(res, 'INVALID_AMOUNT', 'Amount must be a valid number');
    }

    if (
      typeof bank_name !== 'string' ||
      typeof account_number !== 'string' ||
      typeof account_name !== 'string'
    ) {
      return fail(res, 'INVALID_BANK_DETAILS');
    }

    const cleanBank = bank_name.trim();
    const cleanAccNum = account_number.trim();
    const cleanAccName = account_name.trim();

    if (!cleanBank || !cleanAccNum || !cleanAccName) {
      return fail(res, 'INVALID_BANK_DETAILS');
    }

    /* ---------- USER EMAIL ---------- */
    const [[user]] = await pool.query(
      `SELECT email FROM users WHERE id = ? LIMIT 1`,
      [req.auth.userId]
    );

    if (!user?.email) {
      return fail(res, 'USER_EMAIL_NOT_FOUND');
    }

    /* ---------- SERVICE ---------- */
    const result = await WithdrawalService.requestWithdrawal({
      userId: req.auth.userId,
      amount: Number(amount),
      bank_name: cleanBank,
      account_number: cleanAccNum,
      account_name: cleanAccName,
      ip: req.ip,
      user_agent: req.headers['user-agent']
    });

    /* ---------- SEND OTP (ALWAYS) ---------- */
    await sendEmail(
      user.email,
      'Trebetta Withdrawal Verification',
      `
        <p>Your withdrawal verification code is:</p>
        <h2>${result.otp}</h2>
        <p>This code expires in 10 minutes.</p>
      `
    );

    /* ---------- HIDE OTP IN PROD ---------- */
    if (env.NODE_ENV !== 'development') {
      delete result.otp;
    }

    return ok(res, result);

  } catch (err) {
    console.error('[WITHDRAW_REQUEST_CONTROLLER_ERROR]', err);

    return fail(
      res,
      err.code || 'WITHDRAW_REQUEST_FAILED',
      err.message
    );
  }
};

/* =========================================================
   VERIFY OTP
========================================================= */
exports.verifyOtp = async (req, res) => {
  try {
    const { withdrawal_uuid, otp } = req.body;

    if (
      typeof withdrawal_uuid !== 'string' ||
      typeof otp !== 'string' ||
      !withdrawal_uuid.trim() ||
      !otp.trim()
    ) {
      return fail(res, 'INVALID_INPUT');
    }

    const result = await WithdrawalService.verifyWithdrawalOTP({
      userId: req.auth.userId,
      withdrawal_uuid: withdrawal_uuid.trim(),
      otp: otp.trim(),
      ip: req.ip,
      user_agent: req.headers['user-agent']
    });

    return ok(res, result);

  } catch (err) {
    console.error('[WITHDRAW_VERIFY_OTP_CONTROLLER_ERROR]', err);

    return fail(
      res,
      err.code || 'OTP_VERIFICATION_FAILED',
      err.message
    );
  }
};

/* =========================================================
   RESEND OTP
========================================================= */
exports.resendOtp = async (req, res) => {
  try {
    const { withdrawal_uuid } = req.body;

    if (!withdrawal_uuid || typeof withdrawal_uuid !== 'string') {
      return fail(res, 'INVALID_INPUT');
    }

    /* ---------- SERVICE ---------- */
    const result = await WithdrawalService.resendWithdrawalOTP({
      userId: req.auth.userId,
      withdrawal_uuid: withdrawal_uuid.trim(),
      ip: req.ip,
      user_agent: req.headers['user-agent']
    });

    /* ---------- GET EMAIL ---------- */
    const [[user]] = await pool.query(
      `SELECT email FROM users WHERE id = ? LIMIT 1`,
      [req.auth.userId]
    );

    if (!user?.email) {
      return fail(res, 'USER_EMAIL_NOT_FOUND');
    }

    /* ---------- SEND EMAIL ---------- */
    await sendEmail(
      user.email,
      'Trebetta Withdrawal OTP (Resent)',
      `
        <p>Your new withdrawal verification code is:</p>
        <h2>${result.otp}</h2>
        <p>This code expires in 10 minutes.</p>
      `
    );

    return ok(res, {
      message: 'OTP resent successfully'
    });

  } catch (err) {
    console.error('[WITHDRAW_RESEND_OTP_ERROR]', err);

    return fail(
      res,
      err.code || 'RESEND_FAILED',
      err.message
    );
  }
};

/* =========================================================
   CANCEL WITHDRAWAL
========================================================= */
exports.cancel = async (req, res) => {
  try {
    const { uuid } = req.params;

    if (!uuid || typeof uuid !== 'string') {
      return fail(res, 'INVALID_WITHDRAWAL_ID');
    }

    await WithdrawalService.cancelWithdrawal({
      userId: req.auth.userId,
      withdrawal_uuid: uuid.trim()
    });

    return ok(res, { cancelled: true });

  } catch (err) {
    console.error('[WITHDRAW_CANCEL_CONTROLLER_ERROR]', err);

    return fail(
      res,
      err.code || 'CANCEL_FAILED',
      err.message
    );
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

    return ok(res, withdrawals);

  } catch (err) {
    console.error('[WITHDRAW_LIST_CONTROLLER_ERROR]', err);

    return fail(
      res,
      'WITHDRAW_LIST_FAILED',
      'Failed to load withdrawals',
      500
    );
  }
};