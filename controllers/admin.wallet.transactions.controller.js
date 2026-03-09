'use strict';

/**
 * =========================================================
 * ADMIN WALLET TRANSACTIONS CONTROLLER
 * =========================================================
 */

const WalletTxService = require('../services/wallet.transactions.service');
const pool = require('../config/db');

exports.list = async (req, res) => {
  try {
    console.log('[ADMIN_WALLET_TX_READ]', {
      admin: req.admin,
      query: req.query
    });

    const {
      wallet_id,
      user_id,
      type,
      source_type,
      date_from,
      date_to,
      limit,
      cursor
    } = req.query;

    const data = await WalletTxService.fetchTransactions({
      wallet_id,
      user_id,
      type,
      source_type,
      date_from,
      date_to,
      limit: Math.min(Number(limit) || 50, 200),
      cursor
    });

    /* ---------- AUDIT ---------- */
    await pool.query(
      `INSERT INTO admin_audit_logs
       (admin_id, actor_role, action, metadata, ip_address, user_agent)
       VALUES (?, ?, 'ADMIN_VIEW_WALLET_TRANSACTIONS', ?, ?, ?)`,
      [
        req.admin.adminId,
        req.admin.role,
        JSON.stringify(req.query),
        req.ip,
        req.headers['user-agent']
      ]
    );

    return res.json({
      success: true,
      data
    });
  } catch (err) {
    console.error('[ADMIN_WALLET_TX_READ_ERROR]', err);

    return res.status(500).json({
      success: false,
      message: 'Failed to fetch wallet transactions'
    });
  }
};
