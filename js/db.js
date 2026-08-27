// طبقة قاعدة البيانات — IndexedDB (تعمل دون إنترنت بشكل كامل)
const DB_NAME = 'nexora_db';
const DB_VERSION = 1;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('meta')) {
        db.createObjectStore('meta');
      }
      if (!db.objectStoreNames.contains('settings')) {
        const s = db.createObjectStore('settings', { keyPath: 'key' });
        s.createIndex('by_key', 'key', { unique: true });
      }
      ['accounts', 'transactions', 'vouchers', 'categories', 'currencies',
       'conversations', 'messages', 'backups', 'activity', 'trash'].forEach((name) => {
        if (!db.objectStoreNames.contains(name)) {
          db.createObjectStore(name, { keyPath: 'id' });
        }
      });
      ['users', 'notifications', 'audit', 'templates', 'reminders', 'contacts'].forEach((name) => {
        if (!db.objectStoreNames.contains(name)) {
          db.createObjectStore(name, { keyPath: 'id' });
        }
      });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

let _db = null;
export async function getDB() {
  if (!_db) _db = await openDB();
  return _db;
}
export function setDBInstance(db) { _db = db; }

function tx(store, mode = 'readonly') {
  return getDB().then(db => db.transaction(store, mode).objectStore(store));
}
function reqToPromise(r) {
  return new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
}

export async function dbGetAll(store) {
  const s = await tx(store);
  return reqToPromise(s.getAll());
}
export async function dbGet(store, id) {
  const s = await tx(store);
  return reqToPromise(s.get(id));
}
export async function dbPut(store, value) {
  const s = await tx(store, 'readwrite');
  return reqToPromise(s.put(value));
}
export async function dbDelete(store, id) {
  const s = await tx(store, 'readwrite');
  return reqToPromise(s.delete(id));
}
export async function dbClear(store) {
  const s = await tx(store, 'readwrite');
  return reqToPromise(s.clear());
}
export async function dbBulk(store, values, mode = 'readwrite') {
  const s = await tx(store, mode);
  values.forEach(v => s.put(v));
  return new Promise((res, rej) => { s.transaction.oncomplete = res; s.transaction.onerror = () => rej(s.transaction.error); });
}
// حذف من خلال مؤشر يمسح كل السجلات
export async function dbClearWithCount(store) {
  const s = await tx(store, 'readwrite');
  return new Promise((res, rej) => {
    s.openCursor().onsuccess = (e) => {
      const c = e.target.result;
      if (c) { c.delete(); c.continue(); }
      else res();
    };
    s.transaction.onerror = () => rej(s.transaction.error);
  });
}

// إعادة تعيين كاملة
export async function resetAllData() {
  const db = await getDB();
  return new Promise((res, rej) => {
    const names = ['accounts','transactions','vouchers','categories','currencies',
      'conversations','messages','backups','activity','trash','users','notifications',
      'audit','templates','reminders','contacts'];
    const t = db.transaction(names, 'readwrite');
    names.forEach(n => t.objectStore(n).clear());
    t.oncomplete = res; t.onerror = () => rej(t.error);
  });
}

export async function dbSize() {
  const db = await getDB();
  return new Promise((res) => {
    try {
      navigator.storage && navigator.storage.estimate && navigator.storage.estimate().then(e => res(e.usage || 0));
    } catch (e) { res(0); }
  });
}

// تصدير كل البيانات ككائن
export async function exportAllData() {
  const stores = ['settings','currencies','categories','accounts','transactions','vouchers',
    'conversations','messages','users','activity','templates','reminders','notifications','contacts'];
  const out = { _version: DB_VERSION, _exportedAt: new Date().toISOString(), data: {} };
  for (const s of stores) out.data[s] = await dbGetAll(s);
  return out;
}

// استيراد كل البيانات (مع تحذير)
export async function importAllData(payload) {
  const stores = ['settings','currencies','categories','accounts','transactions','vouchers',
    'conversations','messages','users','activity','templates','reminders','notifications','contacts'];
  await resetAllData();
  for (const s of stores) {
    const arr = (payload.data && payload.data[s]) || [];
    if (arr.length) await dbBulk(s, arr);
  }
}
