const express = require('express');
const config = require('../config/config');

const router = express.Router();


// Déverrouillage admin
router.post('/unlock', (req, res) => {

  try {

    const { code } = req.body || {};


    if (!code) {
      return res.status(400).json({
        error: 'Code requis.'
      });
    }


    if (code !== config.ADMIN_ACCESS_CODE) {

      return res.status(403).json({
        error: 'Code administrateur incorrect.'
      });

    }



    req.session.isAdmin = true;



    res.json({
      ok: true
    });



  } catch (e) {

    console.error('Admin unlock error:', e);

    res.status(500).json({
      error: 'Erreur serveur interne.'
    });

  }

});


module.exports = router;
