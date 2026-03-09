'use strict';

const axios = require('axios');

const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email';

/**
 * ---------------------------------------------------------
 * SEND EMAIL (Brevo HTTP API – Production Safe)
 *
 * @param {string} to       Recipient email
 * @param {string} subject  Email subject
 * @param {string} html     HTML body
 * @param {string} [text]   Optional plain-text fallback
 * ---------------------------------------------------------
 */
async function sendEmail(to, subject, html, text = '') {
  try {
    if (!to) {
      console.warn('⚠️ sendEmail skipped: recipient missing');
      return;
    }

    if (!process.env.BREVO_API_KEY) {
      console.warn('⚠️ BREVO_API_KEY missing — email skipped');
      return;
    }

    const fromEmail =
      process.env.MAIL_FROM || 'Trebetta <no-reply@trebetta.com>';

    const payload = {
      sender: {
        email: fromEmail.includes('<')
          ? fromEmail.match(/<(.*)>/)[1]
          : fromEmail,
        name: fromEmail.split('<')[0]?.trim() || 'Trebetta'
      },
      to: [{ email: to }],
      subject,
      htmlContent: html,
      textContent: text || html.replace(/<[^>]+>/g, '')
    };

    const res = await axios.post(BREVO_API_URL, payload, {
      headers: {
        'api-key': process.env.BREVO_API_KEY,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      timeout: 10000 // never hang your API
    });

    console.log('📧 Email sent →', to, 'Brevo ID:', res.data?.messageId);
  } catch (err) {
    console.error('❌ Email send failed:', {
      to,
      subject,
      error: err?.response?.data || err.message
    });
  }
}

module.exports = sendEmail;
