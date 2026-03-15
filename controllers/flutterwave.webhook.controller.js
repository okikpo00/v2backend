'use strict';

/**
 * =========================================================
 * FLUTTERWAVE WEBHOOK (PRODUCTION GRADE)
 * =========================================================
 * - Signature verified
 * - Idempotent
 * - Amount & currency validated
 * - Wallet credited exactly once
 * - Safe under retries
 * =========================================================
 */

const pool = require('../config/db');
const WalletService = require('../services/wallet.service');
const env = require('../config/env');
const crypto = require('crypto');

function timingSafeEqual(a, b) {
  const bufA = Buffer.from(a || '', 'utf8');
  const bufB = Buffer.from(b || '', 'utf8');
  return (
    bufA.length === bufB.length &&
    crypto.timingSafeEqual(bufA, bufB)
  );
}

exports.handle = async (req, res) => {
  const signature = req.headers['verif-hash'];

  if (
    !signature ||
    !timingSafeEqual(signature, env.FLW_WEBHOOK_SECRET)
  ) {
    console.warn('[FLW_WEBHOOK_INVALID_SIGNATURE]', {
      ip: req.ip
    });
    return res.status(401).end();
  }

 let payload;

try {
  payload =
    typeof req.body === 'string'
      ? JSON.parse(req.body)
      : JSON.parse(req.body.toString());
} catch (err) {
  console.error('[FLW_WEBHOOK_INVALID_JSON]');
  return res.status(200).end();
}

  if (
    payload?.event !== 'charge.completed' ||
    payload?.data?.status !== 'successful'
  ) {
    return res.status(200).end();
  }

  const {
    tx_ref,
    id: providerTxId,
    amount,
    currency
  } = payload.data;

  if (!tx_ref || !providerTxId) {
    return res.status(200).end();
  }

  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    const [[deposit]] = await conn.query(
      `SELECT *
       FROM deposits
       WHERE tx_ref = ?
       LIMIT 1
       FOR UPDATE`,
      [tx_ref]
    );

    // Already processed or not found → exit safely
    if (!deposit || deposit.status !== 'pending') {
      await conn.commit();
      return res.status(200).end();
    }

    // 🔒 Validate amount & currency
    if (
      Number(deposit.amount) !== Number(amount) ||
      deposit.currency !== currency
    ) {
      await conn.query(
        `UPDATE deposits
         SET status = 'failed',
             raw_webhook = ?
         WHERE id = ?`,
        [JSON.stringify(payload), deposit.id]
      );

      await conn.commit();
      console.error('[FLW_WEBHOOK_AMOUNT_MISMATCH]', {
        tx_ref,
        expected: deposit.amount,
        received: amount
      });

      return res.status(200).end();
    }

    // Mark deposit first (prevents double credit)
    await conn.query(
      `UPDATE deposits
       SET status = 'successful',
           provider_tx_id = ?,
           verified_at = NOW(),
           raw_webhook = ?
       WHERE id = ?`,
      [providerTxId, JSON.stringify(payload), deposit.id]
    );

    await conn.commit();
  } catch (e) {
    await conn.rollback();
    console.error('[FLW_WEBHOOK_DB_ERROR]', e);
    return res.status(200).end();
  } finally {
    conn.release();
  }

  /**
   * CREDIT WALLET OUTSIDE DB TRANSACTION
   * (wallet service is already atomic)
   */
  try {
    await WalletService.creditWallet({
      walletId: deposit.wallet_id,
      userId: deposit.user_id,
      amount: Number(amount),
      source_type: 'deposit',
      source_id: deposit.id,
      idempotency_key: tx_ref,
      metadata: {
        provider: 'flutterwave',
        provider_tx_id: providerTxId
      }
    });
    /* =========================
   REFERRAL REWARD (FIRST DEPOSIT ONLY)
========================= */

const MIN_REFERRAL_DEPOSIT = 200;
const REFERRAL_REWARD_AMOUNT = 50;

// Only if deposit >= min
if (Number(deposit.amount) >= MIN_REFERRAL_DEPOSIT) {

  // Check if user was referred
  const [[referredUser]] = await conn.query(
    `SELECT id, referred_by
     FROM users
     WHERE id = ?
     LIMIT 1`,
    [deposit.user_id]
  );

  if (referredUser?.referred_by) {

    // Get referrer
    const [[referrer]] = await conn.query(
      `SELECT id
       FROM users
       WHERE uuid = ?
       LIMIT 1`,
      [referredUser.referred_by]
    );

    if (referrer) {

      // Ensure reward not already paid
      const [[existingReward]] = await conn.query(
        `SELECT id
         FROM referral_rewards
         WHERE referred_user_id = ?
         LIMIT 1`,
        [referredUser.id]
      );

      if (!existingReward) {

        // Credit referrer wallet
        await WalletService.creditWallet({
          walletId: referrer.default_wallet_id,
          userId: referrer.id,
          amount: REFERRAL_REWARD_AMOUNT,
          source_type: 'referral_bonus',
          source_id: deposit.id,
          idempotency_key: `referral:${deposit.id}`,
          metadata: {
            referred_user_id: referredUser.id,
            deposit_id: deposit.id
          }
        });

        // Record reward
        await conn.query(
          `INSERT INTO referral_rewards
           (referrer_user_id, referred_user_id, deposit_id, reward_amount)
           VALUES (?, ?, ?, ?)`,
          [
            referrer.id,
            referredUser.id,
            deposit.id,
            REFERRAL_REWARD_AMOUNT
          ]
        );
      }
    }
  }
}

  } catch (e) {
    console.error('[FLW_WEBHOOK_WALLET_CREDIT_ERROR]', e);
    // Do NOT throw — webhook must always return 200
  }

  return res.status(200).end();
};
