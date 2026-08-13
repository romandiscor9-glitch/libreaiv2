const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const db = require('../db/database');
const config = require('../config/config');
const { requireAuth } = require('../middleware/auth');
const { sendVerificationEmail } = require('../services/mail');

const router = express.Router();

const authLimiter = rateLimit({
  windowMs: config.RATE_LIMIT_WINDOW_MS,
  max: config.RATE_LIMIT_MAX_AUTH,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de tentatives. Ralentissez un peu.' },
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function publicUser(u) {
  return {
    id: u.id,
    email: u.email,
    username: u.username,
    createdAt: u.created_at,
    lastLogin: u.last_login,
    emailVerified: u.email_verified === 1,
    isAdmin: u.is_admin === 1,
  };
}

function tokenHash(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function createVerificationToken() {
  return crypto.randomBytes(32).toString('hex');
}

async function sendVerification(user) {
  const token = createVerificationToken();
  const hash = tokenHash(token);
  const expires = new Date(Date.now() + config.EMAIL_VERIFICATION_HOURS * 3600 * 1000).toISOString();
  db.prepare('UPDATE users SET verification_token_hash = ?, verification_expires_at = ? WHERE id = ?')
    .run(hash, expires, user.id);
  await sendVerificationEmail(user.email, user.username, token);
}

router.post('/register', authLimiter, async (req, res) => {
  try {
    let { email, username, password, confirmPassword } = req.body || {};
    email = (email || '').trim().toLowerCase();
    username = (username || '').trim();
    password = password || '';
    confirmPassword = confirmPassword || '';

    if (!email || !EMAIL_RE.test(email)) return res.status(400).json({ error: 'Adresse e-mail invalide.' });
    if (!username || username.length < 2 || username.length > 40) return res.status(400).json({ error: "Le nom d'utilisateur doit contenir entre 2 et 40 caractères." });
    if (password.length < config.MIN_PASSWORD_LENGTH) return res.status(400).json({ error: `Le mot de passe doit contenir au moins ${config.MIN_PASSWORD_LENGTH} caractères.` });
    if (password !== confirmPassword) return res.status(400).json({ error: 'La confirmation du mot de passe ne correspond pas.' });

    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) return res.status(409).json({ error: 'Un compte existe déjà avec cette adresse e-mail.' });

    const hash = bcrypt.hashSync(password, config.BCRYPT_ROUNDS);
    const isAdmin = email === config.ADMIN_EMAIL ? 1 : 0;
    const info = db.prepare(`
      INSERT INTO users
        (email, username, password_hash, is_active, is_admin, email_verified, credits, credits_reset_at)
      VALUES (?, ?, ?, 1, ?, 0, ?, date('now'))
    `).run(email, username, hash, isAdmin, config.DAILY_CREDITS);

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);

    try {
      await sendVerification(user);
    } catch (mailErr) {
      db.prepare('DELETE FROM users WHERE id = ?').run(user.id);
      console.error('verification email error:', mailErr);
      return res.status(503).json({ error: `Impossible d'envoyer l'e-mail de confirmation. Vérifiez la configuration SMTP du serveur. (${mailErr.message})` });
    }

    res.status(201).json({ requiresVerification: true, email: user.email });
  } catch (err) {
    console.error('register error', err);
    res.status(500).json({ error: "Erreur serveur lors de l'inscription." });
  }
});

router.get('/verify-email', (req, res) => {
  const token = (req.query.token || '').toString();
  if (!token || token.length < 20) return res.status(400).json({ error: 'Lien de confirmation invalide.' });

  const user = db.prepare('SELECT * FROM users WHERE verification_token_hash = ?').get(tokenHash(token));
  if (!user) return res.status(400).json({ error: 'Lien de confirmation invalide ou déjà utilisé.' });

  if (!user.verification_expires_at || new Date(user.verification_expires_at).getTime() < Date.now()) {
    return res.status(400).json({ error: 'Ce lien de confirmation a expiré. Demandez un nouvel e-mail.' });
  }

  db.prepare(`
    UPDATE users
    SET email_verified = 1, verification_token_hash = NULL, verification_expires_at = NULL
    WHERE id = ?
  `).run(user.id);

  res.json({ ok: true });
});

router.post('/resend-verification', authLimiter, async (req, res) => {
  const email = (req.body?.email || '').trim().toLowerCase();
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || user.email_verified === 1) return res.json({ ok: true });

  try {
    await sendVerification(user);
  } catch (err) {
    return res.status(503).json({ error: `Impossible d'envoyer l'e-mail de confirmation. (${err.message})` });
  }
  res.json({ ok: true });
});

router.post('/login', authLimiter, (req, res) => {
  try {
    let { email, password } = req.body || {};
    email = (email || '').trim().toLowerCase();
    password = password || '';

    if (!email || !password) return res.status(400).json({ error: 'E-mail et mot de passe requis.' });

    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user || !bcrypt.compareSync(password, user.password_hash)) return res.status(401).json({ error: 'E-mail ou mot de passe incorrect.' });
    if (!user.is_active) return res.status(403).json({ error: 'Ce compte a été désactivé. Contactez un administrateur.' });
    if (user.email_verified !== 1) return res.status(403).json({ error: 'Votre adresse e-mail n’est pas encore confirmée.', code: 'email_not_verified' });

    db.prepare("UPDATE users SET last_login = datetime('now') WHERE id = ?").run(user.id);
    req.session.regenerate((err) => {
      if (err) return res.status(500).json({ error: 'Erreur lors de la création de la session.' });
      req.session.userId = user.id;
      res.json({ user: publicUser(user) });
    });
  } catch (err) {
    console.error('login error', err);
    res.status(500).json({ error: 'Erreur serveur lors de la connexion.' });
  }
});

router.post('/logout', (req, res) => {
  if (!req.session) return res.json({ ok: true });
  req.session.destroy(() => {
    res.clearCookie('libreai.sid');
    res.json({ ok: true });
  });
});

router.get('/me', requireAuth, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId);
  res.json({ user: publicUser(user) });
});

module.exports = router;
