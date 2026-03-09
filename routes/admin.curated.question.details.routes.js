'use strict';

const router = require('express').Router();

const Controller =
  require('../controllers/admin.curated.question.details.controller');

const requireAdminAuth =
  require('../middlewares/admin.auth.guard');


router.get(
  '/:id/details',
  requireAdminAuth,
  Controller.getDetails
);


module.exports = router;
