const db = require('../db/database');
const config = require('../config/config');


function requireAdmin(req, res, next) {

  try {

    // Vérifie la connexion utilisateur
    if (!req.session || !req.session.userId) {
      return res.status(401).json({
        error: 'Connexion utilisateur requise.'
      });
    }


    // Récupère l'utilisateur SQLite
    const user = db.prepare(`
      SELECT 
        id,
        email,
        is_active,
        is_admin
      FROM users
      WHERE id = ?
    `).get(req.session.userId);



    if (!user) {
      return res.status(403).json({
        error: 'Utilisateur introuvable.'
      });
    }



    // Vérifie que le compte est actif
    if (user.is_active !== 1) {
      return res.status(403).json({
        error: 'Compte désactivé.'
      });
    }



    // Vérifie l'adresse admin
    if (
      user.email.toLowerCase() !==
      config.ADMIN_EMAIL.toLowerCase()
    ) {
      return res.status(403).json({
        error: 'Ce compte n’est pas administrateur.'
      });
    }



    // Force le statut admin si le mail correspond
    if (user.is_admin !== 1) {

      db.prepare(`
        UPDATE users
        SET is_admin = 1
        WHERE id = ?
      `).run(user.id);

      user.is_admin = 1;
    }



    // Déverrouillage panneau admin
    if (req.session.isAdmin !== true) {

      req.session.isAdmin = true;

    }



    req.adminUser = user;

    next();



  } catch (err) {

    console.error('Admin middleware error:', err);

    res.status(500).json({
      error: 'Erreur serveur interne.'
    });

  }

}



module.exports = {
  requireAdmin
};
