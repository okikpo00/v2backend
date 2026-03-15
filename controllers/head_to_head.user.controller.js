'use strict';

const Service = require('../services/head_to_head.challenge.service');

function badRequest(res, message) {
  return res.status(400).json({
    success: false,
    message
  });
}

function serverError(res, err) {
  console.error('[H2H USER ERROR]', err);

  return res.status(500).json({
    success: false,
    message: 'SERVER_ERROR'
  });
}


/* =========================================================
   CREATE CHALLENGE
========================================================= */

exports.create = async (req, res) => {

  try {

    const { question_id, stake, side } = req.body || {};

    /* =====================================================
       INPUT VALIDATION
    ===================================================== */

    const questionId = Number(question_id);
    const stakeAmount = Number(stake);

    if (!questionId) {
      return res.status(400).json({
        success: false,
        code: 'QUESTION_ID_REQUIRED',
        message: 'question_id required'
      });
    }

    if (!stakeAmount || stakeAmount <= 0) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_STAKE',
        message: 'Invalid stake amount'
      });
    }

    if (!['yes', 'no'].includes(side)) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_SIDE',
        message: 'Side must be yes or no'
      });
    }

    /* =====================================================
       CREATE CHALLENGE
    ===================================================== */

    const result = await Service.createChallenge({
      userId: req.user.id,
    
      questionId,
      stake: stakeAmount,
      side
    });

    return res.json({
      success: true,
      data: result
    });

  } catch (err) {

    /* =====================================================
       DEBUG LOGGING
    ===================================================== */

    console.log('\n========== CREATE CHALLENGE ERROR ==========');
    console.log('Error object:', err);
    console.log('Error code:', err?.code);
    console.log('Error message:', err?.message);
    console.log('Stack:', err?.stack);
    console.log('============================================\n');

    /* =====================================================
       BUSINESS ERRORS
    ===================================================== */

    if (err.code === 'INSUFFICIENT_BALANCE') {
      return res.status(409).json({
        success: false,
        code: 'INSUFFICIENT_BALANCE',
        message: 'Insufficient wallet balance'
      });
    }

    if (err.code === 'WALLET_NOT_FOUND') {
      return res.status(404).json({
        success: false,
        code: 'WALLET_NOT_FOUND',
        message: 'Wallet not found'
      });
    }

    if (err.code === 'QUESTION_NOT_FOUND') {
      return res.status(404).json({
        success: false,
        code: 'QUESTION_NOT_FOUND',
        message: 'Question not found'
      });
    }

    if (err.code === 'QUESTION_NOT_AVAILABLE') {
      return res.status(409).json({
        success: false,
        code: 'QUESTION_NOT_AVAILABLE',
        message: 'Challenge is no longer available'
      });
    }

    /* =====================================================
       GENERIC SERVICE ERROR
    ===================================================== */

    if (err.code) {
      return res.status(400).json({
        success: false,
        code: err.code,
        message: err.message || 'Request failed'
      });
    }

    /* =====================================================
       UNKNOWN ERROR
    ===================================================== */

    return res.status(500).json({
      success: false,
      code: 'SERVER_ERROR',
      message: 'Internal server error'
    });

  }

};
/* =========================================================
   ACCEPT CHALLENGE
========================================================= */
exports.accept = async (req, res) => {

  try {

    const { invite_code } = req.body || {};

    if (!invite_code) {
      return res.status(400).json({
        success: false,
        code: 'INVITE_CODE_REQUIRED',
        message: 'invite_code required'
      });
    }

    const result = await Service.acceptChallenge({
      userId: req.user.id,
      inviteCode: invite_code
    });

    return res.json({
      success: true,
      data: result
    });

  } catch (err) {

    console.error('[ACCEPT_CHALLENGE_ERROR]', err);

    if (err.code === 'INSUFFICIENT_BALANCE') {
      return res.status(409).json({
        success: false,
        code: 'INSUFFICIENT_BALANCE',
        message: 'Insufficient wallet balance'
      });
    }

    if (err.code === 'CHALLENGE_NOT_FOUND') {
      return res.status(404).json({
        success: false,
        code: 'CHALLENGE_NOT_FOUND',
        message: 'Challenge not found'
      });
    }

    if (err.code === 'CHALLENGE_NOT_AVAILABLE') {
      return res.status(409).json({
        success: false,
        code: 'CHALLENGE_NOT_AVAILABLE',
        message: 'Challenge is no longer available'
      });
    }

    if (err.code === 'CANNOT_ACCEPT_OWN_CHALLENGE') {
      return res.status(409).json({
        success: false,
        code: 'CANNOT_ACCEPT_OWN_CHALLENGE',
        message: 'You cannot accept your own challenge'
      });
    }

    if (err.code) {
      return res.status(400).json({
        success: false,
        code: err.code,
        message: err.message
      });
    }

    return res.status(500).json({
      success: false,
      code: 'SERVER_ERROR',
      message: 'Internal server error'
    });

  }

};
/* =========================================================
   GET CHALLENGE DETAILS
========================================================= */
exports.details = async (req, res) => {

  try {

    const inviteCode = req.params.code;

    if (!inviteCode)
      return badRequest(res, 'invite code required');


    const data =
      await Service.getChallenge({
        inviteCode
      });

    res.json({
      success: true,
      data
    });

  }
  catch (err) {

    if (err.code)
      return badRequest(res, err.message);

    return serverError(res, err);

  }

};



/* =========================================================
   LIST USER CHALLENGES
========================================================= */
exports.list = async (req, res) => {

  try {

    const page =
      Number(req.query.page) || 1;

    const limit =
      Number(req.query.limit) || 20;


    const data =
      await Service.listChallenges({

        userId: req.user.id,

        page,
        limit

      });

    res.json({
      success: true,
      data
    });

  }
  catch (err) {

    return serverError(res, err);

  }

};



exports.cancel = async (req, res) => {

  try {

    const result =
      await Service.cancelChallenge({

        userId: req.user.id,
        inviteCode: req.body.invite_code

      });

    res.json({
      success: true,
      data: result
    });

  }
  catch (err) {

    res.status(400).json({
      success: false,
      message: err.message
    });

  }

};
/* =========================================================
   LIST AVAILABLE QUESTIONS
========================================================= */
exports.listQuestions = async (req, res) => {

  try {

    const result =
      await Service.listAvailableQuestions({

        category: req.query.category,
        page: req.query.page,
        limit: req.query.limit

      });

    res.json({
      success: true,
      data: result
    });

  }
  catch (err) {

    res.status(400).json({
      success: false,
      message: err.message
    });

  }

};