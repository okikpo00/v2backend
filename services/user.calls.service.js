'use strict';

const pool = require('../config/db');

/* =========================================================
   CURATED CALLS
========================================================= */
exports.getCuratedCalls = async ({ userId }) => {

  const [rows] = await pool.query(
    `
    SELECT
      uuid,
      total_stake,
      total_odds,
      potential_payout,
      entry_count,
      status,
      created_at
    FROM curated_entry_slips
    WHERE user_id = ?
    ORDER BY created_at DESC
    `,
    [userId]
  );

  const active = [];
  const settled = [];

  for (const row of rows) {

    let result = null;
    let payout = 0;

    if (row.status === 'settled') {
      payout = Number(row.potential_payout);
      result = payout > 0 ? 'won' : 'lost';
    }

    if (row.status === 'voided') {
      payout = Number(row.total_stake);
      result = 'voided';
    }

    const slip = {
      slip_uuid: row.uuid,
      total_stake: Number(row.total_stake),
      total_odds: Number(row.total_odds),
      potential_payout: Number(row.potential_payout),
      payout,
      status: row.status === 'open' ? 'open' : 'settled',
      result,
      entries_count: Number(row.entry_count),
      created_at: row.created_at
    };

    if (row.status === 'open') {
      active.push(slip);
    } else {
      settled.push(slip);
    }

  }

  return { active, settled };

};


/* =========================================================
   DUEL CALLS (1v1)
========================================================= */
exports.getDuelCalls = async ({ userId }) => {

  const [[feeRow]] = await pool.query(
    `
    SELECT value
    FROM system_settings
    WHERE \`key\` = 'H2H_FEE_PERCENT'
    LIMIT 1
    `
  );

  const feePercent = Number(feeRow?.value || 0);

  const [rows] = await pool.query(
    `
    SELECT
      c.uuid,
      c.invite_code,
      c.stake,
      c.status,
      c.winner_user_id,
      c.payout,
      c.creator_user_id,
      c.opponent_user_id,
      c.creator_side,
      c.opponent_side,
      c.created_at,

      q.title,
      q.category,

      u1.username AS creator_username,
      u2.username AS opponent_username

    FROM head_to_head_challenges c
    JOIN head_to_head_questions q
      ON q.id = c.question_id
    JOIN users u1
      ON u1.id = c.creator_user_id
    LEFT JOIN users u2
      ON u2.id = c.opponent_user_id

    WHERE c.creator_user_id = ?
       OR c.opponent_user_id = ?

    ORDER BY c.created_at DESC
    `,
    [userId, userId]
  );

  const active = [];
  const settled = [];

  for (const row of rows) {

    const stake = Number(row.stake);
    const totalPot = stake * 2;

    const platformFee = (totalPot * feePercent) / 100;
    const potentialWin = totalPot - platformFee;

    let result = null;

    if (row.status === 'settled') {
      result = row.winner_user_id === userId ? 'won' : 'lost';
    }

    if (['voided', 'cancelled', 'expired'].includes(row.status)) {
      result = row.status;
    }

    const duel = {

      uuid: row.uuid,

      title: row.title,

      stake,

      total_pot: totalPot,

      potential_win: Number(potentialWin.toFixed(2)),

      payout: Number(row.payout || 0),

      status: row.status,

      result,
    
      invite_code: row.status === 'pending'
    ? row.invite_code
    : null,

      created_at: row.created_at,

      creator_username: row.creator_username,

      opponent_username: row.opponent_username,

      user_side:
        row.creator_user_id === userId
          ? row.creator_side
          : row.opponent_side

    };

    if (['pending', 'accepted', 'locked'].includes(row.status)) {
      active.push(duel);
    } else {
      settled.push(duel);
    }

  }

  return { active, settled };

};


/* =========================================================
   DUEL DETAIL
========================================================= */
exports.getDuelDetail = async ({ userId, uuid }) => {

  const [[row]] = await pool.query(
    `
    SELECT
      c.*,
      q.title,
      q.category,
      u1.username AS creator_username,
      u2.username AS opponent_username
    FROM head_to_head_challenges c
    JOIN head_to_head_questions q
      ON q.id = c.question_id
    JOIN users u1
      ON u1.id = c.creator_user_id
    LEFT JOIN users u2
      ON u2.id = c.opponent_user_id
    WHERE c.uuid = ?
      AND (c.creator_user_id = ? OR c.opponent_user_id = ?)
    LIMIT 1
    `,
    [uuid, userId, userId]
  );

  if (!row) {
    const e = new Error('NOT_FOUND');
    e.code = 'NOT_FOUND';
    throw e;
  }

  const stake = Number(row.stake);
  const totalPot = stake * 2;

  let result = null;

  if (row.status === 'settled') {
    result = row.winner_user_id === userId ? 'won' : 'lost';
  }

  if (['voided', 'cancelled', 'expired'].includes(row.status)) {
    result = row.status;
  }

  return {

    uuid: row.uuid,

    invite_code:
      row.status === 'pending'
        ? row.invite_code
        : null,

    title: row.title,

    category: row.category,

    stake,

    total_pot: totalPot,

    potential_win: totalPot,

    payout: Number(row.payout || 0),

    status: row.status,

    result,

    creator_username: row.creator_username,

    opponent_username: row.opponent_username,

    creator_side: row.creator_side,

    opponent_side: row.opponent_side,

    user_side:
      row.creator_user_id === userId
        ? row.creator_side
        : row.opponent_side,

    created_at: row.created_at,

    accepted_at: row.accepted_at,

    cancelled_at: row.cancelled_at

  };

};
/* =========================================================
   CURATED SLIP DETAIL
========================================================= */
exports.getCuratedSlipDetail = async ({ userId, uuid }) => {

  const [[slip]] = await pool.query(
    `
    SELECT
      id,
      uuid,
      total_stake,
      total_odds,
      potential_payout,
      entry_count,
      status,
      created_at
    FROM curated_entry_slips
    WHERE uuid = ?
      AND user_id = ?
    LIMIT 1
    `,
    [uuid, userId]
  );

  if (!slip) {
    const e = new Error('NOT_FOUND');
    e.code = 'NOT_FOUND';
    throw e;
  }

  const [entries] = await pool.query(
    `
    SELECT
      e.question_id,
      q.title,
      e.side,
      e.odds,
      e.status,
      e.payout
    FROM curated_question_entries e
    JOIN curated_questions q
      ON q.id = e.question_id
    WHERE e.slip_id = ?
    `,
    [slip.id]
  );

  let result = null;
  let payout = 0;

  if (slip.status === 'settled') {
    payout = Number(slip.potential_payout);
    result = payout > 0 ? 'won' : 'lost';
  }

  if (slip.status === 'voided') {
    payout = Number(slip.total_stake);
    result = 'voided';
  }

  return {
    slip_uuid: slip.uuid,
    status: slip.status,
    result,
    total_stake: Number(slip.total_stake),
    total_odds: Number(slip.total_odds),
    potential_payout: Number(slip.potential_payout),
    payout,
    entries_count: Number(slip.entry_count),
    created_at: slip.created_at,
    entries: entries.map(e => ({
      question_id: e.question_id,
      title: e.title,
      side: e.side,
      odds: Number(e.odds),
      status: e.status,
      payout: Number(e.payout || 0)
    }))
  };

};