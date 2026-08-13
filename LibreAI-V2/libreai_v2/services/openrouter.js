// =========================================================
// LibreAI - Service d'intégration OpenRouter
// La clé API n'est JAMAIS envoyée au navigateur : tout se passe ici, côté serveur.
// =========================================================
const fetch = require('node-fetch');
const config = require('../config/config');

class AiError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code; // 'no_key' | 'timeout' | 'network' | 'empty' | 'rate_limit' | 'api_error'
  }
}

/**
 * Envoie une conversation à OpenRouter et retourne le texte de la réponse.
 * @param {Array<{role: 'user'|'assistant', content: string}>} history
 */
async function getChatCompletion(history) {
  if (!config.OPENROUTER_API_KEY) {
    throw new AiError(
      "Aucune clé OPENROUTER_API_KEY n'est configurée sur le serveur. Ajoutez-la dans le fichier .env puis redémarrez le serveur.",
      'no_key'
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.AI_TIMEOUT_MS);

  let response;
  try {
    response = await fetch(config.OPENROUTER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.OPENROUTER_API_KEY}`,
        'HTTP-Referer': config.SITE_URL,
        'X-Title': 'LibreAI',
      },
      body: JSON.stringify({
        model: config.AI_MODEL,
        messages: history,
        temperature: 0.7,
      }),
      signal: controller.signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new AiError("Le service IA n'a pas répondu à temps (timeout). Réessayez dans un instant.", 'timeout');
    }
    throw new AiError(`Impossible de contacter OpenRouter : ${err.message}`, 'network');
  } finally {
    clearTimeout(timeout);
  }

  if (response.status === 401) {
    throw new AiError("La clé OPENROUTER_API_KEY configurée est invalide ou a été révoquée.", 'api_error');
  }
  if (response.status === 429) {
    throw new AiError("Limite de requêtes OpenRouter atteinte. Réessayez dans quelques instants.", 'rate_limit');
  }
  if (!response.ok) {
    let detail = '';
    try {
      const errJson = await response.json();
      detail = errJson?.error?.message || JSON.stringify(errJson);
    } catch {
      detail = await response.text().catch(() => '');
    }
    throw new AiError(`Erreur de l'API IA (HTTP ${response.status}) : ${detail || 'raison inconnue'}`, 'api_error');
  }

  let data;
  try {
    data = await response.json();
  } catch {
    throw new AiError("Réponse invalide reçue du service IA (JSON illisible).", 'empty');
  }

  const content = data?.choices?.[0]?.message?.content;
  if (!content || !content.trim()) {
    throw new AiError("Le modèle IA a renvoyé une réponse vide. Essayez de reformuler votre message.", 'empty');
  }

  return content;
}

module.exports = { getChatCompletion, AiError };
