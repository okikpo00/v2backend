'use strict';

const { redis, isRedisAvailable } = require('../config/redis');

/* =========================================
   GET CACHE
========================================= */
exports.get = async (key) => {

  try {

    if (!isRedisAvailable()) return null;

    const data = await redis.get(key);

    if (!data) return null;

    return JSON.parse(data);

  }
  catch (err) {

    console.error('[CACHE GET ERROR]', err.message);

    return null;
  }
};

/* =========================================
   SET CACHE
========================================= */
exports.set = async (key, value, ttlSeconds = 60) => {

  try {

    if (!isRedisAvailable()) return;

    await redis.set(
      key,
      JSON.stringify(value),
      'EX',
      ttlSeconds
    );

  }
  catch (err) {

    console.error('[CACHE SET ERROR]', err.message);
  }
};

/* =========================================
   DELETE CACHE
========================================= */
exports.del = async (key) => {

  try {

    if (!isRedisAvailable()) return;

    await redis.del(key);

  }
  catch (err) {

    console.error('[CACHE DEL ERROR]', err.message);
  }
};

/* =========================================
   CLEAR BY PREFIX
========================================= */
exports.delByPrefix = async (prefix) => {

  try {

    if (!isRedisAvailable()) return;

    const keys = await redis.keys(`${prefix}*`);

    if (keys.length > 0) {

      await redis.del(keys);
    }

  }
  catch (err) {

    console.error('[CACHE PREFIX DEL ERROR]', err.message);
  }
};