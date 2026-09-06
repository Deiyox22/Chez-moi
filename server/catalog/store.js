import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { guessCategory } from './providers/feed.js';

let cache = null;

export function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// Catalogues mix whole products with spare parts and covers. A "housse seule"
// is not an armchair, and should not outrank one.
const ACCESSORY = /housse seule|piece detachee|pieces detachees|recharge|pied seul|pieds seuls|echantillon|kit de reparation/;

const STOP_WORDS = new Set(['de', 'du', 'des', 'le', 'la', 'les', 'un', 'une', 'en', 'et', 'pour', 'avec', 'a', 'au', 'aux', 'sur', 'dans']);

function tokenize(value) {
  return normalizeText(value).split(' ').filter((token) => token.length > 2 && !STOP_WORDS.has(token));
}

export function loadStores() {
  const raw = JSON.parse(fs.readFileSync(config.paths.stores, 'utf8'));
  return raw.stores || [];
}

export function searchUrlFor(store, query) {
  const template = store?.searchUrlTemplate;
  if (!template) return store?.site || null;
  let url = template.replace('{query}', encodeURIComponent(query || ''));
  if (store.affiliate?.param && store.affiliate?.value) {
    url += (url.includes('?') ? '&' : '?') + `${encodeURIComponent(store.affiliate.param)}=${encodeURIComponent(store.affiliate.value)}`;
  }
  return url;
}

function syncedFilesByStore() {
  const dir = config.paths.syncedCatalog;
  if (!fs.existsSync(dir)) return new Map();
  const found = new Map();
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith('.json')) continue;
    found.set(path.basename(file, '.json'), path.join(dir, file));
  }
  return found;
}

function decorate(product, storesById) {
  const store = storesById.get(product.store);
  const query = product.title;
  return {
    ...product,
    storeName: store?.name || product.store,
    url: product.url || searchUrlFor(store, query),
    priceIsIndicative: product.source !== 'feed',
    haystack: [
      product.title,
      product.description,
      product.category,
      product.rawCategory,
      product.brand,
      (product.colors || []).join(' '),
      (product.materials || []).join(' '),
      (product.styles || []).join(' '),
    ].join(' '),
  };
}

export function loadCatalog({ force = false } = {}) {
  if (cache && !force) return cache;

  const stores = loadStores();
  const storesById = new Map(stores.map((store) => [store.id, store]));
  const synced = syncedFilesByStore();
  const products = [];
  const sources = [];

  for (const [storeId, file] of synced) {
    if (!storesById.has(storeId)) continue;
    try {
      const payload = JSON.parse(fs.readFileSync(file, 'utf8'));
      const items = (payload.products || []).map((product) => decorate({ ...product, source: 'feed' }, storesById));
      products.push(...items);
      sources.push({ store: storeId, type: 'feed', count: items.length, updatedAt: payload.updatedAt || null });
    } catch (error) {
      console.error(`[catalogue] flux illisible pour ${storeId}:`, error.message);
    }
  }

  // The sample catalogue is a fallback, not a supplement: once real feeds are
  // imported, showing invented prices next to real ones would only mislead.
  if (!sources.length) {
    const seed = JSON.parse(fs.readFileSync(config.paths.seedCatalog, 'utf8'));
    const seedItems = (seed.products || []).map((product) => decorate({ ...product, source: 'exemple' }, storesById));
    products.push(...seedItems);
    if (seedItems.length) sources.push({ store: 'catalogue-exemple', type: 'exemple', count: seedItems.length, updatedAt: seed.updatedAt || null });
  }

  cache = { stores, storesById, products, sources };
  return cache;
}

export function invalidateCatalog() {
  cache = null;
}

/**
 * Ranked product search over every loaded catalogue.
 */
export function searchProducts({ query = '', category = '', store = '', maxPrice = null, styles = [], colors = [], limit = 12 } = {}) {
  const catalog = loadCatalog();
  const queryTokens = tokenize([query, styles.join(' '), colors.join(' ')].join(' '));
  // "matelas 160x200" names a category even when the caller passes none; without
  // this, a protege-matelas outranks a mattress simply for being cheaper.
  const categoryKey = normalizeText(category || guessCategory(query));

  const scored = [];
  for (const product of catalog.products) {
    if (store && product.store !== store) continue;
    if (maxPrice !== null && maxPrice !== undefined && product.price !== null && product.price > maxPrice) continue;

    let score = 0;
    const haystack = normalizeText(product.haystack);
    const productCategory = normalizeText(product.category);

    if (categoryKey) {
      if (productCategory === categoryKey) score += 12;
      else if (productCategory.includes(categoryKey) || categoryKey.includes(productCategory)) score += 6;
      else if (haystack.includes(categoryKey)) score += 2;
      else score -= 3;
    }

    const title = normalizeText(product.title);
    const titleHead = title.split(' ').slice(0, 3).join(' ');
    for (const token of queryTokens) {
      if (titleHead.includes(token)) score += 5;
      else if (title.includes(token)) score += 4;
      else if (haystack.includes(token)) score += 2;
    }
    if (ACCESSORY.test(title)) score -= 6;

    for (const style of styles) {
      if (normalizeText((product.styles || []).join(' ')).includes(normalizeText(style))) score += 3;
    }
    for (const color of colors) {
      if (normalizeText((product.colors || []).join(' ')).includes(normalizeText(color))) score += 2;
    }

    if (product.source === 'feed') score += 1; // a real feed beats the sample catalogue
    if (score > 0) scored.push({ product, score });
  }

  scored.sort((a, b) => b.score - a.score || (a.product.price ?? 1e9) - (b.product.price ?? 1e9));
  return scored.slice(0, limit).map(({ product, score }) => {
    const { haystack, ...rest } = product;
    return { ...rest, score };
  });
}

export function catalogStatus() {
  const catalog = loadCatalog();
  return {
    stores: catalog.stores.map((store) => ({
      id: store.id,
      name: store.name,
      site: store.site,
      enabled: Boolean(store.enabled),
      feedConfigured: Boolean(store.feed?.url),
      feedType: store.feed?.type || null,
      productCount: catalog.products.filter((product) => product.store === store.id).length,
      hasRealFeed: catalog.sources.some((source) => source.store === store.id && source.type === 'feed'),
    })),
    sources: catalog.sources,
    totalProducts: catalog.products.length,
  };
}
