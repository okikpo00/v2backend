'use strict';

const pool = require('../config/db');
const WalletService = require('./wallet.service');
const System = require('./system.service');

function settlementError(code) {
  const e = new Error(code);
  e.code = code;
  return e;
}

/* =========================================================
   SETTLE ALL H2H CHALLENGES FOR QUESTION
========================================================= */
exports.settleByQuestion = async ({
  questionId,
  outcome // 'YES' | 'NO'
}) => {

  if (!['YES', 'NO'].includes(outcome)) {
    throw settlementError('INVALID_OUTCOME');
  }

  const conn = await pool.getConnection();

  try {

    await conn.beginTransaction();

    /* =========================
       SYSTEM SETTINGS
    ========================= */
    const commissionPercent =
      await System.getDecimal('H2H_COMMISSION_PERCENT');

    /* =========================
       LOCK CHALLENGES
    ========================= */
    const [challenges] = await conn.query(
      `
      SELECT *
      FROM head_to_head_challenges
      WHERE question_id = ?
        AND status = 'accepted'
      FOR UPDATE
      `,
      [questionId]
    );

    for (const c of challenges) {

      /* =========================
         DETERMINE WINNER
      ========================= */
      const creatorWon =
        (outcome === 'YES' && c.creator_side === 'yes') ||
        (outcome === 'NO' && c.creator_side === 'no');

      const winnerUserId = creatorWon
        ? c.creator_user_id
        : c.opponent_user_id;

      const winnerWalletId = creatorWon
        ? c.creator_wallet_id
        : c.opponent_wallet_id;

      /* =========================
         CALCULATE PAYOUT
      ========================= */
      const stake = Number(c.stake);
      const totalPot = stake * 2;

      const commission =
        (totalPot * Number(commissionPercent)) / 100;

      const payout = Number((totalPot - commission).toFixed(2));

      /* =========================
         CONSUME LOCKS (CRITICAL)
      ========================= */
      if (!c.creator_lock_id || !c.opponent_lock_id) {
        throw settlementError('LOCK_REFERENCE_MISSING');
      }

      await WalletService.consumeLocked({
        walletId: c.creator_wallet_id,
        lockId: c.creator_lock_id,
        conn
      });

      await WalletService.consumeLocked({
        walletId: c.opponent_wallet_id,
        lockId: c.opponent_lock_id,
        conn
      });

      /* =========================
         CREDIT WINNER
      ========================= */
      await WalletService.credit({
        walletId: winnerWalletId,
        userId: winnerUserId,
        amount: payout,
        reference_type: 'h2h_settlement',
        reference_id: c.uuid,
        idempotency_key: `h2h_settlement:${c.uuid}`,
        metadata: {
          question_id: c.question_id,
          stake,
          total_pot: totalPot,
          commission
        },
        conn
      });

      /* =========================
         UPDATE CHALLENGE
      ========================= */
      await conn.query(
        `
        UPDATE head_to_head_challenges
        SET
          status = 'settled',
          winner_user_id = ?,
          payout = ?,
          settled_at = NOW()
        WHERE id = ?
        `,
        [
          winnerUserId,
          payout,
          c.id
        ]
      );

      /* =========================
         UPDATE ENTRIES
      ========================= */
      await conn.query(
        `
        UPDATE head_to_head_entries
        SET status =
          CASE
            WHEN user_id = ? THEN 'won'
            ELSE 'lost'
          END
        WHERE challenge_id = ?
        `,
        [
          winnerUserId,
          c.id
        ]
      );

    }

    await conn.commit();

    return {
      success: true,
      settled_count: challenges.length
    };

  } catch (err) {

    await conn.rollback();
    throw err;

  } finally {

    conn.release();

  }

};