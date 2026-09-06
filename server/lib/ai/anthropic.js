import Anthropic from '@anthropic-ai/sdk';
import { config } from '../../config.js';

let client = null;

export function getClient() {
  if (!client) client = new Anthropic({ apiKey: config.ai.apiKey });
  return client;
}

const toContent = (parts) =>
  parts.map((part) =>
    part.kind === 'image'
      ? { type: 'image', source: { type: 'base64', media_type: part.mediaType, data: part.data } }
      : { type: 'text', text: part.text }
  );

function textOf(message) {
  return message.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('')
    .trim();
}

export async function askForJson({ system, parts, schema, maxTokens = 16000, effort }) {
  const anthropic = getClient();
  const params = {
    model: config.ai.model,
    max_tokens: maxTokens,
    system,
    messages: [{ role: 'user', content: toContent(parts) }],
    output_config: {
      effort: effort || config.ai.effort,
      format: { type: 'json_schema', schema },
    },
  };

  const message = config.ai.enableFallbacks
    ? await anthropic.beta.messages.create({
        ...params,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
      })
    : await anthropic.messages.create(params);

  if (message.stop_reason === 'refusal') {
    const error = new Error(
      "Le modele n'a pas pu traiter ces photos. Reessayez avec d'autres images ou une autre description."
    );
    error.status = 422;
    error.code = 'refusal';
    throw error;
  }

  const text = textOf(message);
  if (!text) {
    const error = new Error("Le modele n'a renvoye aucun contenu exploitable.");
    error.status = 502;
    throw error;
  }
  return { text, usage: message.usage };
}
