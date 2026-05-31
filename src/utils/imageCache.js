const DB_NAME = 'rv-streetview-cache';
const DB_VERSION = 3; // bump when adding stores
const IMAGE_STORE = 'images';

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(IMAGE_STORE)) {
        db.createObjectStore(IMAGE_STORE);
      }
      if (!db.objectStoreNames.contains('routes')) {
        const rs = db.createObjectStore('routes', { keyPath: 'id' });
        rs.createIndex('loadedAt', 'loadedAt');
      }
      if (!db.objectStoreNames.contains('bad_streets')) {
        db.createObjectStore('bad_streets', { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

export async function getCached(key) {
  const db = await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction(IMAGE_STORE, 'readonly');
    const req = tx.objectStore(IMAGE_STORE).get(key);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => resolve(null);
  });
}

export async function setCached(key, dataUrl) {
  const db = await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction(IMAGE_STORE, 'readwrite');
    tx.objectStore(IMAGE_STORE).put(dataUrl, key);
    tx.oncomplete = resolve;
    tx.onerror = resolve; // swallow errors silently
  });
}

export async function deleteImages(keys) {
  if (!keys.length) return;
  const db = await openDB();
  await Promise.all(
    keys.map(
      (key) =>
        new Promise((resolve) => {
          const tx = db.transaction(IMAGE_STORE, 'readwrite');
          tx.objectStore(IMAGE_STORE).delete(key);
          tx.oncomplete = resolve;
          tx.onerror = resolve;
        })
    )
  );
}

export async function clearAllImages() {
  const db = await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction(IMAGE_STORE, 'readwrite');
    tx.objectStore(IMAGE_STORE).clear();
    tx.oncomplete = resolve;
    tx.onerror = resolve;
  });
}

export async function isCached(key) {
  const val = await getCached(key);
  return val !== null;
}

export async function countUncached(keys) {
  const db = await openDB();
  const total = keys.length;
  let cached = 0;
  await Promise.all(
    keys.map(
      (key) =>
        new Promise((resolve) => {
          const tx = db.transaction(IMAGE_STORE, 'readonly');
          const req = tx.objectStore(IMAGE_STORE).getKey(key);
          req.onsuccess = () => {
            if (req.result !== undefined) cached++;
            resolve();
          };
          req.onerror = resolve;
        })
    )
  );
  return { total, cached, uncached: total - cached };
}
