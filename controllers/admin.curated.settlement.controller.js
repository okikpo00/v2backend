'use strict';

const Service = require('../services/curated.settlement.service');

exports.settle = async (req, res) => {

  try {

    const { questionId, outcome } = req.body;

    await Service.settleQuestion({
      questionId,
      outcome,
      isVoid: false
    });

    res.json({ success: true });

  } catch (e) {

    res.status(400).json({
      success: false,
      message: e.message
    });

  }

};


exports.void = async (req, res) => {

  try {

    const { questionId } = req.body;

    await Service.settleQuestion({
      questionId,
      isVoid: true
    });

    res.json({ success: true });

  } catch (e) {

    res.status(400).json({
      success: false,
      message: e.message
    });

  }

};