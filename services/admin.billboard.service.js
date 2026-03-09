'use strict';

const pool = require('../config/db');

function serviceError(code){
  const e = new Error(code);
  e.code = code;
  return e;
}

/* =========================================
   CREATE BILLBOARD
========================================= */
exports.create = async ({
  image_url,
  action_type,
  action_value,
  priority,
  adminId,
  ip,
  userAgent
}) => {

  if (!image_url || !action_type)
    throw serviceError('INVALID_INPUT');

  const [res] = await pool.query(`
    INSERT INTO homepage_billboards
    (
      image_url,
      action_type,
      action_value,
      priority,
      created_by
    )
    VALUES (?, ?, ?, ?, ?)
  `,[
    image_url,
    action_type,
    action_value || null,
    priority || 0,
    adminId
  ]);

  await pool.query(`
    INSERT INTO admin_audit_logs
    (
      admin_id,
      actor_role,
      action,
      target_type,
      target_id,
      ip_address,
      user_agent,
      metadata
    )
    VALUES (?, 'content','billboard_create','homepage_billboard',?,?,?,?)
  `,[
    adminId,
    res.insertId,
    ip || null,
    userAgent || null,
    JSON.stringify({ image_url })
  ]);

  return { id: res.insertId };

};

/* =========================================
   LIST BILLBOARDS
========================================= */
exports.list = async ()=>{

  const [rows] = await pool.query(`
    SELECT *
    FROM homepage_billboards
    ORDER BY priority DESC, id DESC
  `);

  return rows;

};

/* =========================================
   TOGGLE ACTIVE
========================================= */
exports.toggle = async ({id, adminId, ip, userAgent})=>{

  await pool.query(`
    UPDATE homepage_billboards
    SET is_active = NOT is_active
    WHERE id = ?
  `,[id]);

  await pool.query(`
    INSERT INTO admin_audit_logs
    VALUES
    (NULL, ?, 'content','billboard_toggle','homepage_billboard',?,?,?, '{}',NOW())
  `,[adminId,id,ip||null,userAgent||null]);

};

/* =========================================
   DELETE
========================================= */
exports.delete = async ({id, adminId, ip, userAgent})=>{

  await pool.query(`
    DELETE FROM homepage_billboards
    WHERE id = ?
  `,[id]);

  await pool.query(`
    INSERT INTO admin_audit_logs
    VALUES
    (NULL, ?, 'content','billboard_delete','homepage_billboard',?,?,?, '{}',NOW())
  `,[adminId,id,ip||null,userAgent||null]);

};