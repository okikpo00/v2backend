'use strict';

const pool = require('../config/db');

/* =========================
   HELPERS
========================= */

function safeParseCursor(cursor) {
  if (!cursor || typeof cursor !== 'string') {
    return null;
  }

  const parts = cursor.split('|');
  if (parts.length !== 2) return null;

  const [createdAt, id] = parts;

  if (!createdAt || isNaN(Number(id))) {
    return null;
  }

  return {
    createdAt,
    id: Number(id)
  };
}

function buildCursorCondition(cursorParsed, hasWhere) {
  if (!cursorParsed) {
    return { sql: '', params: [] };
  }

  const prefix = hasWhere ? 'AND' : 'WHERE';

  return {
    sql: `
      ${prefix} (created_at < ? OR (created_at = ? AND id < ?))
    `,
    params: [
      cursorParsed.createdAt,
      cursorParsed.createdAt,
      cursorParsed.id
    ]
  };
}

function safeJSONParse(value) {
  try {
    if (value === null) return null;
    if (typeof value === 'object') return value;
    return JSON.parse(value);
  } catch {
    return null;
  }
}

/* =========================
   MAIN QUERY
========================= */

exports.fetchTransactions = async ({
  wallet_id,
  user_id,
  type,
  source_type,
  date_from,
  date_to,
  limit = 50,
  cursor
}) => {

  /* =========================
     LIMIT GUARD
  ========================= */
  limit = Math.min(Number(limit) || 50, 100);

  const filters = [];
  const params = [];

  if (wallet_id) {
    filters.push('wallet_id = ?');
    params.push(wallet_id);
  }

  if (user_id) {
    filters.push('user_id = ?');
    params.push(user_id);
  }

  if (type) {
    filters.push('type = ?');
    params.push(type);
  }

  if (source_type) {
    filters.push('source_type = ?');
    params.push(source_type);
  }

  if (date_from) {
    filters.push('created_at >= ?');
    params.push(date_from);
  }

  if (date_to) {
    filters.push('created_at <= ?');
    params.push(date_to);
  }

  const whereClause =
    filters.length > 0
      ? `WHERE ${filters.join(' AND ')}`
      : '';

  const cursorParsed = safeParseCursor(cursor);

  const cursorCond = buildCursorCondition(
    cursorParsed,
    filters.length > 0
  );

  const sql = `
    SELECT
      id,
      wallet_id,
      user_id,
      type,
      amount,
      balance_before,
      balance_after,
      source_type,
      source_id,
      metadata,
      created_at
    FROM wallet_transactions
    ${whereClause}
    ${cursorCond.sql}
    ORDER BY created_at DESC, id DESC
    LIMIT ?
  `;

  const [rows] = await pool.query(
    sql,
    [...params, ...cursorCond.params, limit + 1]
  );

  let nextCursor = null;
  let results = rows;

  if (rows.length > limit) {
    const last = rows[limit - 1];

    const createdAt =
      last.created_at instanceof Date
        ? last.created_at.toISOString()
        : new Date(last.created_at).toISOString();

    nextCursor = `${createdAt}|${last.id}`;
    results = rows.slice(0, limit);
  }

  return {
    transactions: results.map((r) => ({
      ...r,
      metadata: safeJSONParse(r.metadata)
    })),
    nextCursor
  };
};