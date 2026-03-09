'use strict';

/**
 * =========================================================
 * DYNAMIC ODDS ENGINE (V2 – PRODUCTION SAFE)
 * =========================================================
 */

const pool = require('../config/db');
const System = require('./system.service');

/* =========================
   HELPERS
========================= */
function clamp(v, min, max) {
  return Math.min(Math.max(v, min), max);
}

function round(v, d) {
  const f = Math.pow(10, d);
  return Math.round(v * f) / f;
}

function oddsError(code) {
  const e = new Error(code);
  e.code = code;
  return e;
}

/* =========================================================
   RECALCULATE ODDS
========================================================= */
exports.recalculate = async (questionId) => {

  if (!questionId || typeof questionId !== 'number') {
    throw oddsError('INVALID_QUESTION_ID');
  }

  const conn = await pool.getConnection();

  try {

    await conn.beginTransaction();

    /* =========================
       LOCK QUESTION
    ========================= */
    const [[question]] = await conn.query(
      `
      SELECT id, status, yes_odds, no_odds
      FROM curated_questions
      WHERE id = ?
      FOR UPDATE
      `,
      [questionId]
    );

    if (!question || question.status !== 'published') {
      await conn.commit();
      return;
    }

    /* =========================
       LOAD EXPOSURE
    ========================= */
    const [[exposure]] = await conn.query(
      `
      SELECT yes_liability, no_liability
      FROM curated_question_exposure
      WHERE question_id = ?
      FOR UPDATE
      `,
      [questionId]
    );

    if (!exposure) {
      await conn.commit();
      return;
    }

    const yesLiability = Number(exposure.yes_liability || 0);
    const noLiability  = Number(exposure.no_liability || 0);

    const imbalance = Math.abs(yesLiability - noLiability);

    /* =========================
       LOAD SYSTEM SETTINGS
    ========================= */
    const [
      houseEdgePercent,
      threshold,
      minOdds,
      maxOdds,
      rounding
    ] = await Promise.all([
      System.getDecimal('HOUSE_EDGE_PERCENT'),
      System.getDecimal('ODDS_IMBALANCE_THRESHOLD'),
      System.getDecimal('MIN_ODDS'),
      System.getDecimal('MAX_ODDS'),
      System.getInt('ODDS_ROUNDING')
    ]);

    /* =========================
       SAFE NUMBERS
    ========================= */
    const edge = Number(houseEdgePercent || 0) / 100;
    const thresholdNum = Number(threshold || 0);
    const minOddsNum = Number(minOdds || 1.2);
    const maxOddsNum = Number(maxOdds || 4);
    const roundingNum = Number(rounding || 2);

    /* =========================
       SKIP IF LOW IMBALANCE
    ========================= */
    if (imbalance < thresholdNum) {
      await conn.commit();
      return;
    }

    const total = yesLiability + noLiability;

    if (total <= 0) {
      await conn.commit();
      return;
    }

    /* =========================
       CALCULATE PROBABILITIES
    ========================= */
    const yesProb = yesLiability / total;
    const noProb  = 1 - yesProb;

    /* Probability safety clamp */
    const safeYesProb = clamp(yesProb, 0.01, 0.99);
    const safeNoProb  = 1 - safeYesProb;

    /* =========================
       CALCULATE ODDS
    ========================= */
    let yesOdds = 1 / (safeYesProb * (1 + edge));
    let noOdds  = 1 / (safeNoProb  * (1 + edge));

    /* Clamp + round */
    yesOdds = round(
      clamp(yesOdds, minOddsNum, maxOddsNum),
      roundingNum
    );

    noOdds = round(
      clamp(noOdds, minOddsNum, maxOddsNum),
      roundingNum
    );

    /* =========================
       EDGE SAFETY CHECK
    ========================= */
    const implied = (1 / yesOdds) + (1 / noOdds);

    if (implied < (1 + edge)) {

      const correctionFactor = (1 + edge) / implied;

      yesOdds = round(
        clamp(yesOdds / correctionFactor, minOddsNum, maxOddsNum),
        roundingNum
      );

      noOdds = round(
        clamp(noOdds / correctionFactor, minOddsNum, maxOddsNum),
        roundingNum
      );

    }

    /* =========================
       PREVENT MICRO UPDATES
    ========================= */
    if (
      Math.abs(yesOdds - Number(question.yes_odds)) < 0.01 &&
      Math.abs(noOdds - Number(question.no_odds)) < 0.01
    ) {
      await conn.commit();
      return;
    }

    /* =========================
       UPDATE QUESTION ODDS
    ========================= */
    await conn.query(
      `
      UPDATE curated_questions
      SET
        yes_odds = ?,
        no_odds = ?,
        updated_at = NOW()
      WHERE id = ?
      `,
      [yesOdds, noOdds, questionId]
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