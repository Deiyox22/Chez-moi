import http from 'node:http';
import { config, aiConfigured } from './config.js';
import { sendJson, sendError, readJsonBody, serveStatic } from './lib/http.js';
import { analyzeFurniture, analyzeRoom } from './routes/analyze.js';
import { createDesign } from './routes/design.js';
import * as catalogRoutes from './routes/catalog.js';
import { loadCatalog } from './catalog/store.js';

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const { pathname } = url;

  if (req.method === 'OPTIONS') {
    res.writeHead(204, { allow: 'GET, POST, OPTIONS' });
    res.end();
    return;
  }

  try {
    if (pathname.startsWith('/api/')) {
      if (req.method === 'GET' && pathname === '/api/health') {
        const catalog = loadCatalog();
        sendJson(res, 200, {
          ok: true,
          ia: aiConfigured() ? 'configuree' : 'non configuree',
          modele: aiConfigured() ? config.anthropic.model : null,
          catalogue: { produits: catalog.products.length, sources: catalog.sources },
        });
        return;
      }

      if (req.method === 'GET' && pathname === '/api/catalog/search') {
        sendJson(res, 200, catalogRoutes.search(url.searchParams));
        return;
      }

      if (req.method === 'GET' && pathname === '/api/catalog/stores') {
        sendJson(res, 200, catalogRoutes.stores());
        return;
      }

      if (req.method === 'GET' && pathname === '/api/catalog/links') {
        sendJson(res, 200, catalogRoutes.storeSearchLinks(url.searchParams));
        return;
      }

      if (req.method === 'POST' && pathname === '/api/furniture/analyze') {
        sendJson(res, 200, await analyzeFurniture(await readJsonBody(req)));
        return;
      }

      if (req.method === 'POST' && pathname === '/api/rooms/analyze') {
        sendJson(res, 200, await analyzeRoom(await readJsonBody(req)));
        return;
      }

      if (req.method === 'POST' && pathname === '/api/designs') {
        sendJson(res, 200, await createDesign(await readJsonBody(req)));
        return;
      }

      sendJson(res, 404, { error: 'Route inconnue.' });
      return;
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      sendJson(res, 405, { error: 'Methode non autorisee.' });
      return;
    }

    if (!serveStatic(req, res, pathname)) {
      sendJson(res, 404, { error: 'Fichier introuvable.' });
    }
  } catch (error) {
    sendError(res, error);
  }
});

server.listen(config.port, config.host, () => {
  const catalog = loadCatalog();
  console.log(`Chez Moi ecoute sur http://localhost:${config.port}`);
  console.log(`  IA         : ${aiConfigured() ? `${config.anthropic.model} (effort ${config.anthropic.effort})` : 'non configuree (ajoutez ANTHROPIC_API_KEY dans .env)'}`);
  console.log(`  Catalogue  : ${catalog.products.length} produits`);
  for (const source of catalog.sources) {
    console.log(`               - ${source.store} : ${source.count} produits (${source.type})`);
  }
});
