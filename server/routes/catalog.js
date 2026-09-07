import { browseCatalog, catalogStatus, searchUrlFor, loadStores } from '../catalog/store.js';
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
