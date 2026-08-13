const fetch = require('node-fetch');
const config = require('../config/config');

class ImageError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
  }
}

async function generateImage(prompt) {
  if (!config.HF_TOKEN) {
    throw new ImageError("Aucun HF_TOKEN n'est configuré. Ajoutez un token Hugging Face avec l'accès Inference Providers dans .env.", 'no_key');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.IMAGE_TIMEOUT_MS);
  const url = `${config.IMAGE_API_URL}${config.IMAGE_MODEL}`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.HF_TOKEN}`,
        'Content-Type': 'application/json',
        Accept: 'image/*',
      },
      body: JSON.stringify({
        inputs: prompt,
        parameters: {
          width: config.IMAGE_WIDTH,
          height: config.IMAGE_HEIGHT,
          num_inference_steps: config.IMAGE_STEPS,
        },
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      let detail = '';
      try {
        const text = await response.text();
        detail = text.slice(0, 700);
      } catch {}
      if (response.status === 401 || response.status === 403) {
        throw new ImageError('Le HF_TOKEN est invalide ou ne possède pas les permissions d’inférence nécessaires.', 'auth');
      }
      if (response.status === 429) {
        throw new ImageError('Le service de génération d’images est temporairement limité. Réessayez dans un instant.', 'rate_limit');
      }
      throw new ImageError(`Erreur Stable Diffusion (HTTP ${response.status}) : ${detail || 'raison inconnue'}`, 'api_error');
    }

    const contentType = response.headers.get('content-type') || 'image/png';
    const buffer = await response.buffer();
    if (!buffer.length) throw new ImageError('Le service d’image a renvoyé une image vide.', 'empty');

    return { buffer, contentType };
  } catch (err) {
    if (err instanceof ImageError) throw err;
    if (err.name === 'AbortError') throw new ImageError('La génération a dépassé le délai maximum.', 'timeout');
    throw new ImageError(`Impossible de contacter le service d’image : ${err.message}`, 'network');
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = { generateImage, ImageError };
