'use strict';

const Auth = require('../services/auth.service');
const { signAccessToken } = require('../utils/jwt.util');
const env = require('../config/env');

const REFRESH_COOKIE_NAME = 'trebetta_rt';

function getRefreshCookieOptions() {
  return {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/auth/refresh',
    maxAge: 1000 * 60 * 60 * 24 * 30
  };
}

/* =========================
   REGISTER
========================= */
exports.register = async (req, res) => {
  try {
    const result = await Auth.register({
      ...req.body,
      signup_ip: req.ip,
      user_agent: req.headers['user-agent']
    });

    return res.status(201).json({
      success: true,
      data: {
        userId: result.userId,
        uuid: result.uuid,
        email: result.email,
        verifyToken: result.verifyToken // dev only
      }
    });
  } catch (err) {
    console.error('[REGISTER_CONTROLLER_ERROR]', err);

    const map = {
      MISSING_REQUIRED_FIELDS: 400,
      INVALID_EMAIL: 400,
      PASSWORD_REQUIRED: 400,
      WEAK_PASSWORD: 400,
      DUPLICATE: 409,
      INVALID_REFERRAL: 400
    };

    return res.status(map[err.code] || 500).json({
      success: false,
      message: err.message || 'Registration failed'
    });
  }
};

/* =========================
   SEND / RESEND VERIFY EMAIL
========================= */
exports.sendVerify = async (req, res) => {
  try {
    await Auth.sendVerification({
      email: req.body.email,
      ip: req.ip,
      user_agent: req.headers['user-agent']
    });

    return res.json({
      success: true,
      message: 'If the email exists, a verification link has been sent'
    });
  } catch (e) {
    console.error('[SEND_VERIFY_ERROR]', e);
    return res.status(500).json({
      success: false,
      message: 'Failed to send verification email'
    });
  }
};

/* =========================
   VERIFY EMAIL
========================= */
exports.verifyEmail = async (req, res) => {
  try {
    await Auth.verifyEmail({
      token: req.body.token,
      ip: req.ip,
      user_agent: req.headers['user-agent']
    });

    return res.json({
      success: true,
      message: 'Email verified successfully'
    });
  } catch (e) {
    console.error('[VERIFY_EMAIL_ERROR]', e);

    if (e.code === 'INVALID_OR_EXPIRED_TOKEN') {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired verification token'
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Email verification failed'
    });
  }
};

/* =========================
   LOGIN (REFRESH TOKEN → COOKIE)
========================= */

/* =========================
   LOGIN
========================= */
exports.login = async (req, res) => {
  const { user, sessionId, refreshToken } = await Auth.login({
    identifier: req.body.identifier,
    password: req.body.password,
    ip: req.ip,
    user_agent: req.headers['user-agent']
  });

  const accessToken = signAccessToken({
    sub: user.uuid,
    sid: sessionId,
    sv: user.security_version
  });

  res.cookie(
    REFRESH_COOKIE_NAME,
    refreshToken,
    getRefreshCookieOptions()
  );

  res.json({
    success: true,
    data: { accessToken, sessionId }
  });
};

/* =========================
   REFRESH
========================= */
exports.refresh = async (req, res) => {
  try {
    const refreshToken = req.cookies?.[REFRESH_COOKIE_NAME];
    if (!refreshToken) {
      return res.status(401).json({ success: false });
    }

    const result = await Auth.refresh({ refresh_token: refreshToken });
    if (!result) {
      return res.status(401).json({ success: false });
    }

    const { user, sessionId, newRefreshToken } = result;

    res.cookie(
      REFRESH_COOKIE_NAME,
      newRefreshToken,
      getRefreshCookieOptions()
    );

    const accessToken = signAccessToken({
      sub: user.uuid,
      sid: sessionId,
      sv: user.security_version
    });

    res.json({
      success: true,
      data: { accessToken }
    });
  } catch (e) {
    console.error('[REFRESH_ERROR]', e);
    res.status(401).json({ success: false });
  }
};

/* =========================
   LOGOUT
========================= */
exports.logout = async (req, res) => {
  await Auth.logout({
    session_id: req.auth.sessionId,
    user_id: req.auth.userId,
    ip: req.ip,
    user_agent: req.headers['user-agent']
  });

  res.clearCookie(REFRESH_COOKIE_NAME, {
    path: '/auth/refresh'
  });

  res.json({ success: true });
};

/* =========================
   LOGOUT ALL
========================= */
exports.logoutAll = async (req, res) => {
  await Auth.logoutAll({
    user_id: req.auth.userId,
    ip: req.ip,
    user_agent: req.headers['user-agent']
  });

  res.clearCookie(REFRESH_COOKIE_NAME, {
    path: '/auth/refresh'
  });

  res.json({ success: true });
};

/* =========================
   LOGOUT ALL (CLEAR COOKIE)
========================= */
exports.logoutAll = async (req, res) => {
  await Auth.logoutAll({
    user_id: req.auth.userId,
    ip: req.ip,
    user_agent: req.headers['user-agent']
  });

  res.clearCookie(REFRESH_COOKIE_NAME, {
    path: '/auth/refresh'
  });

  res.json({ success: true });
};

/* =========================
   PASSWORD RESET
========================= */
exports.forgotPassword = async (req, res) => {
  await Auth.forgotPassword({
    email: req.body.email,
    ip: req.ip,
    user_agent: req.headers['user-agent']
  });
  res.json({ success: true });
};

exports.resetPassword = async (req, res) => {
  const ok = await Auth.resetPassword({
    token: req.body.token,
    password: req.body.password,
    ip: req.ip,
    user_agent: req.headers['user-agent']
  });
  if (!ok) return res.status(400).json({ success: false });
  res.json({ success: true });
};

/* =========================
   AUTH / ME
========================= */
exports.me = async (req, res) => {
  try {
    const data = await Auth.me({
      userId: req.auth.userId
    });

    return res.json({
      success: true,
      data
    });
  } catch (e) {
    console.error('[AUTH_ME_ERROR]', e);

    return res.status(401).json({
      success: false,
      message: 'Unauthorized'
    });
  }
};