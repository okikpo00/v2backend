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

    const { question_id, stake, side } = req.body;

    if (!question_id)
      return badRequest(res, 'question_id required');

    if (!stake || stake <= 0)
      return badRequest(res, 'invalid stake');

    if (!['yes','no'].includes(side))
      return badRequest(res, 'invalid side');

    const result =
      await Service.createChallenge({
        userId: req.user.id,
        walletId: req.user.wallet_id,
        questionId: question_id,
        stake: Number(stake),
        side
      });

    return res.json({
      success: true,
      data: result
    });

  } catch (err) {

    if (err.code)
      return badRequest(res, err.message);

    return serverError(res, err);

  }

};

/* =========================================================
   ACCEPT CHALLENGE
========================================================= */
exports.accept = async (req, res) => {

  try {

    const { invite_code } = req.body;

    if (!invite_code)
      return badRequest(res, 'invite_code required');

    const result =
      await Service.acceptChallenge({
        userId: req.user.id,
        walletId: req.user.wallet_id,
        inviteCode: invite_code
      });

    return res.json({
      success: true,
      data: result
    });

  } catch (err) {

    if (err.code)
      return badRequest(res, err.message);

    return serverError(res, err);

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