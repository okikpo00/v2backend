'use strict';

const Service = require('../services/admin.odds.calculator.service');

/**
 * ADMIN — Odds Calculator
 * Input:
 * {
 *   probability_yes: 60   // percentage
 * }
 */
exports.calculate = async (req, res) => {
  try {
    const { probability_yes } = req.body;

    if (probability_yes === undefined) {
      return res.status(400).json({
        success: false,
        message: 'probability_yes is required (0-100)'
      });
    }

    const result = await Service.calculate({
      probability_yes
    });

    return res.json({
      success: true,
      data: result
    });

  } catch (err) {
    return res.status(400).json({
      success: false,
      message: err.message
    });
  }
};