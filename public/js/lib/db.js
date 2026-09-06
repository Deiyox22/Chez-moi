/** IndexedDB storage: everything the user creates stays on their device. */

const DB_NAME = 'chez-moi';
const DB_VERSION = 1;
export const STORES = { photos: 'photos', furniture: 'furniture', rooms: 'rooms', designs: 'designs', settings: 'settings' };

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORES.photos)) db.createObjectStore(STORES.photos, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(STORES.furniture)) {
        db.createObjectStore(STORES.furniture, { keyPath: 'id' }).createIndex('createdAt', 'createdAt');
      }
      if (!db.objectStoreNames.contains(STORES.rooms)) {
        db.createObjectStore(STORES.rooms, { keyPath: 'id' }).createIndex('createdAt', 'createdAt');
      }
      if (!db.objectStoreNames.contains(STORES.designs)) {
        const store = db.createObjectStore(STORES.designs, { keyPath: 'id' });
        store.createIndex('roomId', 'roomId');
        store.createIndex('createdAt', 'createdAt');
      }
      if (!db.objectStoreNames.contains(STORES.settings)) db.createObjectStore(STORES.settings, { keyPath: 'key' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

async function tx(storeName, mode, run) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    const request = run(transaction.objectStore(storeName));
    transaction.oncomplete = () => resolve(request?.result);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

export const put = (storeName, value) => tx(storeName, 'readwrite', (store) => store.put(value));
export const get = (storeName, key) => tx(storeName, 'readonly', (store) => store.get(key));
export const remove = (storeName, key) => tx(storeName, 'readwrite', (store) => store.delete(key));
export const all = (storeName) => tx(storeName, 'readonly', (store) => store.getAll());

export async function allSorted(storeName, { desc = true } = {}) {
  const rows = (await all(storeName)) || [];
  rows.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  return desc ? rows : rows.reverse();
}

/* ---------- photos ---------- */

export async function savePhoto(blob) {
  const id = `photo_${crypto.randomUUID?.() || Date.now() + Math.random()}`;
  await put(STORES.photos, { id, blob, type: blob.type || 'image/jpeg', createdAt: new Date().toISOString() });
  return id;
}

const urlCache = new Map();

export async function photoUrl(photoId) {
  if (!photoId) return null;
  if (urlCache.has(photoId)) return urlCache.get(photoId);
  const record = await get(STORES.photos, photoId);
  if (!record?.blob) return null;
  const url = URL.createObjectURL(record.blob);
  urlCache.set(photoId, url);
  return url;
}

export async function photoBlob(photoId) {
  const record = await get(STORES.photos, photoId);
  return record?.blob || null;
}

export async function deletePhoto(photoId) {
  const url = urlCache.get(photoId);
  if (url) { URL.revokeObjectURL(url); urlCache.delete(photoId); }
  await remove(STORES.photos, photoId);
}

/* ---------- settings ---------- */

export async function getSetting(key, fallback = null) {
  const row = await get(STORES.settings, key);
  return row ? row.value : fallback;
}

export const setSetting = (key, value) => put(STORES.settings, { key, value });

/* ---------- maintenance ---------- */

/** Deletes photos no longer referenced by a furniture item or a room. */
export async function pruneOrphanPhotos() {
  const [furniture, rooms, photos] = await Promise.all([all(STORES.furniture), all(STORES.rooms), all(STORES.photos)]);
  const used = new Set();
  for (const item of furniture || []) (item.photoIds || []).forEach((id) => used.add(id));
  for (const room of rooms || []) (room.photoIds || []).forEach((id) => used.add(id));
  let removed = 0;
  for (const photo of photos || []) {
    if (!used.has(photo.id)) { await deletePhoto(photo.id); removed += 1; }
  }
  return removed;
}

export async function storageEstimate() {
  if (!navigator.storage?.estimate) return null;
  const { usage, quota } = await navigator.storage.estimate();
  return { usage, quota };
}

export async function exportAll() {
  const [furniture, rooms, designs] = await Promise.all([all(STORES.furniture), all(STORES.rooms), all(STORES.designs)]);
  return { version: 1, exportedAt: new Date().toISOString(), furniture, rooms, designs };
}

export async function wipeEverything() {
  const db = await openDb();
  await Promise.all(
    Object.values(STORES).map(
      (storeName) =>
        new Promise((resolve, reject) => {
          const transaction = db.transaction(storeName, 'readwrite');
          transaction.objectStore(storeName).clear();
          transaction.oncomplete = resolve;
          transaction.onerror = () => reject(transaction.error);
        })
    )
  );
  for (const url of urlCache.values()) URL.revokeObjectURL(url);
  urlCache.clear();
}
