'use strict';

const pool = require('../config/db');

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;

exports.listMine = async (req, res) => {
  try {
    const limit = Math.min(
      Number(req.query.limit) || DEFAULT_LIMIT,
      MAX_LIMIT
    );

    const cursor = req.query.cursor || null;

    const params = [req.auth.userId];
    let where = `WHERE wt.user_id = ?`;

    if (cursor) {
      where += ` AND wt.id < ?`;
      params.push(cursor);
    }

    const [rows] = await pool.query(
      `
      SELECT
        wt.id,
        wt.type,
        wt.source_type,
        wt.source_id,
        wt.amount,
    
        wt.balance_before,
        wt.balance_after,
        wt.created_at,
        wt.metadata
      FROM wallet_transactions wt
      ${where}
      ORDER BY wt.id DESC
      LIMIT ?
      `,
      [...params, limit + 1]
    );

    let next_cursor = null;
    let items = rows;

    if (rows.length > limit) {
      next_cursor = rows[limit - 1].id;
      items = rows.slice(0, limit);
    }

    return res.json({
      success: true,
      data: {
        items,
        next_cursor
      }
    });
  } catch (e) {
    console.error('[WALLET_TX_LIST_ERROR]', e);
    return res.status(500).json({
      success: false,
      message: 'Failed to load transactions'
    });
  }
};
