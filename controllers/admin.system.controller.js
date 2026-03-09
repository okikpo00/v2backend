'use strict';

/**
 * =========================================================
 * ADMIN SYSTEM CONTROLLER
 * =========================================================
 * - Reads & updates system_settings
 * - Relies fully on system.service.js
 * - No business logic here
 * =========================================================
 */

const System = require('../services/system.service');
const pool = require('../config/db');

/* =========================
   GET ALL SETTINGS
========================= */
exports.getAll = async (req, res) => {
  try {
    console.log('[ADMIN_SYSTEM_GET_ALL]', {
      adminId: req.admin.adminId,
      role: req.admin.role
    });

    const settings = await System.refreshCache();

    return res.json({
      success: true,
      data: settings
    });
  } catch (err) {
    console.error('[ADMIN_SYSTEM_GET_ALL_ERROR]', err);

    return res.status(500).json({
      success: false,
      message: 'Failed to fetch system settings'
    });
  }
};

/* =========================
   UPDATE SINGLE SETTING
========================= */
exports.update = async (req, res) => {
  const { key } = req.params;
  const { value, override_expires_at = null } = req.body;

  if (!key || value === undefined) {
    return res.status(400).json({
      success: false,
      message: 'Key and value are required'
    });
  }

  const conn = await pool.getConnection();

  try {
    console.log('[ADMIN_SYSTEM_UPDATE]', {
      adminId: req.admin.adminId,
      key,
      value
    });

    await conn.beginTransaction();

    const [result] = await conn.query(
      `UPDATE system_settings
       SET value = ?, override_expires_at = ?
       WHERE \`key\` = ? AND scope = 'global'
       LIMIT 1`,
      [String(value), override_expires_at, key]
    );

    if (result.affectedRows === 0) {
      throw new Error('SETTING_NOT_FOUND');
    }

    await conn.query(
      `INSERT INTO admin_audit_logs
       (admin_id, actor_role, action, target_type, target_id, metadata)
       VALUES (?, ?, 'SYSTEM_SETTING_UPDATE', 'system_setting', ?, ?)`,
      [
        req.admin.adminId,
        req.admin.role,
        key,
        JSON.stringify({ value, override_expires_at })
      ]
    );

    await conn.commit();

    // 🔄 refresh cache immediately
    await System.refreshCache();

    return res.json({
      success: true,
      message: 'System setting updated'
    });
  } catch (err) {
    await conn.rollback();

    console.error('[ADMIN_SYSTEM_UPDATE_ERROR]', err);

    return res.status(500).json({
      success: false,
      message: 'Failed to update system setting'
    });
  } finally {
    conn.release();
  }
};

/* =========================
   FORCE CACHE REFRESH
========================= */
exports.refreshCache = async (req, res) => {
  try {
    console.log('[ADMIN_SYSTEM_CACHE_REFRESH]', {
      adminId: req.admin.adminId
    });

    await System.refreshCache();

    await pool.query(
      `INSERT INTO admin_audit_logs
       (admin_id, actor_role, action, target_type)
       VALUES (?, ?, 'SYSTEM_CACHE_REFRESH', 'system')`,
      [req.admin.adminId, req.admin.role]
    );

    return res.json({
      success: true,
      message: 'System cache refreshed'
    });
  } catch (err) {
    console.error('[ADMIN_SYSTEM_CACHE_REFRESH_ERROR]', err);

    return res.status(500).json({
      success: false,
      message: 'Failed to refresh system cache'
    });
  }
};
