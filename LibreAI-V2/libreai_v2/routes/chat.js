const express = require('express');
const rateLimit = require('express-rate-limit');
const db = require('../db/database');
const config = require('../config/config');
const { requireAuth } = require('../middleware/auth');
const { getChatCompletion, AiError } = require('../services/openrouter');
const { logAiRequest } = require('../services/logger');
const { chargeCredits, refundCredits, getCreditStatus } = require('../services/credits');

const router = express.Router();
router.use(requireAuth);

const chatLimiter = rateLimit({
  windowMs: config.RATE_LIMIT_WINDOW_MS,
  max: config.RATE_LIMIT_MAX_CHAT,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de messages envoyés. Ralentissez un peu.' },
});

function getOwnedConversation(id, userId) {
  return db.prepare('SELECT * FROM conversations WHERE id = ? AND user_id = ?').get(id, userId);
}

// Liste des conversations
router.get('/conversations', (req, res) => {
  const rows = db
    .prepare('SELECT id, title, created_at, updated_at FROM conversations WHERE user_id = ? ORDER BY updated_at DESC')
    .all(req.userId);
  res.json({ conversations: rows });
});

// Nouvelle conversation
router.post('/conversations', (req, res) => {
  const info = db
    .prepare('INSERT INTO conversations (user_id, title) VALUES (?, ?)')
    .run(req.userId, 'Nouvelle conversation');
  const conv = db.prepare('SELECT id, title, created_at, updated_at FROM conversations WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json({ conversation: conv });
});

// Détail + messages d'une conversation
router.get('/conversations/:id', (req, res) => {
  const conv = getOwnedConversation(req.params.id, req.userId);
  if (!conv) return res.status(404).json({ error: 'Conversation introuvable.' });
  const messages = db
    .prepare('SELECT id, role, content, created_at FROM messages WHERE conversation_id = ? ORDER BY id ASC')
    .all(conv.id);
  res.json({ conversation: conv, messages });
});

// Renommer
router.patch('/conversations/:id', (req, res) => {
  const conv = getOwnedConversation(req.params.id, req.userId);
  if (!conv) return res.status(404).json({ error: 'Conversation introuvable.' });
  const title = (req.body?.title || '').trim();
  if (!title) return res.status(400).json({ error: 'Le titre ne peut pas être vide.' });
  db.prepare("UPDATE conversations SET title = ?, updated_at = datetime('now') WHERE id = ?").run(title.slice(0, 100), conv.id);
  res.json({ ok: true, title: title.slice(0, 100) });
});

// Supprimer
router.delete('/conversations/:id', (req, res) => {
  const conv = getOwnedConversation(req.params.id, req.userId);
  if (!conv) return res.status(404).json({ error: 'Conversation introuvable.' });
  db.prepare('DELETE FROM conversations WHERE id = ?').run(conv.id);
  res.json({ ok: true });
});

// Envoyer un message et obtenir la réponse IA
router.post('/conversations/:id/messages', chatLimiter, async (req, res) => {
  const conv = getOwnedConversation(req.params.id, req.userId);
  if (!conv) return res.status(404).json({ error: 'Conversation introuvable.' });

  const content = (req.body?.content || '').toString().trim();
  if (!content) return res.status(400).json({ error: 'Le message ne peut pas être vide.' });
  if (content.length > 8000) return res.status(400).json({ error: 'Message trop long (8000 caractères max).' });

  const creditCharge = chargeCredits(req.userId, config.CHAT_CREDIT_COST);
  if (!creditCharge.ok) {
    return res.status(402).json({
      error: `Crédits insuffisants. Il vous reste ${creditCharge.credits ?? 0} crédit(s).`,
      code: 'insufficient_credits',
      credits: creditCharge.credits ?? 0,
    });
  }

  // Sauvegarde immédiate du message utilisateur (ne disparaît jamais, même si l'IA échoue)
  db.prepare('INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?)').run(conv.id, 'user', content);

  const isFirstMessage = db.prepare('SELECT COUNT(*) c FROM messages WHERE conversation_id = ?').get(conv.id).c === 1;
  if (isFirstMessage) {
    const autoTitle = content.length > 60 ? content.slice(0, 57) + '…' : content;
    db.prepare('UPDATE conversations SET title = ? WHERE id = ?').run(autoTitle, conv.id);
  }
  db.prepare("UPDATE conversations SET updated_at = datetime('now') WHERE id = ?").run(conv.id);

  const history = db
    .prepare('SELECT role, content FROM messages WHERE conversation_id = ? ORDER BY id ASC')
    .all(conv.id)
    .map((m) => ({ role: m.role, content: m.content }));

  const started = Date.now();
  try {
    const reply = await getChatCompletion([
      { role: 'system', content: 'Tu es LibreAI, un assistant IA francophone serviable, clair et concis. Formate tes réponses en Markdown quand cela aide à la lisibilité.' },
      ...history,
    ]);
    const durationMs = Date.now() - started;
    const info = db.prepare('INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?)').run(conv.id, 'assistant', reply);
    logAiRequest({ userId: req.userId, success: true, model: config.AI_MODEL, durationMs });

    const savedMsg = db.prepare('SELECT id, role, content, created_at FROM messages WHERE id = ?').get(info.lastInsertRowid);
    const updatedConv = db.prepare('SELECT id, title, created_at, updated_at FROM conversations WHERE id = ?').get(conv.id);
    res.json({ message: savedMsg, conversation: updatedConv, credits: getCreditStatus(req.userId) });
  } catch (err) {
    refundCredits(req.userId, config.CHAT_CREDIT_COST);
    const durationMs = Date.now() - started;
    const errMsg = err instanceof AiError ? err.message : "Erreur inattendue lors de l'appel au service IA.";
    logAiRequest({ userId: req.userId, success: false, error: errMsg, model: config.AI_MODEL, durationMs });
    // Le message utilisateur reste enregistré ; on renvoie l'erreur réelle.
    res.status(502).json({ error: errMsg, code: err.code || 'unknown' });
  }
});

module.exports = router;
