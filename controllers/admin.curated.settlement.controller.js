'use strict';

const Service = require('../services/curated.settlement.service');

/* =========================================================
   HELPERS
========================================================= */
function fail(res, code, message = code, status = 400) {
  return res.status(status).json({
    success: false,
    code,
    message
  });
}

function ok(res, data = null) {
  return res.json({
    success: true,
    data
  });
}

/* =========================================================
   SETTLE QUESTION
========================================================= */
exports.settle = async (req, res) => {
  try {
    const { questionId, outcome } = req.body || {};

    /* -------------------------
       VALIDATION
    ------------------------- */
    if (!questionId || isNaN(Number(questionId))) {
      return fail(res, 'INVALID_QUESTION_ID');
    }

    if (!['YES', 'NO'].includes(outcome)) {
      return fail(res, 'INVALID_OUTCOME', 'Outcome must be YES or NO');
    }

    /* -------------------------
       SERVICE CALL
    ------------------------- */
    await Service.settleQuestion({
      questionId: Number(questionId),
      outcome,
      isVoid: false
    });

    return ok(res);

  } catch (err) {

    console.error('[SETTLEMENT_ERROR]', {
      code: err.code,
      message: err.message,
      questionId: req.body?.questionId,
      adminId: req.admin?.adminId
    });

    return fail(
      res,
      err.code || 'SETTLEMENT_FAILED',
      err.message
    );
  }
};

/* =========================================================
   VOID QUESTION
========================================================= */
exports.void = async (req, res) => {
  try {
    const { questionId } = req.body || {};

    /* -------------------------
       VALIDATION
    ------------------------- */
    if (!questionId || isNaN(Number(questionId))) {
      return fail(res, 'INVALID_QUESTION_ID');
    }

    /* -------------------------
       SERVICE CALL
    ------------------------- */
    await Service.settleQuestion({
      questionId: Number(questionId),
      isVoid: true
    });

    return ok(res);

  } catch (err) {

    console.error('[VOID_ERROR]', {
      code: err.code,
      message: err.message,
      questionId: req.body?.questionId,
      adminId: req.admin?.adminId
    });

    return fail(
      res,
      err.code || 'VOID_FAILED',
      err.message
    );
  }
};