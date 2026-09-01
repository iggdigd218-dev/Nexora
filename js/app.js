// نقطة بداية التطبيق — التهيئة والتوجيه
import { $, $$, esc, fmt, todayISO, uid } from './utils.js';
import { store } from './store.js';
import { toast, toastErr, openModal, confirmDialog, readForm, handleAttachment } from './components.js';
import { ACCOUNT_KINDS } from './accounting.js';
import * as views from './views/index.js';
import { initNotificationEngine, notifyDataChangeForBackup } from './notifications.js';

const state = {
  route: 'dashboard',
  params: {},
  sidebarOpen: false,
  hideBalance: false,
  locked: false,
  currentUser: null,
  user: null,
};

export function getState() { return state; }
export function go(route, params = {}) {
  state.route = route;
  state.params = params;
  location.hash = '#' + buildHash(route, params);
  render();
}
function buildHash(route, params) {
  let h = '/' + route;
  if (params.id) h += '/' + params.id;
  if (params.tab) h += '?tab=' + params.tab;
  return h;
}
function parseHash(hash) {
  let h = (hash || '#/dashboard').replace(/^#/, '');
  const q = h.indexOf('?');
  let params = {};
  if (q >= 0) {
    const qs = h.slice(q + 1);
    qs.split('&').forEach(p => { const [k, v] = p.split('='); if (k) params[k] = decodeURIComponent(v); });
    h = h.slice(0, q);
  }
  const parts = h.split('/').filter(Boolean);
  const route = parts[0] || 'dashboard';
  if (parts[1]) params.id = decodeURIComponent(parts[1]);
  return { route, params };
}

export function render() {
  if (state.locked) return;
  // إنشاء حاوية جديدة كل مرة حتى لا تتراكم مستمعات الأحداث على العنصر القديم
  const oldView = $('#view');
  const view = document.createElement('main');
  view.id = 'view';
  view.className = 'main';
  if (oldView) oldView.replaceWith(view);
  const v = views[state.route] || views.dashboard;
  if (!v || typeof v.render !== 'function') { view.innerHTML = '<div class="empty"><div class="e-ic">🚧</div><h3>صفحة غير موجودة</h3></div>'; return; }
  // تنشيط عنصر القائمة
  $$('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.route === state.route));
  v.render(view, state.params, state);
  refreshTopbar();
}

function refreshTopbar() {
  const st = store.settings();
  $('#brand-sub').textContent = (st.businessName ? st.businessName + ' — ' : '') + 'النظام المحاسبي';
  $('#eye-ic').textContent = state.hideBalance ? '🙈' : '👁️';
  $('#theme-ic').textContent = document.documentElement.dataset.theme === 'dark' ? '☀️' : '🌙';
  const unread = store.filter('messages', m => !m.read && !m.fromMe && m.conversationId).length;
  const badge = $('#chat-badge');
  if (unread > 0) { badge.textContent = unread; badge.hidden = false; } else badge.hidden = true;
}

// تطبيق المظهر
function applyTheme(theme) {
  const t = theme === 'system'
    ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : theme;
  document.documentElement.dataset.theme = t;
  document.documentElement.style.colorScheme = t;
}
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if ((store.settings().theme || 'light') === 'system') applyTheme('system');
});

// ---------- شاشة القفل ----------
let pinEntry = '';
function setupPin() {
  const lock = $('#pin-lock');
  const dots = $('#pin-dots');
  const pad = $('#pin-pad');
  const ok = $('#pin-ok');
  const err = $('#pin-err');
  function refreshDots() {
    dots.innerHTML = '';
    for (let i = 0; i < (state.user && state.user.pin ? state.user.pin.length : 4); i++) {
      dots.innerHTML += `<div class="pin-dot ${i < pinEntry.length ? 'fill' : ''}"></div>`;
    }
    ok.disabled = pinEntry.length < 4;
  }
  const nums = ['1','2','3','4','5','6','7','8','9','','0','⌫'];
  pad.innerHTML = nums.map(n => n === '' ? '<button disabled></button>' : `<button data-n="${esc(n)}">${n === '⌫' ? '⌫' : esc(n)}</button>`).join('');
  pad.onclick = (e) => {
    const btn = e.target.closest('button[data-n]');
    if (!btn) return;
    const n = btn.dataset.n;
    if (n === '⌫') pinEntry = pinEntry.slice(0, -1);
    else { if (pinEntry.length < 6) pinEntry += n; }
    refreshDots();
    if (pinEntry.length >= (state.user && state.user.pin ? state.user.pin.length : 4) && n !== '⌫') {
      setTimeout(() => tryUnlock(), 150);
    }
  };
  $('#pin-back').onclick = () => location.hash = '#/dashboard';
  $('#pin-ok').onclick = tryUnlock;
  function tryUnlock() {
    const expected = state.user && state.user.pin;
    if (!expected || pinEntry === expected) {
      state.locked = false;
      lock.classList.add('hidden');
      pinEntry = '';
      refreshDots();
      render();
    } else {
      toastErr('رمز PIN غير صحيح');
      pinEntry = '';
      refreshDots();
    }
  }
}

function lockApp() {
  const st = store.settings();
  if (state.user && state.user.pin) {
    state.locked = true;
    pinEntry = '';
    $('#pin-lock').classList.remove('hidden');
    $('#pin-dots').innerHTML = '';
    setupPin();
  } else {
    toast('التطبيق لا يحتوي رمز PIN، فعّله من الإعدادات', 'warn');
  }
}

// ---------- شاشة البداية ----------
function setupBoot() {
  const boot = $('#boot-screen');
  const app = $('#app');
  const st = store.settings();
  if (st.initialized) {
    boot.classList.add('hidden');
    app.classList.remove('hidden');
    finishStart();
    return;
  }
  boot.classList.remove('hidden');
  $('#boot-form').onsubmit = async (e) => {
    e.preventDefault();
    const name = $('#boot-name').value.trim();
    const cur = $('#boot-currency').value;
    const pin = $('#boot-pin').value;
    const user = { id: uid('user'), name: name || 'المدير', role: 'admin', me: true, pin: pin || '' };
    await store.save('users', user, { noActivity: true });
    await store.setSetting('initialized', true);
    await store.setSetting('businessName', name);
    await store.setSetting('defaultCurrency', cur);
    if (pin) await store.setSetting('pinEnabled', true);
    await store.setSetting('theme', 'light');
    state.currentUser = user;
    boot.classList.add('hidden');
    app.classList.remove('hidden');
    toast('مرحباً بك في إدارة البيانات 🎉');
    finishStart();
  };
}

function finishStart() {
  state.user = store.findBy('users', u => u.me) || { name: 'المدير', role: 'admin', pin: '' };
  // تسجيل الدخول كمدير افتراضي
  state.currentUser = state.user;
  // قفل تلقائي إن فُعّل
  const st = store.settings();
  state.hideBalance = !!st.hideBalances;
  document.documentElement.dataset.hideBal = state.hideBalance ? '1' : '0';
  document.documentElement.dataset.fontSize = st.fontSize || 'medium';
  if (st.pinEnabled && state.user.pin && st.autoLock) {
    state.locked = true;
    $('#pin-lock').classList.remove('hidden');
    setupPin();
  }
  applyTheme(st.theme || 'light');
  document.documentElement.dataset.sidebar = state.sidebarOpen ? 'open' : 'closed';
  setupGlobalHandlers();
  render();
  refreshTopbar();
}

function setupGlobalHandlers() {
  const sidebar = $('#sidebar');
  const closeSidebar = () => {
    state.sidebarOpen = false;
    document.documentElement.dataset.sidebar = 'closed';
  };
  const openSidebar = () => {
    state.sidebarOpen = true;
    document.documentElement.dataset.sidebar = 'open';
  };
  const toggleSidebar = () => {
    state.sidebarOpen = !state.sidebarOpen;
    document.documentElement.dataset.sidebar = state.sidebarOpen ? 'open' : 'closed';
  };

  const toggleBtn = $('#toggle-sidebar');
  if (toggleBtn) toggleBtn.onclick = toggleSidebar;

  const closeBtn = $('#btn-close-sidebar');
  if (closeBtn) closeBtn.onclick = closeSidebar;

  const backdrop = $('#sidebar-backdrop');
  if (backdrop) backdrop.onclick = closeSidebar;

  $('#btn-theme').onclick = () => {
    const cur = document.documentElement.dataset.theme;
    const next = cur === 'dark' ? 'light' : 'dark';
    store.setSetting('theme', next);
    applyTheme(next);
    refreshTopbar();
  };
  $('#btn-hide-balance').onclick = () => {
    state.hideBalance = !state.hideBalance;
    store.setSetting('hideBalances', state.hideBalance);
    document.documentElement.dataset.hideBal = state.hideBalance ? '1' : '0';
    $$('.amount-display, .ac-balance .b-val, .tbl .amount').forEach(el => el.classList.toggle('hide', state.hideBalance));
    refreshTopbar();
  };
  $('#btn-lock').onclick = lockApp;
  $('#btn-support').onclick = () => {
    const st = store.settings();
    window.open('https://wa.me/967774190040?text=' + encodeURIComponent('مرحباً، أحتاج مساعدة من خدمة العملاء'), '_blank');
  };
  $('#btn-search').onclick = () => openGlobalSearch();

  // إغلاق القائمة تلقائياً عند اختيار أي قسم
  if (sidebar) {
    sidebar.addEventListener('click', (e) => {
      if (e.target.closest('.nav-item') || e.target.closest('.btn.support')) {
        closeSidebar();
      }
    });
  }
  // زر نظام المبيعات العائم في أسفل يسار الشاشة
  const posFab = $('#btn-pos-fab');
  if (posFab) posFab.onclick = () => go('pos');

  // FAB
  $('#fab-add').onclick = () => $('#fab-menu').classList.toggle('hidden');
  $('#fab-menu').addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]');
    if (!act) return;
    $('#fab-menu').classList.add('hidden');
    if (act.dataset.act === 'pos') go('pos');
    else if (act.dataset.act === 'account') go('accounts', { new: 1 });
    else if (act.dataset.act === 'transaction') go('transactions', { new: 1 });
    else if (act.dataset.act === 'voucher') go('vouchers', { new: 1 });
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.fab-wrap')) $('#fab-menu').classList.add('hidden');
  });
}

// ---------- بحث شامل ----------
function openGlobalSearch() {
  const m = openModal({
    title: '🔍 بحث شامل',
    body: `
      <div class="search-input" style="margin-bottom:12px">
        <input id="gs-q" placeholder="ابحث في الحسابات، العمليات، السندات، الملاحظات..." autofocus />
        <span class="s-ic">🔍</span>
      </div>
      <div id="gs-results"></div>`,
    cls: 'lg',
  });
  const q = $('#gs-q', m.overlay);
  q.oninput = () => renderResults();
  function renderResults() {
    const term = q.value.trim().toLowerCase();
    const box = $('#gs-results', m.overlay);
    if (term.length < 1) { box.innerHTML = '<div class="muted">اكتب للبحث...</div>'; return; }
    const accounts = store.accounts(true).filter(a =>
      (a.name + ' ' + a.phone + ' ' + a.notes).toLowerCase().includes(term));
    const transactions = store.transactions().filter(t =>
      (t.desc + ' ' + t.ref + ' ' + (t.accountId || '')).toLowerCase().includes(term));
    const vouchers = store.col('vouchers').filter(v =>
      (v.number + ' ' + v.desc).toLowerCase().includes(term));
    const items = store.col('items').filter(item =>
      (item.name + ' ' + item.unit + ' ' + item.notes).toLowerCase().includes(term));
    const html = [];
    if (accounts.length) {
      html.push(`<div class="section-title">الحسابات (${accounts.length})</div>`);
      html.push(accounts.slice(0, 8).map(a => `<div class="settings-row" data-open-account="${a.id}" style="cursor:pointer">
        <span>${ACCOUNT_KINDS[a.kind].icon} <b>${esc(a.name)}</b></span><span class="muted">${esc(ACCOUNT_KINDS[a.kind].label)}</span></div>`).join(''));
    }
    if (transactions.length) {
      html.push(`<div class="section-title">العمليات (${transactions.length})</div>`);
      html.push(transactions.slice(0, 8).map(t => `<div class="settings-row" data-open-tx="${t.id}" style="cursor:pointer">
        <span>💸 ${esc(t.desc || 'عملية')}</span><span class="muted">${esc(t.date)}</span></div>`).join(''));
    }
    if (vouchers.length) {
      html.push(`<div class="section-title">السندات (${vouchers.length})</div>`);
      html.push(vouchers.slice(0, 8).map(v => `<div class="settings-row" data-open-voucher="${v.id}" style="cursor:pointer">
        <span>🧾 ${esc(v.number)}</span><span class="muted">${esc(v.date)}</span></div>`).join(''));
    }
    if (items.length) {
      html.push(`<div class="section-title">الأصناف (${items.length})</div>`);
      html.push(items.slice(0, 8).map(item => `<div class="settings-row" data-open-inventory style="cursor:pointer">
        <span>📦 <b>${esc(item.name)}</b></span><span class="muted">${esc(item.unit || 'حبة')} — ${fmt(item.quantity || 0)}</span></div>`).join(''));
    }
    if (!html.length) html.push('<div class="empty"><div class="e-ic">🔍</div>لا توجد نتائج</div>');
    box.innerHTML = html.join('');
    $$('[data-open-account]', box).forEach(el => el.onclick = () => { m.close(); go('accounts', { id: el.dataset.openAccount }); });
    $$('[data-open-tx]', box).forEach(el => el.onclick = () => { m.close(); go('transactions', { id: el.dataset.openTx }); });
    $$('[data-open-voucher]', box).forEach(el => el.onclick = () => { m.close(); go('vouchers', { id: el.dataset.openVoucher }); });
    $$('[data-open-inventory]', box).forEach(el => el.onclick = () => { m.close(); go('inventory'); });
  }
}

// ---------- نماذج سريعة ----------
export function openAccountForm(existing = null) {
  views.accounts.openAccountForm(existing);
}
export function openQuickTransaction() {
  go('transactions', { new: 1 });
}

// ---- إعادة العرض عند تغيير البيانات ----
store.onChange((payload) => {
  if (state.locked) return;
  if (payload && ['transactions', 'transactionItems', 'vouchers', 'accounts', 'items'].includes(payload.store)) {
    notifyDataChangeForBackup();
  }
  if (location.hash && ['pos','accounts','inventory','transactions','dashboard','vouchers','currencies','reports','chat'].includes(state.route)) {
    refreshTopbar();
  }
});

// ---- التوجيه ----
function onHash() {
  const { route, params } = parseHash(location.hash);
  state.route = route;
  state.params = params;
  render();
}

// ---- تشغيل ----
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').then(reg => {
    reg.update().catch(() => {});
  }).catch(() => {});
}
async function main() {
  await store.load();
  state.user = store.findBy('users', u => u.me) || null;
  setupBoot();
  setupPin();
  initNotificationEngine();
  window.addEventListener('hashchange', onHash);
  // إعداد السجل
  if (location.hash) { const { route, params } = parseHash(location.hash); state.route = route; state.params = params; }
  if (state.route !== 'dashboard') render();
}
main();
