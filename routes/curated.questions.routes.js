'use strict';

const router = require('express').Router();
const C = require('../controllers/curated.questions.controller');
const CallsController = require('../controllers/user.calls.controller');
const { requireAuth } = require('../middlewares/auth.guard');

/**
 * PUBLIC USER READ APIs
 */

// List questions 
router.get('/curated/questions', C.list);

// Single question by UUID
router.get('/curated/questions/:uuid', C.getOne);


router.get('/user/curated/calls', requireAuth, CallsController.curatedCalls);
router.get('/user/duels/calls', requireAuth, CallsController.duelCalls);
router.get('/user/curated/slip/:uuid', requireAuth, CallsController.curatedSlipDetail);
router.get('/user/duels/:uuid', requireAuth, CallsController.duelDetail);

module.exports = router;
