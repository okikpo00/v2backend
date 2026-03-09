'use strict';

const Service =
  require('../services/admin.curated.title.template.service');


/* =========================================================
   LIST
========================================================= */
exports.list = async (req, res) => {

  try {

    const { category } = req.query;

    const data = await Service.list({
      category
    });

    res.json({
      success: true,
      data
    });

  }
  catch (err) {

    console.error('[TITLE_TEMPLATE_LIST_ERROR]', err);

    res.status(400).json({
      success: false,
      message: err.message
    });

  }

};


/* =========================================================
   CREATE
========================================================= */
exports.create = async (req, res) => {

  try {

    const adminId = req.admin.adminId;
    const actorRole = req.admin.role;

    const { title, category } = req.body;

    const data = await Service.create({

      title,
      category,

      adminId,
      actorRole,

      ip: req.ip,
      userAgent: req.headers['user-agent']

    });

    res.json({
      success: true,
      data
    });

  }
  catch (err) {

    console.error('[TITLE_TEMPLATE_CREATE_ERROR]', err);

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

    const adminId = req.admin.adminId;
    const actorRole = req.admin.role;

    await Service.delete({

      id: req.params.id,

      adminId,
      actorRole,

      ip: req.ip,
      userAgent: req.headers['user-agent']

    });

    res.json({
      success: true
    });

  }
  catch (err) {

    console.error('[TITLE_TEMPLATE_DELETE_ERROR]', err);

    res.status(400).json({
      success: false,
      message: err.message
    });

  }

};
