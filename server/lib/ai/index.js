/**
 * Provider dispatch. The app works the same with Claude or with Gemini;
 * which one runs depends on the key present in the environment.
 */
import { config, aiConfigured } from '../../config.js';
import * as anthropic from './anthropic.js';
import * as gemini from './gemini.js';

export { textPart, imageParts } from './parts.js';

const ADAPTERS = { anthropic, gemini };

function adapter() {
  if (!aiConfigured()) {
    const error = new Error(
      "Aucune cle d'IA n'est configuree sur le serveur. Renseignez GEMINI_API_KEY ou ANTHROPIC_API_KEY."
    );
    error.status = 503;
    error.code = 'ai_not_configured';
    throw error;
  }
  const found = ADAPTERS[config.ai.provider];
  if (!found) {
    const error = new Error(`Fournisseur d'IA inconnu : ${config.ai.provider}.`);
    error.status = 500;
    throw error;
  }
  return found;
}

/** One structured call: text and images in, JSON matching `schema` out. */
export async function askForJson({ system, parts, schema, maxTokens = 16000, effort }) {
  const { text, usage } = await adapter().askForJson({ system, parts, schema, maxTokens, effort });
  try {
    return { data: JSON.parse(text), usage };
  } catch {
    const error = new Error("La reponse du modele n'etait pas un JSON valide.");
    error.status = 502;
    error.raw = text.slice(0, 2000);
    throw error;
  }
}

export const providerName = () => (aiConfigured() ? config.ai.provider : null);

export const supportsLiveSearch = () => aiConfigured();

export { adapter as currentAdapter };
