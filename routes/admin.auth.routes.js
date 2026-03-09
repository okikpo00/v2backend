'use strict';

const express = require('express');
const router = express.Router();

const adminLoginLimiter = require('../middlewares/adminRateLimit');
const AdminAuthController = require('../controllers/admin.auth.controller');

router.post('/login', adminLoginLimiter, AdminAuthController.login);

module.exports = router;
