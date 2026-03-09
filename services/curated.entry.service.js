'use strict';

const pool = require('../config/db');
const { v4: uuidv4 } = require('uuid');
const { validateEntryPayload } = require('../validators/curated.entry.validator');
const OddsEngine = require('./odds.engine.service');
const System = require('./system.service');
/* =========================
   ERROR HELPER
========================= */
function entryError(code) {
  const e = new Error(code);
  e.code = code;
  return e;
}

/* =========================================================
   PLACE CURATED ENTRY
========================================================= */
exports.place = async ({
  userId,
  stake,
  entries,
  ip,
  user_agent
}) => {
  validateEntryPayload({ stake, entries });
  // =====================================================
// PREVENT DUPLICATE QUESTION IN SAME SLIP
// =====================================================
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
/* =====================================================
   LOAD RISK SETTINGS
===================================================== */
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

/* =====================================================
   VALIDATE STAKE LIMITS
===================================================== */
if (Number(stake) < Number(minStake)) {
  throw entryError('STAKE_TOO_SMALL');
}

if (Number(stake) > Number(maxStake)) {
  throw entryError('STAKE_TOO_LARGE');
}
    /* =====================================================
       ENSURE WALLET EXISTS
    ===================================================== */
    await conn.query(
      `
      INSERT INTO wallets (user_id, currency, balance, locked_balance, status)
      SELECT ?, 'NGN', 0.00, 0.00, 'active'
      WHERE NOT EXISTS (
        SELECT 1 FROM wallets WHERE user_id = ? AND currency = 'NGN'
      )
      `,
      [userId, userId]
    );

    /* =====================================================
       LOCK WALLET
    ===================================================== */
    const [[wallet]] = await conn.query(
      `
      SELECT id, balance, locked_balance
      FROM wallets
      WHERE user_id = ?
        AND currency = 'NGN'
        AND status = 'active'
      FOR UPDATE
      `,
      [userId]
    );

    if (!wallet) throw entryError('WALLET_NOT_FOUND');

    const available =
      Number(wallet.balance) - Number(wallet.locked_balance);

    if (available < Number(stake)) {
      throw entryError('INSUFFICIENT_BALANCE');
    }

    await conn.query(
      `UPDATE wallets
       SET locked_balance = locked_balance + ?
       WHERE id = ?`,
      [Number(stake), wallet.id]
    );
const [[userRow]] = await conn.query(
  `
  SELECT username
  FROM users
  WHERE id = ?
  LIMIT 1
  `,
  [userId]
);

const username = userRow?.username || 'User';
    /* =====================================================
       CREATE SLIP (ODDS & PAYOUT CALCULATED BELOW)
    ===================================================== */
    
    const slipUuid = uuidv4();
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

    /* =====================================================
       PROCESS ENTRIES
    ===================================================== */
    for (const e of entries) {
      const [[question]] = await conn.query(
        `
        SELECT id, title, yes_odds, no_odds
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
/* =====================================================
   CHECK MAX ACCUMULATED ODDS
===================================================== */
if (totalOdds > Number(maxAccumulatedOdds)) {
  throw entryError('MAX_ACCUMULATED_ODDS_EXCEEDED');
}
      await conn.query(
        `
        INSERT INTO curated_question_exposure
          (question_id, yes_liability, no_liability, total_staked)
        VALUES (?, 0, 0, 0)
        ON DUPLICATE KEY UPDATE question_id = question_id
        `,
        [question.id]
      );

      await conn.query(
        `
        INSERT INTO curated_question_entries (
          slip_id,
          question_id,
          user_id,
          wallet_id,
          side,
          stake,
          odds,
          status
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
/* =====================================================
   CHECK QUESTION EXPOSURE
===================================================== */
const [[currentExposure]] = await conn.query(
  `
  SELECT yes_liability, no_liability
  FROM curated_question_exposure
  WHERE question_id = ?
  `,
  [question.id]
);

const yesLiability = Number(currentExposure?.yes_liability || 0);
const noLiability  = Number(currentExposure?.no_liability || 0);

const addedLiability = Number(stake) * entryOdds;

let newExposure;

if (e.side === 'yes') {
  newExposure = (yesLiability + addedLiability) - (yesLiability + noLiability + Number(stake));
} else {
  newExposure = (noLiability + addedLiability) - (yesLiability + noLiability + Number(stake));
}

if (newExposure > Number(maxQuestionExposure)) {
  throw entryError('QUESTION_EXPOSURE_LIMIT');
}
      await conn.query(
        `
        UPDATE curated_question_exposure
        SET
          ${e.side}_liability = ${e.side}_liability + (? * ?),
          total_staked = total_staked + ?
        WHERE question_id = ?
        `,
        [
          Number(stake),
          entryOdds,
          Number(stake),
          question.id
        ]
      );

      affectedQuestionIds.add(question.id);
    }

    /* =====================================================
       FINAL PAYOUT CALCULATION
    ===================================================== */
    const potentialPayout =
      Number(stake) * Number(totalOdds);
/* =====================================================
   CHECK MAX PAYOUT
===================================================== */
if (potentialPayout > Number(maxPayout)) {
  throw entryError('MAX_PAYOUT_EXCEEDED');
}
    await conn.query(
      `
      UPDATE curated_entry_slips
      SET
        total_odds = ?,
        potential_payout = ?
      WHERE id = ?
      `,
      [
        Number(totalOdds.toFixed(4)),
        Number(potentialPayout.toFixed(2)),
        slipId
      ]
    );

    await conn.commit();
    const ActivityLogger =
require('./homepage.activity.logger');

await ActivityLogger.logPlacedCall({
  userId,
  username,
  amount: stake,
  
});
await pool.query(
  `DELETE FROM curated_slip_drafts WHERE user_id = ?`,
  [userId]
);
    /* =====================================================
       REBALANCE ODDS (SAFE)
    ===================================================== */
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