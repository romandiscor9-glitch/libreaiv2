const config = require('../config/config');

function configured() {
  return Boolean(process.env.RESEND_API_KEY);
}

async function sendVerificationEmail(email, username, token) {
  if (!configured()) {
    throw new Error('Le service e-mail n’est pas configuré (RESEND_API_KEY manquante).');
  }

  const url = `${config.SITE_URL}/verify.html?token=${encodeURIComponent(token)}`;

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'onboarding@resend.dev',
      to: [email],
      subject: 'Confirmez votre adresse e-mail — LibreAI',
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:24px">
          <h2>Bienvenue sur LibreAI 👋</h2>

          <p>Bonjour ${escapeHtml(username)},</p>

          <p>Merci de confirmer votre adresse e-mail.</p>

          <p>
            <a href="${url}"
            style="display:inline-block;padding:12px 18px;background:#7c6cff;color:white;text-decoration:none;border-radius:8px">
            Confirmer mon e-mail
            </a>
          </p>

          <p>Ce lien expire dans ${config.EMAIL_VERIFICATION_HOURS} heures.</p>

          <p>LibreAI</p>
        </div>
      `,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('Resend error:', error);
    throw new Error('Impossible d’envoyer l’e-mail de confirmation.');
  }
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

module.exports = {
  sendVerificationEmail,
  configured,
};
