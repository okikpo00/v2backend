'use strict';

const express = require('express');
const router = express.Router();

const  {requireAuth} = require('../middlewares/auth.guard');
const WalletTxController =
  require('../controllers/wallet.transaction.controller');

router.get(
  '/transactions',
  requireAuth,
  WalletTxController.listMine
);

module.exports = router;
