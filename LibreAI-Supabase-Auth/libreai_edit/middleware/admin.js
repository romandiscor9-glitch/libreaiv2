const db = require('../db/database');
const config = require('../config/config');

function requireAdmin(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: 'Connexion utilisateur requise.' });
  }
  const user = db.prepare('SELECT id, email, is_active, is_admin FROM users WHERE id = ?').get(req.session.userId);
  if (!user || !user.is_active || user.is_admin !== 1 || user.email.toLowerCase() !== config.ADMIN_EMAIL) {
    return res.status(403).json({ error: 'Accès administrateur refusé.' });
  }
  if (req.session.isAdmin !== true) {
    return res.status(403).json({ error: 'Panneau administrateur verrouillé.' });
  }
  req.adminUser = user;
  next();
}

module.exports = { requireAdmin };
