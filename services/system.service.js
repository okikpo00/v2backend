'use strict';

const pool = require('../config/db');
const { redis, isRedisAvailable } = require('../config/redis');

const CACHE_KEY = 'system:settings:global';
const CACHE_TTL = 600; // seconds (10 mins)

/* =========================
   INTERNAL HELPERS
========================= */

function parseValue(type, value, fallback) {
  try {
    if (value === null || value === undefined) return fallback;

    switch (type) {
      case 'boolean':
        return value === true || value === 'true' || value === '1';
      case 'int':
        return parseInt(value, 10);
      case 'decimal':
        return Number(value);
      case 'json':
        return typeof value === 'string' ? JSON.parse(value) : value;
      default:
        return value;
    }
  } catch {
    return fallback;
  }
}

function isOverrideExpired(expiresAt) {
  if (!expiresAt) return false;
  return new Date(expiresAt) <= new Date();
}

/* =========================
   LOAD FROM DB
========================= */

async function loadFromDB() {
  const [rows] = await pool.query(
    `SELECT
       \`key\`,
       type,
       value,
       default_value,
       override_expires_at
     FROM system_settings
     WHERE scope = 'global'`
  );

  const settings = {};

  for (const row of rows) {
    const fallback = parseValue(row.type, row.default_value, null);

    const effectiveValue = isOverrideExpired(row.override_expires_at)
      ? fallback
      : parseValue(row.type, row.value, fallback);

    settings[row.key] = effectiveValue;
  }

  return settings;
}

/* =========================
   CACHE MANAGEMENT
========================= */

async function refreshCache() {
  console.log('[SYSTEM] Refreshing system cache');

  const settings = await loadFromDB();

  if (isRedisAvailable()) {
    await redis.set(
      CACHE_KEY,
      JSON.stringify(settings),
      'EX',
      CACHE_TTL
    );
  }

  return settings;
}

async function getAllSettings() {
  if (isRedisAvailable()) {
    const cached = await redis.get(CACHE_KEY);
    if (cached) {
      return JSON.parse(cached);
    }
  }

  return refreshCache();
}

/* =========================
   PUBLIC API
========================= */

async function get(key) {
  const settings = await getAllSettings();

  if (!(key in settings)) {
    console.warn('[SYSTEM] Missing key:', key);
    return null;
  }

  return settings[key];
}

async function getBoolean(key) {
  const val = await get(key);
  return !!val;
}

async function getDecimal(key) {
  const val = await get(key);
  return Number(val || 0);
}

async function getInt(key) {
  const val = await get(key);
  return parseInt(val || 0, 10);
}

async function getJSON(key) {
  const val = await get(key);
  return val || {};
}

async function assertEnabled(key) {
  const enabled = await getBoolean(key);
  if (!enabled) {
    const err = new Error('SYSTEM_DISABLED');
    err.code = 'SYSTEM_DISABLED';
    err.meta = { key };
    throw err;
  }
}

module.exports = {
  get,
  getBoolean,
  getDecimal,
  getInt,
  getJSON,
  assertEnabled,
  refreshCache
};
