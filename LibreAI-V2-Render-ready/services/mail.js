const nodemailer = require('nodemailer');
const config = require('../config/config');

function configured() {
  return Boolean(config.SMTP_HOST && config.SMTP_USER && config.SMTP_PASS && config.MAIL_FROM);
}

function transporter() {
  if (!configured()) return null;
  return nodemailer.createTransport({
    host: config.SMTP_HOST,
    port: config.SMTP_PORT,
    secure: config.SMTP_SECURE,
    auth: { user: config.SMTP_USER, pass: config.SMTP_PASS },
  });
}

async function sendVerificationEmail(email, username, token) {
  const transport = transporter();
  if (!transport) {
    throw new Error('Le service e-mail n’est pas configuré (SMTP_HOST/SMTP_USER/SMTP_PASS).');
  }
  const url = `${config.SITE_URL}/verify.html?token=${encodeURIComponent(token)}`;
  await transport.sendMail({
    from: config.MAIL_FROM,
    to: email,
    subject: 'Confirmez votre adresse e-mail — LibreAI',
    text: `Bonjour ${username},\n\nConfirmez votre adresse e-mail en ouvrant ce lien :\n${url}\n\nCe lien expire dans ${config.EMAIL_VERIFICATION_HOURS} heures.\n\nLibreAI`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:24px">
        <h2>Bienvenue sur LibreAI 👋</h2>
        <p>Bonjour ${escapeHtml(username)},</p>
        <p>Confirmez votre adresse e-mail pour activer votre compte.</p>
        <p><a href="${url}" style="display:inline-block;padding:12px 18px;background:#7c6cff;color:#fff;text-decoration:none;border-radius:8px">Confirmer mon e-mail</a></p>
        <p style="color:#666;font-size:13px">Le lien expire dans ${config.EMAIL_VERIFICATION_HOURS} heures.</p>
      </div>`,
  });
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

module.exports = { sendVerificationEmail, configured };
