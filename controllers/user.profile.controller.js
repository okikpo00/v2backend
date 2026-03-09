'use strict';

/**
 * =========================================================
 * USER PROFILE CONTROLLER
 * =========================================================
 */

const ProfileService = require('../services/user.profile.service');

/* =========================
   GET PROFILE
========================= */

exports.get = async (req, res) => {
  try {
    const data = await ProfileService.getProfile({
      userId: req.auth.userId
    });

    return res.json({
      success: true,
      data
    });
  } catch (err) {
    console.error('[USER_PROFILE_GET_ERROR]', err);

    return res.status(400).json({
      success: false,
      code: err.code || 'PROFILE_FETCH_FAILED',
      message: err.message
    });
  }
};

/* =========================
   UPDATE PROFILE
========================= */

exports.update = async (req, res) => {
  try {
    const { display_name, avatar_seed } = req.body;

    await ProfileService.updateProfile({
      userId: req.auth.userId,
      display_name,
      avatar_seed
    });

    return res.json({
      success: true
    });
  } catch (err) {
    console.error('[USER_PROFILE_UPDATE_ERROR]', err);

    return res.status(400).json({
      success: false,
      code: err.code || 'PROFILE_UPDATE_FAILED',
      message: err.message
    });
  }
};

/* =========================
   UPDATE AVATAR
========================= */

exports.updateAvatar = async (req, res) => {
  try {
    const { avatar_seed } = req.body;

    await ProfileService.updateAvatar({
      userId: req.auth.userId,
      avatar_seed
    });

    return res.json({
      success: true
    });
  } catch (err) {
    console.error('[USER_AVATAR_UPDATE_ERROR]', err);

    return res.status(400).json({
      success: false,
      code: err.code || 'AVATAR_UPDATE_FAILED',
      message: err.message
    });
  }
};
