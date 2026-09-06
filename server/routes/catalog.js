import { searchProducts, catalogStatus, searchUrlFor, loadStores } from '../catalog/store.js';
import { searchLiveProducts } from '../catalog/providers/websearch.js';
import { aiConfigured } from '../config.js';

const list = (value) => String(value || '').split(',').map((part) => part.trim()).filter(Boolean);

export async function search(query) {
  const limit = Math.min(Number(query.get('limit') || 12), 40);
  const maxPriceRaw = query.get('maxPrice');
  const maxPrice = maxPriceRaw ? Number(maxPriceRaw) : null;
  const term = query.get('q') || '';
  const styles = list(query.get('styles'));
  const colors = list(query.get('colors'));

  const products = searchProducts({
    query: term,
    category: query.get('category') || '',
    store: query.get('store') || '',
    maxPrice,
    styles,
    colors,
    limit,
  });

  // Live lookup on the real store sites, on demand.
  if (query.get('live') === '1' && term) {
    if (!aiConfigured()) {
      const error = new Error("La recherche en ligne necessite une cle ANTHROPIC_API_KEY sur le serveur.");
      error.status = 503;
      error.code = 'ai_not_configured';
      throw error;
    }
    const storeFilter = query.get('store');
    const stores = loadStores().filter((store) => (storeFilter ? store.id === storeFilter : true));
    const live = await searchLiveProducts({ query: term, maxPrice, styles, colors, stores, limit: 5 });
    return { products, live };
  }

  return { products };
}

export function stores() {
  return catalogStatus();
}

export function storeSearchLinks(query) {
  const term = query.get('q') || '';
  return {
    query: term,
    links: loadStores().map((store) => ({ id: store.id, name: store.name, url: searchUrlFor(store, term) })),
  };
}
