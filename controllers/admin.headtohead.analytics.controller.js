'use strict';

const Service =
require('../services/admin.headtohead.analytics.service');

exports.questionDetails = async (req, res) => {

  try {

    const id = Number(req.params.id);

    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'invalid question id'
      });
    }

    const data =
      await Service.getQuestionDetails({
        questionId: id
      });

    res.json({
      success: true,
      data
    });

  } catch (err) {

    if (err.code === 'QUESTION_NOT_FOUND') {
      return res.status(404).json({
        success: false,
        message: 'QUESTION_NOT_FOUND'
      });
    }

    console.error('[H2H_ADMIN_ANALYTICS_ERROR]', err);

    res.status(500).json({
      success: false,
      message: 'internal_error'
    });

  }

};