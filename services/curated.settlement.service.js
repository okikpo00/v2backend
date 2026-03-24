'use strict';

const pool = require('../config/db');
const WalletService = require('./wallet.service');

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
      `SELECT id, status, title
       FROM curated_questions
       WHERE id = ?
       FOR UPDATE`,
      [questionId]
    );

    if (!question) throw settlementError('QUESTION_NOT_FOUND');

    if (![QUESTION_STATUS.PUBLISHED, QUESTION_STATUS.LOCKED].includes(question.status)) {
      throw settlementError('QUESTION_NOT_SETTLABLE');
    }

    /* =====================================================
       2. MARK QUESTION SETTLED
    ===================================================== */
    await conn.query(
      `UPDATE curated_questions
       SET status = ?, outcome = ?, settled_at = NOW()
       WHERE id = ?`,
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
      `SELECT *
       FROM curated_question_entries
       WHERE question_id = ?
         AND status = 'open'
       FOR UPDATE`,
      [questionId]
    );

    /* =====================================================
       4. UPDATE ENTRY RESULTS
    ===================================================== */
    for (const e of entries) {

      let status;
      let payout = 0;

      if (isVoid) {
        status = ENTRY_STATUS.VOIDED;
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
        `UPDATE curated_question_entries
         SET status = ?, payout = ?
         WHERE id = ?`,
        [status, payout, e.id]
      );
    }

    /* =====================================================
       5. GET AFFECTED SLIPS
    ===================================================== */
    const [slips] = await conn.query(
      `SELECT DISTINCT slip_id
       FROM curated_question_entries
       WHERE question_id = ?`,
      [questionId]
    );

    /* =====================================================
       6. PROCESS EACH SLIP
    ===================================================== */
    for (const s of slips) {

      const [[slip]] = await conn.query(
        `SELECT *
         FROM curated_entry_slips
         WHERE id = ?
         FOR UPDATE`,
        [s.slip_id]
      );

      if (!slip) continue;

      /* 🔒 Prevent double settlement */
      if (slip.status === SLIP_STATUS.SETTLED) {
        continue;
      }

      const [slipEntries] = await conn.query(
        `SELECT status, odds
         FROM curated_question_entries
         WHERE slip_id = ?`,
        [slip.id]
      );

      const hasLost = slipEntries.some(e => e.status === ENTRY_STATUS.LOST);
      const hasOpen = slipEntries.some(e => e.status === ENTRY_STATUS.OPEN);

      /* =========================
         FETCH LOCK
      ========================= */
      const [[lock]] = await conn.query(
        `SELECT id
         FROM wallet_locks
         WHERE reference_type = 'entry'
           AND reference_id = ?
           AND status = 'active'
         LIMIT 1
         FOR UPDATE`,
        [slip.uuid]
      );

      if (!lock) {
        throw settlementError('LOCK_NOT_FOUND_FOR_SLIP');
      }

      /* =========================
         LOST CASE
      ========================= */
      if (hasLost) {

        await WalletService.consumeLocked({
          walletId: slip.wallet_id,
          lockId: lock.id,
          idempotency_key: `settle_lost:${slip.uuid}`,
          conn
        });

        await conn.query(
          `UPDATE curated_entry_slips
           SET status = 'settled',
               result = 'lost',
               potential_payout = 0,
               total_odds = 0,
               updated_at = NOW()
           WHERE id = ?`,
          [slip.id]
        );

        continue;
      }

      /* =========================
         STILL OPEN → SKIP
      ========================= */
      if (hasOpen) continue;

      /* =========================
         VOID CASE
      ========================= */
      if (isVoid) {

        await WalletService.unlock({
          walletId: slip.wallet_id,
          lockId: lock.id,
          idempotency_key: `settle_void:${slip.uuid}`,
          conn
        });

        await conn.query(
          `UPDATE curated_entry_slips
           SET status = 'settled',
               result = 'voided',
               potential_payout = 0,
               updated_at = NOW()
           WHERE id = ?`,
          [slip.id]
        );

        continue;
      }

      /* =========================
         WON CASE
      ========================= */
      let totalOdds = 1;

      for (const entry of slipEntries) {
        if (entry.status === ENTRY_STATUS.VOIDED) {
          totalOdds *= 1;
        } else {
          totalOdds *= Number(entry.odds);
        }
      }

      const payout = Number(slip.total_stake) * totalOdds;

      /* 🔥 CONSUME LOCK FIRST */
      await WalletService.consumeLocked({
        walletId: slip.wallet_id,
        lockId: lock.id,
        idempotency_key: `settle_win_consume:${slip.uuid}`,
        conn
      });

      /* 🔥 CREDIT WIN */
      await WalletService.credit({
        walletId: slip.wallet_id,
        userId: slip.user_id,
        amount: payout,
        reference_type: 'curated_settlement',
        reference_id: slip.uuid,
        idempotency_key: `settle_win_credit:${slip.uuid}`,
        metadata: {
          slip_id: slip.id
        },
        conn
      });

      await conn.query(
        `UPDATE curated_entry_slips
         SET status = 'settled',
             result = 'won',
             total_odds = ?,
             potential_payout = ?,
             updated_at = NOW()
         WHERE id = ?`,
        [totalOdds, payout, slip.id]
      );
    }

    await conn.commit();

  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};