'use strict';

/**
 * =========================================================
 * FLUTTERWAVE WEBHOOK (PRODUCTION SAFE)
 * =========================================================
 * - Signature verified
 * - Idempotent
 * - Amount validated
 * - Wallet credited once
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


  console.log('[FLUTTERWAVE_WEBHOOK_HIT]', {
    url: req.originalUrl,
    ip: req.ip
  });
  /* =====================================================
     SIGNATURE CHECK
  ===================================================== */

  const signature = req.headers['verif-hash'];

  if (
    !signature ||
    !timingSafeEqual(signature, env.FLW_WEBHOOK_SECRET)
  ) {
    console.warn('[FLW_WEBHOOK_INVALID_SIGNATURE]', { ip: req.ip });
    return res.status(401).end();
  }

  /* =====================================================
     PARSE RAW BODY
  ===================================================== */

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

  /* =====================================================
     EVENT FILTER
  ===================================================== */

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

  let deposit;

  const conn = await pool.getConnection();

  try {

    await conn.beginTransaction();

    const [[row]] = await conn.query(
      `
      SELECT *
      FROM deposits
      WHERE tx_ref = ?
      LIMIT 1
      FOR UPDATE
      `,
      [tx_ref]
    );

    deposit = row;

    /* =============================
       NOT FOUND / ALREADY PROCESSED
    ============================= */

    if (!deposit || deposit.status !== 'pending') {
      await conn.commit();
      return res.status(200).end();
    }

    /* =============================
       VALIDATE AMOUNT
    ============================= */

    if (
      Number(deposit.amount) !== Number(amount) ||
      deposit.currency !== currency
    ) {

      await conn.query(
        `
        UPDATE deposits
        SET status='failed',
            raw_webhook=?
        WHERE id=?
        `,
        [JSON.stringify(payload), deposit.id]
      );

      await conn.commit();

      console.error('[FLW_AMOUNT_MISMATCH]', {
        expected: deposit.amount,
        received: amount
      });

      return res.status(200).end();
    }

    /* =============================
       MARK SUCCESS
    ============================= */

    await conn.query(
      `
    UPDATE deposits
SET status = 'completed',
    provider_tx_id = ?,
    verified_at = NOW(),
    metadata = ?
WHERE id = ?
      `,
      [providerTxId, JSON.stringify(payload), deposit.id]
    );

    await conn.commit();

  } catch (err) {

    await conn.rollback();
    console.error('[FLW_WEBHOOK_DB_ERROR]', err);

    return res.status(200).end();

  } finally {

    conn.release();

  }

  /* =====================================================
     CREDIT WALLET (OUTSIDE TRANSACTION)
  ===================================================== */

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

  } catch (err) {

    console.error('[WALLET_CREDIT_ERROR]', err);

  }

  /* =====================================================
     REFERRAL BONUS
  ===================================================== */

  try {

    const MIN_REFERRAL_DEPOSIT = 200;
    const REFERRAL_REWARD_AMOUNT = 50;

    if (Number(deposit.amount) >= MIN_REFERRAL_DEPOSIT) {

      const conn2 = await pool.getConnection();

      try {

        const [[referredUser]] = await conn2.query(
          `
          SELECT id, referred_by
          FROM users
          WHERE id = ?
          LIMIT 1
          `,
          [deposit.user_id]
        );

        if (!referredUser?.referred_by) {
          conn2.release();
          return res.status(200).end();
        }

        const [[referrer]] = await conn2.query(
          `
          SELECT id, default_wallet_id
          FROM users
          WHERE uuid = ?
          LIMIT 1
          `,
          [referredUser.referred_by]
        );

        if (!referrer) {
          conn2.release();
          return res.status(200).end();
        }

        const [[existing]] = await conn2.query(
          `
          SELECT id
          FROM referral_rewards
          WHERE referred_user_id = ?
          LIMIT 1
          `,
          [referredUser.id]
        );

        if (!existing) {

          await WalletService.creditWallet({
            walletId: referrer.default_wallet_id,
            userId: referrer.id,
            amount: REFERRAL_REWARD_AMOUNT,
            source_type: 'referral_bonus',
            source_id: deposit.id,
            idempotency_key: `referral:${deposit.id}`,
            metadata: {
              referred_user_id: referredUser.id
            }
          });

          await conn2.query(
            `
            INSERT INTO referral_rewards
            (referrer_user_id, referred_user_id, deposit_id, reward_amount)
            VALUES (?, ?, ?, ?)
            `,
            [
              referrer.id,
              referredUser.id,
              deposit.id,
              REFERRAL_REWARD_AMOUNT
            ]
          );
        }

        conn2.release();

      } catch (err) {

        console.error('[REFERRAL_REWARD_ERROR]', err);
        conn2.release();

      }

    }

  } catch (err) {

    console.error('[REFERRAL_PROCESS_ERROR]', err);

  }

  return res.status(200).end();

};