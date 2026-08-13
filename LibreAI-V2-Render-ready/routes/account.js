const express = require('express');
const db = require('../db/database');
const { requireAuth } = require('../middleware/auth');
const { getCreditStatus } = require('../services/credits');

const router = express.Router();

router.get('/stats', requireAuth, (req, res) => {
  const user = db.prepare('SELECT id, email, username, created_at, last_login, is_admin, email_verified FROM users WHERE id = ?').get(req.userId);
  const conversations = db.prepare('SELECT COUNT(*) c FROM conversations WHERE user_id = ?').get(req.userId).c;
  const messages = db.prepare(
    `SELECT COUNT(*) c FROM messages m
     JOIN conversations c ON c.id = m.conversation_id
     WHERE c.user_id = ? AND m.role = 'user'`
  ).get(req.userId).c;
  const images = db.prepare('SELECT COUNT(*) c FROM image_generations WHERE user_id = ?').get(req.userId).c;

  res.json({
    user: {
      email: user.email,
      username: user.username,
      createdAt: user.created_at,
      lastLogin: user.last_login,
      emailVerified: user.email_verified === 1,
      isAdmin: user.is_admin === 1,
    },
    stats: { conversations, messages, images },
    credits: getCreditStatus(req.userId),
  });
});

module.exports = router;
