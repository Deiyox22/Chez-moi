/** Thin client for the Chez Moi server API. */

async function request(path, options = {}) {
  let response;
  try {
    response = await fetch(path, {
      ...options,
      headers: { 'content-type': 'application/json', ...(options.headers || {}) },
    });
  } catch {
    throw new Error("Serveur injoignable. Vérifiez votre connexion : l'analyse des photos nécessite Internet.");
  }

  const text = await response.text();
  let payload = null;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = null; }

  if (!response.ok) {
    const error = new Error(payload?.error || `Erreur ${response.status}`);
    error.status = response.status;
    error.code = payload?.code;
    throw error;
  }
  return payload;
}

export const health = () => request('/api/health');

export const analyzeFurniture = (body) =>
  request('/api/furniture/analyze', { method: 'POST', body: JSON.stringify(body) });

export const analyzeRoom = (body) =>
  request('/api/rooms/analyze', { method: 'POST', body: JSON.stringify(body) });

export const createDesign = (body) =>
  request('/api/designs', { method: 'POST', body: JSON.stringify(body) });

export const searchCatalog = (params) =>
  request(`/api/catalog/search?${new URLSearchParams(params)}`);

export const searchCatalogLive = (params) =>
  request(`/api/catalog/search?${new URLSearchParams({ ...params, live: '1' })}`);

export const listStores = () => request('/api/catalog/stores');

export const listCategories = () => request('/api/catalog/categories');

export const catalogHighlights = () => request('/api/catalog/highlights');

export const storeLinks = (query) => request(`/api/catalog/links?${new URLSearchParams({ q: query })}`);
