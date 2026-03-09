'use strict';

const pool = require('../config/db');

exports.run = async () => {
  try {
    console.log('[CRON] Running auto-lock job at', new Date().toISOString());

    const [result] = await pool.query(
      `
      UPDATE curated_questions
      SET
        status = 'locked',
        locked_at = NOW()
      WHERE status = 'published'
        AND lock_time IS NOT NULL
        AND lock_time <= NOW()
      `
    );

    console.log(
      `[CRON] Affected rows: ${result.affectedRows}`
    );

  } catch (err) {
    console.error('[CRON_AUTO_LOCK_ERROR]', err);
  }
};