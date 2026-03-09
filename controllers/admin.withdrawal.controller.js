'use strict';

const AdminWithdrawalService = require('../services/admin.withdrawal.service');

/* =========================
   LIST PENDING
========================= */
exports.listPending = async (req, res) => {
  try {
    const rows = await AdminWithdrawalService.listPending();
    return res.json({ success: true, data: rows });
  } catch (e) {
    return res.status(500).json({ success: false });
  }
};

/* =========================
   APPROVE
========================= */
exports.approve = async (req, res) => {
  try {
    const { uuid } = req.params;

    await AdminWithdrawalService.approve({
      adminId: req.admin.adminId,
      withdrawal_uuid: uuid,
      ip: req.ip,
      user_agent: req.headers['user-agent']
    });

    return res.json({ success: true });
  } catch (e) {
    return res.status(400).json({
      success: false,
      code: e.code || 'APPROVE_FAILED'
    });
  }
};

/* =========================
   REJECT
========================= */
exports.reject = async (req, res) => {
  try {
    const { uuid } = req.params;
    const { reason, note } = req.body;

    if (!reason) {
      return res.status(400).json({
        success: false,
        message: 'Rejection reason required'
      });
    }

    await AdminWithdrawalService.reject({
      adminId: req.admin.adminId,
      withdrawal_uuid: uuid,
      reason,
      note,
      ip: req.ip,
      user_agent: req.headers['user-agent']
    });

    return res.json({ success: true });
  } catch (e) {
    return res.status(400).json({
      success: false,
      code: e.code || 'REJECT_FAILED'
    });
  }
};
