const DB_NAME = 'rv-streetview-cache';
const DB_VERSION = 3;
const BAD_STORE = 'bad_streets';

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
      if (!db.objectStoreNames.contains('routes')) {
        const rs = db.createObjectStore('routes', { keyPath: 'id' });
        rs.createIndex('loadedAt', 'loadedAt');
      }
      if (!db.objectStoreNames.contains(BAD_STORE)) {
        db.createObjectStore(BAD_STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

export async function markBad(id, name, geometry) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(BAD_STORE, 'readwrite');
    tx.objectStore(BAD_STORE).put({ id, name, geometry, markedAt: Date.now() });
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

export async function unmarkBad(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(BAD_STORE, 'readwrite');
    tx.objectStore(BAD_STORE).delete(id);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

export async function listBadStreets() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(BAD_STORE, 'readonly');
    const req = tx.objectStore(BAD_STORE).getAll();
    req.onsuccess = () => {
      const map = new Map();
      for (const record of req.result) map.set(record.id, record);
      resolve(map);
    };
    req.onerror = () => reject(req.error);
  });
}
