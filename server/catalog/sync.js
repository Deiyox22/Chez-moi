#!/usr/bin/env node
/**
 * Imports the product feeds declared in config/stores.json into data/catalog/<store>.json.
 *
 *   npm run catalog:sync            # every enabled store with a feed URL
 *   npm run catalog:sync -- ikea    # one store
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config, ROOT } from '../config.js';
import { loadStores, invalidateCatalog } from './store.js';
import { parseFeed } from './providers/feed.js';

async function fetchFeed(store) {
  const source = store.feed.url;

  // A feed exported by hand is just as valid as one served over HTTP.
  if (source.startsWith('file://') || source.startsWith('./') || source.startsWith('/') || source.startsWith('..')) {
    const filePath = source.startsWith('file://')
      ? fileURLToPath(source)
      : path.resolve(ROOT, source);
    return fs.readFileSync(filePath, 'utf8');
  }

  const response = await fetch(source, {
    headers: { 'user-agent': 'chez-moi-catalog-sync/0.1', ...(store.feed.headers || {}) },
    redirect: 'follow',
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
  return response.text();
}

async function syncStore(store) {
  if (!store.feed?.url) {
    return { store: store.id, skipped: "aucune URL de flux dans config/stores.json" };
  }
  const text = await fetchFeed(store);
  const products = parseFeed(text, store);
  if (!products.length) {
    return { store: store.id, skipped: 'le flux ne contient aucun produit exploitable' };
  }
  fs.mkdirSync(config.paths.syncedCatalog, { recursive: true });
  const outFile = path.join(config.paths.syncedCatalog, `${store.id}.json`);
  fs.writeFileSync(
    outFile,
    JSON.stringify({ store: store.id, updatedAt: new Date().toISOString(), feedType: store.feed.type, products }, null, 2)
  );
  return { store: store.id, imported: products.length, file: outFile };
}

async function main() {
  const wanted = process.argv.slice(2);
  const stores = loadStores().filter((store) => (wanted.length ? wanted.includes(store.id) : store.enabled));

  if (!stores.length) {
    console.log(
      "Aucun magasin a synchroniser.\n" +
        "Ouvrez config/stores.json, renseignez 'feed.url' pour une enseigne et passez 'enabled' a true,\n" +
        'puis relancez : npm run catalog:sync'
    );
    return;
  }

  for (const store of stores) {
    try {
      const result = await syncStore(store);
      if (result.skipped) console.log(`- ${store.name} : ignore (${result.skipped})`);
      else console.log(`- ${store.name} : ${result.imported} produits importes -> ${result.file}`);
    } catch (error) {
      console.error(`- ${store.name} : echec (${error.message})`);
    }
  }
  invalidateCatalog();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
