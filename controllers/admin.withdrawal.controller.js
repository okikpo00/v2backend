'use strict';

const AdminWithdrawalService = require('../services/admin.withdrawal.service');

/* =========================================================
   HELPERS
========================================================= */
function fail(res, code, message = code, status = 400) {
  return res.status(status).json({
    success: false,
    code,
    message
  });
}

function ok(res, data = null) {
  return res.json({
    success: true,
    data
  });
}

/* =========================================================
   LIST PENDING WITHDRAWALS
========================================================= */
exports.listPending = async (req, res) => {
  try {
    const rows = await AdminWithdrawalService.listPending();
    return ok(res, rows);

  } catch (err) {
    console.error('[ADMIN_WITHDRAW_LIST_ERROR]', err);

    return fail(
      res,
      'LIST_PENDING_FAILED',
      'Failed to fetch pending withdrawals',
      500
    );
  }
};

/* =========================================================
   APPROVE WITHDRAWAL
========================================================= */
exports.approve = async (req, res) => {
  try {
    const { uuid } = req.params;

    if (!uuid || typeof uuid !== 'string' || !uuid.trim()) {
      return fail(res, 'INVALID_WITHDRAWAL_ID');
    }

    await AdminWithdrawalService.approve({
      adminId: req.admin.adminId,
      withdrawal_uuid: uuid.trim(),
      ip: req.ip,
      user_agent: req.headers['user-agent']
    });

    return ok(res, { approved: true });

  } catch (err) {
    console.error('[ADMIN_WITHDRAW_APPROVE_ERROR]', err);

    return fail(
      res,
      err.code || 'APPROVE_FAILED',
      err.message
    );
  }
};

/* =========================================================
   REJECT WITHDRAWAL
========================================================= */
exports.reject = async (req, res) => {
  try {
    const { uuid } = req.params;
    const { reason, note } = req.body;

    if (!uuid || typeof uuid !== 'string' || !uuid.trim()) {
      return fail(res, 'INVALID_WITHDRAWAL_ID');
    }

    if (!reason || typeof reason !== 'string' || !reason.trim()) {
      return fail(res, 'REJECTION_REASON_REQUIRED');
    }

    await AdminWithdrawalService.reject({
      adminId: req.admin.adminId,
      withdrawal_uuid: uuid.trim(),
      reason: reason.trim(),
      note: note ? String(note).trim() : null,
      ip: req.ip,
      user_agent: req.headers['user-agent']
    });

    return ok(res, { rejected: true });

  } catch (err) {
    console.error('[ADMIN_WITHDRAW_REJECT_ERROR]', err);

    return fail(
      res,
      err.code || 'REJECT_FAILED',
      err.message
    );
  }
};