'use strict';

const pool = require('../config/db');

function serviceError(code) {
  const e = new Error(code);
  e.code = code;
  return e;
}

/* =========================================================
   GET QUESTION ANALYTICS
========================================================= */
exports.getQuestionDetails = async ({ questionId }) => {

  /* ===============================
     LOAD QUESTION
  =============================== */
  const [[question]] = await pool.query(
    `
    SELECT
      id,
      uuid,
      title,
      description,
      category,
      status,
      created_at,
      published_at,
      locked_at,
      settled_at
    FROM head_to_head_questions
    WHERE id = ?
    LIMIT 1
    `,
    [questionId]
  );

  if (!question) {
    throw serviceError('QUESTION_NOT_FOUND');
  }

  /* ===============================
     LOAD STATS
  =============================== */
  const [[stats]] = await pool.query(
    `
    SELECT
      COUNT(*) AS total_challenges,

      SUM(CASE WHEN status IN ('pending','accepted','locked')
        THEN 1 ELSE 0 END) AS active_challenges,

      SUM(CASE WHEN status = 'settled'
        THEN 1 ELSE 0 END) AS settled_challenges,

      SUM(CASE WHEN status = 'voided'
        THEN 1 ELSE 0 END) AS voided_challenges,

      COALESCE(SUM(stake),0) AS total_volume,

      COALESCE(AVG(stake),0) AS average_stake

    FROM head_to_head_challenges
    WHERE question_id = ?
    `,
    [questionId]
  );

  /* ===============================
     LOAD RECENT CHALLENGES
  =============================== */
  const [recent] = await pool.query(
    `
    SELECT
      c.id,
      c.uuid,

      c.creator_user_id,
      u1.username AS creator_name,

      c.opponent_user_id,
      u2.username AS opponent_name,

      c.stake,
      c.status,
      c.payout,
      c.created_at

    FROM head_to_head_challenges c

    JOIN users u1
      ON u1.id = c.creator_user_id

    LEFT JOIN users u2
      ON u2.id = c.opponent_user_id

    WHERE c.question_id = ?

    ORDER BY c.created_at DESC

    LIMIT 50
    `,
    [questionId]
  );

  return {
    question,
    stats: {
      total_challenges: Number(stats.total_challenges),
      active_challenges: Number(stats.active_challenges),
      settled_challenges: Number(stats.settled_challenges),
      voided_challenges: Number(stats.voided_challenges),
      total_volume: Number(stats.total_volume),
      average_stake: Number(stats.average_stake)
    },
    recent_challenges: recent.map(r => ({
      id: r.id,
      uuid: r.uuid,
      creator_user_id: r.creator_user_id,
      creator_name: r.creator_name,
      opponent_user_id: r.opponent_user_id,
      opponent_name: r.opponent_name,
      stake: Number(r.stake),
      status: r.status,
      payout: r.payout ? Number(r.payout) : null,
      created_at: r.created_at
    }))
  };

};