'use strict';

const pool = require('../config/db');

/* =========================
   ERROR HELPER
========================= */
function walletError(code, message) {
  const err = new Error(message || code);
  err.code = code;
  return err;
}

/* =========================
   INTERNAL: GET WALLET (LOCKED)
========================= */
async function getWalletForUpdate(conn, walletId) {
  const [[wallet]] = await conn.query(
    `SELECT id, user_id, balance, locked_balance, status
     FROM wallets
     WHERE id = ?
     FOR UPDATE`,
    [walletId]
  );

  if (!wallet) throw walletError('WALLET_NOT_FOUND');
  if (wallet.status !== 'active') throw walletError('WALLET_FROZEN');

  return wallet;
}

/* =========================
   INTERNAL: TX HANDLER
========================= */
function resolveConn(externalConn) {
  return {
    conn: externalConn || null,
    isExternal: !!externalConn
  };
}

/* =========================
   CREATE WALLET
========================= */
exports.createWalletIfNotExists = async ({ userId, currency = 'NGN' }) => {
  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    const [[existing]] = await conn.query(
      `SELECT id FROM wallets WHERE user_id = ? AND currency = ? LIMIT 1`,
      [userId, currency]
    );

    if (existing) {
      await conn.commit();
      return existing.id;
    }

    const [res] = await conn.query(
      `INSERT INTO wallets (user_id, currency, balance, locked_balance, status)
       VALUES (?, ?, 0, 0, 'active')`,
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
   CREDIT
========================= */
exports.credit = async ({
  walletId,
  userId,
  amount,
  reference_type,
  reference_id,
  idempotency_key,
  metadata = null,
  conn: externalConn
}) => {

  if (!amount || amount <= 0) throw walletError('INVALID_AMOUNT');
  if (!idempotency_key) throw walletError('IDEMPOTENCY_REQUIRED');

  const { conn, isExternal } = resolveConn(externalConn);
  const connection = conn || await pool.getConnection();

  try {
    if (!isExternal) await connection.beginTransaction();

    const wallet = await getWalletForUpdate(connection, walletId);

    const before = Number(wallet.balance);
    const after = before + Number(amount);

    await connection.query(
      `INSERT INTO wallet_transactions (
        wallet_id, user_id, type, amount,
        balance_before, balance_after,
        locked_before, locked_after,
        source_type, source_id,
        idempotency_key, metadata
      ) VALUES (?, ?, 'credit', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        walletId,
        userId,
        amount,
        before,
        after,
        wallet.locked_balance,
        wallet.locked_balance,
        reference_type,
        reference_id,
        idempotency_key,
        metadata ? JSON.stringify(metadata) : null
      ]
    );

    await connection.query(
      `UPDATE wallets SET balance = ? WHERE id = ?`,
      [after, walletId]
    );

    if (!isExternal) await connection.commit();

  } catch (e) {
    if (!isExternal) await connection.rollback();

    if (e.code === 'ER_DUP_ENTRY') {
      throw walletError('DUPLICATE_TRANSACTION');
    }

    throw e;

  } finally {
    if (!isExternal) connection.release();
  }
};

/* =========================
   LOCK
========================= */
exports.lock = async ({
  walletId,
  userId,
  amount,
  reference_type,
  reference_id,
  idempotency_key,
  conn: externalConn
}) => {

  if (!amount || amount <= 0) throw walletError('INVALID_AMOUNT');
  if (!idempotency_key) throw walletError('IDEMPOTENCY_REQUIRED');

  const { conn, isExternal } = resolveConn(externalConn);
  const connection = conn || await pool.getConnection();

  try {
    if (!isExternal) await connection.beginTransaction();

    const wallet = await getWalletForUpdate(connection, walletId);

    const available = wallet.balance - wallet.locked_balance;
    if (available < amount) throw walletError('INSUFFICIENT_BALANCE');

    const [lockRes] = await connection.query(
      `INSERT INTO wallet_locks (
        wallet_id, user_id, amount,
        reference_type, reference_id, status
      ) VALUES (?, ?, ?, ?, ?, 'active')`,
      [walletId, userId, amount, reference_type, reference_id]
    );

    const newLocked = wallet.locked_balance + amount;

    await connection.query(
      `INSERT INTO wallet_transactions (
        wallet_id, user_id, type, amount,
        balance_before, balance_after,
        locked_before, locked_after,
        source_type, source_id,
        idempotency_key, lock_id
      ) VALUES (?, ?, 'lock', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        walletId,
        userId,
        amount,
        wallet.balance,
        wallet.balance,
        wallet.locked_balance,
        newLocked,
        reference_type,
        reference_id,
        idempotency_key,
        lockRes.insertId
      ]
    );

    await connection.query(
      `UPDATE wallets SET locked_balance = ? WHERE id = ?`,
      [newLocked, walletId]
    );

    if (!isExternal) await connection.commit();

    return lockRes.insertId;

  } catch (e) {
    if (!isExternal) await connection.rollback();

    if (e.code === 'ER_DUP_ENTRY') {
      throw walletError('DUPLICATE_TRANSACTION');
    }

    throw e;

  } finally {
    if (!isExternal) connection.release();
  }
};

/* =========================
   UNLOCK (RELEASE)
========================= */
exports.unlock = async ({
  walletId,
  lockId,
  idempotency_key,
  conn: externalConn
}) => {

  if (!idempotency_key) throw walletError('IDEMPOTENCY_REQUIRED');

  const { conn, isExternal } = resolveConn(externalConn);
  const connection = conn || await pool.getConnection();

  try {
    if (!isExternal) await connection.beginTransaction();

    const wallet = await getWalletForUpdate(connection, walletId);

    const [[lock]] = await connection.query(
      `SELECT * FROM wallet_locks
       WHERE id = ? AND status = 'active'
       FOR UPDATE`,
      [lockId]
    );

    if (!lock) throw walletError('LOCK_NOT_FOUND');

    const newLocked = wallet.locked_balance - lock.amount;
    if (newLocked < 0) throw walletError('LOCK_CORRUPTION_DETECTED');

    await connection.query(
      `UPDATE wallet_locks SET status = 'released' WHERE id = ?`,
      [lockId]
    );

    await connection.query(
      `INSERT INTO wallet_transactions (
        wallet_id, user_id, type, amount,
        balance_before, balance_after,
        locked_before, locked_after,
        source_type, source_id,
        idempotency_key, lock_id
      ) VALUES (?, ?, 'unlock', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        walletId,
        wallet.user_id,
        lock.amount,
        wallet.balance,
        wallet.balance,
        wallet.locked_balance,
        newLocked,
        lock.reference_type,
        lock.reference_id,
        idempotency_key,
        lock.id
      ]
    );

    await connection.query(
      `UPDATE wallets SET locked_balance = ? WHERE id = ?`,
      [newLocked, walletId]
    );

    if (!isExternal) await connection.commit();

  } catch (e) {
    if (!isExternal) await connection.rollback();

    if (e.code === 'ER_DUP_ENTRY') {
      throw walletError('DUPLICATE_TRANSACTION');
    }

    throw e;

  } finally {
    if (!isExternal) connection.release();
  }
};

/* =========================
   CONSUME LOCKED
========================= */
exports.consumeLocked = async ({
  walletId,
  lockId,
  idempotency_key,
  conn: externalConn
}) => {

  if (!idempotency_key) throw walletError('IDEMPOTENCY_REQUIRED');

  const { conn, isExternal } = resolveConn(externalConn);
  const connection = conn || await pool.getConnection();

  try {
    if (!isExternal) await connection.beginTransaction();

    const wallet = await getWalletForUpdate(connection, walletId);

    const [[lock]] = await connection.query(
      `SELECT * FROM wallet_locks
       WHERE id = ? AND status = 'active'
       FOR UPDATE`,
      [lockId]
    );

    if (!lock) throw walletError('LOCK_NOT_FOUND');

    const newBalance = wallet.balance - lock.amount;
    const newLocked = wallet.locked_balance - lock.amount;

    if (newBalance < 0 || newLocked < 0) {
      throw walletError('CORRUPTION_DETECTED');
    }

    await connection.query(
      `UPDATE wallet_locks SET status = 'consumed' WHERE id = ?`,
      [lockId]
    );

    await connection.query(
      `INSERT INTO wallet_transactions (
        wallet_id, user_id, type, amount,
        balance_before, balance_after,
        locked_before, locked_after,
        source_type, source_id,
        idempotency_key, lock_id
      ) VALUES (?, ?, 'consume_locked', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        walletId,
        wallet.user_id,
        lock.amount,
        wallet.balance,
        newBalance,
        wallet.locked_balance,
        newLocked,
        lock.reference_type,
        lock.reference_id,
        idempotency_key,
        lock.id
      ]
    );

    await connection.query(
      `UPDATE wallets
       SET balance = ?, locked_balance = ?
       WHERE id = ?`,
      [newBalance, newLocked, walletId]
    );

    if (!isExternal) await connection.commit();

  } catch (e) {
    if (!isExternal) await connection.rollback();

    if (e.code === 'ER_DUP_ENTRY') {
      throw walletError('DUPLICATE_TRANSACTION');
    }

    throw e;

  } finally {
    if (!isExternal) connection.release();
  }
};