'use strict';

/**
 * =========================================================
 * USER PROFILE SERVICE
 * =========================================================
 * - Read user profile
 * - Update allowed fields only
 * - Avatar seed management
 * - Strict validation
 * =========================================================
 */

const pool = require('../config/db');

function profileError(code, message) {
  const err = new Error(message || code);
  err.code = code;
  return err;
}

/* =========================
   VALIDATION HELPERS
========================= */

function isValidAvatarSeed(seed) {
  return (
    typeof seed === 'string' &&
    seed.length >= 3 &&
    seed.length <= 32 &&
    /^[a-zA-Z0-9-_]+$/.test(seed)
  );
}

/* =========================
   READ PROFILE
========================= */

exports.getProfile = async ({ userId }) => {
  const [[user]] = await pool.query(
    `SELECT
       uuid,
       username,
       display_name,
       email,
       email_verified_at,
       avatar_seed,
       avatar_style,
       country_code,
       created_at
     FROM users
     WHERE id = ?
     LIMIT 1`,
    [userId]
  );

  if (!user) {
    throw profileError('USER_NOT_FOUND');
  }

  return {
    uuid: user.uuid,
    username: user.username,
    display_name: user.display_name,
    email: user.email,
    email_verified: !!user.email_verified_at,
    avatar_seed: user.avatar_seed,
    avatar_style: user.avatar_style || 'avataaars',
    country_code: user.country_code,
    joined_at: user.created_at
  };
};

/* =========================
   UPDATE PROFILE
========================= */

exports.updateProfile = async ({
  userId,
  display_name,
  avatar_seed
}) => {
  const updates = [];
  const params = [];

  if (display_name !== undefined) {
    if (
      typeof display_name !== 'string' ||
      display_name.trim().length < 2 ||
      display_name.trim().length > 100
    ) {
      throw profileError('INVALID_DISPLAY_NAME');
    }

    updates.push('display_name = ?');
    params.push(display_name.trim());
  }

  if (avatar_seed !== undefined) {
    if (!isValidAvatarSeed(avatar_seed)) {
      throw profileError('INVALID_AVATAR_SEED');
    }

    updates.push('avatar_seed = ?');
    params.push(avatar_seed);
  }

  if (updates.length === 0) {
    throw profileError('NO_CHANGES');
  }

  await pool.query(
    `UPDATE users
     SET ${updates.join(', ')}, updated_at = NOW()
     WHERE id = ?`,
    [...params, userId]
  );

  return { success: true };
};

/* =========================
   UPDATE AVATAR ONLY
========================= */

exports.updateAvatar = async ({ userId, avatar_seed }) => {
  if (!isValidAvatarSeed(avatar_seed)) {
    throw profileError('INVALID_AVATAR_SEED');
  }

  await pool.query(
    `UPDATE users
     SET avatar_seed = ?, updated_at = NOW()
     WHERE id = ?`,
    [avatar_seed, userId]
  );

  return { success: true };
};
