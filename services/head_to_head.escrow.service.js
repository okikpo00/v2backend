'use strict';

const pool = require('../config/db');

exports.lockFunds = async ({
  conn,
  walletId,
  amount
}) => {

  if (!walletId)
    throw escrowError('WALLET_ID_REQUIRED');

  if (!amount || Number(amount) <= 0)
    throw escrowError('INVALID_AMOUNT');

  /* ===============================
     LOCK WALLET ROW
  =============================== */

  const [[wallet]] = await conn.query(
    `
    SELECT
      id,
      balance,
      locked_balance
    FROM wallets
    WHERE id = ?
    FOR UPDATE
    `,
    [walletId]
  );

  if (!wallet)
    throw escrowError('WALLET_NOT_FOUND');

  const balance = Number(wallet.balance || 0);
  const locked = Number(wallet.locked_balance || 0);
  const available = balance - locked;

  /* ===============================
     BALANCE CHECK
  =============================== */

  if (available < amount) {
    throw escrowError('INSUFFICIENT_BALANCE');
  }

  /* ===============================
     LOCK FUNDS
  =============================== */

  await conn.query(
    `
    UPDATE wallets
    SET locked_balance = locked_balance + ?
    WHERE id = ?
    `,
    [Number(amount), walletId]
  );

  return true;
};


/* ===============================
   ERROR HELPER
=============================== */

function escrowError(code) {
  const err = new Error(code);
  err.code = code;
  return err;
}

exports.unlockFunds = async ({
  conn,
  walletId,
  amount
}) => {

  await conn.query(
    `
    UPDATE wallets
    SET locked_balance =
      locked_balance - ?
    WHERE id = ?
    `,
    [amount, walletId]
  );
};

exports.credit = async ({
  conn,
  walletId,
  userId,
  amount,
  sourceId
}) => {

  await conn.query(
    `
    UPDATE wallets
    SET balance = balance + ?
    WHERE id = ?
    `,
    [amount, walletId]
  );

  await conn.query(
    `
    INSERT INTO wallet_transactions
    (
      wallet_id,
      user_id,
      type,
      amount,
      source_type,
      source_id
    )
    VALUES (?, ?, 'credit', ?, 'h2h_settlement', ?)
    `,
    [walletId, userId, amount, sourceId]
  );
};
