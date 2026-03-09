'use strict';

const AdminAuth = require('../services/admin.auth.service');
const { signAdminAccessToken } = require('../utils/admin.jwt.util');

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    console.log('[ADMIN_LOGIN_CONTROLLER] incoming', {
      email,
      ip: req.ip
    });

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }

    const result = await AdminAuth.login({
      email,
      password,
      ip: req.ip,
      user_agent: req.headers['user-agent']
    });

    const accessToken = signAdminAccessToken({
      sub: result.admin.uuid,
      sid: result.sessionId,
      role: result.admin.role,
      sv: result.admin.security_version
    });

    console.log('[ADMIN_LOGIN_CONTROLLER] success', {
      adminId: result.admin.id,
      role: result.admin.role
    });

    return res.json({
      success: true,
      data: {
        accessToken,
        refreshToken: result.refreshToken,
        sessionId: result.sessionId,
        role: result.admin.role
      }
    });
  } catch (err) {
    console.error('[ADMIN_LOGIN_CONTROLLER_ERROR]', err.code || err.message);

    return res.status(401).json({
      success: false,
      message: 'Invalid credentials'
    });
  }
};
