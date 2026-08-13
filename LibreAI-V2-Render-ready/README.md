# LibreAI V2

LibreAI V2 conserve le chat IA de la V1 et ajoute uniquement :

- 🎨 génération d’images avec Stable Diffusion via Hugging Face Inference Providers ;
- 🖼️ galerie personnelle ;
- 💳 3 000 crédits/jour ;
- 💬 50 crédits par requête texte ;
- 🎨 300 crédits par image ;
- ♾️ crédits illimités pour l’administrateur principal ;
- 📧 confirmation e-mail pour les nouveaux comptes ;
- 🛡️ panneau admin intégré à l’interface principale (ouverture dans la même page) ;
- 🔐 code admin redemandé à chaque ouverture lorsque `ADMIN_REQUIRE_PASSWORD_EACH_TIME=true`.

## Installation

```bash
npm install
cp .env.example .env
npm start
```

## Variables importantes

### Chat
`OPENROUTER_API_KEY` : clé OpenRouter.

### Images
`HF_TOKEN` : token Hugging Face avec permission **Inference Providers**.
`IMAGE_MODEL` : par défaut `stabilityai/stable-diffusion-3-medium-diffusers`.

Le backend appelle le routeur Hugging Face côté serveur : la clé n’est jamais envoyée au navigateur.

### E-mail
Configurez `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` et `MAIL_FROM`.

Sans SMTP configuré, les nouveaux comptes ne peuvent pas terminer leur inscription car l’e-mail de confirmation ne peut pas être envoyé.

### Admin
Le seul administrateur prévu pour cette V2 est :

`grootshoopbs@gmail.com`

L’adresse est vérifiée côté serveur. Le code `ADMIN_ACCESS_CODE` est également vérifié côté serveur.

## Crédits

Les crédits sont gérés exclusivement côté serveur.

- utilisateur : 3 000 crédits/jour ;
- requête texte : 50 ;
- image : 300 ;
- admin : illimité.

Une génération d’image ou une requête texte échouée rembourse automatiquement le coût de la tentative.

## Stockage

SQLite et les images sont stockés dans `data/`. Sur une plateforme avec disque éphémère, prévoyez un stockage persistant pour conserver les données et la galerie après redéploiement.

## Déploiement Render

- Build : `npm install`
- Start : `npm start`
- Node : 22.x
- Ajoutez toutes les variables `.env` nécessaires dans les variables d’environnement Render.
