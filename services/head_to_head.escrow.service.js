'use strict';

const pool = require('../config/db');

exports.lockFunds = async ({
  conn,
  walletId,
  amount
}) => {

  const [[wallet]] = await conn.query(
    `
    SELECT balance, locked_balance
    FROM wallets
    WHERE id = ?
    FOR UPDATE
    `,
    [walletId]
  );

  if (!wallet)
    throw new Error('WALLET_NOT_FOUND');

  const available =
    Number(wallet.balance)
    - Number(wallet.locked_balance);

  if (available < amount)
    throw new Error('INSUFFICIENT_BALANCE');

  await conn.query(
    `
    UPDATE wallets
    SET locked_balance = locked_balance + ?
    WHERE id = ?
    `,
    [amount, walletId]
  );
};

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
