'use strict';

const Service =
require('../services/admin.billboard.service');

exports.create = async (req,res)=>{

  try{

    const data =
    await Service.create({

      ...req.body,
      adminId:req.admin.adminId,
      ip:req.ip,
      userAgent:req.headers['user-agent']

    });

    res.json({success:true,data});

  }catch(e){

    res.status(400).json({
      success:false,
      message:e.message
    });

  }

};

exports.list = async (req,res)=>{

  try{

    const data =
    await Service.list();

    res.json({success:true,data});

  }catch(e){

    res.status(400).json({
      success:false,
      message:e.message
    });

  }

};

exports.toggle = async (req,res)=>{

  await Service.toggle({

    id:req.params.id,
    adminId:req.admin.adminId,
    ip:req.ip,
    userAgent:req.headers['user-agent']

  });

  res.json({success:true});

};

exports.delete = async (req,res)=>{

  await Service.delete({

    id:req.params.id,
    adminId:req.admin.adminId,
    ip:req.ip,
    userAgent:req.headers['user-agent']

  });

  res.json({success:true});

};
