const db = require('../db/database');
const supabase = require('../services/supabase');

async function requireAuth(req, res, next) {

  try {

    const token = req.session?.access_token;

    if (!token) {
      return res.status(401).json({
        error: 'Non authentifié. Veuillez vous connecter.'
      });
    }


    const { data, error } = await supabase.auth.getUser(token);


    if (error || !data.user) {

      req.session.destroy(() => {});

      return res.status(401).json({
        error: 'Session Supabase invalide.'
      });

    }



    const email = data.user.email;



    let user = db.prepare(
      'SELECT * FROM users WHERE email = ? COLLATE NOCASE'
    )
    .get(email);



    // Création automatique du profil SQLite si absent
    if (!user) {

      const result = db.prepare(`
        INSERT INTO users
        (
          email,
          username,
          password_hash,
          email_verified,
          is_active
        )
        VALUES (?, ?, ?, ?, ?)
      `)
      .run(
        email,
        data.user.user_metadata?.username || email.split('@')[0],
        'supabase_auth',
        1,
        1
      );


      user = db.prepare(
        'SELECT * FROM users WHERE id = ?'
      )
      .get(result.lastInsertRowid);

    }



    if (!user.is_active) {

      return res.status(403).json({
        error:'Compte désactivé.'
      });

    }



    req.userId = user.id;

    req.user = user;


    next();


  } catch(err) {

    console.error('Auth error:', err);

    res.status(500).json({
      error:'Erreur serveur interne.'
    });

  }

}


module.exports = {
  requireAuth
};
