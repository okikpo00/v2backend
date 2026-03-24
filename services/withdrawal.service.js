'use strict';

const pool = require('../config/db');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');

const WalletService = require('./wallet.service');
const System = require('./system.service');

function withdrawalError(code, message) {
  const err = new Error(message || code);
  err.code = code;
  return err;
}

/* =========================
   OTP HELPERS
========================= */
function generateOTP() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function hashOTP(otp) {
  return crypto.createHash('sha256').update(otp).digest('hex');
}

/* =========================================================
   REQUEST WITHDRAWAL (PRODUCTION SAFE)
========================================================= */
exports.requestWithdrawal = async ({
  userId,
  amount,
  bank_name,
  account_number,
  account_name,
  ip,
  user_agent
}) => {

  if (!amount || amount <= 0) {
    throw withdrawalError('INVALID_AMOUNT');
  }

  if (!bank_name || !account_number || !account_name) {
    throw withdrawalError('INVALID_BANK_DETAILS');
  }

  await System.assertEnabled('WITHDRAWALS_ENABLED');

  const [
    min,
    max,
    percentFee,
    flatFee
  ] = await Promise.all([
    System.getDecimal('MIN_WITHDRAW_AMOUNT'),
    System.getDecimal('MAX_WITHDRAW_AMOUNT'),
    System.getDecimal('WITHDRAWAL_FEE_PERCENT'),
    System.getDecimal('WITHDRAWAL_FLAT_FEE')
  ]);

  if (amount < min) throw withdrawalError('BELOW_MIN_WITHDRAW');
  if (amount > max) throw withdrawalError('ABOVE_MAX_WITHDRAW');

  const fee = (amount * percentFee) / 100 + flatFee;
  const totalDebit = amount + fee;

  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    /* =========================
       GET WALLET (LOCKED)
    ========================= */
    const [[wallet]] = await conn.query(
      `SELECT id
       FROM wallets
       WHERE user_id = ?
         AND status = 'active'
       LIMIT 1
       FOR UPDATE`,
      [userId]
    );

    if (!wallet) throw withdrawalError('WALLET_NOT_FOUND');

    const walletId = wallet.id;

    /* =========================
       CREATE WITHDRAWAL FIRST
    ========================= */
    const uuid = uuidv4();

    const [res] = await conn.query(
      `INSERT INTO withdrawal_requests (
        uuid, user_id, wallet_id,
        amount, fee, total_debit,
        bank_name, account_number, account_name,
        status, created_ip, created_user_agent
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'otp_pending', ?, ?)`,
      [
        uuid,
        userId,
        walletId,
        amount,
        fee,
        totalDebit,
        bank_name,
        account_number,
        account_name,
        ip,
        user_agent
      ]
    );

    const withdrawalId = res.insertId;

    /* =========================
       LOCK FUNDS (SOURCE OF TRUTH)
    ========================= */
    try {
      await WalletService.lock({
        walletId,
        userId,
        amount: totalDebit,
        reference_type: 'withdrawal',
        reference_id: uuid,
        idempotency_key: `withdrawal_lock:${uuid}`,
        conn
      });
    } catch (e) {
      if (e.code === 'DUPLICATE_TRANSACTION') {
        throw withdrawalError('DUPLICATE_WITHDRAWAL');
      }
      throw e;
    }

    /* =========================
       CREATE OTP
    ========================= */
    const otp = generateOTP();
    const otpHash = hashOTP(otp);

    await conn.query(
      `INSERT INTO withdrawal_otps
       (withdrawal_id, otp_hash, expires_at, attempts, resend_count)
       VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 10 MINUTE), 0, 0)`,
      [withdrawalId, otpHash]
    );

    await conn.commit();

    return {
      withdrawal_uuid: uuid,
      otp // remove in prod response layer
    };

  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
};

/* =========================================================
   VERIFY OTP
========================================================= */
exports.verifyWithdrawalOTP = async ({
  userId,
  withdrawal_uuid,
  otp
}) => {

  if (!withdrawal_uuid || !otp) {
    throw withdrawalError('INVALID_INPUT');
  }

  const otpHash = hashOTP(String(otp));
  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    const [[withdrawal]] = await conn.query(
      `SELECT id, status
       FROM withdrawal_requests
       WHERE uuid = ? AND user_id = ?
       LIMIT 1
       FOR UPDATE`,
      [withdrawal_uuid, userId]
    );

    if (!withdrawal) throw withdrawalError('WITHDRAWAL_NOT_FOUND');
    if (withdrawal.status !== 'otp_pending') {
      throw withdrawalError('INVALID_WITHDRAWAL_STATE');
    }

    const [[otpRow]] = await conn.query(
      `SELECT id, expires_at, verified_at, attempts
       FROM withdrawal_otps
       WHERE withdrawal_id = ?
       FOR UPDATE`,
      [withdrawal.id]
    );

    if (!otpRow) throw withdrawalError('OTP_NOT_FOUND');

    if (otpRow.verified_at) throw withdrawalError('OTP_ALREADY_USED');
    if (otpRow.attempts >= 5) throw withdrawalError('OTP_ATTEMPTS_EXCEEDED');
    if (new Date(otpRow.expires_at) <= new Date()) {
      throw withdrawalError('OTP_EXPIRED');
    }

    if (otpHash !== (await conn.query(
      `SELECT otp_hash FROM withdrawal_otps WHERE id = ?`,
      [otpRow.id]
    ))[0][0].otp_hash) {
      await conn.query(
        `UPDATE withdrawal_otps
         SET attempts = attempts + 1
         WHERE id = ?`,
        [otpRow.id]
      );
      throw withdrawalError('INVALID_OTP');
    }

    await conn.query(
      `UPDATE withdrawal_otps SET verified_at = NOW() WHERE id = ?`,
      [otpRow.id]
    );

    await conn.query(
      `UPDATE withdrawal_requests
       SET status = 'pending_admin'
       WHERE id = ?`,
      [withdrawal.id]
    );

    await conn.commit();

    return { success: true };

  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
};

/* =========================================================
   CANCEL WITHDRAWAL
========================================================= */
exports.cancelWithdrawal = async ({ userId, withdrawal_uuid }) => {

  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    const [[withdrawal]] = await conn.query(
      `SELECT id, wallet_id, status
       FROM withdrawal_requests
       WHERE uuid = ? AND user_id = ?
       FOR UPDATE`,
      [withdrawal_uuid, userId]
    );

    if (!withdrawal) throw withdrawalError('WITHDRAWAL_NOT_FOUND');

    if (!['otp_pending', 'pending_admin'].includes(withdrawal.status)) {
      throw withdrawalError('CANNOT_CANCEL_WITHDRAWAL');
    }

    /* =========================
       FETCH LOCK
    ========================= */
    const [[lock]] = await conn.query(
      `SELECT id
       FROM wallet_locks
       WHERE reference_type = 'withdrawal'
         AND reference_id = ?
         AND status = 'active'
       LIMIT 1
       FOR UPDATE`,
      [withdrawal_uuid]
    );

    if (!lock) throw withdrawalError('LOCK_NOT_FOUND');

    /* =========================
       RELEASE LOCK
    ========================= */
    await WalletService.unlock({
      walletId: withdrawal.wallet_id,
      lockId: lock.id,
      idempotency_key: `withdrawal_cancel:${withdrawal_uuid}`,
      conn
    });

    await conn.query(
      `UPDATE withdrawal_requests
       SET status = 'cancelled'
       WHERE id = ?`,
      [withdrawal.id]
    );

    await conn.commit();

  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
};

/* =========================================================
   LIST USER WITHDRAWALS
========================================================= */
exports.listUserWithdrawals = async ({ userId }) => {
  const [rows] = await pool.query(
    `SELECT
       uuid,
       amount,
       fee,
       total_debit,
       bank_name,
       account_number,
       account_name,
       status,
       created_at
     FROM withdrawal_requests
     WHERE user_id = ?
     ORDER BY created_at DESC`,
    [userId]
  );

  return rows;
};