/**
 * The request handler, shared by the standalone Node server and the Vercel function.
 * `staticFiles: false` is for hosts that serve public/ themselves.
 */
import { config, aiConfigured } from './config.js';
import { sendJson, sendError, readJsonBody, serveStatic } from './lib/http.js';
import { analyzeFurniture, analyzeRoom } from './routes/analyze.js';
import { createDesign } from './routes/design.js';
import { createRender } from './routes/render.js';
import * as catalogRoutes from './routes/catalog.js';
import { loadCatalog } from './catalog/store.js';

export async function handleRequest(req, res, { staticFiles = true } = {}) {
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
          fournisseur: config.ai.provider,
          modele: aiConfigured() ? config.ai.model : null,
          rechercheEnLigne: config.catalog.liveSearch,
          rendu: aiConfigured() && config.ai.imageAvailable ? config.ai.imageModel : null,
          renduPrixIndicatif: aiConfigured() && config.ai.imageAvailable ? config.ai.imagePrixIndicatif : null,
          catalogue: { produits: catalog.products.length, sources: catalog.sources },
        });
        return;
      }

      if (req.method === 'GET' && pathname === '/api/catalog/search') {
        sendJson(res, 200, await catalogRoutes.search(url.searchParams));
        return;
      }

      if (req.method === 'GET' && pathname === '/api/catalog/image') {
        const { type, corps } = await catalogRoutes.proxyImage(url.searchParams);
        res.writeHead(200, {
          'content-type': type,
          'content-length': corps.length,
          'cache-control': 'public, max-age=86400',
        });
        res.end(corps);
        return;
      }

      if (req.method === 'GET' && pathname === '/api/catalog/highlights') {
        sendJson(res, 200, catalogRoutes.highlights());
        return;
      }

      if (req.method === 'GET' && pathname === '/api/catalog/categories') {
        sendJson(res, 200, catalogRoutes.categories());
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

      if (req.method === 'POST' && pathname === '/api/renders') {
        sendJson(res, 200, await createRender(await readJsonBody(req)));
        return;
      }

      if (req.method === 'POST' && pathname === '/api/designs') {
        sendJson(res, 200, await createDesign(await readJsonBody(req)));
        return;
      }

      sendJson(res, 404, { error: 'Route inconnue.' });
      return;
    }

    if (!staticFiles) {
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
}
