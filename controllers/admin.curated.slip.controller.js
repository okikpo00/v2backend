'use strict';

const Service =
require('../services/admin.curated.slip.service');


/* =========================================================
   LIST SLIPS
========================================================= */
exports.list = async (req, res) => {

  try {

    const result =
      await Service.list({

        status: req.query.status,
        user_id: req.query.user_id,
        uuid: req.query.uuid,

        date_from: req.query.date_from,
        date_to: req.query.date_to,

        min_stake: req.query.min_stake,
        max_stake: req.query.max_stake,

        is_accumulator:
          req.query.is_accumulator,

        page: req.query.page,
        limit: req.query.limit

      });


    res.json({
      success: true,
      data: result
    });

  }
  catch (err) {

    console.error(
      '[ADMIN_SLIP_LIST_ERROR]',
      err
    );

    res.status(400).json({
      success: false,
      message: err.message
    });

  }

};
