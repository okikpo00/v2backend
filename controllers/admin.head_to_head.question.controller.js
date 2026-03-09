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


exports.settle = async (req, res) => {

  try {

    await Service.settle({
      id: req.params.id,
      outcome: req.body.outcome,
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


exports.void = async (req, res) => {

  try {

    await Service.void({
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
