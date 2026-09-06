import { GoogleGenAI } from '@google/genai';
import { config } from '../../config.js';

let client = null;

export function getClient() {
  if (!client) {
    const baseUrl = process.env.GEMINI_BASE_URL || '';
    client = new GoogleGenAI({
      apiKey: config.ai.apiKey,
      ...(baseUrl ? { httpOptions: { baseUrl } } : {}),
    });
  }
  return client;
}

const toContents = (parts) => [
  {
    role: 'user',
    parts: parts.map((part) =>
      part.kind === 'image'
        ? { inlineData: { mimeType: part.mediaType, data: part.data } }
        : { text: part.text }
    ),
  },
];

/**
 * Gemini rejects an unknown model with a bare 404. Listing what the key can
 * actually reach turns that into something the user can act on.
 */
async function describeModelError(error) {
  const message = String(error?.message || error);
  if (!/not found|404|is not supported/i.test(message)) return null;
  try {
    const names = [];
    for await (const model of await getClient().models.list()) {
      if (model.name) names.push(String(model.name).replace(/^models\//, ''));
      if (names.length >= 12) break;
    }
    if (!names.length) return null;
    return `Le modele "${config.ai.model}" n'est pas accessible avec cette cle. Modeles disponibles : ${names.join(', ')}. Choisissez-en un via la variable GEMINI_MODEL.`;
  } catch {
    return null;
  }
}

export async function askForJson({ system, parts, schema, maxTokens = 16000 }) {
  const ai = getClient();
  let response;
  try {
    response = await ai.models.generateContent({
      model: config.ai.model,
      contents: toContents(parts),
      config: {
        systemInstruction: system,
        responseMimeType: 'application/json',
        responseJsonSchema: schema,
        maxOutputTokens: maxTokens,
      },
    });
  } catch (error) {
    const hint = await describeModelError(error);
    if (hint) {
      const friendly = new Error(hint);
      friendly.status = 400;
      friendly.code = 'model_not_found';
      throw friendly;
    }
    throw error;
  }

  const blocked = response.candidates?.[0]?.finishReason;
  if (blocked && !['STOP', 'MAX_TOKENS'].includes(blocked)) {
    const error = new Error(
      `Le modele a interrompu sa reponse (${blocked}). Reessayez avec d'autres photos ou une autre description.`
    );
    error.status = 422;
    error.code = 'blocked';
    throw error;
  }

  const text = (response.text || '').trim();
  if (!text) {
    const error = new Error("Le modele n'a renvoye aucun contenu exploitable.");
    error.status = 502;
    throw error;
  }

  const usage = response.usageMetadata
    ? { input_tokens: response.usageMetadata.promptTokenCount, output_tokens: response.usageMetadata.candidatesTokenCount }
    : undefined;
  return { text, usage };
}

/**
 * Grounded product lookup: Google Search grounding cannot be combined with a
 * response schema, so the search runs first and a second, schema-bound call
 * turns what it found into structured products.
 */
export async function searchGrounded({ system, prompt, schema, allowedDomains = [] }) {
  const ai = getClient();
  const scope = allowedDomains.length
    ? `\n\nRestreins-toi aux sites suivants : ${allowedDomains.join(', ')}. Ignore tout resultat provenant d'un autre domaine.`
    : '';

  const grounded = await ai.models.generateContent({
    model: config.ai.model,
    contents: [{ role: 'user', parts: [{ text: prompt + scope }] }],
    config: { systemInstruction: system, tools: [{ googleSearch: {} }] },
  });

  const findings = (grounded.text || '').trim();
  if (!findings) return { text: '{"produits":[]}', usage: undefined };

  return askForJson({
    system:
      "Tu convertis des resultats de recherche en donnees structurees. N'invente aucun produit, aucun prix et aucune URL : reprends uniquement ce qui figure dans le texte fourni.",
    parts: [
      {
        kind: 'text',
        text: `Voici le resultat d'une recherche de produits :\n\n${findings}\n\nConvertis-le au format demande.`,
      },
    ],
    schema,
    maxTokens: 4000,
  });
}
