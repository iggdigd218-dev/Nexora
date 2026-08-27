// Service Worker — دعم العمل دون إنترنت + تثبيت التطبيق كـ PWA
const CACHE = 'nexora-v1';
const CORE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/styles.css',
  './js/app.js',
  './js/utils.js',
  './js/db.js',
  './js/store.js',
  './js/accounting.js',
  './js/components.js',
  './js/views/index.js',
  './js/views/dashboard.js',
  './js/views/accounts.js',
  './js/views/transactions.js',
  './js/views/vouchers.js',
  './js/views/reports.js',
  './js/views/currencies.js',
  './js/views/chat.js',
  './js/views/activity.js',
  './js/views/users.js',
  './js/views/backup.js',
  './js/views/settings.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then(cached => {
      return cached || fetch(e.request).then(resp => {
        const copy = resp.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
        return resp;
      }).catch(() => caches.match('./index.html'));
    })
  );
});
