'use strict';

const pool = require('../config/db');

exports.refreshStats = async ()=>{

  const conn = await pool.getConnection();

  try{

    const [[users]] =
      await conn.query(`SELECT COUNT(*) count FROM users`);

    const [[calls]] =
      await conn.query(`SELECT COUNT(*) count FROM curated_question_entries`);

    const [[volume]] =
      await conn.query(`SELECT SUM(stake) total FROM curated_question_entries`);

    const [[paid]] =
      await conn.query(`SELECT SUM(payout) total FROM curated_question_entries WHERE status='won'`);

    const [[active]] =
      await conn.query(`SELECT COUNT(*) count FROM curated_questions WHERE status='published'`);

    await conn.query(`
      UPDATE homepage_stats_cache
      SET
        total_users=?,
        total_calls=?,
        total_volume=?,
        total_paid_out=?,
        active_questions=?,
        updated_at=NOW()
      WHERE id=1
    `,[

      users.count,
      calls.count,
      volume.total||0,
      paid.total||0,
      active.count

    ]);

  }
  finally{
    conn.release();
  }

};
