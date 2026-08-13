const db = require('../db/database');

function logAdminAction(action, details, ip) {
  db.prepare('INSERT INTO admin_logs (action, details, ip) VALUES (?, ?, ?)')
    .run(action, details || null, ip || null);
}

function logAiRequest({ userId, success, error, model, durationMs }) {
  db.prepare(
    'INSERT INTO ai_request_logs (user_id, success, error, model, duration_ms) VALUES (?, ?, ?, ?, ?)'
  ).run(userId || null, success ? 1 : 0, error || null, model || null, durationMs || null);
}

module.exports = { logAdminAction, logAiRequest };
