'use strict';

const express = require('express');
const router = express.Router();

const FlutterwaveWebhookController =
  require('../controllers/flutterwave.webhook.controller');

// Flutterwave calls THIS
router.post(
  '/flutterwave',
  FlutterwaveWebhookController.handle
);

module.exports = router;
