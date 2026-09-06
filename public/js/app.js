import { clear, toast } from './lib/ui.js';
import * as home from './views/home.js';
import * as furniture from './views/furniture.js';
import * as rooms from './views/rooms.js';
import * as designs from './views/designs.js';
import * as stores from './views/stores.js';
import * as settings from './views/settings.js';

const ROUTES = [
  { pattern: /^\/$/, view: home },
  { pattern: /^\/meubles$/, view: furniture },
  { pattern: /^\/meubles\/(?<id>[^/]+)$/, view: furniture, action: 'detail' },
  { pattern: /^\/pieces$/, view: rooms },
  { pattern: /^\/pieces\/(?<id>[^/]+)$/, view: rooms, action: 'detail' },
  { pattern: /^\/designs$/, view: designs },
  { pattern: /^\/designs\/(?<id>[^/]+)$/, view: designs, action: 'detail' },
  { pattern: /^\/magasins$/, view: stores },
  { pattern: /^\/reglages$/, view: settings },
];

function parseHash() {
  const raw = location.hash.replace(/^#/, '') || '/';
  const [path, queryString] = raw.split('?');
  return { path: path || '/', query: new URLSearchParams(queryString || '') };
}

function markActiveTab(path) {
  const root = `/${path.split('/')[1] || ''}`;
  for (const link of document.querySelectorAll('.tabbar a')) {
    if (link.dataset.tab === root) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
}

let renderToken = 0;

async function render() {
  const { path, query } = parseHash();
  const match = ROUTES.map((route) => ({ route, result: route.pattern.exec(path) })).find((entry) => entry.result);
  const container = document.getElementById('view');
  const token = ++renderToken;

  markActiveTab(path);
  clear(container);
  window.scrollTo({ top: 0 });

  if (!match) {
    container.innerHTML = '<div class="empty"><span class="empty__mark">∅</span><h2>Page introuvable</h2><p class="small"><a href="#/">Revenir à l\'accueil</a></p></div>';
    return;
  }

  const params = match.result.groups || {};
  try {
    const node = await match.route.view.render({ params, query, action: match.route.action });
    if (token !== renderToken) return; // a newer navigation won
    clear(container);
    container.appendChild(node);
    container.focus({ preventScroll: true });
  } catch (error) {
    if (token !== renderToken) return;
    console.error(error);
    clear(container);
    container.innerHTML = `<div class="card"><h2>Une erreur est survenue</h2><p class="small muted">${error.message}</p></div>`;
  }
}

window.addEventListener('hashchange', render);
window.addEventListener('DOMContentLoaded', render);
if (document.readyState !== 'loading') render();

/* ---------- PWA plumbing ---------- */

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((error) => console.warn('Service worker non enregistré :', error));
  });
}

let installPrompt = null;
const installButton = document.getElementById('install-button');

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  installPrompt = event;
  installButton.hidden = false;
});

installButton?.addEventListener('click', async () => {
  if (!installPrompt) return;
  installPrompt.prompt();
  const { outcome } = await installPrompt.userChoice;
  if (outcome === 'accepted') toast('Chez Moi est installée sur votre appareil.');
  installPrompt = null;
  installButton.hidden = true;
});

window.addEventListener('appinstalled', () => { installButton.hidden = true; });
window.addEventListener('offline', () => toast('Hors ligne : vos données restent consultables, les analyses attendront.', 'error'));
