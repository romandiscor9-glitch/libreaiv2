// =========================================================
// LibreAI V2 — SQLite + migrations légères
// =========================================================
const Database = require('better-sqlite3');
const config = require('../config/config');

const db = new Database(config.DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  username TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  is_admin INTEGER NOT NULL DEFAULT 0,
  email_verified INTEGER NOT NULL DEFAULT 0,
  verification_token_hash TEXT,
  verification_expires_at TEXT,
  credits INTEGER NOT NULL DEFAULT 3000,
  credits_reset_at TEXT NOT NULL DEFAULT (date('now')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_login TEXT
);

CREATE TABLE IF NOT EXISTS conversations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'Nouvelle conversation',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK(role IN ('user','assistant')),
  content TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ai_request_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  success INTEGER NOT NULL,
  error TEXT,
  model TEXT,
  duration_ms INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS image_generations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  prompt TEXT NOT NULL,
  filename TEXT NOT NULL,
  model TEXT NOT NULL,
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS admin_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  action TEXT NOT NULL,
  details TEXT,
  ip TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_conversations_user ON conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_ai_logs_created ON ai_request_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_images_user ON image_generations(user_id, created_at);
`);

function hasColumn(table, column) {
  return db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === column);
}
function addColumn(table, column, definition) {
  if (!hasColumn(table, column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    return true;
  }
  return false;
}

// Migrations pour une base V1 existante.
addColumn('users', 'is_admin', 'INTEGER NOT NULL DEFAULT 0');
const addedEmailVerified = addColumn('users', 'email_verified', 'INTEGER NOT NULL DEFAULT 0');
addColumn('users', 'verification_token_hash', 'TEXT');
addColumn('users', 'verification_expires_at', 'TEXT');
addColumn('users', 'credits', 'INTEGER NOT NULL DEFAULT 3000');
addColumn('users', 'credits_reset_at', "TEXT NOT NULL DEFAULT '1970-01-01'");

// Les comptes V1 existants restent utilisables ; seuls les nouveaux comptes passent
// par la confirmation e-mail. L'admin principal existant est également confirmé.
if (addedEmailVerified) {
  db.prepare('UPDATE users SET email_verified = 1').run();
}

// L'admin V2 est déterminé par son adresse e-mail côté serveur.
db.prepare('UPDATE users SET is_admin = CASE WHEN lower(email) = lower(?) THEN 1 ELSE is_admin END WHERE lower(email) = lower(?)')
  .run(config.ADMIN_EMAIL, config.ADMIN_EMAIL);

module.exports = db;
