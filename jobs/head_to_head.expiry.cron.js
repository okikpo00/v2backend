'use strict';

const pool =
require('../config/db');

const Escrow =
require('../services/head_to_head.escrow.service');

exports.run =
async () => {

  const conn =
    await pool.getConnection();

  try {

    await conn.beginTransaction();

    /* =====================================
       FIND PENDING CHALLENGES
       WHERE QUESTION IS NO LONGER PUBLISHED
    ===================================== */
    const [challenges] =
      await conn.query(
        `
        SELECT c.*
        FROM head_to_head_challenges c
        JOIN head_to_head_questions q
          ON q.id = c.question_id
        WHERE c.status = 'pending'
          AND q.status != 'published'
        FOR UPDATE
        `
      );

    for (const c of challenges) {

      /* =====================================
         UNLOCK CREATOR ESCROW
      ===================================== */
      await Escrow.unlockFunds({
        conn,
        walletId: c.creator_wallet_id,
        amount: c.stake
      });

      /* =====================================
         MARK AS EXPIRED
      ===================================== */
      await conn.query(
        `
        UPDATE head_to_head_challenges
        SET
          status = 'expired',
          expired_at = NOW()
        WHERE id = ?
        `,
        [c.id]
      );

    }

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