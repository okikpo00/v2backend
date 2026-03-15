'use strict';

const pool = require('../config/db');

/**
 * Allowed statuses for user feed
 */
const VISIBLE_STATUSES = ['published', 'locked'];

/* =========================
   LIST QUESTIONS
========================= */
exports.list = async ({ category }) => {
  const params = [...VISIBLE_STATUSES];
  let where = `status IN (?, ?)`;

  if (category) {
    where += ` AND category = ?`;
    params.push(category);
  }

  const [rows] = await pool.query(
    `
 SELECT
  q.id,
  q.uuid,
  q.title,
  q.description,
  q.category,
  q.yes_odds,
  q.no_odds,
  q.status,
  q.start_time,
  q.lock_time,
  q.created_at,

  COUNT(c.id) AS combo_count,

  CASE WHEN COUNT(c.id) > 0 THEN 1 ELSE 0 END AS is_combo,

  JSON_ARRAYAGG(
    JSON_OBJECT(
      'id', c.id,
      'label', c.label
     
    )
  ) AS combo_items

FROM curated_questions q

LEFT JOIN curated_question_combo_items c
  ON c.question_id = q.id

WHERE ${where}

GROUP BY q.id

ORDER BY q.created_at DESC
    `,
    params
  );

  return rows;
};

/* =========================
   GET SINGLE QUESTION
========================= */
/* =========================
   GET SINGLE QUESTION (WITH COMBO ITEMS)
========================= */
exports.getOne = async ({ uuid }) => {

  const [[row]] = await pool.query(
    `
    SELECT
      q.id,
      q.uuid,
      q.title,
      q.description,
      q.category,
      q.yes_odds,
      q.no_odds,
      q.status,
      q.outcome,
      q.start_time,
      q.lock_time,
      UNIX_TIMESTAMP(q.lock_time) AS closes_at_unix,
      UNIX_TIMESTAMP(NOW()) AS server_time,
      q.published_at,
      q.created_at,

      COUNT(c.id) AS combo_count,
      CASE WHEN COUNT(c.id) > 0 THEN 1 ELSE 0 END AS is_combo,

      JSON_ARRAYAGG(
        CASE
          WHEN c.id IS NOT NULL THEN
            JSON_OBJECT(
              'id', c.id,
              'label', c.label
            )
          ELSE NULL
        END
      ) AS combo_items

    FROM curated_questions q

    LEFT JOIN curated_question_combo_items c
      ON c.question_id = q.id

    WHERE q.uuid = ?
      AND q.status IN ('published', 'locked', 'settled')

    GROUP BY q.id
    LIMIT 1
    `,
    [uuid]
  );

  if (!row) return null;

  /* ===============================
     CLEAN COMBO ITEMS
  =============================== */

  if (!row.is_combo) {
    row.combo_items = [];
  } else {
    row.combo_items = (row.combo_items || []).filter(i => i !== null);
  }

  /* ===============================
     TYPE CLEANING
  =============================== */

  row.yes_odds = Number(row.yes_odds);
  row.no_odds = Number(row.no_odds);
  row.closes_at_unix = Number(row.closes_at_unix);
  row.server_time = Number(row.server_time);

  return row;
};