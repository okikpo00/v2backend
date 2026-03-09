'use strict';

/**
 * =========================================================
 * FLUTTERWAVE SERVICE
 * =========================================================
 * - Isolated provider integration
 * - Supports test/live switching
 * - Centralized headers & error handling
 * =========================================================
 */

const axios = require('axios');
const env = require('../config/env');

const BASE_URL = 'https://api.flutterwave.com/v3';

function getSecretKey() {
  if (env.FLW_ENV === 'live') {
    if (!env.FLW_SECRET_KEY_LIVE) {
      throw new Error('FLW_SECRET_KEY_LIVE missing');
    }
    return env.FLW_SECRET_KEY_LIVE;
  }

  if (!env.FLW_SECRET_KEY_TEST) {
    throw new Error('FLW_SECRET_KEY_TEST missing');
  }
  return env.FLW_SECRET_KEY_TEST;
}

async function request(method, path, payload = null) {
  try {
    const res = await axios({
      method,
      url: `${BASE_URL}${path}`,
      data: payload,
      headers: {
        Authorization: `Bearer ${getSecretKey()}`,
        'Content-Type': 'application/json'
      },
      timeout: 20000
    });

    return res.data;
  } catch (err) {
    console.error('[FLUTTERWAVE_API_ERROR]', {
      path,
      response: err?.response?.data,
      message: err.message
    });
    throw new Error('PAYMENT_PROVIDER_ERROR');
  }
}

async function initPayment(payload) {
  return request('post', '/payments', payload);
}

module.exports = {
  initPayment
};
