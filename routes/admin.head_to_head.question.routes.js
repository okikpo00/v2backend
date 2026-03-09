'use strict';

const router = require('express').Router();

const Controller =
require('../controllers/admin.head_to_head.question.controller');
const C =
require('../controllers/admin.headtohead.analytics.controller');



const requireAdminAuth =
require('../middlewares/admin.auth.guard');


router.post(
  '/',
  requireAdminAuth,
  Controller.create
);


/* LIST */
router.get(
"/",
requireAdminAuth,
Controller.list
);


/* UPDATE DRAFT */
router.put(
"/:id",
requireAdminAuth,
Controller.updateDraft
);


/* DELETE DRAFT */
router.delete(
"/:id",
requireAdminAuth,
Controller.deleteDraft
);


router.post(
  '/:id/publish',
  requireAdminAuth,
  Controller.publish
);

router.post(
  '/:id/lock',
  requireAdminAuth,
  Controller.lock
);

router.post(
  '/:id/settle',
  requireAdminAuth,
  Controller.settle
);

router.post(
  '/:id/void',
  requireAdminAuth,
  Controller.void
);

router.get(
  '/:id/details',
  requireAdminAuth,
  C.questionDetails
);


module.exports = router;
