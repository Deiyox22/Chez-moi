/**
 * Importers for real store product feeds.
 *
 * No French retailer publishes an open product API, so the supported path is the
 * merchant feed every affiliate/marketing programme already exposes:
 *   - google-merchant-xml : RSS 2.0 with the <g:...> Google Shopping namespace
 *   - csv                 : delimited export (comma, semicolon or tab)
 *   - json                : array of products, or { products: [...] }
 *   - shopify             : a shop's public /products.json storefront endpoint
 * Each importer returns products in the shape used everywhere else in the app.
 */

const FIELD_ALIASES = {
  id: ['id', 'sku', 'reference', 'item_id', 'product_id'],
  title: ['title', 'name', 'titre', 'product_name', 'libelle'],
  description: ['description', 'desc', 'short_description'],
  price: ['price', 'prix', 'sale_price', 'price_ttc'],
  url: ['link', 'url', 'product_url', 'lien'],
  imageUrl: ['image_link', 'image', 'image_url', 'picture'],
  brand: ['brand', 'marque'],
  category: ['product_type', 'category', 'categorie', 'google_product_category'],
  availability: ['availability', 'stock', 'disponibilite'],
  color: ['color', 'couleur'],
  material: ['material', 'matiere', 'materiau'],
};

function pick(row, field) {
  for (const alias of FIELD_ALIASES[field] || [field]) {
    for (const key of Object.keys(row)) {
      const normalized = key.toLowerCase().replace(/^g:/, '').trim();
      if (normalized === alias && row[key] !== undefined && row[key] !== '') return row[key];
    }
  }
  return undefined;
}

function parsePrice(value) {
  if (value === undefined || value === null) return null;
  const match = String(value).replace(/\u00a0/g, ' ').match(/-?\d+(?:[.,]\d+)?/);
  if (!match) return null;
  return Number(match[0].replace(',', '.'));
}

function parseCurrency(value, fallback) {
  const match = String(value || '').match(/\b(EUR|USD|GBP|CHF|CAD)\b/i);
  return match ? match[1].toUpperCase() : fallback;
}

function splitList(value) {
  if (!value) return [];
  return String(value)
    .split(/[,;/|>]/)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 6);
}

// Feeds label categories however they like ("BUREAU", "Canape 3 places",
// "Maison > Textiles > Tapis"). Mapping them onto the app's vocabulary is what
// lets a shopping need find the right products.
const CATEGORY_RULES = [
  [/table\s*basse|bout de canap/i, 'table_basse'],
  [/table\s*(a|à)\s*manger|table de repas|table de salle/i, 'table_repas'],
  [/t(e|ê)te de lit/i, 'tete_de_lit'],
  [/canap(e|é)|sofa|banquette/i, 'canape'],
  [/fauteuil/i, 'fauteuil'],
  [/chaise/i, 'chaise'],
  [/pouf|tabouret/i, 'pouf'],
  [/bureau|secr(e|é)taire/i, 'bureau'],
  [/meuble tv|banc tv/i, 'meuble_tv'],
  [/biblioth(e|è)que/i, 'bibliotheque'],
  [/(e|é)tag(e|è)re/i, 'etagere'],
  [/buffet|enfilade|vaisselier/i, 'buffet'],
  [/commode/i, 'commode'],
  [/armoire|penderie|dressing/i, 'armoire'],
  [/console|vestiaire|porte-manteau|pat(e|è)re|rangement|casier/i, 'rangement'],
  [/prot(e|è)ge[-\s]?matelas|al(e|è)se|housse de couette|drap|taie|parure de lit|linge de lit/i, 'linge_de_lit'],
  [/oreiller|traversin/i, 'oreiller'],
  [/couette/i, 'plaid'],
  [/matelas/i, 'matelas'],
  [/sommier|\blit\b|cadre de lit/i, 'lit'],
  [/chevet/i, 'chevet'],
  [/miroir/i, 'miroir'],
  [/tapis/i, 'tapis'],
  [/rideau|store|voilage/i, 'rideaux'],
  [/coussin/i, 'coussin'],
  [/plaid|couverture|jet(e|é) de lit/i, 'plaid'],
  [/suspension|plafonnier|lustre/i, 'luminaire_plafond'],
  [/lampadaire/i, 'lampadaire'],
  [/lampe|applique|liseuse/i, 'lampe_table'],
  [/affiche|cadre|tableau|d(e|é)co murale/i, 'decoration_murale'],
  [/plante|cache-pot|jardini(e|è)re/i, 'plante'],
  [/vase|bougie|bougeoir|photophore|plateau|vide[-\s]poche|bo(i|î)te|pot d(e|é)coratif|corbeille|panier/i, 'decoration'],
  [/serviette|drap de bain|peignoir|gant de toilette/i, 'linge_de_bain'],
  [/table/i, 'table_repas'],
];

// A shop's catalogue also holds things that have no place in an interior plan.
const OUT_OF_SCOPE = /carte cadeau|gift card|(e|é)chantillon|nuancier|pyjama|pantalon|chausson|t-shirt|chaussette|bon d'achat|extension de garantie|livraison|montage|service/i;

export const isOutOfScope = (title) => OUT_OF_SCOPE.test(String(title || ''));

export function guessCategory(...hints) {
  const text = hints.filter(Boolean).join(' ');
  for (const [pattern, category] of CATEGORY_RULES) {
    if (pattern.test(text)) return category;
  }
  return '';
}

function normalizeRow(row, store) {
  const title = pick(row, 'title');
  if (!title) return null;
  const rawPrice = pick(row, 'price');
  const category = pick(row, 'category');
  return {
    id: `${store.id}-${String(pick(row, 'id') || title).slice(0, 60)}`,
    store: store.id,
    title: String(title).trim(),
    description: String(pick(row, 'description') || '').trim().slice(0, 400),
    category: guessCategory(category, title) || (category ? String(category).split(/[>|/]/).pop().trim().toLowerCase() : ''),
    rawCategory: category ? String(category).trim() : '',
    price: parsePrice(rawPrice),
    currency: parseCurrency(rawPrice, store.currency || 'EUR'),
    url: String(pick(row, 'url') || '').trim(),
    imageUrl: String(pick(row, 'imageUrl') || '').trim() || null,
    brand: String(pick(row, 'brand') || store.name).trim(),
    colors: splitList(pick(row, 'color')),
    materials: splitList(pick(row, 'material')),
    styles: [],
    dimensionsCm: null,
    availability: String(pick(row, 'availability') || '').trim() || null,
    source: 'feed',
  };
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

function decodeXml(value) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&(amp|lt|gt|quot|apos|nbsp);/g, (_, name) => ENTITIES[name]);
}

export function parseGoogleMerchantXml(xml, store) {
  const products = [];
  const itemPattern = /<item\b[^>]*>([\s\S]*?)<\/item>/gi;
  let itemMatch;
  while ((itemMatch = itemPattern.exec(xml)) !== null) {
    const body = itemMatch[1];
    const row = {};
    const tagPattern = /<((?:g:)?[a-z0-9_:-]+)\b[^>]*>([\s\S]*?)<\/\1>/gi;
    let tagMatch;
    while ((tagMatch = tagPattern.exec(body)) !== null) {
      const key = tagMatch[1].toLowerCase();
      if (row[key] === undefined) row[key] = decodeXml(tagMatch[2]).trim();
    }
    const product = normalizeRow(row, store);
    if (product) products.push(product);
  }
  return products;
}

function detectDelimiter(headerLine) {
  const counts = [
    [',', (headerLine.match(/,/g) || []).length],
    [';', (headerLine.match(/;/g) || []).length],
    ['\t', (headerLine.match(/\t/g) || []).length],
  ];
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][1] > 0 ? counts[0][0] : ',';
}

function splitCsvLine(line, delimiter) {
  const cells = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') { current += '"'; i += 1; } else { inQuotes = false; }
      } else current += char;
    } else if (char === '"') inQuotes = true;
    else if (char === delimiter) { cells.push(current); current = ''; }
    else current += char;
  }
  cells.push(current);
  return cells.map((cell) => cell.trim());
}

export function parseCsv(text, store) {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length < 2) return [];
  const delimiter = detectDelimiter(lines[0]);
  const headers = splitCsvLine(lines[0], delimiter).map((header) => header.toLowerCase());
  const products = [];
  for (let i = 1; i < lines.length; i += 1) {
    const cells = splitCsvLine(lines[i], delimiter);
    const row = {};
    headers.forEach((header, index) => { row[header] = cells[index] ?? ''; });
    const product = normalizeRow(row, store);
    if (product) products.push(product);
  }
  return products;
}

export function parseJsonFeed(text, store) {
  const parsed = JSON.parse(text);
  const rows = Array.isArray(parsed) ? parsed : parsed.products || parsed.items || [];
  return rows.map((row) => normalizeRow(row, store)).filter(Boolean);
}

const stripHtml = (html) =>
  String(html || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&(?:quot|#34);/g, '"')
    .replace(/&(?:apos|#39);/g, "'")
    .replace(/\s+/g, ' ')
    .trim();

const TAG_VALUE = /^([a-z_]+)\s*:\s*(.+)$/i;

/** Reads a shop's public Shopify /products.json payload. */
export function parseShopifyProducts(products, store) {
  const base = String(store.site || '').replace(/\/$/, '');
  const out = [];

  for (const product of products || []) {
    if (isOutOfScope(product.title)) continue;
    const variants = product.variants || [];
    const prices = variants.map((variant) => parsePrice(variant.price)).filter((value) => value !== null && value > 0);
    const tags = (product.tags || []).map((tag) => String(tag));
    const labelled = new Map();
    const plainTags = [];
    for (const tag of tags) {
      const match = TAG_VALUE.exec(tag);
      if (match) labelled.set(match[1].toLowerCase(), match[2].trim());
      else plainTags.push(tag);
    }

    out.push({
      id: `${store.id}-${product.id}`,
      store: store.id,
      title: String(product.title || '').trim(),
      description: stripHtml(product.body_html).slice(0, 400),
      category: guessCategory(product.product_type, labelled.get('designation'), product.title, tags.join(' ')),
      rawCategory: String(product.product_type || '').trim(),
      price: prices.length ? Math.min(...prices) : null,
      currency: store.currency || 'EUR',
      url: `${base}/products/${product.handle}`,
      imageUrl: (product.images || [])[0]?.src || null,
      brand: String(product.vendor || store.name).trim(),
      colors: (labelled.get('couleur') || labelled.get('color') || '').split(/[,/]/).map((v) => v.trim()).filter(Boolean),
      materials: (labelled.get('matiere') || labelled.get('material') || '').split(/[,/]/).map((v) => v.trim()).filter(Boolean),
      styles: plainTags.slice(0, 4),
      dimensionsCm: null,
      availability: variants.some((variant) => variant.available) ? 'in stock' : 'out of stock',
      source: 'feed',
    });
  }
  return out;
}

export function parseFeed(text, store) {
  const type = store.feed?.type || 'google-merchant-xml';
  if (type === 'csv') return parseCsv(text, store);
  if (type === 'json') return parseJsonFeed(text, store);
  if (type === 'shopify') return parseShopifyProducts(JSON.parse(text).products, store);
  return parseGoogleMerchantXml(text, store);
}
