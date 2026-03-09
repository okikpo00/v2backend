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

function generateOTP() {
  return String(
    Math.floor(100000 + Math.random() * 900000)
  );
}

function hashOTP(otp) {
  return crypto.createHash('sha256').update(otp).digest('hex');
}

/* =========================================================
   REQUEST WITHDRAWAL
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
  console.log('[WITHDRAW_REQUEST] start', { userId, amount });

  if (!amount || amount <= 0) {
    throw withdrawalError('INVALID_AMOUNT');
  }

  if (!bank_name || !account_number || !account_name) {
    throw withdrawalError('INVALID_BANK_DETAILS');
  }

  await System.assertEnabled('WITHDRAWALS_ENABLED');

  const min = await System.getDecimal('MIN_WITHDRAW_AMOUNT');
  const max = await System.getDecimal('MAX_WITHDRAW_AMOUNT');
  const percentFee = await System.getDecimal('WITHDRAWAL_FEE_PERCENT');
  const flatFee = await System.getDecimal('WITHDRAWAL_FLAT_FEE');

  if (amount < min) throw withdrawalError('BELOW_MIN_WITHDRAW');
  if (amount > max) throw withdrawalError('ABOVE_MAX_WITHDRAW');

  const fee = (amount * percentFee) / 100 + flatFee;
  const totalDebit = amount + fee;

  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();
const [[wallet]] = await conn.query(
  `SELECT id
   FROM wallets
   WHERE user_id = ?
     AND status = 'active'
   LIMIT 1
   FOR UPDATE`,
  [userId]
);

if (!wallet) {
  throw withdrawalError('WALLET_NOT_FOUND');
}

const walletId = wallet.id;
    // Lock funds first

const [[walletRow]] = await conn.query(
  `SELECT balance, locked_balance, status
   FROM wallets
   WHERE id = ?
   FOR UPDATE`,
  [walletId]
);

if (!walletRow) {
  throw withdrawalError('WALLET_NOT_FOUND');
}

if (walletRow.status !== 'active') {
  throw withdrawalError('WALLET_FROZEN');
}

const available =
  Number(walletRow.balance) - Number(walletRow.locked_balance);

if (available < totalDebit) {
  throw withdrawalError('INSUFFICIENT_BALANCE');
}

await conn.query(
  `UPDATE wallets
   SET locked_balance = locked_balance + ?
   WHERE id = ?`,
  [totalDebit, walletId]
);
    

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

    const otp = generateOTP();
    const otpHash = hashOTP(otp);

    await conn.query(
      `INSERT INTO withdrawal_otps
       (withdrawal_id, otp_hash, expires_at)
       VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 10 MINUTE))`,
      [withdrawalId, otpHash]
    );

    await conn.commit();

    console.log('[WITHDRAW_REQUEST] created', { withdrawalId });

    return {
      withdrawal_uuid: uuid,
      otp // SEND VIA EMAIL (not returned in prod)
    };
  } catch (e) {
    await conn.rollback();
    console.error('[WITHDRAW_REQUEST_ERROR]', e);
    throw e;
  } finally {
    conn.release();
  }
};
/* =========================================================
   VERIFY WITHDRAWAL OTP
========================================================= */
exports.verifyWithdrawalOTP = async ({
  userId,
  withdrawal_uuid,
  otp,
  ip,
  user_agent
}) => {
  console.log('[WITHDRAW_OTP_VERIFY] start', { userId, withdrawal_uuid });

  if (!withdrawal_uuid || !otp) {
    throw withdrawalError('INVALID_INPUT');
  }

  const otpHash = hashOTP(String(otp));
  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    /* -------------------------
       FETCH WITHDRAWAL
    ------------------------- */
    const [[withdrawal]] = await conn.query(
      `SELECT id, status
       FROM withdrawal_requests
       WHERE uuid = ?
         AND user_id = ?
       LIMIT 1
       FOR UPDATE`,
      [withdrawal_uuid, userId]
    );

    if (!withdrawal) {
      throw withdrawalError('WITHDRAWAL_NOT_FOUND');
    }

    if (withdrawal.status !== 'otp_pending') {
      throw withdrawalError('INVALID_WITHDRAWAL_STATE');
    }

    /* -------------------------
       FETCH OTP
    ------------------------- */
    const [[otpRow]] = await conn.query(
      `SELECT id, expires_at, verified_at, attempts
       FROM withdrawal_otps
       WHERE withdrawal_id = ?
         AND otp_hash = ?
       LIMIT 1
       FOR UPDATE`,
      [withdrawal.id, otpHash]
    );

    if (!otpRow) {
      await conn.query(
        `UPDATE withdrawal_otps
         SET attempts = attempts + 1
         WHERE withdrawal_id = ?`,
        [withdrawal.id]
      );

      throw withdrawalError('INVALID_OTP');
    }

    if (otpRow.verified_at) {
      throw withdrawalError('OTP_ALREADY_USED');
    }

    if (new Date(otpRow.expires_at) <= new Date()) {
      throw withdrawalError('OTP_EXPIRED');
    }

    if (otpRow.attempts >= 5) {
      throw withdrawalError('OTP_ATTEMPTS_EXCEEDED');
    }

    /* -------------------------
       MARK OTP VERIFIED
    ------------------------- */
    await conn.query(
      `UPDATE withdrawal_otps
       SET verified_at = NOW()
       WHERE id = ?`,
      [otpRow.id]
    );

    /* -------------------------
       UPDATE WITHDRAWAL STATE
    ------------------------- */
    await conn.query(
      `UPDATE withdrawal_requests
       SET status = 'pending_admin'
       WHERE id = ?`,
      [withdrawal.id]
    );

    await conn.commit();

    console.log('[WITHDRAW_OTP_VERIFY] success', { withdrawal_uuid });
    return { success: true };
  } catch (e) {
    await conn.rollback();
    console.error('[WITHDRAW_OTP_VERIFY_ERROR]', e);
    throw e;
  } finally {
    conn.release();
  }
};
exports.resendWithdrawalOTP = async ({
  userId,
  withdrawal_uuid,
  ip,
  user_agent
}) => {
  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    /* 1️⃣ Fetch withdrawal */
    const [[withdrawal]] = await conn.query(
      `SELECT id, status
       FROM withdrawal_requests
       WHERE uuid = ?
         AND user_id = ?
       LIMIT 1
       FOR UPDATE`,
      [withdrawal_uuid, userId]
    );

    if (!withdrawal) {
      throw withdrawalError('WITHDRAWAL_NOT_FOUND');
    }

    if (withdrawal.status !== 'otp_pending') {
      throw withdrawalError('INVALID_WITHDRAWAL_STATE');
    }

    /* 2️⃣ Fetch latest OTP */
    const [[otpRow]] = await conn.query(
      `SELECT id, resend_count, last_sent_at
       FROM withdrawal_otps
       WHERE withdrawal_id = ?
       ORDER BY id DESC
       LIMIT 1
       FOR UPDATE`,
      [withdrawal.id]
    );

    if (!otpRow) {
      throw withdrawalError('OTP_NOT_FOUND');
    }

    /* 3️⃣ Enforce resend rules */
    if (otpRow.resend_count >= 3) {
      throw withdrawalError('OTP_RESEND_LIMIT_EXCEEDED');
    }

    if (
      otpRow.last_sent_at &&
      new Date(Date.now() - 60 * 1000) < new Date(otpRow.last_sent_at)
    ) {
      throw withdrawalError('OTP_RESEND_TOO_SOON');
    }

    /* 4️⃣ Generate new OTP */
    const otp = generateOTP();
    const otpHash = hashOTP(otp);

    await conn.query(
      `UPDATE withdrawal_otps
       SET otp_hash = ?,
           expires_at = DATE_ADD(NOW(), INTERVAL 10 MINUTE),
           resend_count = resend_count + 1,
           last_sent_at = NOW(),
           attempts = 0
       WHERE id = ?`,
      [otpHash, otpRow.id]
    );

    await conn.commit();

    return {
      otp // dev only – controller will strip in prod
    };
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
};


/* =========================================================
   CANCEL WITHDRAWAL (USER)
========================================================= */
exports.cancelWithdrawal = async ({ userId, withdrawal_uuid }) => {
  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    const [[row]] = await conn.query(
      `SELECT id, wallet_id, total_debit, status
       FROM withdrawal_requests
       WHERE uuid = ? AND user_id = ?
       FOR UPDATE`,
      [withdrawal_uuid, userId]
    );

    if (!row) throw withdrawalError('WITHDRAWAL_NOT_FOUND');

    if (!['otp_pending', 'pending_admin'].includes(row.status)) {
      throw withdrawalError('CANNOT_CANCEL_WITHDRAWAL');
    }

    await conn.query(
      `UPDATE withdrawal_requests
       SET status = 'cancelled'
       WHERE id = ?`,
      [row.id]
    );

    await WalletService.unlockFunds({
      walletId: row.wallet_id,
      amount: row.total_debit
    });

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
