'use strict';

const pool = require('../config/db');
const System = require('./services/system.service');

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
  outcome
}) => {

  const conn = await pool.getConnection();

  try {

    await conn.beginTransaction();

    /* =========================
       LOAD SYSTEM SETTINGS
    ========================= */
    const commissionPercent =
      await System.getDecimal(
        'H2H_COMMISSION_PERCENT'
      );

    /* =========================
       LOCK CHALLENGES
    ========================= */
    const [challenges] =
      await conn.query(
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

      let winnerUserId;
      let winnerWalletId;

      const creatorWon =
        (outcome === 'YES'
          && c.creator_side === 'yes') ||

        (outcome === 'NO'
          && c.creator_side === 'no');

      if (creatorWon) {

        winnerUserId =
          c.creator_user_id;

        winnerWalletId =
          c.creator_wallet_id;

      }
      else {

        winnerUserId =
          c.opponent_user_id;

        winnerWalletId =
          c.opponent_wallet_id;

      }

      const totalPot =
        Number(c.stake) * 2;

      const commission =
        totalPot *
        (commissionPercent / 100);

      const payout =
        totalPot - commission;

      /* =========================
         UNLOCK BOTH SIDES
      ========================= */
      await conn.query(
        `
        UPDATE wallets
        SET locked_balance =
            locked_balance - ?
        WHERE id IN (?, ?)
        `,
        [
          c.stake,
          c.creator_wallet_id,
          c.opponent_wallet_id
        ]
      );

      /* =========================
         CREDIT WINNER
      ========================= */
      await conn.query(
        `
        UPDATE wallets
        SET balance = balance + ?
        WHERE id = ?
        `,
        [
          payout,
          winnerWalletId
        ]
      );

      /* =========================
         TRANSACTION LOG
      ========================= */
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
        [
          winnerWalletId,
          winnerUserId,
          payout,
          c.uuid
        ]
      );

      /* =========================
         UPDATE CHALLENGE
      ========================= */
      await conn.query(
        `
        UPDATE head_to_head_challenges
        SET
          status = 'settled',
          winner_user_id = ?,
          settled_at = NOW()
        WHERE id = ?
        `,
        [
          winnerUserId,
          c.id
        ]
      );

      /* =========================
         UPDATE ENTRIES
      ========================= */
      await conn.query(
        `
        UPDATE head_to_head_entries
        SET
          status =
          CASE
            WHEN user_id = ?
            THEN 'won'
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

  }
  catch (err) {

    await conn.rollback();
    throw err;

  }
  finally {

    conn.release();

  }

};
