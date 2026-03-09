'use strict';

const pool = require('../config/db');
const WalletService = require('./wallet.service');

function adminWithdrawalError(code, message) {
  const err = new Error(message || code);
  err.code = code;
  return err;
}

/* =========================================================
   LIST PENDING WITHDRAWALS (ADMIN)
========================================================= */
exports.listPending = async () => {
  const [rows] = await pool.query(`
    SELECT
      w.id,
      w.uuid,
      w.amount,
      w.fee,
      w.total_debit,
      w.bank_name,
      w.account_number,
      w.account_name,
      w.created_at,

      u.id AS user_id,
      u.email,
      u.first_name,
      u.last_name,
      u.display_name

    FROM withdrawal_requests w
    JOIN users u ON u.id = w.user_id
    WHERE w.status = 'pending_admin'
    ORDER BY w.created_at ASC
  `);

  return rows;
};

/* =========================================================
   APPROVE WITHDRAWAL
========================================================= */
exports.approve = async ({
  adminId,
  withdrawal_uuid,
  ip,
  user_agent
}) => {
  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    const [[withdrawal]] = await conn.query(
      `SELECT *
       FROM withdrawal_requests
       WHERE uuid = ?
         AND status = 'pending_admin'
       LIMIT 1
       FOR UPDATE`,
      [withdrawal_uuid]
    );

    if (!withdrawal) {
      throw adminWithdrawalError('INVALID_WITHDRAWAL');
    }

    // Debit wallet (amount + fee already locked)
    await WalletService.debitWallet({
      walletId: withdrawal.wallet_id,
      userId: withdrawal.user_id,
      amount: withdrawal.total_debit,
      source_type: 'withdrawal',
      source_id: withdrawal.uuid,
      idempotency_key: `withdrawal:${withdrawal.uuid}`,
      metadata: {
        admin_id: adminId
      }
    });

    await conn.query(
      `UPDATE withdrawal_requests
       SET status = 'approved',
           admin_id = ?,
           approved_at = NOW()
       WHERE id = ?`,
      [adminId, withdrawal.id]
    );

    await conn.query(
      `INSERT INTO admin_audit_logs
       (admin_id, actor_role, action, target_type, target_id, ip_address, user_agent)
       VALUES (?, 'finance', 'WITHDRAWAL_APPROVE', 'withdrawal', ?, ?, ?)`,
      [adminId, withdrawal.uuid, ip, user_agent]
    );

    await conn.commit();
    return { success: true };
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
};

/* =========================================================
   REJECT WITHDRAWAL
========================================================= */
exports.reject = async ({
  adminId,
  withdrawal_uuid,
  reason,
  note,
  ip,
  user_agent
}) => {
  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    const [[withdrawal]] = await conn.query(
      `SELECT *
       FROM withdrawal_requests
       WHERE uuid = ?
         AND status = 'pending_admin'
       LIMIT 1
       FOR UPDATE`,
      [withdrawal_uuid]
    );

    if (!withdrawal) {
      throw adminWithdrawalError('INVALID_WITHDRAWAL');
    }

    // Unlock funds
    await WalletService.unlockFunds({
      walletId: withdrawal.wallet_id,
      amount: withdrawal.total_debit
    });

    await conn.query(
      `UPDATE withdrawal_requests
       SET status = 'rejected',
           admin_id = ?,
           rejected_at = NOW(),
           rejection_reason = ?,
           rejection_note = ?
       WHERE id = ?`,
      [adminId, reason, note || null, withdrawal.id]
    );

    await conn.query(
      `INSERT INTO admin_audit_logs
       (admin_id, actor_role, action, target_type, target_id, metadata, ip_address, user_agent)
       VALUES (?, 'finance', 'WITHDRAWAL_REJECT', 'withdrawal', ?, JSON_OBJECT('reason', ?), ?, ?)`,
      [adminId, withdrawal.uuid, reason, ip, user_agent]
    );

    await conn.commit();
    return { success: true };
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
};
