'use strict';

const router = require('express').Router();

const C = require('../controllers/homepage.controller');

router.get('/', C.getHomepage);

module.exports = router;
