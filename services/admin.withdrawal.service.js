'use strict';

const pool = require('../config/db');
const WalletService = require('./wallet.service');

function adminWithdrawalError(code, message) {
  const err = new Error(message || code);
  err.code = code;
  return err;
}

/* =========================================================
   LIST PENDING WITHDRAWALS
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
   APPROVE WITHDRAWAL (PRODUCTION SAFE)
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

    /* =========================
       LOCK WITHDRAWAL
    ========================= */
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

    /* =========================
       FETCH LOCK (SOURCE OF TRUTH)
    ========================= */
    const [[lock]] = await conn.query(
      `SELECT id
       FROM wallet_locks
       WHERE reference_type = 'withdrawal'
         AND reference_id = ?
         AND status = 'active'
       LIMIT 1
       FOR UPDATE`,
      [withdrawal_uuid]
    );

    if (!lock) {
      throw adminWithdrawalError('LOCK_NOT_FOUND');
    }

    /* =========================
       CONSUME LOCK (FINAL DEBIT)
    ========================= */
    await WalletService.consumeLocked({
      walletId: withdrawal.wallet_id,
      lockId: lock.id,
      idempotency_key: `withdrawal_consume:${withdrawal_uuid}`,
      conn
    });

    /* =========================
       UPDATE WITHDRAWAL
    ========================= */
    await conn.query(
      `UPDATE withdrawal_requests
       SET status = 'approved',
           admin_id = ?,
           approved_at = NOW()
       WHERE id = ?`,
      [adminId, withdrawal.id]
    );

    /* =========================
       AUDIT LOG
    ========================= */
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
   REJECT WITHDRAWAL (PRODUCTION SAFE)
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

    /* =========================
       LOCK WITHDRAWAL
    ========================= */
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

    /* =========================
       FETCH LOCK
    ========================= */
    const [[lock]] = await conn.query(
      `SELECT id
       FROM wallet_locks
       WHERE reference_type = 'withdrawal'
         AND reference_id = ?
         AND status = 'active'
       LIMIT 1
       FOR UPDATE`,
      [withdrawal_uuid]
    );

    if (!lock) {
      throw adminWithdrawalError('LOCK_NOT_FOUND');
    }

    /* =========================
       RELEASE LOCK (REFUND USER)
    ========================= */
    await WalletService.unlock({
      walletId: withdrawal.wallet_id,
      lockId: lock.id,
      idempotency_key: `withdrawal_release:${withdrawal_uuid}`,
      conn
    });

    /* =========================
       UPDATE WITHDRAWAL
    ========================= */
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

    /* =========================
       AUDIT LOG
    ========================= */
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