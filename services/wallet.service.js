'use strict';

/**
 * =========================================================
 * WALLET SERVICE (SYSTEM-AWARE, LEDGERED, IDEMPOTENT)
 * =========================================================
 * - Atomic balance updates (FOR UPDATE)
 * - Full ledger via wallet_transactions
 * - Redis idempotency (24h)
 * - System rules enforcement (deposits, withdrawals, fees)
 * - Safe under concurrency
 * =========================================================
 */

const pool = require('../config/db');
const { redis, isRedisAvailable } = require('../config/redis');
const System = require('./system.service');
const NotificationService = require('./notification.service');

/* =========================
   CONSTANTS
========================= */

const IDEMPOTENCY_TTL_SECONDS = 60 * 60 * 24; // 24 hours

/* =========================
   ERROR HELPER
========================= */

function walletError(code, message) {
  const err = new Error(message || code);
  err.code = code;
  return err;
}

/* =========================
   IDEMPOTENCY (REDIS)
========================= */

async function acquireIdempotency(key) {
  if (!key || !isRedisAvailable()) return;

  const redisKey = `wallet:idempotency:${key}`;
  const ok = await redis.set(
    redisKey,
    '1',
    'NX',
    'EX',
    IDEMPOTENCY_TTL_SECONDS
  );

  if (!ok) {
    throw walletError('DUPLICATE_TRANSACTION', 'Duplicate wallet operation');
  }
}

async function releaseIdempotency(key) {
  if (!key || !isRedisAvailable()) return;
  await redis.del(`wallet:idempotency:${key}`);
}

/* =========================
   GET WALLET
========================= */

exports.getWalletByUser = async ({ userId, currency = 'NGN' }) => {
  const [[wallet]] = await pool.query(
    `SELECT id, user_id, currency, balance, locked_balance, status
     FROM wallets
     WHERE user_id = ? AND currency = ?
     LIMIT 1`,
    [userId, currency]
  );

  if (!wallet) {
    throw walletError('WALLET_NOT_FOUND');
  }

  return wallet;
};

/* =========================
   CREATE WALLET (SAFE / IDEMPOTENT)
========================= */

exports.createWalletIfNotExists = async ({ userId, currency = 'NGN' }) => {
  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    const [[existing]] = await conn.query(
      `SELECT id FROM wallets
       WHERE user_id = ? AND currency = ?
       LIMIT 1`,
      [userId, currency]
    );

    if (existing) {
      await conn.commit();
      return existing.id;
    }

    const [res] = await conn.query(
      `INSERT INTO wallets
       (user_id, currency, balance, locked_balance, status)
       VALUES (?, ?, 0.00, 0.00, 'active')`,
      [userId, currency]
    );

    await conn.commit();
    return res.insertId;
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
};

/* =========================
   CREDIT WALLET
   (Deposits, Admin Credits, Promos)
========================= */

exports.creditWallet = async ({
  walletId,
  userId,
  amount,
  source_type,
  source_id,
  idempotency_key,
  metadata = null
}) => {
  if (!amount || amount <= 0) {
    throw walletError('INVALID_AMOUNT');
  }

  /* ---------- SYSTEM RULES ---------- */

  await System.assertEnabled('DEPOSITS_ENABLED');

  if (source_type === 'deposit') {
    const minDeposit = await System.getDecimal('MIN_DEPOSIT_AMOUNT');
    if (amount < minDeposit) {
      throw walletError(
        'BELOW_MIN_DEPOSIT',
        `Minimum deposit is ${minDeposit}`
      );
    }
  }

  await acquireIdempotency(idempotency_key);

  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    const [[wallet]] = await conn.query(
      `SELECT balance, locked_balance, status
       FROM wallets
       WHERE id = ?
       FOR UPDATE`,
      [walletId]
    );

    if (!wallet) throw walletError('WALLET_NOT_FOUND');
    if (wallet.status !== 'active') throw walletError('WALLET_FROZEN');

    const before = Number(wallet.balance);
    const after = before + Number(amount);

    const [tx] = await conn.query(
      `INSERT INTO wallet_transactions (
        wallet_id,
        user_id,
        type,
        amount,
        balance_before,
        balance_after,
        source_type,
        source_id,
        idempotency_key,
        metadata
      ) VALUES (?, ?, 'credit', ?, ?, ?, ?, ?, ?, ?)`,
      [
        walletId,
        userId,
        amount,
        before,
        after,
        source_type,
        source_id || null,
        idempotency_key || null,
        metadata ? JSON.stringify(metadata) : null
      ]
    );

    await conn.query(
      `UPDATE wallets SET balance = ? WHERE id = ?`,
      [after, walletId]
    );

   await conn.commit();

/* =========================
   USER NOTIFICATION
========================= */
await NotificationService.createNotification({
  userId,
  type: source_type,
  title:
    source_type === 'deposit'
      ? 'Deposit successful'
      : source_type === 'admin_credit'
      ? 'Wallet credited'
      : 'Wallet update',
  message:
    source_type === 'deposit'
      ? `₦${amount} has been added to your wallet`
      : source_type === 'admin_credit'
      ? `₦${amount} credited by admin`
      : `₦${amount} credited`,
  reference_type: 'wallet_transaction',
  reference_id: tx.insertId
});

return tx.insertId;

  } catch (e) {
    await conn.rollback();
    await releaseIdempotency(idempotency_key);
    throw e;
  } finally {
    conn.release();
  }
};


/* =========================
   DEBIT WALLET
   (Withdrawals, Bets, Transfers)
========================= */

exports.debitWallet = async ({
  walletId,
  userId,
  amount,
  source_type,
  source_id,
  idempotency_key,
  metadata = null
}) => {
  if (!amount || amount <= 0) {
    throw walletError('INVALID_AMOUNT');
  }

  /* ---------- SYSTEM RULES ---------- */

  await System.assertEnabled('WITHDRAWALS_ENABLED');

  let totalDebit = Number(amount);
  let fee = 0;

  if (source_type === 'withdrawal') {
    const percentFee = await System.getDecimal('WITHDRAWAL_FEE_PERCENT');
    const flatFee = await System.getDecimal('WITHDRAWAL_FLAT_FEE');

    fee = (amount * percentFee) / 100 + flatFee;
    totalDebit += fee;

    metadata = {
      ...(metadata || {}),
      fee,
      percentFee,
      flatFee
    };
  }

  await acquireIdempotency(idempotency_key);

  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    const [[wallet]] = await conn.query(
      `SELECT balance, locked_balance, status
       FROM wallets
       WHERE id = ?
       FOR UPDATE`,
      [walletId]
    );

    if (!wallet) throw walletError('WALLET_NOT_FOUND');
    if (wallet.status !== 'active') throw walletError('WALLET_FROZEN');

    const available =
      Number(wallet.balance) - Number(wallet.locked_balance);

    if (available < totalDebit) {
      throw walletError('INSUFFICIENT_BALANCE');
    }

    const before = Number(wallet.balance);
    const after = before - totalDebit;

    const [tx] = await conn.query(
      `INSERT INTO wallet_transactions (
        wallet_id,
        user_id,
        type,
        amount,
        balance_before,
        balance_after,
        source_type,
        source_id,
        idempotency_key,
        metadata
      ) VALUES (?, ?, 'debit', ?, ?, ?, ?, ?, ?, ?)`,
      [
        walletId,
        userId,
        totalDebit,
        before,
        after,
        source_type,
        source_id || null,
        idempotency_key || null,
        metadata ? JSON.stringify(metadata) : null
      ]
    );

    await conn.query(
      `UPDATE wallets SET balance = ? WHERE id = ?`,
      [after, walletId]
    );

    await conn.commit();

/* =========================
   USER NOTIFICATION
========================= */
await NotificationService.createNotification({
  userId,
  type: source_type,
  title:
    source_type === 'withdrawal'
      ? 'Withdrawal update'
      : 'Wallet debit',
  message:
    source_type === 'withdrawal'
      ? `₦${amount} withdrawal processed`
      : `₦${amount} debited from your wallet`,
  reference_type: 'wallet_transaction',
  reference_id: tx.insertId
});

return tx.insertId;

  } catch (e) {
    await conn.rollback();
    await releaseIdempotency(idempotency_key);
    throw e;
  } finally {
    conn.release();
  }
};

/* =========================
   LOCK FUNDS (NO LEDGER)
========================= */

exports.lockFunds = async ({ walletId, amount }) => {
  if (!amount || amount <= 0) {
    throw walletError('INVALID_AMOUNT');
  }

  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    const [[wallet]] = await conn.query(
      `SELECT balance, locked_balance, status
       FROM wallets
       WHERE id = ?
       FOR UPDATE`,
      [walletId]
    );

    if (!wallet) throw walletError('WALLET_NOT_FOUND');
    if (wallet.status !== 'active') throw walletError('WALLET_FROZEN');

    const available =
      Number(wallet.balance) - Number(wallet.locked_balance);

    if (available < amount) {
      throw walletError('INSUFFICIENT_BALANCE');
    }

    await conn.query(
      `UPDATE wallets
       SET locked_balance = locked_balance + ?
       WHERE id = ?`,
      [amount, walletId]
    );

    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
};

/* =========================
   UNLOCK FUNDS (NO LEDGER)
========================= */

exports.unlockFunds = async ({ walletId, amount }) => {
  if (!amount || amount <= 0) {
    throw walletError('INVALID_AMOUNT');
  }

  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    const [[wallet]] = await conn.query(
      `SELECT locked_balance
       FROM wallets
       WHERE id = ?
       FOR UPDATE`,
      [walletId]
    );

    if (!wallet) throw walletError('WALLET_NOT_FOUND');
    if (wallet.locked_balance < amount) {
      throw walletError('INVALID_UNLOCK_AMOUNT');
    }

    await conn.query(
      `UPDATE wallets
       SET locked_balance = locked_balance - ?
       WHERE id = ?`,
      [amount, walletId]
    );

    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
};
