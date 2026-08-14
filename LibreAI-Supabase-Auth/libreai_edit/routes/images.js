const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const rateLimit = require('express-rate-limit');

const db = require('../db/database');
const config = require('../config/config');
const { requireAuth } = require('../middleware/auth');
const { generateImage, ImageError } = require('../services/imagegen');
const { chargeCredits, refundCredits, getCreditStatus } = require('../services/credits');

const router = express.Router();

router.use(requireAuth);


const imageLimiter = rateLimit({
  windowMs: config.RATE_LIMIT_WINDOW_MS,
  max: config.RATE_LIMIT_MAX_IMAGE,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Trop de générations d’images. Réessayez plus tard.'
  },
});


// Crédit restant
router.get('/credits', (req, res) => {
  res.json({
    credits: getCreditStatus(req.userId)
  });
});


// Galerie
router.get('/gallery', (req, res) => {

  const rows = db.prepare(`
    SELECT id, prompt, filename, model, width, height, created_at
    FROM image_generations
    WHERE user_id = ?
    ORDER BY id DESC
  `)
  .all(req.userId)
  .map((r) => ({
    ...r,
    url: `/media/generated/${encodeURIComponent(r.filename)}`
  }));

  res.json({
    images: rows
  });

});



// Génération image
router.post('/generate', imageLimiter, async (req, res) => {

  const prompt = (req.body?.prompt || '').toString().trim();


  if (!prompt) {
    return res.status(400).json({
      error: 'Le prompt ne peut pas être vide.'
    });
  }


  if (prompt.length > 2000) {
    return res.status(400).json({
      error: 'Prompt trop long (2000 caractères max).'
    });
  }



  const charge = chargeCredits(
    req.userId,
    config.IMAGE_CREDIT_COST
  );


  if (!charge.ok) {
    return res.status(402).json({
      error: `Crédits insuffisants. Il vous reste ${charge.credits ?? 0} crédit(s).`,
      code: 'insufficient_credits',
      credits: charge.credits ?? 0
    });
  }



  try {

    const started = Date.now();


    const result = await generateImage(prompt);



    const ext =
      result.contentType.includes('jpeg') ||
      result.contentType.includes('jpg')
      ? 'jpg'
      : 'png';



    const filename =
      `${Date.now()}-${crypto.randomBytes(8).toString('hex')}.${ext}`;



    fs.writeFileSync(
      path.join(config.GENERATED_DIR, filename),
      result.buffer
    );



    /*
      Conversion utilisateur Supabase -> utilisateur SQLite
    */

    const sqliteUser = db.prepare(
      'SELECT id FROM users WHERE supabase_id = ?'
    )
    .get(req.userId);



    if (!sqliteUser) {
      throw new Error(
        'Utilisateur SQLite introuvable pour cette session.'
      );
    }



    const info = db.prepare(`
      INSERT INTO image_generations
      (
        user_id,
        prompt,
        filename,
        model,
        width,
        height
      )
      VALUES (?, ?, ?, ?, ?, ?)
    `)
    .run(
      sqliteUser.id,
      prompt,
      filename,
      config.IMAGE_MODEL,
      config.IMAGE_WIDTH,
      config.IMAGE_HEIGHT
    );




    const image = db.prepare(`
      SELECT id, prompt, filename, model, width, height, created_at
      FROM image_generations
      WHERE id = ?
    `)
    .get(info.lastInsertRowid);



    res.json({

      image: {
        ...image,
        url: `/media/generated/${encodeURIComponent(filename)}`
      },

      credits: getCreditStatus(req.userId),

      durationMs: Date.now() - started

    });



  } catch (err) {


    console.error(err);



    refundCredits(
      req.userId,
      config.IMAGE_CREDIT_COST
    );



    const message =
      err instanceof ImageError
      ? err.message
      : err.message || 'Erreur inattendue pendant la génération.';



    res.status(502).json({

      error: message,

      code: err.code || 'image_error'

    });


  }

});



// Suppression image
router.delete('/gallery/:id', (req, res) => {


  const image = db.prepare(
    'SELECT * FROM image_generations WHERE id = ? AND user_id = ?'
  )
  .get(
    req.params.id,
    req.userId
  );


  if (!image) {
    return res.status(404).json({
      error: 'Image introuvable.'
    });
  }



  const filePath = path.join(
    config.GENERATED_DIR,
    image.filename
  );



  try {

    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

  } catch {}



  db.prepare(
    'DELETE FROM image_generations WHERE id = ?'
  )
  .run(image.id);



  res.json({
    ok: true
  });


});



module.exports = router;
