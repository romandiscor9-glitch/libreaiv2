const sqliteUser = db.prepare(
  'SELECT id FROM users WHERE supabase_id = ?'
).get(req.userId);

if (!sqliteUser) {
  throw new Error('Utilisateur SQLite introuvable.');
}

const info = db.prepare(`
  INSERT INTO image_generations (user_id, prompt, filename, model, width, height)
  VALUES (?, ?, ?, ?, ?, ?)
`).run(
  sqliteUser.id,
  prompt,
  filename,
  config.IMAGE_MODEL,
  config.IMAGE_WIDTH,
  config.IMAGE_HEIGHT
);
