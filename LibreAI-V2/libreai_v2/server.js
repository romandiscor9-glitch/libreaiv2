const express = require('express');
const path = require('path');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);

const config = require('./config/config');
require('./db/database'); // initialise le schéma au démarrage

const authRoutes = require('./routes/auth');
const chatRoutes = require('./routes/chat');
const accountRoutes = require('./routes/account');
const adminRoutes = require('./routes/admin');
const imageRoutes = require('./routes/images');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);

app.use(express.json({ limit: '1mb' }));

// --- En-têtes de sécurité basiques (sans dépendance supplémentaire) ---
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  next();
});

// --- Session persistante (survit aux redémarrages, stockée dans data/) ---
app.use(
  session({
    store: new SQLiteStore({ db: 'sessions.sqlite', dir: config.DATA_DIR }),
    name: 'libreai.sid',
    secret: config.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: config.SESSION_MAX_AGE_MS,
      secure: process.env.NODE_ENV === 'production',
    },
  })
);

// --- API ---
app.use('/api/auth', authRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/account', accountRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/images', imageRoutes);

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    aiConfigured: Boolean(config.OPENROUTER_API_KEY),
    imageConfigured: Boolean(config.HF_TOKEN),
    model: config.AI_MODEL,
    imageModel: config.IMAGE_MODEL
  });
});

// --- Fichiers statiques (frontend) ---
app.use('/media/generated', express.static(config.GENERATED_DIR, { maxAge: '1d', immutable: false }));
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin', 'index.html'));
});

// 404 pour les routes API inconnues
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Route API introuvable.' });
});

// Toute autre route sert l'application (le routage de page se fait côté client)
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --- Gestionnaire d'erreurs global ---
app.use((err, req, res, next) => {
  console.error('Erreur non gérée :', err);
  res.status(500).json({ error: 'Erreur serveur interne.' });
});

app.listen(config.PORT, () => {
  console.log('='.repeat(50));
  console.log(`  LibreAI démarré sur http://localhost:${config.PORT}`);
  console.log(`  Modèle IA : ${config.AI_MODEL}`);
  console.log(`  Clé OpenRouter configurée : ${config.OPENROUTER_API_KEY ? 'oui' : 'NON — le chat renverra une erreur claire'}`);
  console.log(`  Panneau admin : http://localhost:${config.PORT}/admin`);
  console.log('='.repeat(50));
});
