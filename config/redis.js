'use strict';

const Redis = require('ioredis');
const env = require('./env');

let redis = null;

/* ======================================================
   CREATE REDIS CONNECTION (TLS + USERNAME SAFE)
====================================================== */

function createRedis() {

  if (!env.REDIS_HOST) {
    console.warn('[REDIS] disabled (no host)');
    return null;
  }

  const client = new Redis({
    host: env.REDIS_HOST,

    port: Number(env.REDIS_PORT),

    username: env.REDIS_USERNAME || 'default',

    password: env.REDIS_PASSWORD,

    tls: {
      rejectUnauthorized: false
    },

    maxRetriesPerRequest: null,

    enableOfflineQueue: false,

    lazyConnect: true,

    connectTimeout: 10000,

    retryStrategy(times) {

      const delay = Math.min(times * 200, 2000);

      console.log(`[REDIS] retry attempt ${times}`);

      return delay;
    }
  });

  client.on('connect', () => {
    console.log('[REDIS] connecting...');
  });

  client.on('ready', () => {
    console.log('[REDIS] ready');
  });

  client.on('error', (err) => {
    console.error('[REDIS] error:', err.message);
  });

  client.on('close', () => {
    console.warn('[REDIS] connection closed');
  });

  return client;
}

redis = createRedis();

/* ======================================================
   HEALTH CHECK
====================================================== */

function isRedisAvailable() {

  return redis && redis.status === 'ready';
}

module.exports = {

  redis,

  isRedisAvailable
};