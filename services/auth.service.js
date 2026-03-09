const pool = require('../config/db');
const { hashPassword, verifyPassword } = require('../utils/password.util');
const sendEmail = require('../utils/sendEmail');
const { isValidEmail } = require('../utils/email.util');

const { v4: uuidv4 } = require('uuid');
const {
  generateToken,
  hashToken,
  generateReferralCode
} = require('../utils/token.util');



/* -------------------- helpers -------------------- */
const normalizeEmail = (e) => String(e || '').trim().toLowerCase();
const normalizeUsername = (u) => String(u || '').trim().toLowerCase();

function assertStrongPassword(pw) {
  if (typeof pw !== 'string' || pw.length < 8) {
    const err = new Error('WEAK_PASSWORD');
    err.code = 'WEAK_PASSWORD';
    throw err;
  }
}

/* -------------------- audit -------------------- */
async function audit({
  user_id = null,
  actor_type = 'system',
  actor_id = null,
  action,
  target_type = null,
  target_id = null,
  ip_address = null,
  user_agent = null,
  metadata = null
}) {
  await pool.query(
    `INSERT INTO user_audit_logs
     (user_id, actor_type, actor_id, action, target_type, target_id, ip_address, user_agent, metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      user_id,
      actor_type,
      actor_id,
      action,
      target_type,
      target_id,
      ip_address,
      user_agent,
      metadata ? JSON.stringify(metadata) : null
    ]
  );
}

/* -------------------- REGISTER -------------------- */
exports.register = async ({
  first_name,
  last_name,
  username,
  email,
  password,
  country_code,
  referral_code,
  signup_ip,
  user_agent
}) => {
  console.log('[REGISTER] Incoming payload:', {
    first_name,
    last_name,
    username,
    email,
    country_code,
    referral_code,
    signup_ip
  });

  /* =========================
     HARD VALIDATION (FAIL FAST)
  ========================= */

  try {
    /* =========================
   HARD VALIDATION (FAIL FAST)
========================= */

if (!first_name || !last_name || !username || !email) {
  const err = new Error('MISSING_REQUIRED_FIELDS');
  err.code = 'MISSING_REQUIRED_FIELDS';
  throw err;
}

if (!isValidEmail(email)) {
  const err = new Error('INVALID_EMAIL');
  err.code = 'INVALID_EMAIL';
  throw err;
}

if (!password || typeof password !== 'string') {
  const err = new Error('PASSWORD_REQUIRED');
  err.code = 'PASSWORD_REQUIRED';
  throw err;
}

assertStrongPassword(password);

  } catch (err) {
    console.error('[REGISTER][VALIDATION_ERROR]', err);
    throw err;
  }

  /* =========================
     NORMALIZATION
  ========================= */

  const emailNorm = normalizeEmail(email);
  const usernameLower = normalizeUsername(username);

  const country =
    country_code && typeof country_code === 'string'
      ? country_code.toUpperCase().slice(0, 2)
      : null;

  const displayName = `${first_name} ${last_name}`.trim();

  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();
    console.log('[REGISTER] Transaction started');

    /* =========================
       DUPLICATE CHECK
    ========================= */

    const [dup] = await conn.query(
      `SELECT id, email, username_lower
       FROM users
       WHERE email = ? OR username_lower = ?
       LIMIT 1`,
      [emailNorm, usernameLower]
    );

    if (dup.length) {
      const err = new Error('DUPLICATE');
      err.code = 'DUPLICATE';
      console.error('[REGISTER][DUPLICATE]', dup[0]);
      throw err;
    }

    /* =========================
       REFERRAL HANDLING
    ========================= */

    let referredBy = null;

    if (referral_code) {
      const [ref] = await conn.query(
        `SELECT uuid
         FROM users
         WHERE referral_code = ?
         LIMIT 1`,
        [referral_code]
      );

      if (!ref.length) {
        const err = new Error('INVALID_REFERRAL');
        err.code = 'INVALID_REFERRAL';
        console.error('[REGISTER][INVALID_REFERRAL]', referral_code);
        throw err;
      }

      referredBy = ref[0].uuid;
    }

    /* =========================
       PASSWORD HASHING
    ========================= */

    const passwordHash = await hashPassword(password);
    const uuid = uuidv4();
    const newReferralCode = generateReferralCode();

    /* =========================
       USER INSERT
    ========================= */

    const [result] = await conn.query(
      `INSERT INTO users (
        uuid,
        email,
        username,
        username_lower,
        first_name,
        last_name,
        display_name,
        password_hash,
        password_updated_at,
        country_code,
        referral_code,
        referred_by,
        signup_ip
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?, ?, ?, ?)`,
      [
        uuid,
        emailNorm,
        username,
        usernameLower,
        first_name,
        last_name,
        displayName,
        passwordHash,
        country,
        newReferralCode,
        referredBy,
        signup_ip || null
      ]
    );

    const userId = result.insertId;
    console.log('[REGISTER] User created:', { userId, uuid });

    /* =========================
       EMAIL VERIFICATION TOKEN
    ========================= */

    const rawVerifyToken = generateToken();

    await conn.query(
      `INSERT INTO email_verification_tokens
       (user_id, token_hash, expires_at)
       VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 2 HOUR))`,
      [userId, hashToken(rawVerifyToken)]
    );

    console.log('[REGISTER] Email verification token created');

    await conn.commit();
    console.log('[REGISTER] Transaction committed');
// 📧 Send verification email (non-blocking)
setImmediate(async () => {
  try {
    const verifyUrl = `${process.env.FRONTEND_URL}/verify-email?token=${rawVerifyToken}`;

    await sendEmail(
      emailNorm,
      'Verify your Trebetta account',
      `
        <div style="font-family: Arial, sans-serif">
          <h2>Welcome to Trebetta 👋</h2>
          <p>Please verify your email to activate your account.</p>
          <p>
            <a href="${verifyUrl}" style="color:#fff;background:#8b0000;padding:10px 16px;text-decoration:none;border-radius:4px">
              Verify Email
            </a>
          </p>
          <p>This link expires in 2 hours.</p>
        </div>
      `
    );
  } catch (e) {
    console.warn('[REGISTER] verification email failed:', e?.message);
  }
});

    /* =========================
       AUDIT LOG (POST-COMMIT)
    ========================= */

    await audit({
      user_id: userId,
      actor_type: 'system',
      action: 'REGISTER',
      target_type: 'user',
      target_id: uuid,
      ip_address: signup_ip,
      user_agent,
      metadata: {
        email: emailNorm,
        username,
        referred_by: referredBy || null
      }
    });

    console.log('[REGISTER] Audit log written');

    return {
      userId,
      uuid,
      email: emailNorm,
      verifyToken: rawVerifyToken
    };
  } catch (err) {
    console.error('[REGISTER][ERROR]', err);

    try {
      await conn.rollback();
      console.error('[REGISTER] Transaction rolled back');
    } catch (rbErr) {
      console.error('[REGISTER][ROLLBACK_FAILED]', rbErr);
    }

    throw err;
  } finally {
    conn.release();
    console.log('[REGISTER] Connection released');
  }
};

/* =========================
   SEND / RESEND VERIFICATION
========================= */
exports.sendVerification = async ({ email, ip, user_agent }) => {
  console.log('[SEND_VERIFY_SERVICE]', email);

  const emailNorm = normalizeEmail(email);
  const [[user]] = await pool.query(
    `SELECT id, email_verified_at FROM users WHERE email = ? LIMIT 1`,
    [emailNorm]
  );

  // Silent exit for security
  if (!user || user.email_verified_at) return;

  // Invalidate previous tokens
  await pool.query(
    `UPDATE email_verification_tokens
     SET verified_at = NOW()
     WHERE user_id = ? AND verified_at IS NULL`,
    [user.id]
  );

  const raw = generateToken();

  await pool.query(
    `INSERT INTO email_verification_tokens
     (user_id, token_hash, expires_at)
     VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 2 HOUR))`,
    [user.id, hashToken(raw)]
  );

  await audit({
    user_id: user.id,
    actor_type: 'system',
    action: 'SEND_VERIFY_EMAIL',
    target_type: 'user',
    target_id: String(user.id),
    ip_address: ip,
    user_agent
  });

  console.log('[SEND_VERIFY_SERVICE] token issued');
// 📧 Send verification email
setImmediate(async () => {
  try {
    const verifyUrl = `${process.env.FRONTEND_URL}/verify-email?token=${raw}`;

    await sendEmail(
      emailNorm,
      'Verify your Trebetta email',
      `
        <div style="font-family: Arial, sans-serif">
          <p>Please verify your email to continue using Trebetta.</p>
          <p>
            <a href="${verifyUrl}">${verifyUrl}</a>
          </p>
          <p>This link expires in 2 hours.</p>
        </div>
      `
    );
  } catch (e) {
    console.warn('[SEND_VERIFY] email failed:', e?.message);
  }
});

  return raw; // email service will use this
};

/* =========================
   VERIFY EMAIL
========================= */
/* =========================
   VERIFY EMAIL + CREATE WALLET
========================= */
exports.verifyEmail = async ({ token, ip, user_agent }) => {
  console.log('[VERIFY_EMAIL_SERVICE] start');

  if (!token || typeof token !== 'string') {
    const err = new Error('INVALID_OR_EXPIRED_TOKEN');
    err.code = 'INVALID_OR_EXPIRED_TOKEN';
    throw err;
  }

  const tokenHash = hashToken(token);
  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();
    console.log('[VERIFY_EMAIL_SERVICE] transaction started');

    /* =========================
       FIND VALID TOKEN
    ========================= */
    const [[row]] = await conn.query(
      `SELECT evt.id AS token_id, evt.user_id, u.email_verified_at, u.currency
       FROM email_verification_tokens evt
       JOIN users u ON u.id = evt.user_id
       WHERE evt.token_hash = ?
         AND evt.verified_at IS NULL
         AND evt.expires_at > NOW()
       LIMIT 1`,
      [tokenHash]
    );

    if (!row) {
      const err = new Error('INVALID_OR_EXPIRED_TOKEN');
      err.code = 'INVALID_OR_EXPIRED_TOKEN';
      throw err;
    }

    /* =========================
       MARK EMAIL VERIFIED (IDEMPOTENT SAFE)
    ========================= */
    if (!row.email_verified_at) {
      await conn.query(
        `UPDATE users
         SET email_verified_at = NOW()
         WHERE id = ?`,
        [row.user_id]
      );
    }

    await conn.query(
      `UPDATE email_verification_tokens
       SET verified_at = NOW()
       WHERE id = ?`,
      [row.token_id]
    );

    /* =========================
       CREATE WALLET (POST-VERIFY)
       — ONE PER USER PER CURRENCY
    ========================= */
    const walletCurrency = row.currency || 'NGN';

    const [[existingWallet]] = await conn.query(
      `SELECT id
       FROM wallets
       WHERE user_id = ?
         AND currency = ?
       LIMIT 1`,
      [row.user_id, walletCurrency]
    );

    let walletId = null;

    if (!existingWallet) {
      const [walletRes] = await conn.query(
        `INSERT INTO wallets
         (user_id, currency, balance, locked_balance, status)
         VALUES (?, ?, 0.00, 0.00, 'active')`,
        [row.user_id, walletCurrency]
      );

      walletId = walletRes.insertId;
      console.log('[VERIFY_EMAIL_SERVICE] wallet created:', walletId);
    } else {
      walletId = existingWallet.id;
      console.log('[VERIFY_EMAIL_SERVICE] wallet already exists:', walletId);
    }

    /* =========================
       COMMIT TRANSACTION
    ========================= */
    await conn.commit();
    console.log('[VERIFY_EMAIL_SERVICE] transaction committed');

    /* =========================
       AUDIT (POST-COMMIT)
    ========================= */
    await audit({
      user_id: row.user_id,
      actor_type: 'system',
      action: 'VERIFY_EMAIL',
      target_type: 'user',
      target_id: String(row.user_id),
      ip_address: ip,
      user_agent,
      metadata: {
        wallet_id: walletId,
        currency: walletCurrency
      }
    });

    console.log('[VERIFY_EMAIL_SERVICE] success');
    return;
  } catch (e) {
    await conn.rollback();
    console.error('[VERIFY_EMAIL_SERVICE_ERROR]', e);
    throw e;
  } finally {
    conn.release();
    console.log('[VERIFY_EMAIL_SERVICE] connection released');
  }
};


/* =========================
   LOGIN
========================= */
const {
  signRefreshToken,
  verifyRefreshToken
} = require('../utils/jwt.util');

/* =========================
   LOGIN
========================= */
exports.login = async ({ identifier, password, ip, user_agent }) => {
  const idEmail = normalizeEmail(identifier);
  const idUser = normalizeUsername(identifier);

  const [[user]] = await pool.query(
    `SELECT * FROM users
     WHERE email = ? OR username_lower = ?
     LIMIT 1`,
    [idEmail, idUser]
  );

  if (!user) throw new Error('INVALID_CREDENTIALS');
  if (!user.email_verified_at) throw new Error('EMAIL_NOT_VERIFIED');

  const valid = await verifyPassword(password, user.password_hash);
  if (!valid) throw new Error('INVALID_CREDENTIALS');

  const sessionId = uuidv4();

  const refreshToken = signRefreshToken({
    sub: user.uuid,
    sid: sessionId,
    sv: user.security_version
  });

  await pool.query(
    `INSERT INTO user_sessions
     (session_id, user_id, refresh_token_hash, ip_address, user_agent, expires_at)
     VALUES (?, ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL 30 DAY))`,
    [sessionId, user.id, hashToken(refreshToken), ip, user_agent]
  );

  return { user, sessionId, refreshToken };
};

/* =========================
   REFRESH (COOKIE BASED)
========================= */
exports.refresh = async ({ refresh_token }) => {
  let payload;

  try {
    payload = verifyRefreshToken(refresh_token);
  } catch {
    return null;
  }

  const { sid, sv } = payload;

  const [[row]] = await pool.query(
    `SELECT s.session_id, u.*
     FROM user_sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.session_id = ?
       AND s.refresh_token_hash = ?
       AND s.revoked_at IS NULL
       AND s.expires_at > NOW()
     LIMIT 1`,
    [sid, hashToken(refresh_token)]
  );

  if (!row) return null;
  if (row.security_version !== sv) return null;

  const newRefreshToken = signRefreshToken({
    sub: row.uuid,
    sid,
    sv
  });

  await pool.query(
    `UPDATE user_sessions
     SET refresh_token_hash = ?
     WHERE session_id = ?`,
    [hashToken(newRefreshToken), sid]
  );

  return {
    user: row,
    sessionId: sid,
    newRefreshToken
  };
};

/* -------------------- LOGOUT -------------------- */
exports.logout = async ({ session_id, user_id, ip, user_agent }) => {
  await pool.query(
    `UPDATE user_sessions SET revoked_at = NOW() WHERE session_id = ?`,
    [session_id]
  );
  await audit({
    user_id,
    action: 'LOGOUT',
    target_type: 'session',
    target_id: session_id,
    ip_address: ip,
    user_agent
  });
};

exports.logoutAll = async ({ user_id, ip, user_agent }) => {
  await pool.query(
    `UPDATE user_sessions SET revoked_at = NOW() WHERE user_id = ?`,
    [user_id]
  );
  await audit({
    user_id,
    action: 'LOGOUT_ALL',
    target_type: 'user',
    target_id: String(user_id),
    ip_address: ip,
    user_agent
  });
};

/* -------------------- FORGOT / RESET -------------------- */
exports.forgotPassword = async ({ email, ip, user_agent }) => {
  const emailNorm = normalizeEmail(email);
  const [[user]] = await pool.query(
    `SELECT id FROM users WHERE email = ? LIMIT 1`,
    [emailNorm]
  );
  if (!user) return null;

  const raw = generateToken();
  await pool.query(
    `INSERT INTO password_reset_tokens
     (user_id, token_hash, expires_at)
     VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 15 MINUTE))`,
    [user.id, hashToken(raw)]
  );

  await audit({
    user_id: user.id,
    action: 'FORGOT_PASSWORD',
    ip_address: ip,
    user_agent
  });
// 📧 Send password reset email
setImmediate(async () => {
  try {
    const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${raw}`;

    await sendEmail(
      emailNorm,
      'Reset your Trebetta password',
      `
        <div style="font-family: Arial, sans-serif">
          <p>You requested to reset your password.</p>
          <p>
            <a href="${resetUrl}">${resetUrl}</a>
          </p>
          <p>This link expires in 15 minutes.</p>
        </div>
      `
    );
  } catch (e) {
    console.warn('[FORGOT_PASSWORD] email failed:', e?.message);
  }
});

  return raw;
};

exports.resetPassword = async ({ token, password, ip, user_agent }) => {
  assertStrongPassword(password);
  const tokenHash = hashToken(token);

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [[row]] = await conn.query(
      `SELECT id, user_id FROM password_reset_tokens
       WHERE token_hash = ?
         AND used_at IS NULL
         AND expires_at > NOW()
       LIMIT 1`,
      [tokenHash]
    );
    if (!row) return false;

    const pwHash = await hashPassword(password);
    await conn.query(
      `UPDATE users
       SET password_hash = ?, password_updated_at = NOW(),
           security_version = security_version + 1
       WHERE id = ?`,
      [pwHash, row.user_id]
    );
    await conn.query(
      `UPDATE password_reset_tokens SET used_at = NOW() WHERE id = ?`,
      [row.id]
    );
    await conn.query(
      `UPDATE user_sessions SET revoked_at = NOW() WHERE user_id = ?`,
      [row.user_id]
    );

    await conn.commit();

    await audit({
      user_id: row.user_id,
      action: 'RESET_PASSWORD',
      ip_address: ip,
      user_agent
    });

    return true;
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
};

/* =========================
   AUTH / ME (SERVICE)
========================= */
exports.me = async ({ userId }) => {
  console.log('[AUTH_ME_SERVICE] fetching user', userId);

  const [[user]] = await pool.query(
    `SELECT
       id,
       uuid,
       email,
       username,
       display_name,
       referral_code,
       email_verified_at
     FROM users
     WHERE id = ?
     LIMIT 1`,
    [userId]
  );

  if (!user) {
    const err = new Error('USER_NOT_FOUND');
    err.code = 'USER_NOT_FOUND';
    throw err;
  }

  const [[wallet]] = await pool.query(
    `SELECT
       id,
       currency,
       balance,
       locked_balance,
       status
     FROM wallets
     WHERE user_id = ?
     LIMIT 1`,
    [userId]
  );

  return {
    uuid: user.uuid,
    email: user.email,
    username: user.username,
    display_name: user.display_name,
    referral_code: user.referral_code, // ✅ ADDED
    email_verified: !!user.email_verified_at,
    wallet: wallet
      ? {
          id: wallet.id,
          currency: wallet.currency,
          balance: Number(wallet.balance),
          locked_balance: Number(wallet.locked_balance),
          available_balance:
            Number(wallet.balance) - Number(wallet.locked_balance),
          status: wallet.status
        }
      : null
  };
};
