'use strict';

const express = require('express');
const controller = require('../controllers/admin.curated.settlement.controller');

const router = express.Router();

router.post('/settle', controller.settle);
router.post('/void', controller.void);

module.exports = router;
