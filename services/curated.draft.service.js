'use strict';

const pool = require('../config/db');

function draftError(code) {
  const e = new Error(code);
  e.code = code;
  return e;
}

/* =========================================================
   SAVE / UPDATE DRAFT
========================================================= */
exports.save = async ({ userId, stake, entries }) => {

  const conn = await pool.getConnection();

  try {

    await conn.beginTransaction();

    /* =========================
       VALIDATE ENTRIES
    ========================= */
    if (!Array.isArray(entries) || entries.length === 0) {
      throw draftError('INVALID_ENTRIES');
    }

    for (const e of entries) {

      if (!e.question_id) {
        throw draftError('QUESTION_ID_REQUIRED');
      }

      if (!['yes','no'].includes(e.side)) {
        throw draftError('INVALID_SIDE');
      }

      const [[question]] = await conn.query(
        `
        SELECT id
        FROM curated_questions
        WHERE id = ?
          AND status = 'published'
          AND lock_time > NOW()
        LIMIT 1
        `,
        [e.question_id]
      );

      if (!question) {
        throw draftError('QUESTION_NOT_AVAILABLE');
      }
    }

    /* =========================
       UPSERT
    ========================= */
    await conn.query(
      `
      INSERT INTO curated_slip_drafts
        (user_id, stake, entries_json)
      VALUES (?, ?, CAST(? AS JSON))
      ON DUPLICATE KEY UPDATE
        stake = VALUES(stake),
        entries_json = VALUES(entries_json)
      `,
      [
        userId,
        Number(stake) || 0,
        JSON.stringify(entries)
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


/* =========================================================
   GET DRAFT (SAFE JSON PARSE)
========================================================= */
/* =========================================================
   GET DRAFT (ENRICHED RESPONSE)
========================================================= */
exports.get = async ({ userId }) => {

  const [[row]] = await pool.query(
    `
    SELECT stake, entries_json
    FROM curated_slip_drafts
    WHERE user_id = ?
    LIMIT 1
    `,
    [userId]
  );

  if (!row) return null;

  let rawEntries;

  if (typeof row.entries_json === 'string') {
    try {
      rawEntries = JSON.parse(row.entries_json);
    } catch {
      rawEntries = [];
    }
  } else {
    rawEntries = row.entries_json;
  }

  if (!Array.isArray(rawEntries) || rawEntries.length === 0) {
    return {
      stake: Number(row.stake),
      entries: []
    };
  }

  const enrichedEntries = [];

  for (const e of rawEntries) {

    if (!e.question_id || !['yes','no'].includes(e.side)) {
      continue;
    }

    const [[question]] = await pool.query(
      `
      SELECT
        id,
        uuid,
        title,
        yes_odds,
        no_odds,
        status,
        lock_time
      FROM curated_questions
      WHERE id = ?
      LIMIT 1
      `,
      [e.question_id]
    );

    // If question missing → skip
    if (!question) continue;

    // Must be published
    if (question.status !== 'published') continue;

    // Must not be locked
    if (new Date(question.lock_time) <= new Date()) continue;

    const odds =
      e.side === 'yes'
        ? Number(question.yes_odds)
        : Number(question.no_odds);

    if (!odds || odds <= 1) continue;

    enrichedEntries.push({
      question_id: question.id,
      uuid: question.uuid,
      title: question.title,
      side: e.side,
      odds
    });
  }

  return {
    stake: Number(row.stake),
    entries: enrichedEntries
  };
};
/* =========================================================
   CLEAR DRAFT
========================================================= */
exports.clear = async ({ userId }) => {

  await pool.query(
    `
    DELETE FROM curated_slip_drafts
    WHERE user_id = ?
    `,
    [userId]
  );

};