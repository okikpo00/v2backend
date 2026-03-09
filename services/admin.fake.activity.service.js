'use strict';

const pool = require('../config/db');

exports.create = async ({
  display_name,
  action_type,
  amount,
  question_title,
  adminId
})=>{

  const [res] =
  await pool.query(`
    INSERT INTO homepage_recent_activity_fake
    (
      display_name,
      action_type,
      amount,
      question_title,
      created_by
    )
    VALUES (?, ?, ?, ?, ?)
  `,[

    display_name,
    action_type,
    amount||null,
    question_title||null,
    adminId

  ]);

  return {id:res.insertId};

};


/* =========================================================
   LIST FAKE ACTIVITY
========================================================= */
exports.list = async () => {

  const [rows] = await pool.query(
    `
    SELECT
      id,
      display_name,
      action_type,
      amount,
      question_title,
      created_at
    FROM homepage_recent_activity_fake
    ORDER BY created_at DESC
    `
  );

  return rows;
};


/* =========================================================
   DELETE FAKE ACTIVITY
========================================================= */
exports.delete = async ({
  id,
  adminId,
  actorRole,
  ip,
  userAgent
}) => {

  const [res] = await pool.query(
    `
    DELETE FROM homepage_recent_activity_fake
    WHERE id = ?
    `,
    [id]
  );

  if (!res.affectedRows) {
    throw serviceError('NOT_FOUND');
  }

  /* =========================
     AUDIT LOG
  ========================= */
  await pool.query(
    `
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
    VALUES (?, ?, 'homepage_recent_fake_activity_delete',
            'homepage_fake_activity',
            ?, ?, ?, '{}')
    `,
    [
      adminId,
      actorRole,
      id,
      ip || null,
      userAgent || null
    ]
  );

};