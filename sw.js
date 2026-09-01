// Service Worker — دعم العمل دون إنترنت + دفع الإشعارات في وضع السكون + مزامنة خلفية دورية
const CACHE = 'nexora-v2';
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
  './js/notifications.js',
  './js/drive.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(CORE)).catch(() => {})
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.map(k => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  
  // Network-First: استدعاء أحدث كود من الخادم أولاً ثم تحديث الكاش، وإذا كان بدون إنترنت يتم استخدام الكاش
  e.respondWith(
    fetch(e.request).then(resp => {
      if (resp && resp.status === 200) {
        const copy = resp.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
      }
      return resp;
    }).catch(() => {
      return caches.match(e.request).then(cached => {
        return cached || caches.match('./index.html');
      });
    })
  );
});

// =========================================================================
// 🔔 استقبال ومعالجة إشعارات الدفع (Push Notifications) حتى في وضع السكون
// =========================================================================
self.addEventListener('push', (e) => {
  let payload = {};
  if (e.data) {
    try {
      payload = e.data.json();
    } catch (err) {
      payload = { title: 'تنبيه نظام إدارة البيانات', body: e.data.text() };
    }
  }

  const title = payload.title || '🔔 تنبيه من نظام الحسابات';
  const options = {
    body: payload.body || 'يوجد تحديث أو تنبيه جديد يخص عملياتك.',
    icon: payload.icon || './icons/icon-192.png',
    badge: payload.badge || './icons/icon-192.png',
    data: payload.data || { url: './' },
    vibrate: [300, 150, 300, 150, 300],
    requireInteraction: payload.requireInteraction !== false,
    tag: payload.tag || ('push-' + Date.now()),
    actions: payload.actions || [
      { action: 'open', title: '👁️ فتح التطبيق' }
    ]
  };

  e.waitUntil(self.registration.showNotification(title, options));
});

// =========================================================================
// 🔄 فحص المزامنة الدورية في الخلفية (Periodic Background Sync) أثناء سكون الجهاز
// =========================================================================
self.addEventListener('periodicsync', (e) => {
  if (e.tag === 'audit-and-backup-check') {
    e.waitUntil(performBackgroundAuditInWorker());
  }
});

self.addEventListener('sync', (e) => {
  if (e.tag === 'background-backup-sync' || e.tag === 'audit-and-backup-check') {
    e.waitUntil(performBackgroundAuditInWorker());
  }
});

// فحص قاعدة البيانات IndexedDB مباشرة من الـ Service Worker في الخلفية
async function performBackgroundAuditInWorker() {
  try {
    const db = await openIDB();
    if (!db) return;

    // 1. فحص إعدادات التنبيهات
    const settingsStore = db.transaction('settings', 'readonly').objectStore('settings');
    const settingsReq = settingsStore.getAll();
    const settingsList = await reqToPromise(settingsReq);
    const settings = {};
    settingsList.forEach(s => { settings[s.key] = s.value; });

    if (settings.stockNotificationsEnabled === false) return;

    // 2. فحص الأصناف النافذة والراكدة
    const itemsStore = db.transaction('items', 'readonly').objectStore('items');
    const items = await reqToPromise(itemsStore.getAll());
    if (!items || !items.length) return;

    const txStore = db.transaction('transactions', 'readonly').objectStore('transactions');
    const txList = await reqToPromise(txStore.getAll());

    const txItemsStore = db.transaction('transactionItems', 'readonly').objectStore('transactionItems');
    const txItems = await reqToPromise(txItemsStore.getAll());

    const now = Date.now();
    const stagnantDays = Number(settings.stagnantDaysThreshold || 20);
    const stagnantMs = stagnantDays * 24 * 60 * 60 * 1000;

    const lastSoldMap = {};
    const txMap = {};
    txList.forEach(t => { txMap[t.id] = t; });

    txItems.forEach(line => {
      const tx = txMap[line.transactionId];
      if (tx && tx.date) {
        const time = new Date(tx.date).getTime();
        if (!lastSoldMap[line.itemId] || time > lastSoldMap[line.itemId]) {
          lastSoldMap[line.itemId] = time;
        }
      }
    });

    const outOfStock = [];
    const stagnant = [];

    items.forEach(item => {
      const q = Number(item.quantity || 0);
      if (q <= 0) {
        outOfStock.push(item);
      } else {
        const lastSold = lastSoldMap[item.id];
        if (!lastSold || (now - lastSold > stagnantMs)) {
          stagnant.push(item);
        }
      }
    });

    // إشعار الأصناف النافذة في الخلفية
    if (outOfStock.length > 0) {
      const names = outOfStock.slice(0, 3).map(i => i.name).join('، ');
      const extra = outOfStock.length > 3 ? ` و ${outOfStock.length - 3} أصناف أخرى` : '';
      await self.registration.showNotification(`❌ تنبيه نفاد مخزون (${outOfStock.length} صنف)`, {
        body: `تنبيه سكون: نفد مخزون ${names}${extra}. يرجى التوريد وتحديث الكميات.`,
        icon: settings.logo || './icons/icon-192.png',
        badge: './icons/icon-192.png',
        tag: 'bg-out-of-stock',
        data: { url: './#/inventory' },
        vibrate: [200, 100, 200],
      });
    }

    // إشعار الأصناف الراكدة في الخلفية
    if (stagnant.length > 0 && settings.stagnantAlertsEnabled !== false) {
      const names = stagnant.slice(0, 3).map(i => i.name).join('، ');
      const extra = stagnant.length > 3 ? ` و ${stagnant.length - 3} أصناف أخرى` : '';
      await self.registration.showNotification(`⏳ تنبيه أصناف راكدة بالمخزن (${stagnant.length} صنف)`, {
        body: `أصناف لم تسجل أي حركة مبيعات منذ أكثر من ${stagnantDays} يوماً: ${names}${extra}.`,
        icon: settings.logo || './icons/icon-192.png',
        badge: './icons/icon-192.png',
        tag: 'bg-stagnant-items',
        data: { url: './#/inventory' },
        vibrate: [150, 80, 150],
      });
    }
  } catch (err) {
    console.warn('Worker background audit failed:', err);
  }
}

function openIDB() {
  return new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') return resolve(null);
    const req = indexedDB.open('nexora_db', 2);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  });
}

function reqToPromise(req) {
  return new Promise((resolve) => {
    if (!req) return resolve([]);
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => resolve([]);
  });
}

// التعامل مع النقر على الإشعارات وتوجيه المستخدم للشاشة المناسبة
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const targetUrl = (e.notification.data && e.notification.data.url) ? e.notification.data.url : './';
  
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          if (client.url && client.navigate && targetUrl !== './') {
            client.navigate(targetUrl);
          }
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});

self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'SHOW_NOTIFICATION') {
    self.registration.showNotification(e.data.title, e.data.options);
  } else if (e.data && e.data.type === 'TRIGGER_BG_AUDIT') {
    performBackgroundAuditInWorker();
  }
});
