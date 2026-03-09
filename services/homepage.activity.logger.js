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

async function log({
  userId,
  username,
  actionType,
  amount = null,
  questionTitle = null
}) {

  try {

    await pool.query(
      `
      INSERT INTO homepage_activity
      (
        user_id,
        username,
        action_type,
        amount,
        question_title
      )
      VALUES (?, ?, ?, ?, ?)
      `,
      [
        userId,
        maskUsername(username),
        actionType,
        amount,
        questionTitle
      ]
    );

  } catch (err) {

    console.error('[ACTIVITY_LOG_ERROR]', err);

  }
}

exports.logPlacedCall = (data) =>
  log({ ...data, actionType: 'placed_call' });

exports.logWonCall = (data) =>
  log({ ...data, actionType: 'won_call' });

exports.logDeposit = (data) =>
  log({ ...data, actionType: 'funded_wallet' });

exports.logWithdrawal = (data) =>
  log({ ...data, actionType: 'withdrew' });

exports.logCreated1v1 = (data) =>
  log({ ...data, actionType: 'created_1v1' });