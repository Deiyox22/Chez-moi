/**
 * Reads a retailer's catalogue from its published sitemap and the schema.org
 * Product data its pages carry.
 *
 * This is the mechanism shops publish *for* search and shopping engines, so it
 * is used the way they intend it:
 *   - robots.txt is fetched first and its Disallow rules are honoured;
 *   - requests are serialised with a delay, never in parallel;
 *   - the user agent says who is calling;
 *   - the number of pages is capped, and balanced across categories rather than
 *     sweeping the whole site.
 * A shop that answers 403 to an automated request has said no; that answer is
 * taken at face value and the store is reported as unavailable.
 */
import { guessCategory, isOutOfScope } from './feed.js';

const USER_AGENT = 'chez-moi-catalog/0.1 (+https://github.com/Deiyox22/Chez-moi)';
const DEFAULT_DELAY_MS = 700;
const DEFAULT_MAX_PRODUCTS = 400;
const DEFAULT_PER_CATEGORY = 24;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function get(url, { accept = 'text/html' } = {}) {
  const response = await fetch(url, {
    headers: { 'user-agent': USER_AGENT, accept, 'accept-language': 'fr-FR,fr;q=0.9' },
    redirect: 'follow',
  });
  if (!response.ok) {
    const error = new Error(`HTTP ${response.status} ${response.statusText}`);
    error.status = response.status;
    throw error;
  }
  return response.text();
}

/* ---------- robots.txt ---------- */

function patternToRegex(pattern) {
  const escaped = pattern
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*');
  return new RegExp('^' + (escaped.endsWith('$') ? escaped.slice(0, -1) + '$' : escaped));
}

/** Disallow rules that apply to every crawler. */
export async function readRobots(origin) {
  let text;
  try {
    text = await get(`${origin}/robots.txt`, { accept: 'text/plain' });
  } catch {
    // No readable robots.txt means no permission to assume: crawl nothing.
    return null;
  }

  const disallow = [];
  let applies = false;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.split('#')[0].trim();
    if (!line) continue;
    const [rawKey, ...rest] = line.split(':');
    const key = rawKey.trim().toLowerCase();
    const value = rest.join(':').trim();
    if (key === 'user-agent') applies = value === '*';
    else if (applies && key === 'disallow' && value) disallow.push(patternToRegex(value));
  }
  return disallow;
}

export const isAllowed = (pathname, disallow) => !disallow.some((rule) => rule.test(pathname));

/* ---------- sitemap ---------- */

const locations = (xml) =>
  [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((match) => match[1].trim());

/**
 * Walks the sitemap index down to product URLs, keeping only what looks like a
 * furniture or decoration item and capping how many of each kind are taken.
 */
async function collectUrls(store, disallow) {
  const { sitemap, urlPattern, maxProducts = DEFAULT_MAX_PRODUCTS, perCategory = DEFAULT_PER_CATEGORY, delayMs = DEFAULT_DELAY_MS } = store.feed;
  const productPattern = urlPattern ? new RegExp(urlPattern) : null;

  const indexXml = await get(sitemap, { accept: 'application/xml' });
  let childSitemaps = locations(indexXml);
  const isIndex = /<sitemapindex/i.test(indexXml);
  if (!isIndex) childSitemaps = [sitemap];
  if (store.feed.sitemapPattern) {
    const keep = new RegExp(store.feed.sitemapPattern);
    childSitemaps = childSitemaps.filter((url) => keep.test(url));
  }

  const perCategoryCount = new Map();
  const chosen = [];

  for (const child of childSitemaps) {
    if (chosen.length >= maxProducts) break;
    let xml;
    try {
      xml = isIndex ? await get(child, { accept: 'application/xml' }) : indexXml;
    } catch {
      continue;
    }
    if (isIndex) await sleep(delayMs);

    for (const url of locations(xml)) {
      if (chosen.length >= maxProducts) break;
      if (productPattern && !productPattern.test(url)) continue;

      let pathname;
      try {
        pathname = new URL(url).pathname;
      } catch {
        continue;
      }
      if (!isAllowed(pathname, disallow)) continue;

      // The slug carries the product type, so the mix can be balanced before
      // a single page is downloaded.
      const slug = decodeURIComponent(pathname).replace(/-/g, ' ');
      if (isOutOfScope(slug)) continue;
      const category = guessCategory(slug);
      if (!category) continue;
      const seen = perCategoryCount.get(category) || 0;
      if (seen >= perCategory) continue;

      perCategoryCount.set(category, seen + 1);
      chosen.push({ url, category });
    }
  }
  return chosen;
}

/* ---------- product pages ---------- */

const JSON_LD = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

function firstProduct(html) {
  for (const match of html.matchAll(JSON_LD)) {
    let parsed;
    try {
      parsed = JSON.parse(match[1].trim());
    } catch {
      continue;
    }
    const candidates = Array.isArray(parsed) ? parsed : [parsed, ...(parsed['@graph'] || [])];
    for (const item of candidates) {
      if (item && typeof item === 'object' && String(item['@type'] || '').includes('Product')) return item;
    }
  }
  return null;
}

const firstImage = (image) => {
  const value = Array.isArray(image) ? image[0] : image;
  if (!value) return null;
  if (typeof value === 'string') return value;
  return value.contentUrl || value.url || null;
};

export function productFromHtml(html, { url, store, category }) {
  const item = firstProduct(html);
  if (!item?.name) return null;

  let offer = item.offers || {};
  if (Array.isArray(offer)) offer = offer[0] || {};
  const price = Number(String(offer.price ?? '').replace(',', '.'));
  const brandName = typeof item.brand === 'object' ? item.brand?.name : item.brand;

  return {
    id: `${store.id}-${item.sku || item.mpn || url.split('/').filter(Boolean).pop()}`,
    store: store.id,
    title: String(item.name).trim(),
    description: String(item.description || '').replace(/\s+/g, ' ').trim().slice(0, 400),
    category: guessCategory(item.category, item.name) || category,
    rawCategory: String(item.category || '').trim(),
    price: Number.isFinite(price) && price > 0 ? price : null,
    currency: offer.priceCurrency || store.currency || 'EUR',
    url,
    imageUrl: firstImage(item.image),
    brand: String(brandName || store.name).trim(),
    colors: [],
    materials: [],
    styles: [],
    dimensionsCm: null,
    availability: /InStock/i.test(String(offer.availability || '')) ? 'in stock' : 'out of stock',
    source: 'feed',
  };
}

/* ---------- orchestration ---------- */

export async function crawlSitemap(store, { onProgress } = {}) {
  const origin = new URL(store.feed.sitemap).origin;
  const disallow = await readRobots(origin);
  if (disallow === null) {
    throw new Error("robots.txt illisible : aucune permission de parcours n'est supposee.");
  }

  const targets = await collectUrls(store, disallow);
  const delayMs = store.feed.delayMs || DEFAULT_DELAY_MS;
  const products = [];
  let refused = 0;

  for (const [index, target] of targets.entries()) {
    try {
      const html = await get(target.url);
      const product = productFromHtml(html, { url: target.url, store, category: target.category });
      if (product && !isOutOfScope(product.title)) products.push(product);
    } catch (error) {
      if (error.status === 403 || error.status === 429) {
        refused += 1;
        // A few refusals in a row mean the shop does not want this traffic.
        if (refused >= 5) throw new Error(`le site refuse les requetes automatisees (HTTP ${error.status})`);
      }
    }
    if (onProgress && index % 25 === 24) onProgress(products.length, targets.length);
    await sleep(delayMs);
  }

  return products;
}
