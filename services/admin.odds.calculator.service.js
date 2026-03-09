'use strict';

const System = require('./system.service');

/* =========================
   HELPERS
========================= */
function round(value, decimals) {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

/* =========================
   CALCULATE ODDS
========================= */
exports.calculate = async ({ probability_yes }) => {

  const percentage = Number(probability_yes);

  if (
    isNaN(percentage) ||
    percentage <= 0 ||
    percentage >= 100
  ) {
    throw new Error('INVALID_PROBABILITY');
  }

  /* =========================
     CONVERT % → DECIMAL
  ========================= */
  const probYes = percentage / 100;
  const probNo  = 1 - probYes;

  /* =========================
     LOAD SYSTEM SETTINGS
  ========================= */
  const [
    houseEdgePercent,
    minOdds,
    maxOdds,
    rounding
  ] = await Promise.all([
    System.getDecimal('HOUSE_EDGE_PERCENT'),
    System.getDecimal('MIN_ODDS'),
    System.getDecimal('MAX_ODDS'),
    System.getInt('ODDS_ROUNDING')
  ]);

  /* =========================
     SAFE NUMBERS
  ========================= */
  const edge = Number(houseEdgePercent || 0) / 100;
  const minOddsNum = Number(minOdds || 1.2);
  const maxOddsNum = Number(maxOdds || 4);
  const roundingNum = Number(rounding || 2);

  /* =========================
     PROBABILITY SAFETY CLAMP
  ========================= */
  const safeYesProb = clamp(probYes, 0.01, 0.99);
  const safeNoProb  = 1 - safeYesProb;

  /* =========================
     APPLY HOUSE EDGE
  ========================= */
  const adjYesProb = safeYesProb * (1 + edge);
  const adjNoProb  = safeNoProb  * (1 + edge);

  let yesOdds = 1 / adjYesProb;
  let noOdds  = 1 / adjNoProb;

  /* =========================
     CLAMP ODDS LIMITS
  ========================= */
  yesOdds = clamp(yesOdds, minOddsNum, maxOddsNum);
  noOdds  = clamp(noOdds,  minOddsNum, maxOddsNum);

  /* =========================
     ROUND ODDS
  ========================= */
  yesOdds = round(yesOdds, roundingNum);
  noOdds  = round(noOdds,  roundingNum);

  /* =========================
     IMPLIED PROBABILITY
  ========================= */
  const implied =
    round((1 / yesOdds) + (1 / noOdds), 4);

  return {
    input_probability_yes_percent: percentage,
    yes_odds: yesOdds,
    no_odds: noOdds,
    implied_probability: implied,
    house_edge_percent: Number(houseEdgePercent || 0)
  };
};