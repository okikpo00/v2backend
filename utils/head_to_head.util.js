'use strict';

/* =========================================================
   GENERATE TREBETTA INVITE CODE
   Format: TREB-XXXXXX
========================================================= */
exports.generateInviteCode = () => {

  // Excludes: I, O, 0, 1 (ambiguous)
  const chars =
    'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

  const prefix = 'TREB-';
  const length = 6;

  let randomPart = '';

  for (let i = 0; i < length; i++) {
    randomPart += chars.charAt(
      Math.floor(Math.random() * chars.length)
    );
  }

  return prefix + randomPart;
};


/* =========================================================
   CALCULATE COMMISSION
========================================================= */
exports.calculateCommission = ({
  totalPot,
  percent
}) => {

  const pot = Number(totalPot);
  const rate = Number(percent);

  if (isNaN(pot) || isNaN(rate))
    return 0;

  return Number(
    (pot * rate / 100).toFixed(2)
  );
};