'use strict';

const Service = require('../services/admin.dashboard.service');

exports.summary = async (req,res) => {

  try {

    const data = await Service.getSummary();

    res.json({
      success: true,
      data
    });

  }
  catch(err){

    console.error('[ADMIN_DASHBOARD_ERROR]',err);

    res.status(500).json({
      success:false,
      message:'DASHBOARD_ERROR'
    });

  }

};