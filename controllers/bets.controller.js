'use strict';

const Service = require('../services/bets.service');

exports.active = async (req, res) => {
  try {
    const data = await Service.getActiveBets({
      userId: req.auth.userId
    });

    return res.json({
      success: true,
      data
    });
  } catch (err) {
    console.error('[BETS_ACTIVE_ERROR]', err);
    return res.status(400).json({
      success: false,
      message: err.message
    });
  }
};

exports.settled = async (req, res) => {
  try {
    const data = await Service.getSettledBets({
      userId: req.auth.userId
    });

    return res.json({
      success: true,
      data
    });
  } catch (err) {
    console.error('[BETS_SETTLED_ERROR]', err);
    return res.status(400).json({
      success: false,
      message: err.message
    });
  }
};
