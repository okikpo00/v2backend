'use strict';

const pool = require('../config/db');

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

/**
 * =========================================================
 * FETCH DEPOSITS (ADMIN – READ ONLY)
 * =========================================================
 * - Cursor based pagination (id)
 * - Multiple filters
 * - Safe for large datasets
 * - NO locks
 * =========================================================
 */
exports.fetchDeposits = async ({
  status,
  provider,
  email,
  user_id,
  tx_ref,
  provider_tx_id,
  cursor,
  limit
}) => {
  const pageLimit = Math.min(
    Number(limit) || DEFAULT_LIMIT,
    MAX_LIMIT
  );

  const params = [];
  let where = `WHERE 1=1`;

  /* ---------- FILTERS ---------- */

  if (status) {
    where += ` AND d.status = ?`;
    params.push(status);
  }

  if (provider) {
    where += ` AND d.provider = ?`;
    params.push(provider);
  }

  if (user_id) {
    where += ` AND d.user_id = ?`;
    params.push(user_id);
  }

  if (email) {
    where += ` AND u.email LIKE ?`;
    params.push(`%${email}%`);
  }

  if (tx_ref) {
    where += ` AND d.tx_ref = ?`;
    params.push(tx_ref);
  }

  if (provider_tx_id) {
    where += ` AND d.provider_tx_id = ?`;
    params.push(provider_tx_id);
  }

  /* ---------- CURSOR ---------- */

  if (cursor) {
    where += ` AND d.id < ?`;
    params.push(cursor);
  }

  /* ---------- QUERY ---------- */

  const [rows] = await pool.query(
    `
    SELECT
      d.id,
      d.user_id,
      d.wallet_id,
      d.amount,
      d.currency,
      d.tx_ref,
      d.provider,
      d.provider_ref,
      d.provider_tx_id,
      d.status,
      d.created_ip,
      d.created_user_agent,
      d.idempotency_key,
      d.failure_reason,
      d.wallet_transaction_id,
      d.metadata,
      d.created_at,
      d.updated_at,

      u.email,
      u.first_name,
      u.last_name
    FROM deposits d
    JOIN users u ON u.id = d.user_id
    ${where}
    ORDER BY d.id DESC
    LIMIT ?
    `,
    [...params, pageLimit + 1]
  );

  /* ---------- PAGINATION ---------- */

  let nextCursor = null;
  let items = rows;

  if (rows.length > pageLimit) {
    const last = rows[pageLimit - 1];
    nextCursor = last.id;
    items = rows.slice(0, pageLimit);
  }

  return {
    items,
    next_cursor: nextCursor
  };
};
