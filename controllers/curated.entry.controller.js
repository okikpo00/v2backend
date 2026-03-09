'use strict';

const Service = require('../services/curated.entry.service');

exports.place = async (req, res) => {
  try {

    const { stake, entries } = req.body || {};

    if (!stake || !Array.isArray(entries) || entries.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'INVALID_PAYLOAD'
      });
    }

    const result = await Service.place({
      userId: req.auth.userId,
      stake: Number(stake),
      entries,
      ip: req.ip || null,
      user_agent: req.headers['user-agent'] || null
    });

    return res.json({
      success: true,
      data: result
    });

  } catch (e) {

    console.error('[CURATED_ENTRY_ERROR]', e);

    return res.status(400).json({
      success: false,
      message: e.code || 'ENTRY_FAILED'
    });

  }
};