'use strict';

const { VOID_ODDS } = require('../constants/settlement.constants');

exports.computeSlipOutcome = ({ entries, stake }) => {
  let totalOdds = 1;
  let hasLoss = false;
  let allRefunded = true;

  for (const e of entries) {
    if (e.status === 'lost') {
      hasLoss = true;
    }

    if (e.status !== 'refunded') {
      allRefunded = false;
    }

    const odds =
      e.status === 'refunded'
        ? VOID_ODDS
        : Number(e.odds);

    totalOdds *= odds;
  }

  totalOdds = Number(totalOdds.toFixed(4));

  if (hasLoss) {
    return {
      slipStatus: 'settled',
      totalOdds,
      payout: 0
    };
  }

  if (allRefunded) {
    return {
      slipStatus: 'voided',
      totalOdds: VOID_ODDS,
      payout: Number(stake)
    };
  }

  return {
    slipStatus: 'settled',
    totalOdds,
    payout: Number((stake * totalOdds).toFixed(2))
  };
};
