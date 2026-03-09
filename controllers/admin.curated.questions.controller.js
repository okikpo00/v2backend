'use strict';

const Service = require('../services/curated.question.service');

/* =========================
   CREATE
========================= */
exports.create = async (req, res) => {
  try {
    if (!req.admin?.adminId) {
      return res.status(401).json({
        success: false,
        message: 'Admin authentication required'
      });
    }

    const result = await Service.create({
      payload: req.body,
      adminId: req.admin.adminId
    });

    return res.json({ success: true, data: result });
  } catch (err) {
    console.error('[ADMIN_CURATED_CREATE_ERROR]', err);
    return res.status(400).json({
      success: false,
      message: err.message
    });
  }
};

/* =========================
   PUBLISH
========================= */
exports.publish = async (req, res) => {
  try {
    if (!req.admin?.adminId) {
      return res.status(401).json({
        success: false,
        message: 'Admin authentication required'
      });
    }

    await Service.publish({
      id: req.params.id,
      adminId: req.admin.adminId,
      ip: req.ip,
      userAgent: req.headers['user-agent']
    });

    return res.json({ success: true });
  } catch (err) {
    console.error('[ADMIN_CURATED_PUBLISH_ERROR]', err);
    return res.status(400).json({
      success: false,
      message: err.message
    });
  }
};


/* =========================
   LOCK
========================= */
exports.lock = async (req, res) => {
  try {
    await Service.lock({ id: req.params.id });
    return res.json({ success: true });
  } catch (err) {
    console.error('[ADMIN_CURATED_LOCK_ERROR]', err);
    return res.status(400).json({
      success: false,
      message: err.message
    });
  }
};


/* =========================
   LIST
========================= */
exports.list = async (req, res) => {
  try {
    const result = await Service.list({
      status: req.query.status,
      category: req.query.category,
      search: req.query.search,
      page: req.query.page,
      limit: req.query.limit
    });

    return res.json({
      success: true,
      data: result
    });
  } catch (err) {
    console.error('[ADMIN_CURATED_LIST_ERROR]', err);
    return res.status(400).json({
      success: false,
      message: err.message
    });
  }
};
exports.updateDraft = async (req, res) => {
  try {
    await Service.updateDraft({
      id: req.params.id,
      payload: req.body,
      adminId: req.admin.adminId,
      ip: req.ip,
      userAgent: req.headers['user-agent']
    });

    return res.json({ success: true });
  } catch (err) {
    console.error('[ADMIN_CURATED_UPDATE_ERROR]', err);
    return res.status(400).json({
      success: false,
      message: err.message
    });
  }
};

exports.deleteDraft = async (req, res) => {
  try {
    await Service.deleteDraft({
      id: req.params.id,
      adminId: req.admin.adminId,
      role: req.admin.role,
      ip: req.ip,
      userAgent: req.headers['user-agent']
    });

    return res.json({ success: true });
  } catch (err) {
    console.error('[ADMIN_CURATED_DELETE_ERROR]', err);
    return res.status(400).json({
      success: false,
      message: err.message
    });
  }
};
