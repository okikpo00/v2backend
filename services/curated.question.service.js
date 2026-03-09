'use strict';

const pool = require('../config/db');
const { v4: uuidv4 } = require('uuid');
const WalletService = require('./wallet.service');
const {
  STATUSES,
  OUTCOMES
} = require('../constants/curatedQuestion.constants');

/* =========================
   HELPERS
========================= */
function serviceError(code, message) {
  const err = new Error(message || code);
  err.code = code;
  return err;
}

function toMysqlDatetime(value) {
  if (!value) return null;

  const d = new Date(value);
  if (isNaN(d.getTime())) return null;

  const pad = (n) => n.toString().padStart(2, '0');

  return (
    d.getFullYear() + '-' +
    pad(d.getMonth() + 1) + '-' +
    pad(d.getDate()) + ' ' +
    pad(d.getHours()) + ':' +
    pad(d.getMinutes()) + ':' +
    pad(d.getSeconds())
  );
}

/* =========================
   CREATE (DRAFT)
========================= */

exports.create = async ({ payload, adminId }) => {
  const {
    title,
    description,
    category,
    yes_odds,
    no_odds,
    lock_time,
    is_combo,
    combo_items
  } = payload;
console.log(payload);
  if (!title || !description || !category || !lock_time) {
    throw serviceError('INVALID_INPUT', 'Missing required fields');
  }

  const lockTime = toMysqlDatetime(lock_time);

  if (!lockTime) {
    throw serviceError('INVALID_DATETIME', 'Invalid lock_time');
  }

  if (new Date(lockTime) <= new Date()) {
    throw serviceError('LOCK_TIME_MUST_BE_FUTURE');
  }

  const comboFlag = is_combo ? 1 : 0;

  // Combo validation
  if (comboFlag === 1) {
    if (!Array.isArray(combo_items) || combo_items.length < 2) {
      throw serviceError('INVALID_COMBO_ITEMS');
    }
  }

  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    const uuid = uuidv4();

    const [res] = await conn.query(
      `
      INSERT INTO curated_questions (
        uuid,
        title,
        description,
        category,
        yes_odds,
        no_odds,
        lock_time,
        status,
        is_combo,
        created_by
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?)
      `,
      [
        uuid,
        title.trim(),
        description.trim(),
        category,
        yes_odds,
        no_odds,
        lockTime,
        comboFlag,
        adminId
      ]
    );

    const questionId = res.insertId;

    /* =========================
       INSERT COMBO ITEMS
    ========================= */
    if (comboFlag === 1) {
      for (const item of combo_items) {
        if (!item.label) {
          throw serviceError('INVALID_COMBO_LABEL');
        }

        await conn.query(
          `
          INSERT INTO curated_question_combo_items (
            question_id,
            label,
            metadata
          )
          VALUES (?, ?, ?)
          `,
          [
            questionId,
            item.label.trim(),
            item.metadata
              ? JSON.stringify(item.metadata)
              : null
          ]
        );
      }
    }

    await conn.commit();

    return { uuid };
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
};

/* =========================
   PUBLISH
========================= */
/* =========================
   PUBLISH (REFINED)
========================= */
exports.publish = async ({ id, adminId, ip, userAgent }) => {
  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    /* =========================
       LOCK QUESTION
    ========================= */
    const [[question]] = await conn.query(
      `
      SELECT id, status, lock_time
      FROM curated_questions
      WHERE id = ?
      FOR UPDATE
      `,
      [id]
    );

    if (!question) {
      throw serviceError('QUESTION_NOT_FOUND');
    }

    if (question.status !== 'draft') {
      throw serviceError('INVALID_STATE');
    }

    if (!question.lock_time) {
      throw serviceError('LOCK_TIME_REQUIRED');
    }

    if (new Date(question.lock_time) <= new Date()) {
      throw serviceError('LOCK_TIME_MUST_BE_FUTURE');
    }

    /* =========================
       UPDATE STATE
    ========================= */
    await conn.query(
      `
      UPDATE curated_questions
      SET
        status = 'published',
        start_time = NOW(),
        published_at = NOW()
      WHERE id = ?
      `,
      [id]
    );

    /* =========================
       AUDIT LOG
    ========================= */
    await conn.query(
      `
      INSERT INTO admin_audit_logs (
        admin_id,
        actor_role,
        action,
        target_type,
        target_id,
        ip_address,
        user_agent,
        metadata
      ) VALUES (?, 'content', 'publish', 'curated_question', ?, ?, ?, ?)
      `,
      [
        adminId,
        String(id),
        ip || null,
        userAgent || null,
        JSON.stringify({})
      ]
    );

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};


/* =========================
   LOCK
========================= */
exports.lock = async ({ id }) => {
  const [res] = await pool.query(
    `
    UPDATE curated_questions
    SET status = 'locked', locked_at = NOW()
    WHERE id = ? AND status = 'published'
    `,
    [id]
  );

  if (!res.affectedRows) {
    throw serviceError('INVALID_STATE');
  }
};


/* =========================
   LIST (ADMIN) — WITH COMBO SUPPORT
========================= */
exports.list = async ({
  status,
  category,
  search,
  page = 1,
  limit = 20
}) => {
  page = Number(page) || 1;
  limit = Number(limit) || 20;

  if (page < 1) page = 1;
  if (limit < 1) limit = 20;
  if (limit > 100) limit = 100; // safety cap

  const offset = (page - 1) * limit;

  const filters = [];
  const params = [];

  /* =========================
     STATUS FILTER
  ========================= */
  if (status) {
    filters.push('q.status = ?');
    params.push(status);
  }

  /* =========================
     CATEGORY FILTER
  ========================= */
  if (category) {
    filters.push('q.category = ?');
    params.push(category);
  }

  /* =========================
     SEARCH FILTER
  ========================= */
  if (search) {
    filters.push('(q.title LIKE ? OR q.description LIKE ?)');
    params.push(`%${search}%`, `%${search}%`);
  }

  const whereClause = filters.length
    ? `WHERE ${filters.join(' AND ')}`
    : '';

  /* =========================
     MAIN QUERY (WITH COMBO)
  ========================= */
  const [rows] = await pool.query(
    `
    SELECT
      q.id,
      q.uuid,
      q.title,
      q.description,
      q.category,
      q.yes_odds,
      q.no_odds,
      q.status,
      q.outcome,
      q.start_time,
      q.lock_time,
      q.published_at,
      q.locked_at,
      q.settled_at,
      q.created_at,
      q.updated_at,
      COUNT(c.id) AS combo_count,
      CASE WHEN COUNT(c.id) > 0 THEN 1 ELSE 0 END AS is_combo
    FROM curated_questions q
    LEFT JOIN curated_question_combo_items c
      ON c.question_id = q.id
    ${whereClause}
    GROUP BY q.id
    ORDER BY q.created_at DESC
    LIMIT ? OFFSET ?
    `,
    [...params, limit, offset]
  );

  /* =========================
     TOTAL COUNT (NO JOIN)
     Important: avoid inflated count
  ========================= */
  const [[countRow]] = await pool.query(
    `
    SELECT COUNT(*) AS total
    FROM curated_questions q
    ${whereClause}
    `,
    params
  );

  const total = Number(countRow.total);

  return {
    items: rows.map(row => ({
      ...row,
      combo_count: Number(row.combo_count),
      is_combo: Boolean(row.is_combo)
    })),
    pagination: {
      page,
      limit,
      total,
      total_pages: Math.ceil(total / limit)
    }
  };
};
/* =========================
   UPDATE DRAFT
========================= */
/* =========================
   UPDATE DRAFT (WITH COMBO)
========================= */
exports.updateDraft = async ({
  id,
  payload,
  adminId,
  ip,
  userAgent
}) => {
  const {
    title,
    description,
    category,
    yes_odds,
    no_odds,
    lock_time,
    combo_items = []
  } = payload;

  if (
    !title ||
    !description ||
    !category ||
    !yes_odds ||
    !no_odds ||
    !lock_time
  ) {
    throw serviceError('INVALID_INPUT');
  }

  const lockTime = toMysqlDatetime(lock_time);
  if (!lockTime || new Date(lockTime) <= new Date()) {
    throw serviceError('LOCK_TIME_INVALID');
  }

  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    const [[question]] = await conn.query(
      `SELECT id, status
       FROM curated_questions
       WHERE id = ?
       FOR UPDATE`,
      [id]
    );

    if (!question) throw serviceError('QUESTION_NOT_FOUND');
    if (question.status !== 'draft') {
      throw serviceError('ONLY_DRAFT_EDITABLE');
    }

    /* =========================
       UPDATE MAIN QUESTION
    ========================= */
    await conn.query(
      `
      UPDATE curated_questions
      SET
        title = ?,
        description = ?,
        category = ?,
        yes_odds = ?,
        no_odds = ?,
        lock_time = ?,
        updated_at = NOW()
      WHERE id = ?
      `,
      [
        title.trim(),
        description.trim(),
        category,
        Number(yes_odds),
        Number(no_odds),
        lockTime,
        id
      ]
    );

    /* =========================
       COMBO SUPPORT
    ========================= */

    // Delete old combo rows
    await conn.query(
      `DELETE FROM curated_question_combo_items
       WHERE question_id = ?`,
      [id]
    );

    // Insert new combo rows (if provided)
    if (Array.isArray(combo_items) && combo_items.length > 0) {
      for (const item of combo_items) {
        if (!item.label) {
          throw serviceError('INVALID_COMBO_ITEM');
        }

        await conn.query(
          `
          INSERT INTO curated_question_combo_items
            (question_id, label, metadata, created_at)
          VALUES (?, ?, ?, NOW())
          `,
          [
            id,
            item.label.trim(),
            item.metadata
              ? JSON.stringify(item.metadata)
              : null
          ]
        );
      }
    }

    /* =========================
       AUDIT
    ========================= */
    await conn.query(
      `
      INSERT INTO admin_audit_logs
        (admin_id, actor_role, action, target_type, target_id, ip_address, user_agent, metadata)
      VALUES (?, 'content', 'update_draft', 'curated_question', ?, ?, ?, ?)
      `,
      [
        adminId,
        id,
        ip || null,
        userAgent || null,
        JSON.stringify({
          combo_count: combo_items.length
        })
      ]
    );

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};

/* =========================
   DELETE DRAFT
========================= */
exports.deleteDraft = async ({
  id,
  adminId,
  role,
  ip,
  userAgent
}) => {
  if (role !== 'super_admin') {
    throw serviceError('FORBIDDEN', 'Super admin only');
  }

  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    const [[question]] = await conn.query(
      `
      SELECT id, status
      FROM curated_questions
      WHERE id = ?
      FOR UPDATE
      `,
      [id]
    );

    if (!question) {
      throw serviceError('QUESTION_NOT_FOUND');
    }

    if (question.status !== 'draft') {
      throw serviceError('ONLY_DRAFT_DELETABLE');
    }

    const [[entryCount]] = await conn.query(
      `
      SELECT COUNT(*) AS total
      FROM curated_question_entries
      WHERE question_id = ?
      `,
      [id]
    );

    if (entryCount.total > 0) {
      throw serviceError('QUESTION_HAS_ENTRIES');
    }

    await conn.query(
      `DELETE FROM curated_questions WHERE id = ?`,
      [id]
    );

    /* ========= AUDIT ========= */
    await conn.query(
      `
      INSERT INTO admin_audit_logs
        (admin_id, actor_role, action, target_type, target_id, ip_address, user_agent, metadata)
      VALUES (?, ?, 'delete_draft', 'curated_question', ?, ?, ?, ?)
      `,
      [
        adminId,
        role,
        id,
        ip || null,
        userAgent || null,
        JSON.stringify({ deleted: true })
      ]
    );

    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
};
