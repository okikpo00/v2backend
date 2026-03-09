'use strict';

const router = require('express').Router();
const C = require('../controllers/admin.curated.questions.controller');
const  requireAdminAuth  = require('../middlewares/admin.auth.guard');
const OddsController = require('../controllers/admin.odds.calculator.controller');



router.get('/', requireAdminAuth, C.list);

router.post('/', requireAdminAuth, C.create);
router.post('/:id/publish', requireAdminAuth, C.publish);
router.post('/:id/lock', requireAdminAuth, C.lock);

router.put('/:id', requireAdminAuth, C.updateDraft);
router.delete('/:id', requireAdminAuth, C.deleteDraft);


router.post(
  '/odds/calculate',
  requireAdminAuth,
  OddsController.calculate
);

module.exports = router;
