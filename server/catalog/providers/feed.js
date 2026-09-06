/**
 * Importers for real store product feeds.
 *
 * No French retailer publishes an open product API, so the supported path is the
 * merchant feed every affiliate/marketing programme already exposes:
 *   - google-merchant-xml : RSS 2.0 with the <g:...> Google Shopping namespace
 *   - csv                 : delimited export (comma, semicolon or tab)
 *   - json                : array of products, or { products: [...] }
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
    category: category ? String(category).split(/[>|/]/).pop().trim().toLowerCase() : '',
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

export function parseFeed(text, store) {
  const type = store.feed?.type || 'google-merchant-xml';
  if (type === 'csv') return parseCsv(text, store);
  if (type === 'json') return parseJsonFeed(text, store);
  return parseGoogleMerchantXml(text, store);
}
