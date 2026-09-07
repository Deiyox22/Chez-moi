import { browseCatalog, catalogHighlights, catalogStatus, imageAutorisee, searchUrlFor, loadStores } from '../catalog/store.js';
import { searchLiveProducts } from '../catalog/providers/websearch.js';
import { aiConfigured } from '../config.js';

const list = (value) => String(value || '').split(',').map((part) => part.trim()).filter(Boolean);

const nombre = (valeur) => {
  const n = Number(valeur);
  return valeur && Number.isFinite(n) ? n : null;
};

export async function search(query) {
  const limit = Math.min(Number(query.get('limit') || 24), 60);
  const offset = Math.max(Number(query.get('offset') || 0), 0);
  const maxPrice = nombre(query.get('maxPrice'));
  const minPrice = nombre(query.get('minPrice'));
  const term = query.get('q') || '';
  const styles = list(query.get('styles'));
  const colors = list(query.get('colors'));

  const resultat = browseCatalog({
    query: term,
    category: query.get('category') || '',
    categories: list(query.get('categories')),
    stores: list(query.get('store') || query.get('stores')),
    maxPrice,
    minPrice,
    styles,
    colors,
    sort: query.get('sort') || 'pertinence',
    limit,
    offset,
  });

  // Live lookup on the real store sites, on demand.
  if (query.get('live') === '1' && term) {
    if (!aiConfigured()) {
      const error = new Error("La recherche en ligne necessite une cle d'IA sur le serveur (GEMINI_API_KEY ou ANTHROPIC_API_KEY).");
      error.status = 503;
      error.code = 'ai_not_configured';
      throw error;
    }
    const wanted = list(query.get('store') || query.get('stores'));
    const stores = loadStores().filter((store) => (wanted.length ? wanted.includes(store.id) : true));
    const live = await searchLiveProducts({ query: term, maxPrice, styles, colors, stores, limit: 5 });
    return { ...resultat, live };
  }

  return resultat;
}

export function stores() {
  return catalogStatus();
}

/**
 * Relais d'image pour le montage. Le navigateur ne peut pas lire les pixels
 * d'une image servie sans en-tete CORS ; passer par le serveur leve la
 * contrainte. Seules les images deja presentes dans le catalogue sont
 * relayees, ce qui interdit d'en faire un proxy ouvert.
 */
export async function proxyImage(query) {
  const url = query.get('url') || '';
  if (!imageAutorisee(url)) {
    const erreur = new Error("Cette image ne fait pas partie du catalogue.");
    erreur.status = 403;
    throw erreur;
  }

  const reponse = await fetch(url, { headers: { 'user-agent': 'chez-moi/0.1' }, redirect: 'follow' });
  if (!reponse.ok) {
    const erreur = new Error(`Image indisponible (HTTP ${reponse.status}).`);
    erreur.status = 502;
    throw erreur;
  }
  const type = (reponse.headers.get('content-type') || '').split(';')[0];
  if (!type.startsWith('image/')) {
    const erreur = new Error("La ressource visee n'est pas une image.");
    erreur.status = 415;
    throw erreur;
  }
  return { type, corps: Buffer.from(await reponse.arrayBuffer()) };
}

/** The catalogue's front page: shelves and ready-made selections. */
export function highlights() {
  return catalogHighlights();
}

/** Categories actually present in the catalogue, most furnished first. */
export function categories() {
  return { categories: browseCatalog({ limit: 0 }).categories };
}

export function storeSearchLinks(query) {
  const term = query.get('q') || '';
  return {
    query: term,
    links: loadStores().map((store) => ({ id: store.id, name: store.name, url: searchUrlFor(store, term) })),
  };
}
