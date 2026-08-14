const express = require('express');

const db = require('../db/database');
const { requireAdmin } = require('../middleware/admin');

const router = express.Router();


// ======================================================
// Protection admin
// ======================================================

router.use(requireAdmin);




// ======================================================
// Dashboard statistiques
// ======================================================

router.get('/stats', (req, res) => {

  try {


    const totalUsers = db.prepare(`
      SELECT COUNT(*) AS count
      FROM users
    `).get().count;



    const newUsers = db.prepare(`
      SELECT COUNT(*) AS count
      FROM users
      WHERE created_at >= datetime('now','-7 days')
    `).get().count;



    const activeUsers = db.prepare(`
      SELECT COUNT(*) AS count
      FROM users
      WHERE is_active = 1
    `).get().count;



    const onlineUsers = db.prepare(`
      SELECT COUNT(*) AS count
      FROM users
      WHERE last_login >= datetime('now','-24 hours')
    `).get().count;



    const conversations = db.prepare(`
      SELECT COUNT(*) AS count
      FROM conversations
    `).get().count;



    const messages = db.prepare(`
      SELECT COUNT(*) AS count
      FROM messages
      WHERE role = 'user'
    `).get().count;



    const aiRequests = db.prepare(`
      SELECT COUNT(*) AS count
      FROM ai_request_logs
    `).get().count;



    const aiErrors = db.prepare(`
      SELECT COUNT(*) AS count
      FROM ai_request_logs
      WHERE success = 0
    `).get().count;



    res.json({

      // Format actuel
      users: {

        total: totalUsers,

        new7d: newUsers,

        active: activeUsers,

        online24h: onlineUsers

      },


      conversations,

      messages,

      aiRequests,

      aiErrors,



      // Compatibilité ancien panneau admin

      totalUsers,

      newUsers,

      activeUsers,

      onlineUsers,

      totalConversations: conversations,

      totalMessages: messages,

      totalAIRequests: aiRequests,

      totalAIErrors: aiErrors


    });



  } catch (e) {


    console.error('Admin stats error:', e);


    res.status(500).json({

      error: 'Erreur serveur interne.'

    });


  }

});






// ======================================================
// Liste utilisateurs
// ======================================================

router.get('/users', (req, res) => {

  try {


    const users = db.prepare(`

      SELECT

        id,
        email,
        username,
        is_active,
        is_admin,
        email_verified,
        credits,
        created_at,
        last_login

      FROM users

      ORDER BY id DESC

    `).all();



    res.json({

      users

    });



  } catch (e) {


    console.error('Admin users error:', e);


    res.status(500).json({

      error: 'Erreur serveur interne.'

    });


  }

});






// ======================================================
// Modifier utilisateur
// ======================================================

router.patch('/users/:id', (req, res) => {

  try {


    const { is_active } = req.body;



    db.prepare(`

      UPDATE users

      SET is_active = ?

      WHERE id = ?

    `)
    .run(

      is_active ? 1 : 0,

      req.params.id

    );



    res.json({

      ok: true

    });



  } catch (e) {


    console.error('Admin update user error:', e);


    res.status(500).json({

      error: 'Erreur serveur interne.'

    });


  }

});






// ======================================================
// Logs admin
// ======================================================

router.get('/logs', (req, res) => {

  try {


    const logs = db.prepare(`

      SELECT *

      FROM admin_logs

      ORDER BY id DESC

      LIMIT 100

    `).all();



    res.json({

      logs

    });



  } catch (e) {


    console.error('Admin logs error:', e);


    res.status(500).json({

      error: 'Erreur serveur interne.'

    });


  }

});





module.exports = router;
