import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

export function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
  });
  res.end(body);
}

export function sendError(res, error) {
  const status = error?.status || 500;
  if (status >= 500) console.error('[chez-moi]', error);
  sendJson(res, status, {
    error: error?.message || 'Erreur interne du serveur.',
    code: error?.code || undefined,
    details: error?.raw || undefined,
  });
}

export async function readJsonBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > config.maxBodyBytes) {
      const error = new Error('Requete trop volumineuse. Envoyez moins de photos a la fois.');
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    const error = new Error('Corps de requete JSON invalide.');
    error.status = 400;
    throw error;
  }
}

export function serveStatic(req, res, urlPath) {
  const rootDir = config.paths.web;
  const decoded = decodeURIComponent(urlPath.split('?')[0]);
  const relative = decoded === '/' ? 'index.html' : decoded.replace(/^\/+/, '');
  const target = path.resolve(rootDir, relative);

  if (!target.startsWith(rootDir + path.sep) && target !== rootDir) {
    sendJson(res, 403, { error: 'Acces refuse.' });
    return true;
  }

  let filePath = target;
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    // Single-page app: unknown routes fall back to the shell.
    if (path.extname(filePath)) return false;
    filePath = path.join(rootDir, 'index.html');
    if (!fs.existsSync(filePath)) return false;
  }

  const ext = path.extname(filePath).toLowerCase();
  const isShell = filePath.endsWith('index.html') || filePath.endsWith('sw.js');
  res.writeHead(200, {
    'content-type': MIME[ext] || 'application/octet-stream',
    'cache-control': isShell ? 'no-cache' : 'public, max-age=3600',
  });
  fs.createReadStream(filePath).pipe(res);
  return true;
}
