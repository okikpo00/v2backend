'use strict';

/**
 * =========================================================
 * FLUTTERWAVE SERVICE
 * =========================================================
 * - Isolated provider integration
 * - Automatic test/live detection
 * - Centralized request handler
 * - Consistent error handling
 * =========================================================
 */

const axios = require('axios');
const env = require('../config/env');

const BASE_URL = 'https://api.flutterwave.com/v3';

/* =========================================================
   GET SECRET KEY
========================================================= */
function getSecretKey() {

  const key =
    env.FLW_SECRET_KEY_LIVE ||
    env.FLW_SECRET_KEY_TEST ||
    env.FLW_SECRET_KEY;

  if (!key) {
    throw new Error('FLUTTERWAVE_SECRET_KEY_MISSING');
  }

  return key;

}

/* =========================================================
   SAFE FLUTTERWAVE REQUEST
========================================================= */
async function request(method, path, payload = null) {

  const secretKey = getSecretKey();

  try {

    const response = await axios({

      method,

      url: `${BASE_URL}${path}`,

      data: payload,

      headers: {
        Authorization: `Bearer ${secretKey}`,
        'Content-Type': 'application/json'
      },

      timeout: 20000

    });

    return response.data;

  } catch (err) {

    console.error('[FLUTTERWAVE_API_ERROR]', {

      path,

      status: err?.response?.status,

      response: err?.response?.data,

      message: err.message

    });

    const e = new Error('PAYMENT_PROVIDER_ERROR');
    e.code = 'PAYMENT_PROVIDER_ERROR';
    throw e;

  }

}

/* =========================================================
   INITIALIZE PAYMENT
========================================================= */
async function initPayment(payload) {

  if (!payload) {
    const e = new Error('INVALID_PAYMENT_PAYLOAD');
    e.code = 'INVALID_PAYMENT_PAYLOAD';
    throw e;
  }

  return request(
    'post',
    '/payments',
    payload
  );

}

/* =========================================================
   VERIFY TRANSACTION
========================================================= */
async function verifyTransaction(transactionId) {

  if (!transactionId) {
    const e = new Error('INVALID_TRANSACTION_ID');
    e.code = 'INVALID_TRANSACTION_ID';
    throw e;
  }

  return request(
    'get',
    `/transactions/${transactionId}/verify`
  );

}

module.exports = {

  initPayment,

  verifyTransaction

};