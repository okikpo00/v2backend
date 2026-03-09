'use strict';

const pool = require('../config/db');
const {
  ENTRY_STATUS,
  SLIP_STATUS,
  QUESTION_STATUS
} = require('../constants/settlement.constants');

function settlementError(code) {
  const e = new Error(code);
  e.code = code;
  return e;
}

exports.settleQuestion = async ({ questionId, outcome, isVoid }) => {

  const conn = await pool.getConnection();

  try {

    await conn.beginTransaction();

    /* =====================================================
       1. LOCK QUESTION
    ===================================================== */
    const [[question]] = await conn.query(
      `
      SELECT id, status, title
      FROM curated_questions
      WHERE id = ?
      FOR UPDATE
      `,
      [questionId]
    );

    if (!question) throw settlementError('QUESTION_NOT_FOUND');

    if (!['published','locked'].includes(question.status)) {
      throw settlementError('QUESTION_NOT_SETTLABLE');
    }

    /* =====================================================
       2. UPDATE QUESTION STATE
    ===================================================== */
    await conn.query(
      `
      UPDATE curated_questions
      SET
        status = ?,
        outcome = ?,
        settled_at = NOW()
      WHERE id = ?
      `,
      [
        isVoid ? QUESTION_STATUS.VOIDED : QUESTION_STATUS.SETTLED,
        isVoid ? null : outcome,
        questionId
      ]
    );

    /* =====================================================
       3. LOCK ENTRIES
    ===================================================== */
    const [entries] = await conn.query(
      `
      SELECT *
      FROM curated_question_entries
      WHERE question_id = ?
        AND status = 'open'
      ORDER BY id ASC
      FOR UPDATE
      `,
      [questionId]
    );

    /* =====================================================
       4. SETTLE ENTRIES
    ===================================================== */
    for (const e of entries) {

      let status;
      let payout = 0;

      if (isVoid) {

        status = ENTRY_STATUS.VOIDED;
        payout = 0;

      } else {

        const won =
          (outcome === 'YES' && e.side === 'yes') ||
          (outcome === 'NO' && e.side === 'no');

        if (won) {
          status = ENTRY_STATUS.WON;
          payout = Number(e.stake * e.odds);
        } else {
          status = ENTRY_STATUS.LOST;
        }

      }

      await conn.query(
        `
        UPDATE curated_question_entries
        SET status = ?, payout = ?
        WHERE id = ?
        `,
        [status, payout, e.id]
      );
    }

    /* =====================================================
       5. FIND AFFECTED SLIPS
    ===================================================== */
    const [slips] = await conn.query(
      `
      SELECT DISTINCT slip_id
      FROM curated_question_entries
      WHERE question_id = ?
      `,
      [questionId]
    );

    /* =====================================================
       6. PROCESS SLIPS
    ===================================================== */
    for (const s of slips) {

      const [[slip]] = await conn.query(
        `
        SELECT *
        FROM curated_entry_slips
        WHERE id = ?
        FOR UPDATE
        `,
        [s.slip_id]
      );

      const [slipEntries] = await conn.query(
        `
        SELECT status, odds
        FROM curated_question_entries
        WHERE slip_id = ?
        `,
        [s.slip_id]
      );

      const hasLost = slipEntries.some(e => e.status === ENTRY_STATUS.LOST);
      const hasOpen = slipEntries.some(e => e.status === ENTRY_STATUS.OPEN);

      /* -------------------------
         LOST RULE
      ------------------------- */
      if (hasLost) {

        await conn.query(
          `
          UPDATE curated_entry_slips
          SET
            status = 'settled',
            result = 'lost',
            potential_payout = 0,
            total_odds = 0,
            updated_at = NOW()
          WHERE id = ?
          `,
          [slip.id]
        );

        await settleWallet(conn, slip, 0, question.title);

        continue;
      }

      /* -------------------------
         OPEN RULE
      ------------------------- */
      if (hasOpen) {
        continue;
      }

      /* -------------------------
         WON RULE
      ------------------------- */
      let totalOdds = 1;

      for (const entry of slipEntries) {

        if (entry.status === ENTRY_STATUS.VOIDED) {
          totalOdds *= 1;
        } else {
          totalOdds *= Number(entry.odds);
        }

      }

      const payout = Number(slip.total_stake) * totalOdds;

      await conn.query(
        `
        UPDATE curated_entry_slips
        SET
          status = 'settled',
          result = 'won',
          total_odds = ?,
          potential_payout = ?,
          updated_at = NOW()
        WHERE id = ?
        `,
        [totalOdds, payout, slip.id]
      );

      await settleWallet(conn, slip, payout, question.title);

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


/* =========================================================
   WALLET SETTLEMENT
========================================================= */

async function settleWallet(conn, slip, payout, questionTitle) {

  const [[wallet]] = await conn.query(
    `
    SELECT balance, locked_balance
    FROM wallets
    WHERE id = ?
    FOR UPDATE
    `,
    [slip.wallet_id]
  );

  await conn.query(
    `
    UPDATE wallets
    SET locked_balance = locked_balance - ?
    WHERE id = ?
    `,
    [slip.total_stake, slip.wallet_id]
  );

  if (payout <= 0) return;

  const before = Number(wallet.balance);
  const after  = before + payout;

  await conn.query(
    `
    UPDATE wallets
    SET balance = ?
    WHERE id = ?
    `,
    [after, slip.wallet_id]
  );

  await conn.query(
    `
    INSERT INTO wallet_transactions
    (
      wallet_id,
      user_id,
      type,
      amount,
      balance_before,
      balance_after,
      source_type,
      source_id
    )
    VALUES (?, ?, 'credit', ?, ?, ?, 'curated_settlement', ?)
    `,
    [
      slip.wallet_id,
      slip.user_id,
      payout,
      before,
      after,
      slip.uuid
    ]
  );

  const [[user]] = await conn.query(
    `SELECT username FROM users WHERE id = ? LIMIT 1`,
    [slip.user_id]
  );

  const WinnerLogger =
    require('./homepage.winner.logger');

  await WinnerLogger.logWinner({
    userId: slip.user_id,
    username: user?.username || 'User',
    amountWon: payout,
    questionTitle
  });

}