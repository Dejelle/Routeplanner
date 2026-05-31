const DB_NAME = 'rv-streetview-cache';
const DB_VERSION = 3;
const ROUTE_STORE = 'routes';

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('images')) {
        db.createObjectStore('images');
      }
      if (!db.objectStoreNames.contains(ROUTE_STORE)) {
        const rs = db.createObjectStore(ROUTE_STORE, { keyPath: 'id' });
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

export async function saveRoute(record) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ROUTE_STORE, 'readwrite');
    tx.objectStore(ROUTE_STORE).put(record);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

export async function listRoutes() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ROUTE_STORE, 'readonly');
    const req = tx.objectStore(ROUTE_STORE).getAll();
    req.onsuccess = () =>
      resolve([...req.result].sort((a, b) => b.loadedAt - a.loadedAt));
    req.onerror = () => reject(req.error);
  });
}

export async function loadRoute(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ROUTE_STORE, 'readonly');
    const req = tx.objectStore(ROUTE_STORE).get(id);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function deleteRoute(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ROUTE_STORE, 'readwrite');
    tx.objectStore(ROUTE_STORE).delete(id);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}
