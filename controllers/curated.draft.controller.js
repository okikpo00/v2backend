'use strict';

const Service = require('../services/curated.draft.service');

exports.save = async (req, res) => {
  try {

    await Service.save({
      userId: req.auth.userId,
      stake: req.body.stake,
      entries: req.body.entries
    });

    res.json({ success: true });

  } catch (e) {

    res.status(400).json({
      success: false,
      message: e.code || e.message
    });

  }
};

exports.get = async (req, res) => {
  try {

    const data = await Service.get({
      userId: req.auth.userId
    });

    res.json({
      success: true,
      data
    });

  } catch (e) {

    res.status(400).json({
      success: false,
      message: e.code || e.message
    });

  }
};

exports.clear = async (req, res) => {
  try {

    await Service.clear({
      userId: req.auth.userId
    });

    res.json({ success: true });

  } catch (e) {

    res.status(400).json({
      success: false,
      message: e.code || e.message
    });

  }
};