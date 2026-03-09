'use strict';

const router = require('express').Router();
const { requireAuth } = require('../middlewares/auth.guard');
const C = require('../controllers/bets.controller');

/**
 * USER BETS
 * - Active
 * - Settled
 */
router.get('/bets/active', requireAuth, C.active);
router.get('/bets/settled', requireAuth, C.settled);

module.exports = router;
