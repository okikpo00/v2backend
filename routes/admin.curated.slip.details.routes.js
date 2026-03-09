'use strict';

const router =
require('express').Router();

const Controller =
require('../controllers/admin.curated.slip.details.controller');

const requireAdminAuth =
require('../middlewares/admin.auth.guard');


/* =========================================================
   GET DETAILS
========================================================= */

router.get(
  '/:uuid',
  requireAdminAuth,
  Controller.getDetails
);


module.exports = router;
