'use strict';

const router = require('express').Router();

const Controller =
  require('../controllers/admin.curated.title.template.controller');

const requireAdminAuth =
  require('../middlewares/admin.auth.guard');


/* =========================================================
   ROUTES
========================================================= */

router.get(
  '/',
  requireAdminAuth,
  Controller.list
);

router.post(
  '/',
  requireAdminAuth,
  Controller.create
);

router.delete(
  '/:id',
  requireAdminAuth,
  Controller.delete
);

module.exports = router;
