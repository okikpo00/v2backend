'use strict';

const express = require('express');
const router = express.Router();

const {requireAuth} = require('../middlewares/auth.guard');
const ProfileController = require('../controllers/user.profile.controller');

/* =========================
   PROFILE ROUTES
========================= */

router.get(
  '/profile',
  requireAuth,
  ProfileController.get
);

router.put(
  '/profile',
  requireAuth,
  ProfileController.update
);

router.put(
  '/avatar',
  requireAuth,
  ProfileController.updateAvatar
);

module.exports = router;
