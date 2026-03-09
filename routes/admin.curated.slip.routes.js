'use strict';

const router =
require('express').Router();

const Controller =
require('../controllers/admin.curated.slip.controller');

const requireAdminAuth =
require('../middlewares/admin.auth.guard');


/* =========================================================
   LIST SLIPS
========================================================= */
router.get(
  '/',
  requireAdminAuth,
  Controller.list
);


module.exports = router;
