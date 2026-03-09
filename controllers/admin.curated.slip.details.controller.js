'use strict';

const Service =
require('../services/admin.curated.slip.details.service');


/* =========================================================
   GET SLIP DETAILS
========================================================= */
exports.getDetails = async (req, res) => {

  try {

    const result =
      await Service.getDetails({
        uuid: req.params.uuid
      });

    res.json({
      success: true,
      data: result
    });

  }
  catch (err) {

    console.error(
      '[ADMIN_SLIP_DETAILS_ERROR]',
      err
    );

    res.status(400).json({
      success: false,
      message: err.message
    });

  }

};
