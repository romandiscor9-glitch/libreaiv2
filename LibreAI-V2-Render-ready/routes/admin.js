const express = require('express');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const db = require('../db/database');
const config = require('../config/config');
const { requireAdmin } = require('../middleware/admin');
const { logAdminAction } = require('../services/logger');

const router = express.Router();

function clientIp(req) {
  return (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').toString();
}

function safeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) {
    // Comparaison factice pour éviter les attaques par mesure de temps sur la longueur
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

const verifyLimiter = rateLimit({
  windowMs: config.RATE_LIMIT_WINDOW_MS,
  max: config.RATE_LIMIT_MAX_ADMIN_LOGIN,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de tentatives. Réessayez plus tard.' },
});

// --- Vérification du code d'accès (côté serveur uniquement) ---
router.post('/verify', verifyLimiter, (req, res) => {
  if (!req.session?.userId) return res.status(401).json({ error: 'Connectez-vous d’abord.' });
  const user = db.prepare('SELECT id, email, is_admin, is_active FROM users WHERE id = ?').get(req.session.userId);
  if (!user || !user.is_active || user.is_admin !== 1 || user.email.toLowerCase() !== config.ADMIN_EMAIL) {
    return res.status(403).json({ error: 'Ce compte n’est pas administrateur.' });
  }
  const code = (req.body?.code || '').toString();
  const ok = safeEqual(code, config.ADMIN_ACCESS_CODE);
  if (!ok) {
    logAdminAction('admin_login_failed', null, clientIp(req));
    return res.status(403).json({ error: 'Code incorrect.' });
  }
  req.session.isAdmin = true;
  logAdminAction('admin_login', null, clientIp(req));
  res.json({ ok: true });
});

router.get('/session', (req, res) => {
  const user = req.session?.userId
    ? db.prepare('SELECT email, is_admin, is_active FROM users WHERE id = ?').get(req.session.userId)
    : null;
  const allowed = Boolean(user && user.is_active && user.is_admin === 1 && user.email.toLowerCase() === config.ADMIN_EMAIL);
  res.json({
    isAdmin: allowed && req.session?.isAdmin === true,
    requirePasswordEachTime: config.ADMIN_REQUIRE_PASSWORD_EACH_TIME,
  });
});

router.post('/logout', (req, res) => {
  logAdminAction('admin_logout', null, clientIp(req));
  if (req.session) req.session.isAdmin = false;
  res.json({ ok: true });
});

// Tout ce qui suit nécessite une session admin valide
router.use(requireAdmin);

// --- Tableau de bord ---
router.get('/stats', (req, res) => {
  const totalUsers = db.prepare('SELECT COUNT(*) c FROM users').get().c;
  const activeUsers = db.prepare('SELECT COUNT(*) c FROM users WHERE is_active = 1').get().c;
  const newUsers7d = db.prepare("SELECT COUNT(*) c FROM users WHERE created_at >= datetime('now','-7 days')").get().c;
  const recentlyActive = db.prepare("SELECT COUNT(*) c FROM users WHERE last_login >= datetime('now','-1 day')").get().c;
  const totalConversations = db.prepare('SELECT COUNT(*) c FROM conversations').get().c;
  const totalMessages = db.prepare("SELECT COUNT(*) c FROM messages WHERE role = 'user'").get().c;
  const totalAiRequests = db.prepare('SELECT COUNT(*) c FROM ai_request_logs').get().c;
  const aiErrors = db.prepare('SELECT COUNT(*) c FROM ai_request_logs WHERE success = 0').get().c;

  const signupsByDay = db
    .prepare(
      `SELECT date(created_at) day, COUNT(*) count FROM users
       WHERE created_at >= datetime('now','-13 days')
       GROUP BY day ORDER BY day ASC`
    )
    .all();

  const messagesByDay = db
    .prepare(
      `SELECT date(created_at) day, COUNT(*) count FROM messages
       WHERE role='user' AND created_at >= datetime('now','-13 days')
       GROUP BY day ORDER BY day ASC`
    )
    .all();

  const aiByDay = db
    .prepare(
      `SELECT date(created_at) day,
              SUM(CASE WHEN success=1 THEN 1 ELSE 0 END) ok,
              SUM(CASE WHEN success=0 THEN 1 ELSE 0 END) failed
       FROM ai_request_logs
       WHERE created_at >= datetime('now','-13 days')
       GROUP BY day ORDER BY day ASC`
    )
    .all();

  const recentActivity = db
    .prepare(
      `SELECT 'inscription' AS type, username AS label, created_at AS ts FROM users
       UNION ALL
       SELECT 'connexion' AS type, u.username AS label, u.last_login AS ts FROM users u WHERE u.last_login IS NOT NULL
       ORDER BY ts DESC LIMIT 15`
    )
    .all();

  res.json({
    totals: {
      totalUsers,
      activeUsers,
      newUsers7d,
      recentlyActive,
      totalConversations,
      totalMessages,
      totalAiRequests,
      aiErrors,
    },
    charts: { signupsByDay, messagesByDay, aiByDay },
    recentActivity,
  });
});

// --- Gestion des utilisateurs ---
router.get('/users', (req, res) => {
  const { search = '', status = 'all', sort = 'created_desc', page = '1', pageSize = '20' } = req.query;
  const p = Math.max(1, parseInt(page, 10) || 1);
  const size = Math.min(100, Math.max(1, parseInt(pageSize, 10) || 20));

  let where = 'WHERE 1=1';
  const params = [];
  if (search) {
    where += ' AND (u.email LIKE ? OR u.username LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }
  if (status === 'active') where += ' AND u.is_active = 1';
  if (status === 'disabled') where += ' AND u.is_active = 0';

  const sortMap = {
    created_desc: 'u.created_at DESC',
    created_asc: 'u.created_at ASC',
    last_login_desc: 'u.last_login DESC',
    messages_desc: 'messages DESC',
    email_asc: 'u.email ASC',
  };
  const orderBy = sortMap[sort] || sortMap.created_desc;

  const total = db.prepare(`SELECT COUNT(*) c FROM users u ${where}`).get(...params).c;

  const rows = db
    .prepare(
      `SELECT u.id, u.email, u.username, u.created_at, u.last_login, u.is_active,
              (SELECT COUNT(*) FROM conversations c WHERE c.user_id = u.id) AS conversations,
              (SELECT COUNT(*) FROM messages m JOIN conversations c ON c.id = m.conversation_id WHERE c.user_id = u.id AND m.role='user') AS messages
       FROM users u ${where}
       ORDER BY ${orderBy}
       LIMIT ? OFFSET ?`
    )
    .all(...params, size, (p - 1) * size);

  res.json({ users: rows, total, page: p, pageSize: size });
});

router.get('/users/:id', (req, res) => {
  const user = db
    .prepare(
      `SELECT id, email, username, created_at, last_login, is_active FROM users WHERE id = ?`
    )
    .get(req.params.id);
  if (!user) return res.status(404).json({ error: 'Utilisateur introuvable.' });
  const conversations = db
    .prepare(
      `SELECT id, title, created_at, updated_at,
              (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = conversations.id) AS messageCount
       FROM conversations WHERE user_id = ? ORDER BY updated_at DESC`
    )
    .all(user.id);
  res.json({ user, conversations });
});

router.get('/users/:id/conversations/:convId', (req, res) => {
  const conv = db.prepare('SELECT * FROM conversations WHERE id = ? AND user_id = ?').get(req.params.convId, req.params.id);
  if (!conv) return res.status(404).json({ error: 'Conversation introuvable.' });
  const messages = db.prepare('SELECT id, role, content, created_at FROM messages WHERE conversation_id = ? ORDER BY id ASC').all(conv.id);
  res.json({ conversation: conv, messages });
});

router.post('/users/:id/disable', (req, res) => {
  const user = db.prepare('SELECT id, username FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'Utilisateur introuvable.' });
  db.prepare('UPDATE users SET is_active = 0 WHERE id = ?').run(user.id);
  logAdminAction('user_disabled', `user_id=${user.id} (${user.username})`, clientIp(req));
  res.json({ ok: true });
});

router.post('/users/:id/enable', (req, res) => {
  const user = db.prepare('SELECT id, username FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'Utilisateur introuvable.' });
  db.prepare('UPDATE users SET is_active = 1 WHERE id = ?').run(user.id);
  logAdminAction('user_enabled', `user_id=${user.id} (${user.username})`, clientIp(req));
  res.json({ ok: true });
});

router.delete('/users/:id', (req, res) => {
  const user = db.prepare('SELECT id, username, email FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'Utilisateur introuvable.' });
  db.prepare('DELETE FROM users WHERE id = ?').run(user.id);
  logAdminAction('user_deleted', `user_id=${user.id} (${user.email})`, clientIp(req));
  res.json({ ok: true });
});

// --- Journaux admin ---
router.get('/logs', (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const size = 50;
  const total = db.prepare('SELECT COUNT(*) c FROM admin_logs').get().c;
  const logs = db
    .prepare('SELECT id, action, details, ip, created_at FROM admin_logs ORDER BY id DESC LIMIT ? OFFSET ?')
    .all(size, (page - 1) * size);
  res.json({ logs, total, page, pageSize: size });
});

// --- Paramètres (lecture seule pour la clé API : jamais exposée) ---
router.get('/settings', (req, res) => {
  res.json({
    aiModel: config.AI_MODEL,
    apiKeyConfigured: Boolean(config.OPENROUTER_API_KEY),
    imageModel: config.IMAGE_MODEL,
    imageApiConfigured: Boolean(config.HF_TOKEN),
    dailyCredits: config.DAILY_CREDITS,
    chatCreditCost: config.CHAT_CREDIT_COST,
    imageCreditCost: config.IMAGE_CREDIT_COST,
    adminEmail: config.ADMIN_EMAIL,
    adminPasswordEachTime: config.ADMIN_REQUIRE_PASSWORD_EACH_TIME,
    smtpConfigured: Boolean(config.SMTP_HOST && config.SMTP_USER && config.SMTP_PASS),
    limits: {
      rateLimitChatPerWindow: config.RATE_LIMIT_MAX_CHAT,
      rateLimitAuthPerWindow: config.RATE_LIMIT_MAX_AUTH,
      windowMinutes: config.RATE_LIMIT_WINDOW_MS / 60000,
      maxMessageLength: 8000,
      sessionDurationDays: config.SESSION_MAX_AGE_MS / (1000 * 60 * 60 * 24),
    },
  });
});

module.exports = router;
