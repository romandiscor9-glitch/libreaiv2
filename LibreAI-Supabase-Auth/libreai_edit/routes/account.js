const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { getCreditStatus } = require('../services/credits');
const supabase = require('../services/supabase');

const router = express.Router();


router.get('/stats', requireAuth, async (req, res) => {
  try {

    const { data, error } = await supabase.auth.getUser();

    if (error || !data.user) {
      return res.status(401).json({
        error: 'Utilisateur non authentifié.'
      });
    }


    const user = data.user;


    res.json({
      user: {
        email: user.email,
        username: user.user_metadata?.username || '',
        createdAt: user.created_at,
        lastLogin: user.last_sign_in_at,
        emailVerified: !!user.email_confirmed_at,
        isAdmin: false
      },

      stats: {
        conversations: 0,
        messages: 0,
        images: 0
      },

      credits: getCreditStatus(req.userId)
    });


  } catch (e) {

    console.error('Account stats error:', e);

    res.status(500).json({
      error: 'Erreur serveur interne.'
    });

  }
});


module.exports = router;
