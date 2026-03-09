'use strict';

const pool = require('../config/db');

exports.getRecentActivityFeed = async (limit = 20) => {

  const [real] = await pool.query(
    `
    SELECT
      username AS display_name,
      action_type,
      amount,
      question_title,
      created_at,
      'real' AS source
    FROM homepage_activity
    ORDER BY created_at DESC
    LIMIT ?
    `,
    [limit]
  );

  const [fake] = await pool.query(
    `
    SELECT
      display_name,
      action_type,
      amount,
      question_title,
      created_at,
      'fake' AS source
    FROM homepage_fake_activity
    ORDER BY created_at DESC
    LIMIT ?
    `,
    [limit]
  );

  return [...real, ...fake]
    .sort((a,b) =>
      new Date(b.created_at) -
      new Date(a.created_at)
    )
    .slice(0, limit);
};

exports.getWinnerTickerFeed = async (limit = 20) => {

  const [real] = await pool.query(
    `
    SELECT
      username AS display_name,
      amount_won,
      question_title,
      created_at,
      'real' AS source
    FROM homepage_winners
    ORDER BY created_at DESC
    LIMIT ?
    `,
    [limit]
  );

  const [fake] = await pool.query(
    `
    SELECT
      display_name,
      amount_won,
      question_title,
      created_at,
      'fake' AS source
    FROM homepage_fake_winners
    ORDER BY created_at DESC
    LIMIT ?
    `,
    [limit]
  );

  return [...real, ...fake]
    .sort((a,b) =>
      new Date(b.created_at) -
      new Date(a.created_at)
    )
    .slice(0, limit);
};