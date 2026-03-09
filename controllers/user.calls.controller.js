'use strict';

const Service = require('../services/user.calls.service');

/* =========================================================
   CURATED CALLS
========================================================= */
exports.curatedCalls = async (req, res) => {

  try {

    const data = await Service.getCuratedCalls({
      userId: req.auth.userId
    });

    res.json({
      success: true,
      data
    });

  } catch (err) {

    console.error('[USER_CURATED_CALLS_ERROR]', err);

    res.status(500).json({
      success: false,
      message: 'Failed to load curated calls'
    });

  }

};


/* =========================================================
   DUEL CALLS
========================================================= */
exports.duelCalls = async (req, res) => {

  try {

    const data = await Service.getDuelCalls({
      userId: req.auth.userId
    });

    res.json({
      success: true,
      data
    });

  } catch (err) {

    console.error('[USER_DUEL_CALLS_ERROR]', err);

    res.status(500).json({
      success: false,
      message: 'Failed to load duel calls'
    });

  }

};

/* =========================================================
   CURATED SLIP DETAIL
========================================================= */
exports.curatedSlipDetail = async (req, res) => {

  try {

    const data = await Service.getCuratedSlipDetail({
      userId: req.auth.userId,
      uuid: req.params.uuid
    });

    res.json({
      success: true,
      data
    });

  } catch (err) {

    if (err.code === 'NOT_FOUND') {
      return res.status(404).json({
        success: false,
        message: 'Slip not found'
      });
    }

    console.error('[CURATED_SLIP_DETAIL_ERROR]', err);

    res.status(500).json({
      success: false,
      message: 'Failed to load slip'
    });

  }

};


/* =========================================================
   DUEL DETAIL
========================================================= */
exports.duelDetail = async (req, res) => {

  try {

    const data = await Service.getDuelDetail({
      userId: req.auth.userId,
      uuid: req.params.uuid
    });

    res.json({
      success: true,
      data
    });

  } catch (err) {

    if (err.code === 'NOT_FOUND') {
      return res.status(404).json({
        success: false,
        message: 'Duel not found'
      });
    }

    console.error('[DUEL_DETAIL_ERROR]', err);

    res.status(500).json({
      success: false,
      message: 'Failed to load duel'
    });

  }

};