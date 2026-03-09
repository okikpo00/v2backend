'use strict';

const dotenv = require('dotenv');
dotenv.config();

function must(key) {
  if (!process.env[key]) {
    throw new Error(`Missing required env var: ${key}`);
  }
  return process.env[key];
}

module.exports = {
  NODE_ENV: process.env.NODE_ENV || 'development',

  PORT: Number(process.env.PORT || 4000),

  DB_HOST: must('DB_HOST'),
  DB_USER: must('DB_USER'),
  DB_PASSWORD: must('DB_PASSWORD'),
  DB_NAME: must('DB_NAME'),

  JWT_ACCESS_SECRET: must('JWT_ACCESS_SECRET'),
  JWT_REFRESH_SECRET: must('JWT_REFRESH_SECRET'),
REFRESH_TOKEN_TTL: process.env.REFRESH_TOKEN_TTL || '30d',
  ACCESS_TOKEN_TTL: process.env.ACCESS_TOKEN_TTL || '15m',

 ADMIN_JWT_SECRET: process.env.ADMIN_JWT_SECRET,
  ADMIN_JWT_EXPIRES_IN: process.env.ADMIN_JWT_EXPIRES_IN || '15m',
REDIS_HOST: process.env.REDIS_HOST,
REDIS_PORT: process.env.REDIS_PORT,
REDIS_PASSWORD: process.env.REDIS_PASSWORD,
REDIS_KEY_PREFIX: process.env.REDIS_KEY_PREFIX,
REDIS_USERNAME: process.env.REDIS_USERNAME,
  REDIS_URL: must('REDIS_URL'),
  FRONTEND_URL: must('FRONTEND_URL'),
VITE_API_BASE_URL: must('VITE_API_BASE_URL'),
  FLW_MODE: process.env.FLW_MODE || 'test',
  FLW_SECRET_KEY_TEST: must('FLW_SECRET_KEY_TEST'),
  FLW_SECRET_KEY_LIVE: process.env.FLW_SECRET_KEY_LIVE || null,
  FLW_WEBHOOK_SECRET: process.env.FLW_WEBHOOK_SECRET,
};
