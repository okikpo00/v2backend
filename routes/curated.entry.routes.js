'use strict';

const router = require('express').Router();
const { requireAuth } = require('../middlewares/auth.guard');
const requireEmailVerified =
  require('../middlewares/email.verified.guard');
const C = require('../controllers/curated.entry.controller');
const DraftController =
require('../controllers/curated.draft.controller');

router.post(
  '/curated/entry',
  requireAuth,
  requireEmailVerified,
  C.place
);

router.post(
  '/curated/draft',
  requireAuth,
  DraftController.save
);

router.get(
  '/curated/draft',
  requireAuth,
  DraftController.get
);

router.delete(
  '/curated/draft',
  requireAuth,
  DraftController.clear
);

module.exports = router;
