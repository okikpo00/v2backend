'use strict';

const Service =
require('../services/admin.fake.activity.service');

exports.create = async (req,res)=>{

  const data =
  await Service.create({

    ...req.body,
    adminId:req.admin.adminId

  });

  res.json({success:true,data});

};



/* =========================================================
   LIST
========================================================= */
exports.list = async (req, res) => {

  try {

    const data = await Service.list();

    res.json({
      success: true,
      data
    });

  }
  catch (err) {

    res.status(400).json({
      success: false,
      message: err.message
    });

  }

};


/* =========================================================
   DELETE
========================================================= */
exports.delete = async (req, res) => {

  try {

    await Service.delete({

      id: req.params.id,

      adminId: req.admin.adminId,

      actorRole: req.admin.role,

      ip: req.ip,

      userAgent: req.headers['user-agent']

    });

    res.json({
      success: true
    });

  }
  catch (err) {

    res.status(400).json({
      success: false,
      message: err.message
    });

  }

};