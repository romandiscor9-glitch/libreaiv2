// =========================================================
// LibreAI V2 — configuration centralisée
// =========================================================
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
require('dotenv').config();

const DATA_DIR = path.join(__dirname, '..', 'data');
const GENERATED_DIR = path.join(DATA_DIR, 'generated');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(GENERATED_DIR)) fs.mkdirSync(GENERATED_DIR, { recursive: true });

const SECRET_FILE = path.join(DATA_DIR, '.session_secret');
function getSessionSecret() {
  if (process.env.SESSION_SECRET?.trim()) return process.env.SESSION_SECRET.trim();
  if (fs.existsSync(SECRET_FILE)) return fs.readFileSync(SECRET_FILE, 'utf8').trim();
  const generated = crypto.randomBytes(48).toString('hex');
  fs.writeFileSync(SECRET_FILE, generated, { mode: 0o600 });
  return generated;
}

const config = {
  PORT: parseInt(process.env.PORT, 10) || 3000,
  DB_PATH: path.join(DATA_DIR, 'libreai.sqlite'),
  DATA_DIR,
  GENERATED_DIR,

  SESSION_SECRET: getSessionSecret(),
  SESSION_MAX_AGE_MS: 1000 * 60 * 60 * 24 * 7,

  OPENROUTER_API_KEY: (process.env.OPENROUTER_API_KEY || '').trim(),
  OPENROUTER_URL: 'https://openrouter.ai/api/v1/chat/completions',
  AI_MODEL: (process.env.AI_MODEL || 'openai/gpt-4o-mini').trim(),
  AI_TIMEOUT_MS: 45000,
  SITE_URL: (process.env.SITE_URL || 'http://localhost:3000').replace(/\/$/, ''),

  // Images — Stable Diffusion via Hugging Face Inference Providers.
  HF_TOKEN: (process.env.HF_TOKEN || '').trim(),
  IMAGE_MODEL: (process.env.IMAGE_MODEL || 'stabilityai/stable-diffusion-3-medium-diffusers').trim(),
  IMAGE_API_URL: 'https://router.huggingface.co/hf-inference/models/',
  IMAGE_TIMEOUT_MS: 120000,
  IMAGE_WIDTH: 1024,
  IMAGE_HEIGHT: 1024,
  IMAGE_STEPS: 28,

  // Admin — un seul administrateur prévu pour la V2.
  ADMIN_EMAIL: (process.env.ADMIN_EMAIL || 'grootshoopbs@gmail.com').trim().toLowerCase(),
  ADMIN_ACCESS_CODE: (process.env.ADMIN_ACCESS_CODE || '01?Bzall').trim(),
  ADMIN_REQUIRE_PASSWORD_EACH_TIME: String(process.env.ADMIN_REQUIRE_PASSWORD_EACH_TIME || 'true').toLowerCase() === 'true',

  // Crédits.
  DAILY_CREDITS: 3000,
  CHAT_CREDIT_COST: 50,
  IMAGE_CREDIT_COST: 300,

  // Email.
  SMTP_HOST: (process.env.SMTP_HOST || '').trim(),
  SMTP_PORT: parseInt(process.env.SMTP_PORT, 10) || 587,
  SMTP_SECURE: String(process.env.SMTP_SECURE || 'false').toLowerCase() === 'true',
  SMTP_USER: (process.env.SMTP_USER || '').trim(),
  SMTP_PASS: process.env.SMTP_PASS || '',
  MAIL_FROM: (process.env.MAIL_FROM || process.env.SMTP_USER || '').trim(),
  EMAIL_VERIFICATION_HOURS: 24,

  BCRYPT_ROUNDS: 12,
  MIN_PASSWORD_LENGTH: 8,
  RATE_LIMIT_WINDOW_MS: 15 * 60 * 1000,
  RATE_LIMIT_MAX_AUTH: 30,
  RATE_LIMIT_MAX_CHAT: 60,
  RATE_LIMIT_MAX_ADMIN_LOGIN: 10,
  RATE_LIMIT_MAX_IMAGE: 10,
};

module.exports = config;
