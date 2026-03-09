'use strict';

const DepositService = require('../services/deposit.service');
const WalletService = require('../services/wallet.service');
const pool = require('../config/db');

exports.init = async (req, res) => {
  try {
    const { amount } = req.body;

    if (!amount || Number(amount) <= 0) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_AMOUNT',
        message: 'Invalid deposit amount'
      });
    }

    const userId = req.auth.userId;

    /* =========================
       FETCH USER EMAIL
    ========================= */

    const [[user]] = await pool.query(
      `SELECT email FROM users WHERE id = ? LIMIT 1`,
      [userId]
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        code: 'USER_NOT_FOUND'
      });
    }

    /* =========================
       FETCH / CREATE WALLET
    ========================= */

    const walletId = await WalletService.createWalletIfNotExists({
      userId,
      currency: 'NGN'
    });

    /* =========================
       INIT DEPOSIT
    ========================= */

    const result = await DepositService.initDeposit({
      userId,
      walletId,
      amount: Number(amount),
      email: user.email,
      ip: req.ip,
      user_agent: req.headers['user-agent']
    });

    return res.json({
      success: true,
      data: result
    });
  } catch (err) {
    console.error('[DEPOSIT_INIT_ERROR]', err);

    return res.status(400).json({
      success: false,
      code: err.code || 'DEPOSIT_FAILED',
      message: err.message
    });
  }
};
/* =========================
   LIST USER DEPOSITS
========================= */
exports.list = async (req, res) => {
  try {
    const limit = Math.min(
      Number(req.query.limit) || 20,
      100
    );

    const cursor = req.query.cursor || null;

    const params = [req.auth.userId];
    let where = `WHERE d.user_id = ?`;

    if (cursor) {
      where += ` AND d.id < ?`;
      params.push(cursor);
    }

    const [rows] = await pool.query(
      `
      SELECT
        d.id,
        d.amount,
        d.currency,
        d.status,
        d.provider,
        d.tx_ref,
        d.provider_tx_id,
        d.created_at
      FROM deposits d
      ${where}
      ORDER BY d.id DESC
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
  } catch (err) {
    console.error('[DEPOSIT_LIST_ERROR]', err);

    return res.status(500).json({
      success: false,
      message: 'Failed to load deposits'
    });
  }
};