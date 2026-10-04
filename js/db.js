// Thin IndexedDB wrapper. Bills embed their line items (a snapshot of
// productName, unit and rate at the moment of adding), so price changes
// never alter existing bills.
const DB_NAME = 'aone-billing';
const DB_VERSION = 1;
export const STORES = ['products', 'customers', 'bills', 'settings'];

let dbPromise;

function open() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains('products')) d.createObjectStore('products', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('customers')) d.createObjectStore('customers', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('bills')) {
          const s = d.createObjectStore('bills', { keyPath: 'id' });
          s.createIndex('status', 'status');
        }
        if (!d.objectStoreNames.contains('settings')) d.createObjectStore('settings', { keyPath: 'key' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error('Database blocked — close other tabs of this app'));
    });
  }
  return dbPromise;
}

async function run(stores, mode, fn) {
  const d = await open();
  return new Promise((resolve, reject) => {
    const t = d.transaction(stores, mode);
    const req = fn(t);
    t.oncomplete = () => resolve(req && 'result' in req ? req.result : undefined);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('Transaction aborted'));
  });
}

export const db = {
  all: store => run(store, 'readonly', t => t.objectStore(store).getAll()),
  put: (store, value) => run(store, 'readwrite', t => t.objectStore(store).put(value)),
  putMany: (store, list) => run(store, 'readwrite', t => {
    const os = t.objectStore(store);
    list.forEach(v => os.put(v));
  }),
  del: (store, key) => run(store, 'readwrite', t => t.objectStore(store).delete(key)),

  async exportAll() {
    const out = {};
    for (const s of STORES) out[s] = await this.all(s);
    return out;
  },

  // Atomic: either the whole backup is restored or nothing changes.
  replaceAll: data => run(STORES, 'readwrite', t => {
    for (const s of STORES) {
      const os = t.objectStore(s);
      os.clear();
      (data[s] || []).forEach(v => os.put(v));
    }
  }),

  clearAll: () => run(STORES, 'readwrite', t => {
    STORES.forEach(s => t.objectStore(s).clear());
  }),
};
