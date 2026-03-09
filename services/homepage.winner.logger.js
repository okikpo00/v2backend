'use strict';

const pool = require('../config/db');

function maskUsername(username) {

  if (!username) return 'User';

  if (username.length <= 2)
    return username[0] + '*';

  return (
    username.slice(0, 2) +
    '*'.repeat(username.length - 2)
  );
}

exports.logWinner = async ({
  userId,
  username,
  amountWon,
  questionTitle
}) => {

  try {

    await pool.query(
      `
      INSERT INTO homepage_winners
      (
        user_id,
        username,
        amount_won,
        question_title
      )
      VALUES (?, ?, ?, ?)
      `,
      [
        userId,
        maskUsername(username),
        amountWon,
        questionTitle
      ]
    );

  } catch (err) {

    console.error('[WINNER_LOG_ERROR]', err);

  }
};