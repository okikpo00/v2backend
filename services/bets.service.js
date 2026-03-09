'use strict';

const pool = require('../config/db');

/* =========================================================
   HELPERS
========================================================= */

function normalizeSlip(row) {
  return {
    slip_id: row.slip_id,
    slip_uuid: row.slip_uuid,
    status: row.slip_status,
    total_stake: Number(row.total_stake),
    total_odds: Number(row.total_odds),
    potential_payout: Number(row.potential_payout),
    created_at: row.created_at,
    entries: []
  };
}

/* =========================================================
   ACTIVE BETS
   - open
   - locked (questions locked but slip not settled yet)
========================================================= */
exports.getActiveBets = async ({ userId }) => {
  const [rows] = await pool.query(
    `
    SELECT
      s.id              AS slip_id,
      s.uuid            AS slip_uuid,
      s.status          AS slip_status,
      s.total_stake,
      s.total_odds,
      s.potential_payout,
      s.created_at,

      e.id              AS entry_id,
      e.side,
      e.odds,
      q.title,
      q.category,
      q.status          AS question_status
    FROM curated_entry_slips s
    JOIN curated_question_entries e ON e.slip_id = s.id
    JOIN curated_questions q ON q.id = e.question_id
    WHERE s.user_id = ?
      AND s.status = 'open'
    ORDER BY s.created_at DESC, e.id ASC
    `,
    [userId]
  );

  const slips = {};
  for (const r of rows) {
    if (!slips[r.slip_id]) {
      slips[r.slip_id] = normalizeSlip(r);
    }

    slips[r.slip_id].entries.push({
      entry_id: r.entry_id,
      title: r.title,
      category: r.category,
      side: r.side,
      odds: Number(r.odds),
      question_status: r.question_status
    });
  }

  return Object.values(slips);
};

/* =========================================================
   SETTLED BETS
   - won
   - lost
   - voided
========================================================= */
exports.getSettledBets = async ({ userId }) => {
  const [rows] = await pool.query(
    `
    SELECT
      s.id              AS slip_id,
      s.uuid            AS slip_uuid,
      s.status          AS slip_status,
      s.total_stake,
      s.total_odds,
      s.potential_payout,
      s.created_at,

      e.id              AS entry_id,
      e.side,
      e.odds,
      e.status          AS entry_status,
      e.payout,
      q.title,
      q.category,
      q.outcome
    FROM curated_entry_slips s
    JOIN curated_question_entries e ON e.slip_id = s.id
    JOIN curated_questions q ON q.id = e.question_id
    WHERE s.user_id = ?
      AND s.status IN ('settled', 'voided')
    ORDER BY s.created_at DESC, e.id ASC
    `,
    [userId]
  );

  const slips = {};
  for (const r of rows) {
    if (!slips[r.slip_id]) {
      slips[r.slip_id] = {
        slip_id: r.slip_id,
        slip_uuid: r.slip_uuid,
        status: r.slip_status,
        total_stake: Number(r.total_stake),
        total_odds: Number(r.total_odds),
        potential_payout: Number(r.potential_payout),
        created_at: r.created_at,
        entries: []
      };
    }

    slips[r.slip_id].entries.push({
      entry_id: r.entry_id,
      title: r.title,
      category: r.category,
      side: r.side,
      odds: Number(r.odds),
      outcome: r.outcome,
      status: r.entry_status,
      payout: Number(r.payout || 0)
    });
  }

  return Object.values(slips);
};
