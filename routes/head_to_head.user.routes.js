'use strict';

const router = require('express').Router();

const Controller =
  require('../controllers/head_to_head.user.controller');

const { requireAuth } =
  require('../middlewares/auth.guard');


/* =========================================================
   CREATE CHALLENGE
========================================================= */

router.get(
  '/questions',
  requireAuth,
  Controller.listQuestions
);

router.post(
  '/challenge/create',
  requireAuth,
  Controller.create
);


/* =========================================================
   ACCEPT CHALLENGE
========================================================= */
router.post(
  '/challenge/accept',
  requireAuth,
  Controller.accept
);

router.post(
  '/challenge/cancel',
  requireAuth,
  Controller.cancel
);
/* =========================================================
   LIST USER CHALLENGES
========================================================= */
router.get(
  '/challenge/my',
  requireAuth,
  Controller.list
);
/* =========================================================
   GET CHALLENGE DETAILS
========================================================= */
router.get(
  '/challenge/:code',
  requireAuth,
  Controller.details
);



router.get(
  '/questions',
  requireAuth,
  Controller.listQuestions
);


module.exports = router;