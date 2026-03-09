'use strict';

const pool = require('../config/db');

function serviceError(code, message) {
  const err = new Error(message || code);
  err.code = code;
  return err;
}

/**
 * ADMIN — Curated Question Full Details
 */
exports.getDetails = async ({ questionId }) => {

  /* =====================================
     LOAD QUESTION
  ===================================== */
  const [[question]] = await pool.query(
    `
    SELECT
      id,
      uuid,
      title,
      description,
      category,
      is_combo,
      yes_odds,
      no_odds,
      status,
      outcome,
      void_reason,
      published_at,
      locked_at,
      settled_at,
      start_time,
      lock_time,
      created_at,
      updated_at
    FROM curated_questions
    WHERE id = ?
    LIMIT 1
    `,
    [questionId]
  );

  if (!question) {
    throw serviceError('QUESTION_NOT_FOUND');
  }

  /* =====================================
     LOAD EXPOSURE
  ===================================== */
  const [[exposure]] = await pool.query(
    `
    SELECT
      yes_liability,
      no_liability,
      total_staked,
      updated_at,
      last_rebalanced_at
    FROM curated_question_exposure
    WHERE question_id = ?
    LIMIT 1
    `,
    [questionId]
  );

  const yesLiability = Number(exposure?.yes_liability || 0);
  const noLiability  = Number(exposure?.no_liability || 0);
  const totalStaked  = Number(exposure?.total_staked || 0);

  /* =====================================
     STAKE BREAKDOWN
  ===================================== */
  const [stakeRows] = await pool.query(
    `
    SELECT
      side,
      SUM(stake) AS total
    FROM curated_question_entries
    WHERE question_id = ?
    GROUP BY side
    `,
    [questionId]
  );

  let yesStake = 0;
  let noStake = 0;

  for (const row of stakeRows) {
    if (row.side === 'yes') yesStake = Number(row.total);
    if (row.side === 'no')  noStake  = Number(row.total);
  }

  /* =====================================
     PARTICIPATION STATS
  ===================================== */
  const [[participation]] = await pool.query(
    `
    SELECT
      COUNT(*) AS total_entries,
      COUNT(DISTINCT slip_id) AS total_slips,
      COUNT(DISTINCT user_id) AS total_users
    FROM curated_question_entries
    WHERE question_id = ?
    `,
    [questionId]
  );

  /* =====================================
     COMPANY PROFIT PROJECTION
  ===================================== */

  const maxPayout = Math.max(yesLiability, noLiability);

  const companyProfitIfYes =
    totalStaked - yesLiability;

  const companyProfitIfNo =
    totalStaked - noLiability;

  /* =====================================
     RECENT ENTRIES (LAST 20)
  ===================================== */
  const [recentEntries] = await pool.query(
    `
    SELECT
      e.id,
      e.user_id,
      e.side,
      e.stake,
      e.odds,
      e.status,
      e.payout,
      e.created_at,
      s.uuid AS slip_uuid
    FROM curated_question_entries e
    JOIN curated_entry_slips s
      ON s.id = e.slip_id
    WHERE e.question_id = ?
    ORDER BY e.created_at DESC
    LIMIT 20
    `,
    [questionId]
  );

  /* =====================================
     FINAL RESPONSE
  ===================================== */

  return {

    question,

    exposure: {
      total_stake: totalStaked,
      yes_stake: yesStake,
      no_stake: noStake,
      yes_liability: yesLiability,
      no_liability: noLiability,
      last_rebalanced_at: exposure?.last_rebalanced_at || null
    },

    participation: {
      total_entries: Number(participation.total_entries),
      total_slips: Number(participation.total_slips),
      total_users: Number(participation.total_users)
    },

    financials: {
      max_payout: maxPayout,
      company_profit_if_yes: companyProfitIfYes,
      company_profit_if_no: companyProfitIfNo
    },

    recent_entries: recentEntries

  };

};
