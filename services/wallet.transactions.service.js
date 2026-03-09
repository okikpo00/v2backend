'use strict';

/**
 * =========================================================
 * WALLET TRANSACTIONS READ SERVICE (ADMIN)
 * =========================================================
 * - Read-only ledger access
 * - Filtered, paginated, indexed
 * - Cursor-based pagination (no OFFSET)
 * - Safe for large tables
 * =========================================================
 */

const pool = require('../config/db');

/* =========================
   HELPERS
========================= */

function buildCursorCondition(cursor) {
  if (!cursor) return { sql: '', params: [] };

  const [createdAt, id] = cursor.split('|');
  if (!createdAt || !id) return { sql: '', params: [] };

  return {
    sql: `AND (created_at < ? OR (created_at = ? AND id < ?))`,
    params: [createdAt, createdAt, Number(id)]
  };
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

  const whereClause = filters.length
    ? `WHERE ${filters.join(' AND ')}`
    : '';

  const cursorCond = buildCursorCondition(cursor);

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
    [...params, ...cursorCond.params, Number(limit) + 1]
  );

  let nextCursor = null;
  let results = rows;

  if (rows.length > limit) {
    const last = rows[limit - 1];
    nextCursor = `${last.created_at.toISOString()}|${last.id}`;
    results = rows.slice(0, limit);
  }
return {
  transactions: results.map((r) => ({
    ...r,
    metadata:
      r.metadata === null
        ? null
        : typeof r.metadata === 'string'
          ? JSON.parse(r.metadata)
          : r.metadata
  })),
  nextCursor
};

};
