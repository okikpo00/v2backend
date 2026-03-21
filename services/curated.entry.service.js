'use strict';

const pool = require('../config/db');
const { v4: uuidv4 } = require('uuid');
const { validateEntryPayload } = require('../validators/curated.entry.validator');
const OddsEngine = require('./odds.engine.service');
const System = require('./system.service');
const WalletService = require('./wallet.service');

function entryError(code) {
  const e = new Error(code);
  e.code = code;
  return e;
}

exports.place = async ({
  userId,
  stake,
  entries,
  ip,
  user_agent
}) => {

  validateEntryPayload({ stake, entries });

  const slipUuid = uuidv4(); // ✅ FIXED (local, safe)

  // Prevent duplicate questions
  const unique = new Set();
  for (const e of entries) {
    if (unique.has(e.question_id)) {
      throw entryError('DUPLICATE_QUESTION_IN_SLIP');
    }
    unique.add(e.question_id);
  }

  const conn = await pool.getConnection();
  const affectedQuestionIds = new Set();

  try {
    await conn.beginTransaction();

    /* =============================
       SYSTEM SETTINGS
    ============================= */
    const [
      minStake,
      maxStake,
      maxAccumulatedOdds,
      maxPayout,
      maxQuestionExposure
    ] = await Promise.all([
      System.getDecimal('MIN_STAKE_AMOUNT'),
      System.getDecimal('MAX_STAKE_AMOUNT'),
      System.getDecimal('MAX_ACCUMULATED_ODDS'),
      System.getDecimal('MAX_PAYOUT'),
      System.getDecimal('MAX_QUESTION_EXPOSURE')
    ]);

    if (Number(stake) < Number(minStake)) {
      throw entryError('STAKE_TOO_SMALL');
    }

    if (Number(stake) > Number(maxStake)) {
      throw entryError('STAKE_TOO_LARGE');
    }

    /* =============================
       ENSURE WALLET EXISTS
    ============================= */
    await conn.query(
      `
      INSERT INTO wallets (user_id, currency, balance, locked_balance, status)
      SELECT ?, 'NGN', 0, 0, 'active'
      WHERE NOT EXISTS (
        SELECT 1 FROM wallets WHERE user_id = ? AND currency = 'NGN'
      )
      `,
      [userId, userId]
    );

    /* =============================
       GET WALLET (NO LOCK)
    ============================= */
    const [[wallet]] = await conn.query(
      `
      SELECT id
      FROM wallets
      WHERE user_id = ?
        AND currency = 'NGN'
        AND status = 'active'
      LIMIT 1
      `,
      [userId]
    );

    if (!wallet) throw entryError('WALLET_NOT_FOUND');

    /* =============================
       DEBIT WALLET (SINGLE SOURCE OF TRUTH)
    ============================= */
    await WalletService.debitWallet({
      walletId: wallet.id,
      userId,
      amount: Number(stake),
      source_type: 'stake',
      source_id: slipUuid,
      idempotency_key: `stake:${slipUuid}`
    });

    /* =============================
       USERNAME
    ============================= */
    const [[userRow]] = await conn.query(
      `SELECT username FROM users WHERE id = ? LIMIT 1`,
      [userId]
    );

    const username = userRow?.username || 'User';

    /* =============================
       CREATE SLIP
    ============================= */
    let totalOdds = 1;

    const [slipRes] = await conn.query(
      `
      INSERT INTO curated_entry_slips (
        uuid,
        user_id,
        wallet_id,
        total_stake,
        entry_count,
        total_odds,
        potential_payout,
        status,
        created_ip,
        created_user_agent
      ) VALUES (?, ?, ?, ?, ?, 0, 0, 'open', ?, ?)
      `,
      [
        slipUuid,
        userId,
        wallet.id,
        Number(stake),
        entries.length,
        ip || null,
        user_agent || null
      ]
    );

    const slipId = slipRes.insertId;

    /* =============================
       PROCESS ENTRIES
    ============================= */
    for (const e of entries) {

      const [[question]] = await conn.query(
        `
        SELECT id, yes_odds, no_odds
        FROM curated_questions
        WHERE id = ?
          AND status = 'published'
        FOR UPDATE
        `,
        [e.question_id]
      );

      if (!question) throw entryError('QUESTION_NOT_AVAILABLE');

      const entryOdds =
        e.side === 'yes'
          ? Number(question.yes_odds)
          : Number(question.no_odds);

      if (!entryOdds || entryOdds <= 1) {
        throw entryError('INVALID_ODDS');
      }

      totalOdds *= entryOdds;

      if (totalOdds > Number(maxAccumulatedOdds)) {
        throw entryError('MAX_ACCUMULATED_ODDS_EXCEEDED');
      }

      await conn.query(
        `
        INSERT INTO curated_question_entries (
          slip_id, question_id, user_id, wallet_id,
          side, stake, odds, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'open')
        `,
        [
          slipId,
          question.id,
          userId,
          wallet.id,
          e.side,
          Number(stake),
          entryOdds
        ]
      );

      affectedQuestionIds.add(question.id);
    }

    /* =============================
       FINAL PAYOUT
    ============================= */
    const potentialPayout = Number(stake) * Number(totalOdds);

    if (potentialPayout > Number(maxPayout)) {
      throw entryError('MAX_PAYOUT_EXCEEDED');
    }

    await conn.query(
      `
      UPDATE curated_entry_slips
      SET total_odds = ?, potential_payout = ?
      WHERE id = ?
      `,
      [
        Number(totalOdds.toFixed(4)),
        Number(potentialPayout.toFixed(2)),
        slipId
      ]
    );

    await conn.commit();

    /* =============================
       POST ACTIONS (OUTSIDE TX)
    ============================= */
    const ActivityLogger = require('./homepage.activity.logger');

    await ActivityLogger.logPlacedCall({
      userId,
      username,
      amount: stake
    });

    await pool.query(
      `DELETE FROM curated_slip_drafts WHERE user_id = ?`,
      [userId]
    );

    for (const qId of affectedQuestionIds) {
      await OddsEngine.recalculate(qId);
    }

    return {
      slip_uuid: slipUuid,
      entries_count: entries.length,
      total_stake: Number(stake),
      total_odds: Number(totalOdds.toFixed(4)),
      potential_payout: Number(potentialPayout.toFixed(2))
    };

  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};