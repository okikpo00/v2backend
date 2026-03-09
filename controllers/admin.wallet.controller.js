'use strict';

const WalletService = require('../services/wallet.service');
const pool = require('../config/db');

function badRequest(res, message) {
  return res.status(400).json({ success: false, message });
}

exports.credit = async (req, res) => {
  console.log('[ADMIN_WALLET_CREDIT] start', { admin: req.admin });

  const { userId, amount, currency = 'NGN', reason, idempotency_key } = req.body;

  if (!userId || !amount || !idempotency_key) {
    return badRequest(res, 'userId, amount and idempotency_key are required');
  }

  try {
    // Ensure wallet exists
    const walletId = await WalletService.createWalletIfNotExists({
      userId,
      currency
    });

    // Credit
    const txId = await WalletService.creditWallet({
      walletId,
      userId,
      amount: Number(amount),
      source_type: 'admin_manual',
      source_id: req.admin.adminId,
      idempotency_key,
      metadata: {
        reason,
        admin_role: req.admin.role
      }
    });

    // Admin audit
    await pool.query(
      `INSERT INTO admin_audit_logs
       (admin_id, actor_role, action, target_type, target_id, metadata)
       VALUES (?, ?, 'CREDIT_WALLET', 'wallet', ?, ?)`,
      [
        req.admin.adminId,
        req.admin.role,
        String(walletId),
        JSON.stringify({ userId, amount, currency, reason, txId })
      ]
    );

    console.log('[ADMIN_WALLET_CREDIT] success', { walletId, txId });

    return res.json({
      success: true,
      data: { walletId, txId }
    });
  } catch (err) {
    console.error('[ADMIN_WALLET_CREDIT_ERROR]', err);
    return res.status(500).json({
      success: false,
      message: err.code || 'Wallet credit failed'
    });
  }
};

exports.debit = async (req, res) => {
  console.log('[ADMIN_WALLET_DEBIT] start', { admin: req.admin });

  const { userId, amount, currency = 'NGN', reason, idempotency_key } = req.body;

  if (!userId || !amount || !idempotency_key) {
    return badRequest(res, 'userId, amount and idempotency_key are required');
  }

  try {
    const wallet = await WalletService.getWalletByUser({
      userId,
      currency
    });

    const txId = await WalletService.debitWallet({
      walletId: wallet.id,
      userId,
      amount: Number(amount),
      source_type: 'admin_manual',
      source_id: req.admin.adminId,
      idempotency_key,
      metadata: {
        reason,
        admin_role: req.admin.role
      }
    });

    await pool.query(
      `INSERT INTO admin_audit_logs
       (admin_id, actor_role, action, target_type, target_id, metadata)
       VALUES (?, ?, 'DEBIT_WALLET', 'wallet', ?, ?)`,
      [
        req.admin.adminId,
        req.admin.role,
        String(wallet.id),
        JSON.stringify({ userId, amount, currency, reason, txId })
      ]
    );

    console.log('[ADMIN_WALLET_DEBIT] success', { walletId: wallet.id, txId });

    return res.json({
      success: true,
      data: { walletId: wallet.id, txId }
    });
  } catch (err) {
    console.error('[ADMIN_WALLET_DEBIT_ERROR]', err);
    return res.status(500).json({
      success: false,
      message: err.code || 'Wallet debit failed'
    });
  }
};
