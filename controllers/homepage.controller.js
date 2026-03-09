'use strict';

const Service = require('../services/homepage.service');

exports.getHomepage = async (req,res)=>{

  try{

    const data =
      await Service.getHomepage();

    res.json({
      success:true,
      data
    });

  }
  catch(err){

    console.error('[Homepage Error]', err);

    res.status(500).json({
      success:false,
      message:'SERVER_ERROR'
    });

  }

};