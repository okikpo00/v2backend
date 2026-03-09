'use strict';

const pool = require('../config/db');
const { v4: uuidv4 } = require('uuid');

function serviceError(code, message) {
  const err = new Error(message || code);
  err.code = code;
  return err;
}

/* =========================================================
   CREATE DRAFT
========================================================= */
exports.create = async ({ payload, adminId, ip, userAgent }) => {

  const { title, description, category } = payload;

  if (!title || !category)
    throw serviceError('INVALID_INPUT');

  const allowedCategories = [
    'sports',
    'finance',
    'entertainment',
    'politics'
  ];

  if (!allowedCategories.includes(category))
    throw serviceError('INVALID_CATEGORY');

  if (title.length > 255)
    throw serviceError('TITLE_TOO_LONG');

  const conn = await pool.getConnection();

  try {

    await conn.beginTransaction();

    const uuid = uuidv4();

    await conn.query(`
      INSERT INTO head_to_head_questions
      (
        uuid,
        title,
        description,
        category,
        status,
        created_by
      )
      VALUES (?, ?, ?, ?, 'draft', ?)
    `, [
      uuid,
      title.trim(),
      description || null,
      category,
      adminId
    ]);

    await conn.query(`
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
      VALUES (?, 'content', 'h2h_create', 'h2h_question', ?, ?, ?, ?)
    `, [
      adminId,
      uuid,
      ip || null,
      userAgent || null,
      JSON.stringify({})
    ]);

    await conn.commit();

    return { uuid };

  } catch (err) {

    await conn.rollback();
    throw err;

  } finally {

    conn.release();

  }

};


/* =========================================================
   PUBLISH
========================================================= */
exports.publish = async ({ id, adminId, ip, userAgent }) => {

  const [res] = await pool.query(
    `
    UPDATE head_to_head_questions
    SET
      status = 'published',
      published_at = NOW()
    WHERE id = ?
      AND status = 'draft'
    `,
    [id]
  );

  if (!res.affectedRows) {
    throw serviceError('INVALID_STATE');
  }

  await pool.query(
    `
    INSERT INTO admin_audit_logs
    VALUES (NULL, ?, 'content', 'h2h_publish', 'h2h_question', ?, ?, ?, '{}', NOW())
    `,
    [
      adminId,
      id,
      ip || null,
      userAgent || null
    ]
  );
};


/* =========================================================
   LOCK
========================================================= */
exports.lock = async ({ id, adminId, ip, userAgent }) => {

  const [res] = await pool.query(
    `
    UPDATE head_to_head_questions
    SET
      status = 'locked',
      locked_at = NOW()
    WHERE id = ?
      AND status = 'published'
    `,
    [id]
  );

  if (!res.affectedRows) {
    throw serviceError('INVALID_STATE');
  }

  await pool.query(
    `
    INSERT INTO admin_audit_logs
    VALUES (NULL, ?, 'content', 'h2h_lock', 'h2h_question', ?, ?, ?, '{}', NOW())
    `,
    [
      adminId,
      id,
      ip || null,
      userAgent || null
    ]
  );
};



/* =========================================================
   SETTLE QUESTION (PRODUCTION SAFE)
========================================================= */
exports.settle = async ({
  id,
  outcome,
  adminId,
  ip,
  userAgent
}) => {

  if (!['YES','NO'].includes(outcome)) {
    throw serviceError('INVALID_OUTCOME');
  }

  const conn = await pool.getConnection();

  try {

    await conn.beginTransaction();

    /* =====================================
       LOCK QUESTION
    ===================================== */
    const [[question]] = await conn.query(
      `
      SELECT id, status
      FROM head_to_head_questions
      WHERE id = ?
      FOR UPDATE
      `,
      [id]
    );

    if (!question)
      throw serviceError('QUESTION_NOT_FOUND');

    if (question.status !== 'locked')
      throw serviceError('INVALID_STATE');


    /* =====================================
       SET QUESTION SETTLED
    ===================================== */
    await conn.query(
      `
      UPDATE head_to_head_questions
      SET
        status = 'settled',
        outcome = ?,
        settled_at = NOW()
      WHERE id = ?
      `,
      [outcome, id]
    );


    /* =====================================
       LOAD COMPANY FEE
    ===================================== */
    const [[feeRow]] = await conn.query(
      `
      SELECT value
      FROM system_settings
      WHERE \`key\` = 'H2H_FEE_PERCENT'
      LIMIT 1
      `
    );

    const feePercent = Number(feeRow?.value || 0);


    /* =====================================
       LOCK ACCEPTED CHALLENGES
    ===================================== */
    const [challenges] = await conn.query(
      `
      SELECT *
      FROM head_to_head_challenges
      WHERE question_id = ?
        AND status = 'accepted'
      FOR UPDATE
      `,
      [id]
    );


    /* =====================================
       PROCESS EACH CHALLENGE
    ===================================== */
    for (const c of challenges) {

      const stake = Number(c.stake);
      const totalPool = stake * 2;

      const fee = (totalPool * feePercent) / 100;
      const winnerPayout = totalPool - fee;

      let winnerUserId;
      let winnerWalletId;

      const creatorSideUpper = c.creator_side.toUpperCase();

      if (creatorSideUpper === outcome) {
        winnerUserId = c.creator_user_id;
        winnerWalletId = c.creator_wallet_id;
      } else {
        winnerUserId = c.opponent_user_id;
        winnerWalletId = c.opponent_wallet_id;
      }


      /* =====================================
         LOCK BOTH WALLETS
      ===================================== */
      await conn.query(
        `
        SELECT id
        FROM wallets
        WHERE id IN (?, ?)
        FOR UPDATE
        `,
        [
          c.creator_wallet_id,
          c.opponent_wallet_id
        ]
      );


      /* =====================================
         RELEASE ESCROW
      ===================================== */
      await conn.query(
        `
        UPDATE wallets
        SET locked_balance = locked_balance - ?
        WHERE id = ?
        `,
        [stake, c.creator_wallet_id]
      );

      await conn.query(
        `
        UPDATE wallets
        SET locked_balance = locked_balance - ?
        WHERE id = ?
        `,
        [stake, c.opponent_wallet_id]
      );


      /* =====================================
         READ WINNER WALLET BALANCE
      ===================================== */
      const [[wallet]] = await conn.query(
        `
        SELECT balance
        FROM wallets
        WHERE id = ?
        FOR UPDATE
        `,
        [winnerWalletId]
      );

      const balanceBefore = Number(wallet.balance);
      const balanceAfter = balanceBefore + winnerPayout;


      /* =====================================
         CREDIT WINNER
      ===================================== */
      await conn.query(
        `
        UPDATE wallets
        SET balance = ?
        WHERE id = ?
        `,
        [
          balanceAfter,
          winnerWalletId
        ]
      );


      /* =====================================
         TRANSACTION LOG (WINNER)
      ===================================== */
      await conn.query(
        `
        INSERT INTO wallet_transactions
        (
          wallet_id,
          user_id,
          type,
          amount,
          balance_before,
          balance_after,
          source_type,
          source_id
        )
        VALUES (?, ?, 'credit', ?, ?, ?, 'h2h_settlement', ?)
        `,
        [
          winnerWalletId,
          winnerUserId,
          winnerPayout,
          balanceBefore,
          balanceAfter,
          c.uuid
        ]
      );


      /* =====================================
         TRANSACTION LOG (COMPANY FEE)
      ===================================== */
      if (fee > 0) {

        await conn.query(
          `
          INSERT INTO wallet_transactions
          (
            wallet_id,
            user_id,
            type,
            amount,
            balance_before,
            balance_after,
            source_type,
            source_id
          )
          VALUES (NULL, NULL, 'fee', ?, 0, 0, 'h2h_fee', ?)
          `,
          [
            fee,
            c.uuid
          ]
        );

      }


      /* =====================================
         UPDATE CHALLENGE
      ===================================== */
      await conn.query(
        `
        UPDATE head_to_head_challenges
        SET
          status = 'settled',
          winner_user_id = ?,
          payout = ?
        WHERE id = ?
        `,
        [
          winnerUserId,
          winnerPayout,
          c.id
        ]
      );

    }


    /* =====================================
       ADMIN AUDIT
    ===================================== */
    await conn.query(
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
      VALUES (?, 'content', 'h2h_settle', 'h2h_question', ?, ?, ?, ?)
      `,
      [
        adminId,
        id,
        ip || null,
        userAgent || null,
        JSON.stringify({ outcome })
      ]
    );

    await conn.commit();

  }
  catch (err) {

    await conn.rollback();
    throw err;

  }
  finally {

    conn.release();

  }

};

/* =========================================================
   VOID QUESTION (PRODUCTION SAFE)
========================================================= */
exports.void = async ({
  id,
  reason,
  adminId,
  ip,
  userAgent
}) => {

  const conn = await pool.getConnection();

  try {

    await conn.beginTransaction();

    const [[question]] = await conn.query(
      `
      SELECT id, status
      FROM head_to_head_questions
      WHERE id = ?
      FOR UPDATE
      `,
      [id]
    );

    if (!question)
      throw serviceError('QUESTION_NOT_FOUND');

    if (question.status !== 'locked')
      throw serviceError('INVALID_STATE');



    await conn.query(
      `
      UPDATE head_to_head_questions
      SET
        status = 'voided',
        settled_at = NOW()
      WHERE id = ?
      `,
      [id]
    );


const [challenges] = await conn.query(
`
SELECT *
FROM head_to_head_challenges
WHERE question_id = ?
AND status IN ('accepted','locked')
FOR UPDATE
`,
[id]
);


    for (const c of challenges) {

      const stake = Number(c.stake);

      await conn.query(
        `
        SELECT id
        FROM wallets
        WHERE id IN (?, ?)
        FOR UPDATE
        `,
        [
          c.creator_wallet_id,
          c.opponent_wallet_id
        ]
      );


      /* RELEASE ESCROW + REFUND */

      await conn.query(
        `
        UPDATE wallets
        SET
          locked_balance = locked_balance - ?,
          balance = balance + ?
        WHERE id = ?
        `,
        [stake, stake, c.creator_wallet_id]
      );


      await conn.query(
        `
        UPDATE wallets
        SET
          locked_balance = locked_balance - ?,
          balance = balance + ?
        WHERE id = ?
        `,
        [stake, stake, c.opponent_wallet_id]
      );


const [[creatorWallet]] = await conn.query(
`
SELECT balance
FROM wallets
WHERE id = ?
`,
[c.creator_wallet_id]
);

const creatorBefore = Number(creatorWallet.balance);
const creatorAfter = creatorBefore + stake;

await conn.query(
`
INSERT INTO wallet_transactions
(wallet_id,user_id,type,amount,balance_before,balance_after,source_type,source_id)
VALUES (?, ?, 'credit', ?, ?, ?, 'h2h_refund', ?)
`,
[
c.creator_wallet_id,
c.creator_user_id,
stake,
creatorBefore,
creatorAfter,
c.uuid
]
);

     
const [[opponentWallet]] = await conn.query(
`
SELECT balance
FROM wallets
WHERE id = ?
`,
[c.opponent_wallet_id]
);

const opponentBefore = Number(opponentWallet.balance);
const opponentAfter = opponentBefore + stake;

await conn.query(
`
INSERT INTO wallet_transactions
(wallet_id,user_id,type,amount,balance_before,balance_after,source_type,source_id)
VALUES (?, ?, 'credit', ?, ?, ?, 'h2h_refund', ?)
`,
[
c.opponent_wallet_id,
c.opponent_user_id,
stake,
opponentBefore,
opponentAfter,
c.uuid
]
);

      await conn.query(
        `
        UPDATE head_to_head_challenges
        SET status = 'voided', payout = 0
        WHERE id = ?
        `,
        [c.id]
      );

    }



    await conn.query(
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
      VALUES (?, 'content', 'h2h_void', 'h2h_question', ?, ?, ?, ?)
      `,
      [
        adminId,
        id,
        ip || null,
        userAgent || null,
        JSON.stringify({ reason })
      ]
    );


    await conn.commit();

  }
  catch (err) {

    await conn.rollback();
    throw err;

  }
  finally {

    conn.release();

  }

};

/* =========================
   LIST QUESTIONS (ADMIN)
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
  if (limit > 100) limit = 100;

  const offset = (page - 1) * limit;

  const filters = [];
  const params = [];

  if (status) {
    filters.push("status = ?");
    params.push(status);
  }

  if (category) {
    filters.push("category = ?");
    params.push(category);
  }

  if (search) {
    filters.push("(title LIKE ? OR description LIKE ?)");
    params.push(`%${search}%`, `%${search}%`);
  }

  const whereClause =
    filters.length > 0
      ? `WHERE ${filters.join(" AND ")}`
      : "";

  const [rows] = await pool.query(
    `
    SELECT
      id,
      uuid,
      title,
      description,
      category,
      status,
      outcome,
      created_by,
      published_at,
      locked_at,
      settled_at,
      created_at,
      updated_at
    FROM head_to_head_questions
    ${whereClause}
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
    `,
    [...params, limit, offset]
  );

  const [[countRow]] = await pool.query(
    `
    SELECT COUNT(*) AS total
    FROM head_to_head_questions
    ${whereClause}
    `,
    params
  );

  return {
    items: rows,
    pagination: {
      page,
      limit,
      total: countRow.total,
      total_pages: Math.ceil(countRow.total / limit)
    }
  };
};



/* =========================
   UPDATE DRAFT
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
    category
  } = payload;

  if (!title || !category) {
    throw serviceError("INVALID_INPUT");
  }

  const [[question]] = await pool.query(
    `
    SELECT id, status
    FROM head_to_head_questions
    WHERE id = ?
    `,
    [id]
  );

  if (!question) {
    throw serviceError("QUESTION_NOT_FOUND");
  }

  if (question.status !== "draft") {
    throw serviceError("ONLY_DRAFT_EDITABLE");
  }

  await pool.query(
    `
    UPDATE head_to_head_questions
    SET
      title = ?,
      description = ?,
      category = ?,
      updated_at = NOW()
    WHERE id = ?
    `,
    [
      title.trim(),
      description || null,
      category,
      id
    ]
  );

  /* AUDIT */
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
    VALUES (?, 'content', 'update_h2h_draft', 'head_to_head_question', ?, ?, ?, ?)
    `,
    [
      adminId,
      id,
      ip || null,
      userAgent || null,
      JSON.stringify({ updated: true })
    ]
  );

};



/* =========================
   DELETE DRAFT
   SUPER ADMIN ONLY
========================= */
exports.deleteDraft = async ({
  id,
  adminId,
  actorRole,
  ip,
  userAgent
}) => {

  if (actorRole !== "super_admin") {
    throw serviceError("FORBIDDEN");
  }

  const [[question]] = await pool.query(
    `
    SELECT id, status
    FROM head_to_head_questions
    WHERE id = ?
    `,
    [id]
  );

  if (!question) {
    throw serviceError("QUESTION_NOT_FOUND");
  }

  if (question.status !== "draft") {
    throw serviceError("ONLY_DRAFT_DELETABLE");
  }

  await pool.query(
    `
    DELETE FROM head_to_head_questions
    WHERE id = ?
    `,
    [id]
  );

  /* AUDIT */
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
    VALUES (?, 'super_admin', 'delete_h2h_draft', 'head_to_head_question', ?, ?, ?, ?)
    `,
    [
      adminId,
      id,
      ip || null,
      userAgent || null,
      JSON.stringify({ deleted: true })
    ]
  );

};
