'use strict';

const Service = require('../services/head_to_head.question.service');


exports.create = async (req, res) => {

  try {

    const result = await Service.create({
      payload: req.body,
      adminId: req.admin.adminId,
      ip: req.ip,
      userAgent: req.headers['user-agent']
    });

    res.json({
      success: true,
      data: result
    });

  } catch (err) {

    res.status(400).json({
      success: false,
      message: err.message
    });

  }

};


exports.publish = async (req, res) => {

  try {

    await Service.publish({
      id: req.params.id,
      adminId: req.admin.adminId,
      ip: req.ip,
      userAgent: req.headers['user-agent']
    });

    res.json({ success: true });

  } catch (err) {

    res.status(400).json({
      success: false,
      message: err.message
    });

  }

};


exports.lock = async (req, res) => {

  try {

    await Service.lock({
      id: req.params.id,
      adminId: req.admin.adminId,
      ip: req.ip,
      userAgent: req.headers['user-agent']
    });

    res.json({ success: true });

  } catch (err) {

    res.status(400).json({
      success: false,
      message: err.message
    });

  }

};




/* =========================
   HELPERS
========================= */
function success(res, data = null) {
  return res.json({ success: true, data });
}

function fail(res, status, code, message) {
  return res.status(status).json({
    success: false,
    code,
    message
  });
}

function handleError(res, err) {
  console.error('[H2H_SETTLEMENT_CONTROLLER_ERROR]', err);

  if (!err) {
    return fail(res, 500, 'SERVER_ERROR', 'Internal server error');
  }

  switch (err.code) {
    case 'INVALID_OUTCOME':
    case 'INVALID_STATE':
      return fail(res, 400, err.code, err.message);

    case 'QUESTION_NOT_FOUND':
      return fail(res, 404, err.code, err.message);

    default:
      if (err.code) {
        return fail(res, 400, err.code, err.message);
      }
      return fail(res, 500, 'SERVER_ERROR', 'Internal server error');
  }
}

/* =========================
   SETTLE
========================= */
exports.settle = async (req, res) => {
  try {

    const { outcome } = req.body;

    if (!['YES', 'NO'].includes(outcome)) {
      return fail(res, 400, 'INVALID_OUTCOME', 'Invalid outcome');
    }

    await Service.settle({
      id: Number(req.params.id),
      outcome,
      adminId: req.admin.adminId,
      ip: req.ip,
      userAgent: req.headers['user-agent']
    });

    return success(res);

  } catch (err) {
    return handleError(res, err);
  }
};

/* =========================
   VOID
========================= */
exports.void = async (req, res) => {
  try {

    await Service.void({
      id: Number(req.params.id),
      adminId: req.admin.adminId,
      ip: req.ip,
      userAgent: req.headers['user-agent']
    });

    return success(res);

  } catch (err) {
    return handleError(res, err);
  }
};




/* =========================
   LIST
========================= */
exports.list = async (req, res) => {

  try {

    const result =
    await Service.list(req.query);

    res.json({
      success: true,
      data: result
    });

  }
  catch(err){

    res.status(400).json({
      success:false,
      message: err.message
    });

  }

};



/* =========================
   UPDATE DRAFT
========================= */
exports.updateDraft =
async (req,res)=>{

  try{

    await Service.updateDraft({

      id: req.params.id,

      payload: req.body,

      adminId: req.admin.adminId,

      ip: req.ip,

      userAgent:
      req.headers['user-agent']

    });

    res.json({
      success:true
    });

  }
  catch(err){

    res.status(400).json({
      success:false,
      message: err.message
    });

  }

};



/* =========================
   DELETE DRAFT
========================= */
exports.deleteDraft =
async (req,res)=>{

  try{

    await Service.deleteDraft({

      id: req.params.id,

      adminId:
      req.admin.adminId,

      actorRole:
      req.admin.role,

      ip:req.ip,

      userAgent:
      req.headers['user-agent']

    });

    res.json({
      success:true
    });

  }
  catch(err){

    res.status(400).json({
      success:false,
      message: err.message
    });

  }

};
