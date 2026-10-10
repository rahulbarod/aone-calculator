// Offline cache for the app shell and the Firebase SDK. Bump VERSION
// whenever any file changes so installed phones pick up the new files.
const VERSION = 'aone-v3.2.0';
const FIREBASE = 'https://www.gstatic.com/firebasejs/12.19.0/';
const ASSETS = [
  './',
  './index.html',
  './css/app.css',
  './js/app.js',
  './js/cloud.js',
  './js/parse.js',
  './js/i18n.js',
  './js/db.js',
  './js/voice.js',
  './js/scale.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-512.png',
  './icons/apple-touch-icon.png',
  FIREBASE + 'firebase-app.js',
  FIREBASE + 'firebase-auth.js',
  FIREBASE + 'firebase-firestore.js',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Only the app's own files and the Firebase SDK are cached. Firestore and
// sign-in traffic always goes to the network (Firestore has its own offline copy).
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const sameOrigin = new URL(req.url).origin === location.origin;
  if (!sameOrigin && !req.url.startsWith(FIREBASE)) return;
  if (sameOrigin && new URL(req.url).pathname.includes('/__/')) return;
  if (req.mode === 'navigate') {
    e.respondWith(caches.match('./index.html').then(r => r || fetch(req)));
    return;
  }
  e.respondWith(
    caches.match(req).then(hit => hit || fetch(req).then(res => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(VERSION).then(c => c.put(req, copy));
      }
      return res;
    })),
  );
});
