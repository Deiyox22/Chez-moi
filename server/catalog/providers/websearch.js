/**
 * Live product lookup on the real store websites.
 *
 * A merchant feed (providers/feed.js) is the right tool for a whole catalogue, but it
 * requires an affiliate account. This provider covers the other case: asking for the few
 * products that answer one need, right now, on the actual store sites. It uses the model's
 * server-side web search, restricted to the domains declared in config/stores.json, then
 * has the model hand back the results through a strict tool so they arrive structured.
 */

import { getClient } from '../../lib/ai/anthropic.js';
import { searchGrounded } from '../../lib/ai/gemini.js';
import { config } from '../../config.js';

const MAX_ITERATIONS = 8;

const RECORD_TOOL = {
  name: 'enregistrer_produits',
  description:
    "Enregistre les produits reellement trouves sur les sites des magasins. N'appelle cet outil qu'une seule fois, a la fin, avec les produits verifies.",
  strict: true,
  input_schema: {
    type: 'object',
    properties: {
      produits: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            titre: { type: 'string', description: 'Nom du produit tel qu\'il apparait sur le site.' },
            magasin: { type: 'string', description: "Identifiant du magasin, par exemple ikea." },
            prix: { type: 'number', description: 'Prix en euros. 0 si le prix n\'a pas ete trouve.' },
            url: { type: 'string', description: 'Lien vers la fiche produit sur le site du magasin.' },
            description: { type: 'string' },
            couleurs: { type: 'array', items: { type: 'string' } },
            materiaux: { type: 'array', items: { type: 'string' } },
            dimensions: { type: 'string', description: 'Dimensions telles qu\'annoncees, ou chaine vide.' },
            certitude: { type: 'string', enum: ['verifie', 'probable'], description: "verifie si le prix et le lien viennent d'une page produit vue pendant la recherche." },
          },
          required: ['titre', 'magasin', 'prix', 'url', 'description', 'couleurs', 'materiaux', 'dimensions', 'certitude'],
          additionalProperties: false,
        },
      },
    },
    required: ['produits'],
    additionalProperties: false,
  },
};

const SYSTEM = `Tu cherches des produits d'ameublement reels sur les sites de magasins, pour completer un projet de decoration.

Regles :
- Utilise la recherche web pour trouver de vraies fiches produit sur les sites autorises. N'invente jamais un produit, un prix ni une URL.
- Ne retiens que des produits qui repondent au besoin demande et qui respectent le budget.
- Le prix doit etre celui affiche sur la page trouvee. Si tu ne l'as pas vu, mets 0 et marque "probable".
- Marque "verifie" uniquement quand le lien pointe vers une fiche produit que la recherche a reellement remontee.
- Cinq produits au maximum, les plus pertinents d'abord.
- Termine toujours en appelant l'outil enregistrer_produits, meme si tu n'as rien trouve (tableau vide).`;

function normalize(product, storesById) {
  const store = storesById.get(product.magasin) || null;
  return {
    id: `live-${product.magasin}-${product.titre}`.slice(0, 90),
    store: product.magasin,
    storeName: store?.name || product.magasin,
    title: product.titre,
    description: product.description || '',
    category: '',
    price: Number(product.prix) > 0 ? Number(product.prix) : null,
    currency: store?.currency || 'EUR',
    url: product.url,
    imageUrl: null,
    brand: store?.name || '',
    colors: product.couleurs || [],
    materials: product.materiaux || [],
    styles: [],
    dimensionsCm: null,
    dimensionsText: product.dimensions || '',
    availability: null,
    source: 'recherche-en-ligne',
    priceIsIndicative: product.certitude !== 'verifie',
    confidence: product.certitude,
  };
}

function buildBrief({ query, maxPrice, styles, colors, searchable, limit }) {
  return [
    `Besoin : ${query}`,
    maxPrice ? `Budget maximum : ${maxPrice} euros` : null,
    styles.length ? `Styles recherches : ${styles.join(', ')}` : null,
    colors.length ? `Couleurs recherchees : ${colors.join(', ')}` : null,
    '',
    'Magasins autorises (utilise leur identifiant dans le champ magasin) :',
    ...searchable.map((store) => `- ${store.id} : ${store.name}, ${store.site}`),
    '',
    `Trouve au maximum ${limit} produits.`,
  ]
    .filter(Boolean)
    .join('\n');
}

const finalize = (produits, storesById, limit) =>
  (produits || [])
    .slice(0, limit)
    .map((product) => normalize(product, storesById))
    .filter((product) => product.url && product.title);

/** Claude: server-side web search, then a strict tool call to hand back the results. */
async function searchWithAnthropic({ brief, searchable, storesById, limit }) {
  const client = getClient();
  const messages = [{ role: 'user', content: `${brief}\n\nPuis appelle enregistrer_produits.` }];
  const tools = [
    {
      type: 'web_search_20260209',
      name: 'web_search',
      max_uses: Math.max(3, searchable.length),
      allowed_domains: searchable.map((store) => store.domain),
      user_location: { type: 'approximate', country: 'FR' },
    },
    RECORD_TOOL,
  ];

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration += 1) {
    const message = await client.messages.create({
      model: config.ai.model,
      max_tokens: 8000,
      system: SYSTEM,
      messages,
      tools,
      output_config: { effort: 'low' },
    });

    if (message.stop_reason === 'refusal') {
      const error = new Error('La recherche en ligne a ete refusee par le modele.');
      error.status = 422;
      throw error;
    }

    const recorded = message.content.find((block) => block.type === 'tool_use' && block.name === RECORD_TOOL.name);
    if (recorded) return finalize(recorded.input?.produits, storesById, limit);

    // Web search runs server-side, so a long search comes back as pause_turn:
    // push the paused turn back and let the model carry on.
    if (message.stop_reason === 'pause_turn') {
      messages.push({ role: 'assistant', content: message.content });
      continue;
    }

    return [];
  }

  return [];
}

/** Gemini: Google Search grounding, then a schema-bound pass to structure it. */
async function searchWithGemini({ brief, searchable, storesById, limit }) {
  const { text } = await searchGrounded({
    system: SYSTEM,
    prompt: brief,
    schema: RECORD_TOOL.input_schema,
    allowedDomains: searchable.map((store) => store.domain),
  });
  try {
    return finalize(JSON.parse(text).produits, storesById, limit);
  } catch {
    return [];
  }
}

/**
 * @param {object} options
 * @param {string} options.query        what to look for
 * @param {number|null} options.maxPrice
 * @param {string[]} options.styles
 * @param {string[]} options.colors
 * @param {Array} options.stores        store config entries to search in
 * @param {number} [options.limit]
 */
export async function searchLiveProducts({ query, maxPrice = null, styles = [], colors = [], stores = [], limit = 5 }) {
  const searchable = stores.filter((store) => store.domain);
  if (!searchable.length) {
    const error = new Error('Aucun magasin ne declare de domaine dans config/stores.json.');
    error.status = 400;
    throw error;
  }

  const storesById = new Map(searchable.map((store) => [store.id, store]));
  const brief = buildBrief({ query, maxPrice, styles, colors, searchable, limit });
  const args = { brief, searchable, storesById, limit };

  return config.ai.provider === 'gemini' ? searchWithGemini(args) : searchWithAnthropic(args);
}
