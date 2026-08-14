const express = require('express');
const config = require('../config/config');

const router = express.Router();


// ======================================================
// Vérification code administrateur
// Compatible /verify et /unlock
// ======================================================

function verifyAdmin(req, res) {

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



    // Mémorisation de l'accès admin dans la session
    req.session.isAdmin = true;



    res.json({

      ok: true,

      message: 'Accès administrateur autorisé.'

    });



  } catch (e) {


    console.error('Admin auth error:', e);


    res.status(500).json({

      error: 'Erreur serveur interne.'

    });


  }

}



// Ancienne route utilisée par ton frontend actuel
router.post('/verify', verifyAdmin);


// Nouvelle route compatible
router.post('/unlock', verifyAdmin);



module.exports = router;
