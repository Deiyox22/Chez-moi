import { searchProducts, catalogStatus, searchUrlFor, loadStores } from '../catalog/store.js';

export function search(query) {
  const limit = Math.min(Number(query.get('limit') || 12), 40);
  const maxPriceRaw = query.get('maxPrice');
  return {
    products: searchProducts({
      query: query.get('q') || '',
      category: query.get('category') || '',
      store: query.get('store') || '',
      maxPrice: maxPriceRaw ? Number(maxPriceRaw) : null,
      styles: (query.get('styles') || '').split(',').map((value) => value.trim()).filter(Boolean),
      colors: (query.get('colors') || '').split(',').map((value) => value.trim()).filter(Boolean),
      limit,
    }),
  };
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
