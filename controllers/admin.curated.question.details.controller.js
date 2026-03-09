'use strict';

const Service =
  require('../services/admin.curated.question.details.service');

exports.getDetails = async (req, res) => {

  try {

    const questionId =
      Number(req.params.id);

    if (!questionId) {
      return res.status(400).json({
        success: false,
        message: 'Invalid question id'
      });
    }

    const result =
      await Service.getDetails({
        questionId
      });

    res.json({
      success: true,
      data: result
    });

  }
  catch (err) {

    console.error(
      '[ADMIN_CURATED_DETAILS_ERROR]',
      err
    );

    res.status(400).json({
      success: false,
      message: err.message
    });

  }

};
