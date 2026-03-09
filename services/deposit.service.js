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
