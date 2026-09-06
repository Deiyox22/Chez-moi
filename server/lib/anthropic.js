import Anthropic from '@anthropic-ai/sdk';
import { config, aiConfigured } from '../config.js';

let client = null;

export function getClient() {
  if (!aiConfigured()) {
    const error = new Error(
      "Aucune cle ANTHROPIC_API_KEY n'est configuree sur le serveur. Copiez .env.example vers .env et renseignez votre cle."
    );
    error.status = 503;
    error.code = 'ai_not_configured';
    throw error;
  }
  if (!client) client = new Anthropic({ apiKey: config.anthropic.apiKey });
  return client;
}

const ALLOWED_MEDIA_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

/**
 * Turns the images posted by the PWA into Anthropic image content blocks.
 * @param {Array<{media_type: string, data: string}>} images
 */
export function imageBlocks(images = []) {
  return images.map((image, index) => {
    const mediaType = ALLOWED_MEDIA_TYPES.has(image.media_type) ? image.media_type : 'image/jpeg';
    const data = String(image.data || '').replace(/^data:[^,]+,/, '').replace(/\s+/g, '');
    if (!data) {
      const error = new Error(`La photo ${index + 1} est vide ou illisible.`);
      error.status = 400;
      throw error;
    }
    return { type: 'image', source: { type: 'base64', media_type: mediaType, data } };
  });
}

function extractText(message) {
  return message.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('')
    .trim();
}

/**
 * One structured-output call: sends text and images, gets JSON matching `schema`.
 * @param {object} options
 * @param {string} options.system
 * @param {Array<object>} options.content  user content blocks
 * @param {object} options.schema          JSON schema the answer must match
 * @param {number} [options.maxTokens]
 * @param {string} [options.effort]
 */
export async function askForJson({ system, content, schema, maxTokens = 16000, effort }) {
  const anthropic = getClient();
  const params = {
    model: config.anthropic.model,
    max_tokens: maxTokens,
    system,
    messages: [{ role: 'user', content }],
    output_config: {
      effort: effort || config.anthropic.effort,
      format: { type: 'json_schema', schema },
    },
  };

  let message;
  if (config.anthropic.enableFallbacks) {
    message = await anthropic.beta.messages.create({
      ...params,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    });
  } else {
    message = await anthropic.messages.create(params);
  }

  if (message.stop_reason === 'refusal') {
    const error = new Error(
      "Le modele n'a pas pu traiter ces photos. Reessayez avec d'autres images ou une autre description."
    );
    error.status = 422;
    error.code = 'refusal';
    error.details = message.stop_details || null;
    throw error;
  }

  const text = extractText(message);
  if (!text) {
    const error = new Error("Le modele n'a renvoye aucun contenu exploitable.");
    error.status = 502;
    throw error;
  }

  try {
    return { data: JSON.parse(text), usage: message.usage };
  } catch {
    const error = new Error("La reponse du modele n'etait pas un JSON valide.");
    error.status = 502;
    error.raw = text.slice(0, 2000);
    throw error;
  }
}
