// Cloud sync: Firebase Firestore + Google sign-in.
// Firestore keeps a full copy on the phone (IndexedDB), so the app keeps
// working offline and queued changes upload when the connection returns.
//
// Writes are fire-and-forget: with offline persistence a write promise only
// settles when the server acknowledges it, so nothing in the UI awaits them.
// The local cache (and every listener) updates immediately either way.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import {
  getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signInWithRedirect,
  signInWithCredential, signOut, connectAuthEmulator,
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager, connectFirestoreEmulator,
  collection, doc, onSnapshot, query, where, orderBy, limit, getDocs, setDoc, updateDoc, deleteDoc,
  deleteField, increment, writeBatch, FieldPath,
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';

const firebaseConfig = {
  apiKey: 'AIzaSyBF15VsYltwkTgVQ6diAp2jzsOyhhf6UPY',
  authDomain: 'aone-billing.firebaseapp.com',
  projectId: 'aone-billing',
  storageBucket: 'aone-billing.firebasestorage.app',
  messagingSenderId: '547510283637',
  appId: '1:547510283637:web:e5a7445fe99438e3ccb73c',
};

// Local testing against the Firebase emulator: open http://localhost:8765/?emu
const EMU = ['localhost', '127.0.0.1'].includes(location.hostname) && new URLSearchParams(location.search).has('emu');

const app = initializeApp(EMU ? { ...firebaseConfig, projectId: 'demo-aone' } : firebaseConfig);
const auth = getAuth(app);
const fs = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});
if (EMU) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(fs, '127.0.0.1', 8080);
}

const COLLECTIONS = ['products', 'customers', 'bills', 'bundles', 'meta'];
const ref = (col, id) => doc(fs, col, id);
const clean = obj => JSON.parse(JSON.stringify(obj)); // Firestore rejects `undefined`
const pairs = fields => Object.entries(fields).flat();

export const cloud = {
  emulator: EMU,
  debug: { fs }, // for testing in DevTools (e.g. disableNetwork)
  onError: e => console.error(e),

  // ---- auth
  watchAuth: cb => onAuthStateChanged(auth, cb),
  async signIn() {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    try {
      await signInWithPopup(auth, provider);
    } catch (e) {
      if (['auth/popup-blocked', 'auth/operation-not-supported-in-this-environment'].includes(e.code)) {
        await signInWithRedirect(auth, provider);
      } else throw e;
    }
  },
  // Emulator only: sign in as any test address without a real Google account.
  emuSignIn: email => signInWithCredential(auth, GoogleAuthProvider.credential(JSON.stringify({ sub: email, email, email_verified: true }))),
  signOut: () => signOut(auth),

  // ---- live data
  // handler(name, rows, meta) is called for 'products', 'customers', 'bills', 'meta'.
  // meta = { fromCache, pending, dataChanged }
  subscribe(handler, onError, recentSinceIso) {
    const unsubs = [];
    const meta = s => ({ fromCache: s.metadata.fromCache, pending: s.metadata.hasPendingWrites, dataChanged: s.docChanges().length > 0 });
    const opts = { includeMetadataChanges: true };
    for (const col of ['products', 'customers', 'meta']) {
      unsubs.push(onSnapshot(collection(fs, col), opts, s => handler(col, s.docs.map(d => ({ id: d.id, ...d.data() })), meta(s)), onError));
    }
    // Bills: everything still open or unpaid, plus anything touched recently.
    // Older history is fetched on demand so daily reads stay small.
    // Several queries feed one list; each keeps its own map and they are merged.
    const merged = (name, count) => {
      const maps = Array.from({ length: count }, () => new Map());
      const emit = s => handler(name, [...new Map(maps.flatMap(m => [...m])).values()], meta(s));
      return (i, q) => unsubs.push(onSnapshot(q, opts, s => {
        maps[i].clear();
        s.docs.forEach(d => maps[i].set(d.id, { id: d.id, ...d.data() }));
        emit(s);
      }, onError));
    };
    const bills = merged('bills', 3);
    bills(0, query(collection(fs, 'bills'), where('updatedAt', '>=', recentSinceIso)));
    bills(1, query(collection(fs, 'bills'), where('settled', '==', false)));
    bills(2, query(collection(fs, 'bills'), where('status', 'in', ['DRAFT', 'ACTIVE'])));
    // Wire bundles: every bundle still with a customer, plus recently returned ones.
    const bundles = merged('bundles', 2);
    bundles(0, query(collection(fs, 'bundles'), where('updatedAt', '>=', recentSinceIso)));
    bundles(1, query(collection(fs, 'bundles'), where('status', '==', 'OUT')));
    return () => unsubs.forEach(u => u());
  },

  async loadBillsBefore(iso, max = 300) {
    const s = await getDocs(query(collection(fs, 'bills'), where('updatedAt', '<', iso), orderBy('updatedAt', 'desc'), limit(max)));
    return s.docs.map(d => ({ id: d.id, ...d.data() }));
  },
  async loadBillsCompletedBetween(fromIso, toIso) {
    const s = await getDocs(query(collection(fs, 'bills'), where('completedAt', '>=', fromIso), where('completedAt', '<', toIso)));
    return s.docs.map(d => ({ id: d.id, ...d.data() }));
  },

  // ---- writes (fire-and-forget)
  put(col, obj) {
    setDoc(ref(col, obj.id), clean(obj)).catch(cloud.onError);
  },
  update(col, id, fields) {
    updateDoc(ref(col, id), clean(fields)).catch(cloud.onError);
  },
  remove(col, id) {
    deleteDoc(ref(col, id)).catch(cloud.onError);
  },
  setMeta(id, fields) {
    setDoc(ref('meta', id), clean(fields), { merge: true }).catch(cloud.onError);
  },
  // Items and payments live in maps on the bill (map = 'items' | 'payments'),
  // so two phones adding to the same bill at the same moment never overwrite
  // each other.
  setBillEntry(billId, map, entry, fields) {
    updateDoc(ref('bills', billId), new FieldPath(map, entry.id), clean(entry), ...pairs(clean(fields))).catch(cloud.onError);
  },
  removeBillEntry(billId, map, entryId, fields) {
    updateDoc(ref('bills', billId), new FieldPath(map, entryId), deleteField(), ...pairs(clean(fields))).catch(cloud.onError);
  },
  addStock(productId, delta, at) {
    updateDoc(ref('products', productId), { stock: increment(delta), updatedAt: at }).catch(cloud.onError);
  },

  // ---- bulk (awaited; need a connection)
  async exportAll() {
    const out = {};
    for (const col of COLLECTIONS) out[col] = (await getDocs(collection(fs, col))).docs.map(d => ({ id: d.id, ...d.data() }));
    return out;
  },
  async writeAll(data) {
    const ops = [];
    for (const col of COLLECTIONS) for (const row of data[col] || []) ops.push(b => b.set(ref(col, row.id), clean(row)));
    await commitInChunks(ops);
  },
  async deleteAll() {
    const ops = [];
    for (const col of COLLECTIONS) (await getDocs(collection(fs, col))).docs.forEach(d => ops.push(b => b.delete(d.ref)));
    await commitInChunks(ops);
  },
};

async function commitInChunks(ops) {
  for (let i = 0; i < ops.length; i += 400) {
    const batch = writeBatch(fs);
    ops.slice(i, i + 400).forEach(op => op(batch));
    await batch.commit();
  }
}
