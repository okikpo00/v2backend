'use strict';

/**
 * =========================================================
 * DEPOSIT SERVICE (AUTHORITATIVE)
 * =========================================================
 * - Creates deposit intent
 * - Enforces system limits
 * - Never touches wallet balance
 * - Provider-agnostic
 * =========================================================
 */

const pool = require('../config/db');
const { v4: uuidv4 } = require('uuid');
const System = require('./system.service');
const Flutterwave = require('./flutterwave.service');

function depositError(code, message) {
  const err = new Error(message || code);
  err.code = code;
  return err;
}

exports.initDeposit = async ({
  userId,
  walletId,
  amount,
  email,
  ip,
  user_agent
}) => {
  /* =========================
     HARD VALIDATION
  ========================= */

  if (!userId || !walletId || !email) {
    throw depositError('INVALID_CONTEXT');
  }

  if (!amount || amount <= 0) {
    throw depositError('INVALID_AMOUNT');
  }

  /* =========================
     SYSTEM RULES
  ========================= */

  await System.assertEnabled('DEPOSITS_ENABLED');

  const min = await System.getDecimal('MIN_DEPOSIT_AMOUNT');
  const max = await System.getDecimal('MAX_DEPOSIT_AMOUNT');
const dailyMax = await System.getDecimal('MAX_DAILY_DEPOSIT_AMOUNT');
  if (amount < min) {
    throw depositError(
      'BELOW_MIN_DEPOSIT',
      `Minimum deposit is ${min}`
    );
  }

  if (amount > max) {
    throw depositError(
      'ABOVE_MAX_DEPOSIT',
      `Maximum single deposit is ${max}`
    );
  }
 

  

  if (dailyMax > 0) {
    const [[row]] = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) AS total
       FROM deposits
       WHERE user_id = ?
         AND status IN ('pending', 'completed')
         AND DATE(created_at) = CURDATE()`,
      [userId]
    );

    const usedToday = Number(row.total || 0);

    if (usedToday + amount > dailyMax) {
      throw depositError(
        'DAILY_DEPOSIT_LIMIT_EXCEEDED',
        `Daily deposit limit is ${dailyMax}`
      );
    }
  }


  /* =========================
     CREATE DEPOSIT RECORD
  ========================= */

  const txRef = `DEP_${uuidv4()}`;

  await pool.query(
    `INSERT INTO deposits (
      user_id,
      wallet_id,
      provider,
      amount,
      currency,
      tx_ref,
      status,
      created_ip,
      created_user_agent
    ) VALUES (?, ?, 'flutterwave', ?, 'NGN', ?, 'pending', ?, ?)`,
    [userId, walletId, amount, txRef, ip, user_agent]
  );

  /* =========================
     INIT PROVIDER
  ========================= */

  const providerRes = await Flutterwave.initPayment({
    tx_ref: txRef,
    amount,
    currency: 'NGN',
    redirect_url: 'https://trebetta.com/payment-complete',
    customer: { email },
    customizations: {
      title: 'Trebetta Wallet Deposit',
      description: 'Wallet funding'
    }
  });

  if (!providerRes?.data?.link) {
    throw depositError('PROVIDER_INIT_FAILED');
  }

  return {
    checkout_url: providerRes.data.link,
    tx_ref: txRef
  };
};
/* =========================================================
   VERIFY DEPOSIT (MANUAL FALLBACK)
========================================================= */

exports.verifyDeposit = async ({
  tx_ref,
  transaction_id
}) => {

  if (!tx_ref || !transaction_id) {
    throw depositError('INVALID_VERIFY_REQUEST');
  }

  /* =========================
     VERIFY WITH FLUTTERWAVE
  ========================= */

  const verifyRes =
    await Flutterwave.verifyTransaction(transaction_id);

  const data = verifyRes?.data;

  if (!data || data.status !== 'successful') {
    throw depositError('PAYMENT_NOT_SUCCESSFUL');
  }

  const conn = await pool.getConnection();

  let deposit;

  try {

    await conn.beginTransaction();

    const [[row]] = await conn.query(
      `SELECT *
       FROM deposits
       WHERE tx_ref = ?
       LIMIT 1
       FOR UPDATE`,
      [tx_ref]
    );

    if (!row) {
      throw depositError('DEPOSIT_NOT_FOUND');
    }

    if (row.status !== 'pending') {
      await conn.commit();
      return {
        status: row.status
      };
    }

    /* =========================
       VALIDATE AMOUNT
    ========================= */

    if (
      Number(row.amount) !== Number(data.amount) ||
      row.currency !== data.currency
    ) {
      await conn.query(
        `UPDATE deposits
         SET status = 'failed'
         WHERE id = ?`,
        [row.id]
      );

      await conn.commit();

      throw depositError('AMOUNT_MISMATCH');
    }

    /* =========================
       MARK SUCCESS
    ========================= */

    await conn.query(
      `UPDATE deposits
       SET status = 'successful',
           provider_tx_id = ?,
           verified_at = NOW()
       WHERE id = ?`,
      [transaction_id, row.id]
    );

    deposit = row;

    await conn.commit();

  } catch (e) {

    await conn.rollback();
    throw e;

  } finally {

    conn.release();

  }

  /* =========================
     CREDIT WALLET
  ========================= */

  await WalletService.creditWallet({

    walletId: deposit.wallet_id,

    userId: deposit.user_id,

    amount: Number(deposit.amount),

    source_type: 'deposit',

    source_id: deposit.id,

    idempotency_key: tx_ref,

    metadata: {
      provider: 'flutterwave',
      provider_tx_id: transaction_id
    }

  });

  return {
    status: 'successful'
  };

};