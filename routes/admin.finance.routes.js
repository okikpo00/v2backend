'use strict';

const router = require('express').Router();
const Controller = require('../controllers/admin.finance.controller');
const requireAdminAuth = require('../middlewares/admin.auth.guard');

router.get('/summary', requireAdminAuth, Controller.summary);

router.post('/expenses', requireAdminAuth, Controller.createExpense);

router.get('/expenses', requireAdminAuth, Controller.listExpenses);

router.delete('/expenses/:id', requireAdminAuth, Controller.deleteExpense);

module.exports = router;