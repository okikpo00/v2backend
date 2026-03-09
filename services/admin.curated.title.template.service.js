'use strict';

const pool = require('../config/db');

function serviceError(code, message) {
  const err = new Error(message || code);
  err.code = code;
  return err;
}

/* =========================================================
   LIST TEMPLATES
========================================================= */
exports.list = async ({ category }) => {

  const filters = [];
  const params = [];

  if (category) {
    filters.push('category = ?');
    params.push(category);
  }

  const whereClause =
    filters.length > 0
      ? `WHERE ${filters.join(' AND ')}`
      : '';

  const [rows] = await pool.query(
    `
    SELECT
      id,
      title,
      category,
      created_at
    FROM curated_title_templates
    ${whereClause}
    ORDER BY created_at DESC
    `,
    params
  );

  return rows;
};


/* =========================================================
   CREATE TEMPLATE
========================================================= */
exports.create = async ({
  title,
  category,
  adminId,
  ip,
  userAgent
}) => {

  if (!title || !category) {
    throw serviceError('INVALID_INPUT', 'Title and category required');
  }

  const trimmedTitle = title.trim();

  if (!trimmedTitle) {
    throw serviceError('INVALID_TITLE');
  }

  /* =====================================
     INSERT TEMPLATE
  ===================================== */

  let insertId;

  try {

    const [res] = await pool.query(
      `
      INSERT INTO curated_title_templates
      (
        title,
        category,
        created_by
      )
      VALUES (?, ?, ?)
      `,
      [
        trimmedTitle,
        category,
        adminId
      ]
    );

    insertId = res.insertId;

  }
  catch (err) {

    if (err.code === 'ER_DUP_ENTRY') {
      throw serviceError(
        'DUPLICATE_TEMPLATE',
        'Template already exists for this category'
      );
    }

    throw err;
  }


  /* =====================================
     AUDIT LOG
  ===================================== */

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
    VALUES (?, 'content', 'curated_title_template_create',
            'curated_title_template', ?, ?, ?, ?)
    `,
    [
      adminId,
      insertId,
      ip || null,
      userAgent || null,
      JSON.stringify({
        title: trimmedTitle,
        category
      })
    ]
  );


  return {
    id: insertId,
    title: trimmedTitle,
    category
  };

};


/* =========================================================
   DELETE TEMPLATE
========================================================= */
exports.delete = async ({
  id,
  adminId,
  actorRole,
  ip,
  userAgent
}) => {

  if (!['content', 'super_admin'].includes(actorRole)) {
    throw serviceError('FORBIDDEN');
  }

  const [[template]] = await pool.query(
    `
    SELECT id, title, category
    FROM curated_title_templates
    WHERE id = ?
    `,
    [id]
  );

  if (!template) {
    throw serviceError('NOT_FOUND');
  }

  await pool.query(
    `
    DELETE FROM curated_title_templates
    WHERE id = ?
    `,
    [id]
  );

  /* =====================================
     AUDIT LOG
  ===================================== */

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
    VALUES (?, ?, 'curated_title_template_delete',
            'curated_title_template', ?, ?, ?, ?)
    `,
    [
      adminId,
      actorRole,
      id,
      ip || null,
      userAgent || null,
      JSON.stringify({
        title: template.title,
        category: template.category,
        deleted: true
      })
    ]
  );

};
