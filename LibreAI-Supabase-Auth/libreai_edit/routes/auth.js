const express = require('express');
const rateLimit = require('express-rate-limit');

const supabase = require('../services/supabase');
const db = require('../db/database');
const config = require('../config/config');

const router = express.Router();


const authLimiter = rateLimit({
  windowMs: config.RATE_LIMIT_WINDOW_MS,
  max: config.RATE_LIMIT_MAX_AUTH
});


function isAdminEmail(email) {
  return email &&
    email.toLowerCase() === config.ADMIN_EMAIL.toLowerCase();
}



// =====================
// REGISTER
// =====================

router.post('/register', authLimiter, async (req, res) => {

  try {

    const { email, password, username } = req.body;


    const { data, error } = await supabase.auth.signUp({

      email,
      password,

      options: {
        data: {
          username
        }
      }

    });


    if (error) {
      return res.status(400).json({
        error: error.message
      });
    }


    const admin = isAdminEmail(email) ? 1 : 0;


    db.prepare(`
      INSERT OR IGNORE INTO users
      (
        email,
        username,
        password_hash,
        email_verified,
        is_admin
      )
      VALUES (?,?,?,?,?)
    `).run(
      email,
      username || email.split('@')[0],
      'supabase_auth',
      0,
      admin
    );


    res.json({
      requiresVerification: true,
      email
    });


  } catch (e) {

    console.error(e);

    res.status(500).json({
      error: 'Erreur serveur interne.'
    });

  }

});




// =====================
// LOGIN
// =====================

router.post('/login', authLimiter, async (req, res) => {


  try {


    const { email, password } = req.body;


    const { data, error } =
      await supabase.auth.signInWithPassword({
        email,
        password
      });



    if (error) {

      return res.status(401).json({
        error: error.message
      });

    }



    let user = db.prepare(
      'SELECT * FROM users WHERE email = ? COLLATE NOCASE'
    ).get(email);




    if (!user) {


      const admin = isAdminEmail(email) ? 1 : 0;


      const result = db.prepare(`
        INSERT INTO users
        (
          email,
          username,
          password_hash,
          email_verified,
          is_admin
        )
        VALUES (?,?,?,?,?)
      `).run(
        email,
        data.user.user_metadata?.username ||
        email.split('@')[0],
        'supabase_auth',
        1,
        admin
      );


      user = db.prepare(
        'SELECT * FROM users WHERE id = ?'
      ).get(result.lastInsertRowid);


    }



    // Sécurité : force admin si le mail correspond

    if (isAdminEmail(user.email) && user.is_admin !== 1) {

      db.prepare(`
        UPDATE users
        SET is_admin = 1
        WHERE id = ?
      `).run(user.id);


      user.is_admin = 1;

    }




    // Mise à jour dernière connexion

    db.prepare(`
      UPDATE users
      SET last_login = datetime('now')
      WHERE id = ?
    `).run(user.id);




    req.session.userId = user.id;

    req.session.access_token =
      data.session.access_token;


    req.session.isAdmin =
      user.is_admin === 1;




    res.json({

      user: {

        id: user.id,

        email: user.email,

        username: user.username,

        isAdmin: user.is_admin === 1

      }

    });



  } catch (e) {


    console.error(e);


    res.status(500).json({
      error: 'Erreur serveur interne.'
    });


  }


});




// =====================
// ME
// =====================

router.get('/me', (req, res) => {


  if (!req.session?.userId) {

    return res.status(401).json({
      error: 'Non connecté'
    });

  }



  const user = db.prepare(`
    SELECT
      id,
      email,
      username,
      is_admin
    FROM users
    WHERE id = ?
  `).get(req.session.userId);




  if (!user) {

    return res.status(401).json({
      error: 'Session invalide'
    });

  }



  res.json({

    user: {

      id: user.id,

      email: user.email,

      username: user.username,

      isAdmin: user.is_admin === 1

    }

  });


});




// =====================
// LOGOUT
// =====================

router.post('/logout', (req, res) => {


  req.session.destroy(() => {

    res.json({
      ok: true
    });

  });


});



module.exports = router;
