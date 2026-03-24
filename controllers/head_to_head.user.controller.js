'use strict';

const Service = require('../services/head_to_head.challenge.service');

/* =========================================================
   RESPONSE HELPERS
========================================================= */
function success(res, data = null) {
  return res.json({
    success: true,
    data
  });
}

function fail(res, status, code, message) {
  return res.status(status).json({
    success: false,
    code,
    message
  });
}

function handleError(res, err) {
  console.error('[H2H_CONTROLLER_ERROR]', err);

  if (!err) {
    return fail(res, 500, 'SERVER_ERROR', 'Internal server error');
  }

  switch (err.code) {

    case 'INVALID_SIDE':
    case 'INVALID_STAKE':
    case 'INVALID_INPUT':
      return fail(res, 400, err.code, err.message);

    case 'QUESTION_ID_REQUIRED':
    case 'INVITE_CODE_REQUIRED':
      return fail(res, 400, err.code, err.message);

    case 'QUESTION_NOT_FOUND':
    case 'CHALLENGE_NOT_FOUND':
      return fail(res, 404, err.code, err.message);

    case 'WALLET_NOT_FOUND':
      return fail(res, 404, err.code, 'Wallet not found');

    case 'INSUFFICIENT_BALANCE':
      return fail(res, 409, err.code, 'Insufficient balance');

    case 'QUESTION_NOT_AVAILABLE':
    case 'CHALLENGE_NOT_AVAILABLE':
    case 'CANNOT_ACCEPT_OWN_CHALLENGE':
    case 'CANNOT_CANCEL':
      return fail(res, 409, err.code, err.message);

    default:
      if (err.code) {
        return fail(res, 400, err.code, err.message || 'Request failed');
      }

      return fail(res, 500, 'SERVER_ERROR', 'Internal server error');
  }
}

/* =========================================================
   CREATE CHALLENGE
========================================================= */
exports.create = async (req, res) => {
  try {

    const { question_id, stake, side } = req.body || {};

    const questionId = Number(question_id);
    const stakeAmount = Number(stake);

    if (!questionId) {
      return fail(res, 400, 'QUESTION_ID_REQUIRED', 'question_id required');
    }

    if (!stakeAmount || stakeAmount <= 0) {
      return fail(res, 400, 'INVALID_STAKE', 'Invalid stake amount');
    }

    if (!['yes', 'no'].includes(side)) {
      return fail(res, 400, 'INVALID_SIDE', 'Side must be yes or no');
    }

    const result = await Service.createChallenge({
      userId: req.user.id,
      questionId,
      stake: stakeAmount,
      side
    });

    return success(res, result);

  } catch (err) {
    return handleError(res, err);
  }
};

/* =========================================================
   ACCEPT CHALLENGE
========================================================= */
exports.accept = async (req, res) => {
  try {

    const { invite_code } = req.body || {};

    if (!invite_code) {
      return fail(res, 400, 'INVITE_CODE_REQUIRED', 'invite_code required');
    }

    const result = await Service.acceptChallenge({
      userId: req.user.id,
      inviteCode: invite_code
    });

    return success(res, result);

  } catch (err) {
    return handleError(res, err);
  }
};

/* =========================================================
   GET CHALLENGE DETAILS
========================================================= */
exports.details = async (req, res) => {
  try {

    const inviteCode = req.params.code;

    if (!inviteCode) {
      return fail(res, 400, 'INVITE_CODE_REQUIRED', 'invite code required');
    }

    const data = await Service.getChallenge({ inviteCode });

    return success(res, data);

  } catch (err) {
    return handleError(res, err);
  }
};

/* =========================================================
   LIST USER CHALLENGES
========================================================= */
exports.list = async (req, res) => {
  try {

    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 20;

    const data = await Service.listChallenges({
      userId: req.user.id,
      page,
      limit
    });

    return success(res, data);

  } catch (err) {
    return handleError(res, err);
  }
};

/* =========================================================
   CANCEL CHALLENGE
========================================================= */
exports.cancel = async (req, res) => {
  try {

    const { invite_code } = req.body || {};

    if (!invite_code) {
      return fail(res, 400, 'INVITE_CODE_REQUIRED', 'invite_code required');
    }

    const result = await Service.cancelChallenge({
      userId: req.user.id,
      inviteCode: invite_code
    });

    return success(res, result);

  } catch (err) {
    return handleError(res, err);
  }
};

/* =========================================================
   LIST AVAILABLE QUESTIONS
========================================================= */
exports.listQuestions = async (req, res) => {
  try {

    const result = await Service.listAvailableQuestions({
      category: req.query.category,
      page: req.query.page,
      limit: req.query.limit
    });

    return success(res, result);

  } catch (err) {
    return handleError(res, err);
  }
};