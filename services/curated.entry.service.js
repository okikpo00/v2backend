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

  const slipUuid = uuidv4();
  const conn = await pool.getConnection();
  const affectedQuestionIds = new Set();

  try {
    await conn.beginTransaction();

    /* =============================
       PREVENT DUPLICATE QUESTIONS
    ============================= */
    const unique = new Set();
    for (const e of entries) {
      if (unique.has(e.question_id)) {
        throw entryError('DUPLICATE_QUESTION_IN_SLIP');
      }
      unique.add(e.question_id);
    }

    /* =============================
       SYSTEM SETTINGS
    ============================= */
    const [
      minStake,
      maxStake,
      maxAccumulatedOdds,
      maxPayout
    ] = await Promise.all([
      System.getDecimal('MIN_STAKE_AMOUNT'),
      System.getDecimal('MAX_STAKE_AMOUNT'),
      System.getDecimal('MAX_ACCUMULATED_ODDS'),
      System.getDecimal('MAX_PAYOUT')
    ]);

    if (stake < Number(minStake)) throw entryError('STAKE_TOO_SMALL');
    if (stake > Number(maxStake)) throw entryError('STAKE_TOO_LARGE');

    /* =============================
       ENSURE WALLET
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

    const [[wallet]] = await conn.query(
      `
      SELECT id
      FROM wallets
      WHERE user_id = ?
      AND currency = 'NGN'
      AND status = 'active'
      LIMIT 1
      FOR UPDATE
      `,
      [userId]
    );

    if (!wallet) throw entryError('WALLET_NOT_FOUND');

    const walletId = wallet.id;

    /* =============================
       CREATE SLIP FIRST (IMPORTANT)
    ============================= */
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
        walletId,
        Number(stake),
        entries.length,
        ip || null,
        user_agent || null
      ]
    );

    const slipId = slipRes.insertId;

    /* =============================
       LOCK FUNDS (AFTER SLIP)
    ============================= */
    let lockId;

    try {
      lockId = await WalletService.lock({
        walletId,
        userId,
        amount: Number(stake),
        reference_type: 'entry',
        reference_id: slipUuid,
        idempotency_key: `entry_lock:${slipUuid}`,
        conn
      });
    } catch (e) {
      if (e.code === 'DUPLICATE_TRANSACTION') {
        throw entryError('DUPLICATE_ENTRY');
      }
      throw e;
    }

    /* =============================
       PROCESS ENTRIES
    ============================= */
    let totalOdds = 1;

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

      const odds =
        e.side === 'yes'
          ? Number(question.yes_odds)
          : Number(question.no_odds);

      if (!odds || odds <= 1) {
        throw entryError('INVALID_ODDS');
      }

      totalOdds *= odds;

      if (totalOdds > Number(maxAccumulatedOdds)) {
        throw entryError('MAX_ACCUMULATED_ODDS_EXCEEDED');
      }

      await conn.query(
        `
        INSERT INTO curated_question_entries (
          slip_id, question_id, user_id, wallet_id,
          side, odds, status
        ) VALUES (?, ?, ?, ?, ?, ?, 'open')
        `,
        [
          slipId,
          question.id,
          userId,
          walletId,
          e.side,
          odds
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
       POST ACTIONS
    ============================= */
    const ActivityLogger = require('./homepage.activity.logger');

    await ActivityLogger.logPlacedCall({
      userId,
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