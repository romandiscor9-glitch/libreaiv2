const db = require('../db/database');

function requireAuth(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: 'Non authentifié. Veuillez vous connecter.' });
  }
  const user = db.prepare('SELECT id, is_active, email_verified FROM users WHERE id = ?').get(req.session.userId);
  if (!user) {
    req.session.destroy(() => {});
    return res.status(401).json({ error: 'Session invalide. Veuillez vous reconnecter.' });
  }
  if (!user.is_active) {
    req.session.destroy(() => {});
    return res.status(403).json({ error: 'Ce compte a été désactivé.' });
  }
  if (user.email_verified !== 1) {
    req.session.destroy(() => {});
    return res.status(403).json({ error: 'Adresse e-mail non confirmée.', code: 'email_not_verified' });
  }
  req.userId = user.id;
  next();
}

module.exports = { requireAuth };
