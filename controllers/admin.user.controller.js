'use strict';

const AdminUserService = require('../services/admin.user.service');

/* =========================
   LIST USERS
========================= */
exports.list = async (req, res) => {
  try {
    const data = await AdminUserService.fetchUsers(req.query);
    return res.json({ success: true, data });
  } catch (e) {
    return res.status(500).json({
      success: false,
      message: 'Failed to load users'
    });
  }
};

/* =========================
   GET SINGLE USER
========================= */
exports.get = async (req, res) => {
  try {
    const user = await AdminUserService.getUser(req.params.id);
    return res.json({ success: true, data: user });
  } catch (e) {
    return res.status(404).json({
      success: false,
      code: e.code,
      message: e.message
    });
  }
};

/* =========================
   STATUS CHANGES
========================= */
exports.changeStatus = (status) => async (req, res) => {
  try {
    const { reason } = req.body;

    if (!reason || reason.length < 5) {
      return res.status(400).json({
        success: false,
        message: 'Reason required'
      });
    }

    await AdminUserService.changeStatus({
      userId: req.params.id,
      newStatus: status,
      reason,
      admin: req.admin
    });

    return res.json({ success: true });
  } catch (e) {
    return res.status(400).json({
      success: false,
      code: e.code,
      message: e.message
    });
  }
};
