import http from 'node:http';
import { config, aiConfigured } from './config.js';
import { handleRequest } from './handler.js';
import { loadCatalog } from './catalog/store.js';

const server = http.createServer((req, res) => handleRequest(req, res, { staticFiles: true }));

server.listen(config.port, config.host, () => {
  const catalog = loadCatalog();
  console.log(`Chez Moi ecoute sur http://localhost:${config.port}`);
  console.log(`  IA         : ${aiConfigured() ? `${config.anthropic.model} (effort ${config.anthropic.effort})` : 'non configuree (ajoutez ANTHROPIC_API_KEY dans .env)'}`);
  console.log(`  Recherche  : ${config.catalog.liveSearch ? 'en ligne activee sur les sites des magasins' : 'catalogues locaux uniquement'}`);
  console.log(`  Catalogue  : ${catalog.products.length} produits`);
  for (const source of catalog.sources) {
    console.log(`               - ${source.store} : ${source.count} produits (${source.type})`);
  }
});
