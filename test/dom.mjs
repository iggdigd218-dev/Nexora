// اختبار واجهة المستخدم عبر jsdom — يحمّل التطبيق ويرسّم كل الشاشات
import 'fake-indexeddb/auto';
import { JSDOM } from 'jsdom';
import fs from 'fs';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const dom = new JSDOM(html, { url: 'http://localhost:8080/', pretendToBeVisual: true });
const { window } = dom;

// إعداد المتغيرات العامة
global.window = window;
global.document = window.document;
Object.defineProperty(global, 'navigator', { value: window.navigator, configurable: true });
Object.defineProperty(global, 'location', { value: window.location, configurable: true });
Object.defineProperty(global, 'localStorage', { value: window.localStorage, configurable: true });
Object.defineProperty(global, 'history', { value: window.history, configurable: true });
global.customElements = window.customElements;
global.getComputedStyle = window.getComputedStyle;
global.HTMLElement = window.HTMLElement;
global.Element = window.Element;
global.Node = window.Node;
global.Event = window.Event;
global.MouseEvent = window.MouseEvent;
global.KeyboardEvent = window.KeyboardEvent;
global.InputEvent = window.InputEvent;
global.performance = window.performance;
Object.defineProperty(global, 'crypto', { value: window.crypto, configurable: true });

window.matchMedia = window.matchMedia || ((q) => ({ matches: false, media: q, addEventListener(){}, removeEventListener(){}, addListener(){}, removeListener(){} }));
global.matchMedia = window.matchMedia;

// منع AudioContext
window.AudioContext = class {
  constructor(){ this.currentTime = 0; this.destination = {}; }
  createOscillator(){ return { connect(){}, start(){}, stop(){}, setValueAtTime(){}, type:'' }; }
  createGain(){ return { connect(){}, gain:{ setValueAtTime(){}, exponentialRampToValueAtTime(){} } }; }
};
window.webkitAudioContext = window.AudioContext;
global.AudioContext = window.AudioContext;

let pass = 0, fail = 0;
const ok = (n, c) => c ? pass++ : (fail++, console.log('FAIL:', n));

try {
  await import('../js/app.js');
  await new Promise(r => setTimeout(r, 100));

  // شاشة البداية تظهر لأن غير مهيأ
  const bootVisible = !document.getElementById('boot-screen').classList.contains('hidden');
  ok('boot screen shown', bootVisible);

  // ملء نموذج البداية
  const bootName = document.getElementById('boot-name');
  bootName.value = 'مؤسسة الاختبار';
  const bootForm = document.getElementById('boot-form');
  bootForm.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await new Promise(r => setTimeout(r, 300));

  const appVisible = !document.getElementById('app').classList.contains('hidden');
  ok('app visible after boot', appVisible);

  const view = document.getElementById('view');
  ok('dashboard rendered', view.innerHTML.length > 0 && view.querySelector('.view-title'));
  ok('dashboard has stats', view.querySelectorAll('.stat-card').length >= 3);

  // التنقل عبر كل الشاشات
  const routes = ['dashboard','accounts','inventory','transactions','vouchers','reports','currencies','chat','activity','users','backup','settings'];
  for (const route of routes) {
    window.location.hash = '#/' + route;
    window.dispatchEvent(new window.HashChangeEvent('hashchange'));
    await new Promise(r => setTimeout(r, 30));
    ok('route renders: ' + route, view.innerHTML.length > 0);
  }
  window.location.hash = '#/accounts';
  window.dispatchEvent(new window.HashChangeEvent('hashchange'));
  await new Promise(r => setTimeout(r, 50));

  // إضافة حساب من زر FAB/القائمة
  const accountAdd = document.querySelector('.view-head [data-act="new"]');
  if (accountAdd) accountAdd.click();
  await new Promise(r => setTimeout(r, 50));
  const modal = document.getElementById('modal-root');
  ok('account form modal opens', modal.innerHTML.includes('إضافة حساب'));

  console.log(`\nنتيجة DOM: ${pass} نجحت، ${fail} فشلت`);
} catch (err) {
  console.log('EXCEPTION:', err && err.stack || err);
  fail++;
}
console.log(`\nDOM: ${pass} نجحت، ${fail} فشلت`);

// ---- اختبار تدفق كامل عبر الواجهة: إنشاء حساب ثم عملية والتحقق من الرصيد ----
try {
  const { store } = await import('../js/store.js');
  // 1) إنشاء حساب من واجهة القائمة
  window.location.hash = '#/accounts';
  window.dispatchEvent(new window.HashChangeEvent('hashchange'));
  await new Promise(r => setTimeout(r, 50));
  const addBtn = document.querySelector('.view-head [data-act="new"]');
  addBtn.click();
  await new Promise(r => setTimeout(r, 50));
    const nameInput = document.getElementById('f-name');
  nameInput.value = 'عميل الواجهة';
  nameInput.dispatchEvent(new window.Event('input', { bubbles: true }));
  document.getElementById('acc-save').click();
  await new Promise(r => setTimeout(r, 200));
    const acc = store.findBy('accounts', a => a.name === 'عميل الواجهة');
  ok('account created via UI', !!acc);

  // 1.5) تفاصيل صنف وفاتورة: التخزين، نص واتساب، والسند مع الترويسة البديلة
  const item = await store.save('items', { id: 'item-ui', name: 'قهوة عربية', unit: 'كرتون', quantity: 12, buyPrice: 80, sellPrice: 100, alertQty: 2, notes: '' });
  ok('inventory item saved', item.name === 'قهوة عربية');
  const { transactionText, receiptHTML } = await import('../js/views/transactions.js');
  const featureTx = { id: 'feature-tx', accountId: acc.id, accountKind: 'customer', type: 'debit', amount: 200, currency: 'YER', date: '2026-04-01', time: '10:00', desc: 'بيع آجل', invoiceItems: [{ itemId: item.id, name: item.name, unit: item.unit, quantity: 2, unitPrice: 100, total: 200 }], status: 'completed', createdBy: 'المدير' };
  const featureText = transactionText(featureTx);
  const featureReceipt = receiptHTML(featureTx);
  ok('WhatsApp text includes line details', featureText.includes('قهوة عربية') && featureText.includes('الكمية') && featureText.includes('سعر الوحدة') && featureText.includes('إجمالي البند') && featureText.includes('الإجمالي: 200'));
  ok('receipt includes invoice table and fallback header', featureReceipt.includes('transaction-receipt') && featureReceipt.includes('<table>') && featureReceipt.includes('قهوة عربية') && featureReceipt.includes('إجمالي البند') && featureReceipt.includes('مؤسسة الاختبار'));
  const savedFeature = await store.saveTransaction(featureTx);
  ok('invoice lines stored separately', store.transactionItems(savedFeature.id).length === 1 && store.transactionItems(savedFeature.id)[0].itemId === item.id);
  ok('stored line details render in text', transactionText(savedFeature).includes('قهوة عربية') && transactionText(savedFeature).includes('إجمالي البند'));
  await store.setSetting('logo', 'data:image/png;base64,ZmFrZQ==');
  ok('logo setting is reused in receipt', receiptHTML(featureTx).includes('data:image/png;base64,ZmFrZQ=='));
  await store.setSetting('logo', '');
  await store.deleteTransaction(savedFeature.id);
  ok('invoice lines removed with transaction', store.transactionItems(savedFeature.id).length === 0);
  const { exportAllData } = await import('../js/db.js');
  const exported = await exportAllData();
  ok('backup includes inventory items', exported.data.items.some(x => x.id === 'item-ui'));

  // 2) إنشاء عملية عبر واجهة العمليات
  window.location.hash = '#/transactions?new=1';
  window.dispatchEvent(new window.HashChangeEvent('hashchange'));
  await new Promise(r => setTimeout(r, 100));
    const amt = document.getElementById('tx-amount');
  amt.value = '500';
  const desc = document.getElementById('f-desc');
  if (desc) desc.value = 'بيع نقدي';
  // اختر العملية من النوع «له» = debit
  const typeSel = document.getElementById('f-type');
  if (typeSel) { typeSel.value = 'debit'; typeSel.dispatchEvent(new window.Event('change', {bubbles:true})); }
  const accSel = document.getElementById('f-accountId');
  // اختر حساب العميل الذي أنشأناه
  if (accSel) {
    const opt = [...accSel.options].find(o => o.text.includes('عميل الواجهة'));
    if (opt) accSel.value = opt.value;
    accSel.dispatchEvent(new window.Event('change', {bubbles:true}));
  }
      const _sel = document.getElementById('f-accountId');
          document.getElementById('tx-save').click();
  await new Promise(r => setTimeout(r, 250));
    const bal = store.balance(acc.id);
  ok('balance = 500 after debit via UI', bal === 500);
  ok('transactions count = 1', store.col('transactions').length === 1);

  // 3) تعديل العملية من 500 إلى 700
  [...document.querySelectorAll('.modal-close')].forEach(b => b.click()); // أغلق أي مودالات معلقة
  await new Promise(r => setTimeout(r, 50));
  window.location.hash = '#/transactions';
  window.dispatchEvent(new window.HashChangeEvent('hashchange'));
  await new Promise(r => setTimeout(r, 80));
  const row = document.querySelector('#tx-list [data-open-tx]');
  ok('transaction row shown', !!row);
  if (row) { row.click(); await new Promise(r=>setTimeout(r,80)); }
  const editBtn = document.querySelector('#view [data-edit]');
  if (editBtn) { editBtn.click(); await new Promise(r=>setTimeout(r,80)); }
  const amt2 = document.getElementById('tx-amount');
  if (amt2) { amt2.value = '700'; }
  const save2 = document.getElementById('tx-save');
    if (save2) { save2.click(); await new Promise(r=>setTimeout(r,200)); }
    const bal2 = store.balance(acc.id);
    ok('balance = 700 after edit via UI', bal2 === 700);

  console.log(`\nتدفقات الواجهة: ${pass} نجحت، ${fail} فشلت`);
} catch (err) {
  console.log('FLOW EXCEPTION:', err && err.stack || err);
  fail++;
}
console.log(`\nالإجمالي النهائي: ${pass} نجحت، ${fail} فشلت`);
process.exit(fail ? 1 : 0);
