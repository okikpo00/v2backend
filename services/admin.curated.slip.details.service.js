'use strict';

const pool = require('../config/db');

function serviceError(code, message) {
  const err = new Error(message || code);
  err.code = code;
  return err;
}


/* =========================================================
   GET SLIP DETAILS (ADMIN)
========================================================= */
exports.getDetails = async ({ uuid }) => {

  if (!uuid) {
    throw serviceError('INVALID_UUID');
  }

  /* =========================
     FETCH SLIP
  ========================= */

  const [[slip]] = await pool.query(
    `
    SELECT
      id,
      uuid,
      user_id,
      wallet_id,
      total_stake,
      total_odds,
      potential_payout,
      entry_count,
      status,
      created_ip,
      created_user_agent,
      created_at,
      updated_at
    FROM curated_entry_slips
    WHERE uuid = ?
    `,
    [uuid]
  );

  if (!slip) {
    throw serviceError('SLIP_NOT_FOUND');
  }


  /* =========================
     FETCH ENTRIES
  ========================= */

  const [entries] = await pool.query(
    `
    SELECT
      e.id,
      e.question_id,
      e.side,
      e.stake,
      e.odds,
      e.status,
      e.payout,
      e.created_at,

      q.uuid AS question_uuid,
      q.title,
      q.category,
      q.status AS question_status,
      q.outcome,
      q.lock_time,
      q.settled_at

    FROM curated_question_entries e

    INNER JOIN curated_questions q
      ON q.id = e.question_id

    WHERE e.slip_id = ?

    ORDER BY e.id ASC
    `,
    [slip.id]
  );


  /* =========================
     CALCULATE ACTUAL PAYOUT
  ========================= */

  const [[payoutRow]] = await pool.query(
    `
    SELECT COALESCE(SUM(payout), 0) AS total
    FROM curated_question_entries
    WHERE slip_id = ?
    `,
    [slip.id]
  );


  /* =========================
     FINAL STRUCTURE
  ========================= */

  return {

    slip: {

      uuid: slip.uuid,

      user_id: slip.user_id,

      wallet_id: slip.wallet_id,

      total_stake: Number(slip.total_stake),

      total_odds: Number(slip.total_odds),

      potential_payout:
        Number(slip.potential_payout),

      actual_payout:
        Number(payoutRow.total),

      entry_count: slip.entry_count,

      is_accumulator:
        slip.entry_count > 1,

      status: slip.status,

      created_ip: slip.created_ip,

      created_user_agent:
        slip.created_user_agent,

      created_at: slip.created_at,

      updated_at: slip.updated_at

    },

    entries

  };

};
