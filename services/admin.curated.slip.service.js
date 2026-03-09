'use strict';

const pool = require('../config/db');

function serviceError(code, message) {
  const err = new Error(message || code);
  err.code = code;
  return err;
}

/* =========================================================
   LIST SLIPS (ADMIN)
========================================================= */
exports.list = async ({
  status,
  user_id,
  uuid,
  date_from,
  date_to,
  min_stake,
  max_stake,
  is_accumulator,
  page = 1,
  limit = 20
}) => {

  page = Number(page) || 1;
  limit = Number(limit) || 20;

  if (page < 1) page = 1;
  if (limit > 100) limit = 100;

  const offset = (page - 1) * limit;

  const filters = [];
  const params = [];

  /* =========================
     FILTERS
  ========================= */

  if (status) {
    filters.push("s.status = ?");
    params.push(status);
  }

  if (user_id) {
    filters.push("s.user_id = ?");
    params.push(user_id);
  }

  if (uuid) {
    filters.push("s.uuid = ?");
    params.push(uuid);
  }

  if (date_from) {
    filters.push("s.created_at >= ?");
    params.push(date_from);
  }

  if (date_to) {
    filters.push("s.created_at <= ?");
    params.push(date_to);
  }

  if (min_stake) {
    filters.push("s.total_stake >= ?");
    params.push(min_stake);
  }

  if (max_stake) {
    filters.push("s.total_stake <= ?");
    params.push(max_stake);
  }

  if (is_accumulator !== undefined) {

    if (is_accumulator === 'true')
      filters.push("s.entry_count > 1");

    if (is_accumulator === 'false')
      filters.push("s.entry_count = 1");

  }

  const whereClause =
    filters.length ? `WHERE ${filters.join(" AND ")}` : "";



  /* =========================
     MAIN QUERY
  ========================= */

  const [rows] = await pool.query(
    `
    SELECT
      s.id,
      s.uuid,
      s.user_id,
      s.wallet_id,
      s.total_stake,
      s.total_odds,
      s.potential_payout,
      s.entry_count,
      s.status,
      s.created_ip,
      s.created_user_agent,
      s.created_at,
      s.updated_at,

      COALESCE(SUM(e.payout), 0) AS actual_payout

    FROM curated_entry_slips s

    LEFT JOIN curated_question_entries e
      ON e.slip_id = s.id

    ${whereClause}

    GROUP BY s.id

    ORDER BY s.created_at DESC

    LIMIT ? OFFSET ?
    `,
    [...params, limit, offset]
  );



  /* =========================
     FETCH PREVIEW ENTRIES
  ========================= */

  for (const slip of rows) {

    const [entries] = await pool.query(
      `
      SELECT
        question_id,
        side,
        odds,
        status
      FROM curated_question_entries
      WHERE slip_id = ?
      LIMIT 3
      `,
      [slip.id]
    );

    slip.is_accumulator =
      slip.entry_count > 1;

    slip.entries_preview = entries;

  }



  /* =========================
     TOTAL COUNT
  ========================= */

  const [[countRow]] = await pool.query(
    `
    SELECT COUNT(*) AS total
    FROM curated_entry_slips s
    ${whereClause}
    `,
    params
  );



  return {

    items: rows,

    pagination: {
      page,
      limit,
      total: countRow.total,
      total_pages:
        Math.ceil(countRow.total / limit)
    }

  };

};
