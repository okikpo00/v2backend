'use strict';

const Service = require('../services/curated.questions.read.service');

/* =========================
   LIST QUESTIONS
========================= */
exports.list = async (req, res) => {
  try {
    const { category } = req.query;

    const data = await Service.list({
      category: category || null
    });

    return res.json({
      success: true,
      data
    });
  } catch (err) {
    console.error('[CURATED_LIST_ERROR]', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to load questions'
    });
  }
};

/* =========================
   GET SINGLE QUESTION
========================= */
exports.getOne = async (req, res) => {
  try {
    const { uuid } = req.params;

    const data = await Service.getOne({ uuid });

    if (!data) {
      return res.status(404).json({
        success: false,
        message: 'Question not found'
      });
    }

    return res.json({
      success: true,
      data
    });
  } catch (err) {
    console.error('[CURATED_GET_ONE_ERROR]', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to load question'
    });
  }
};
