const express = require('express');
const router = express.Router();

const C = require('../controllers/auth.controller');
const { requireAuth } = require('../middlewares/auth.guard');
const {
  loginLimiter,
  forgotPasswordLimiter,
  resendVerificationLimiter
} = require('../middlewares/rateLimit');

router.get('/me', requireAuth, C.me);

router.post('/register', C.register);
router.post('/send-verify-email', resendVerificationLimiter, C.sendVerify);
router.post('/verify-email', C.verifyEmail);

router.post('/login', loginLimiter, C.login);
router.post('/refresh', C.refresh);

router.post('/logout', requireAuth, C.logout);
router.post('/logout-all', requireAuth, C.logoutAll);

router.post('/forgot-password', forgotPasswordLimiter, C.forgotPassword);
router.post('/reset-password', C.resetPassword);

module.exports = router;
