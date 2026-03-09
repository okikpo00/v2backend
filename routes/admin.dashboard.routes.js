'use strict';

const router = require('express').Router();
const Controller = require('../controllers/admin.dashboard.controller');
const requireAdminAuth = require('../middlewares/admin.auth.guard');

router.get(
  '/summary',
  requireAdminAuth,
  Controller.summary
);

module.exports = router;