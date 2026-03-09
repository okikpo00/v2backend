'use strict';

const pool = require('../config/db');

exports.create = async ({
  display_name,
  amount_won,
  question_title,
  adminId
})=>{

  const [res] =
  await pool.query(`
    INSERT INTO homepage_winner_fake
    (
      display_name,
      amount_won,
      question_title,
      created_by
    )
    VALUES (?, ?, ?, ?)
  `,[

    display_name,
    amount_won,
    question_title,
    adminId

  ]);

  return {id:res.insertId};

};

/* =========================================================
   LIST FAKE WINNERS
========================================================= */
exports.list = async () => {

  const [rows] = await pool.query(
    `
    SELECT
      id,
      display_name,
      amount_won,
      question_title,
      created_at
    FROM homepage_winner_fake
    ORDER BY created_at DESC
    `
  );

  return rows;

};


/* =========================================================
   DELETE FAKE WINNER
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
    DELETE FROM homepage_winner_fake
    WHERE id = ?
    `,
    [id]
  );

  if (!res.affectedRows) {
    throw serviceError('NOT_FOUND');
  }


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
    VALUES (?, ?, 'homepage_winner_fake_delete',
            'homepage_fake_winner',
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