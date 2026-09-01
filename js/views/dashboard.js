// لوحة التحكم — ملخص مالي + تنبيهات + رسوم بيانية
import { $, $$, esc, fmt, todayISO, parseDate, relTime, beep } from '../utils.js';
import { store } from '../store.js';
import { money, toast, openModal } from '../components.js';
import { accountBalance, ACCOUNT_KINDS, OP_TYPES, balanceLabels, txEffect } from '../accounting.js';
import { go } from '../app.js';

export function render(container, params, state) {
  const settings = store.settings();
  const accounts = store.accounts(true);
  const txs = store.transactions();
  const currs = store.getCurrencies();
  const { oweUs, oweThem } = balanceLabels(settings);

  // --- ملخصات حسب العملة ---
  const perCurr = {};
  for (const a of accounts) {
    const c = a.currency || settings.defaultCurrency;
    if (!perCurr[c]) perCurr[c] = { receivable: 0, payable: 0, net: 0, count: 0 };
    const bal = accountBalance(a, txs);
    if (bal > 0) perCurr[c].receivable += bal;
    else perCurr[c].payable += Math.abs(bal);
    perCurr[c].net += bal;
    perCurr[c].count++;
  }

  // --- إيرادات ومصروفات ---
  let revenue = 0, expense = 0;
  for (const t of txs) {
    if (t.currency !== settings.defaultCurrency) continue;
    if (t.type === 'revenue' || t.type === 'in') revenue += Math.abs(t.amount);
    else if (t.type === 'expense' || t.type === 'out') expense += Math.abs(t.amount);
  }

  // --- العمليات الأخيرة ---
  const recent = txs.slice(0, 8);

  // --- الحسابات الأكثر نشاطاً ---
  const txCount = {};
  for (const t of txs) if (t.accountId) txCount[t.accountId] = (txCount[t.accountId] || 0) + 1;
  const activeAccounts = accounts
    .map(a => ({ a, n: txCount[a.id] || 0, bal: accountBalance(a, txs) }))
    .sort((x, y) => y.n - x.n).slice(0, 6);

  // --- التنبيهات ---
  const alerts = [];
  const today = todayISO();
  for (const a of accounts) {
    if (a.dueDate && a.dueDate <= today && a.status === 'active') {
      const bal = accountBalance(a, txs);
      if (bal > 0) alerts.push({ type: 'warn', text: `حساب <b>${esc(a.name)}</b> عليه <b>${fmt(bal)}</b> والموعد المحدد قد حل (${esc(a.dueDate)}).` });
    }
    if (a.creditLimit && accountBalance(a, txs) > a.creditLimit) {
      alerts.push({ type: 'danger', text: `حساب <b>${esc(a.name)}</b> تجاوز الحد الائتماني (${fmt(accountBalance(a, txs))} من أصل ${fmt(a.creditLimit)}).` });
    }
  }

  // --- بيانات الرسوم البيانية (آخر 7 أيام و 12 شهراً) ---
  const daily = lastDays(7, txs, settings.defaultCurrency);
  const monthly = lastMonths(6, txs, settings.defaultCurrency);

  container.innerHTML = `
    <div class="view-head">
      <div>
        <div class="view-title">لوحة التحكم 📊</div>
        <small>نظرة شاملة على وضعك المالي — ${esc(settings.businessName || '')}</small>
      </div>
      <div class="view-actions">
        <button class="btn primary" data-quick="tx">＋ عملية</button>
        <button class="btn soft" data-quick="account">＋ حساب</button>
        <button class="btn ghost" data-quick="voucher">＋ سند</button>
      </div>
    </div>

    ${alerts.length ? `<div style="margin-bottom:14px">${alerts.map(a => `
      <div class="alert ${a.type}"><span class="a-ic">${a.type === 'danger' ? '🚨' : '⏰'}</span><div>${a.text}</div></div>`).join('')}</div>` : ''}

    <div class="grid grid-4" style="margin-bottom:16px">
      <div class="card stat-card tone-teal">
        <span class="stat-ic">👥</span>
        <div class="label">إجمالي المستحق لصالحك (له / ذمم مدينة)</div>
        <div class="value" id="d-total-owe">${fmt(totalOf(perCurr, 'receivable'))}</div>
        <div class="sub">في كل العملات حسب تقاريرك</div>
      </div>
      <div class="card stat-card tone-danger">
        <span class="stat-ic">🏷️</span>
        <div class="label">إجمالي المستحق عليك (عليه / ذمم دائنة)</div>
        <div class="value" id="d-total-owed">${fmt(totalOf(perCurr, 'payable'))}</div>
        <div class="sub">ما عليك سداده</div>
      </div>
      <div class="card stat-card tone-green">
        <span class="stat-ic">💰</span>
        <div class="label">صافي الرصيد</div>
        <div class="value" id="d-net">${fmt(totalOf(perCurr, 'net'))}</div>
        <div class="sub">المستحق لك ناقصاً ما عليك</div>
      </div>
      <div class="card stat-card tone-accent">
        <span class="stat-ic">📈</span>
        <div class="label">الإيرادات / المصروفات (${esc(store.currency(settings.defaultCurrency).symbol)})</div>
        <div class="value">${fmt(revenue)} <span style="color:var(--green)">▲</span> <span style="color:var(--danger)">${fmt(expense)} ▼</span></div>
        <div class="sub">آخر الحركة المالية</div>
      </div>
    </div>

    <div class="grid grid-3" style="margin-bottom:16px">
      <div class="card" style="grid-column:span 2">
        <div class="cc-head"><div class="section-title" style="margin:0">الحركة المالية — آخر 7 أيام</div>
          <span class="legend"><span class="lg"><span class="sw" style="background:var(--green)"></span> إيراد/قبض</span><span class="lg"><span class="sw" style="background:var(--danger)"></span> مصروف/صرف</span></span>
        </div>
        <div class="bars" id="d-bars">${renderBars(daily)}</div>
      </div>
      <div class="card">
        <div class="cc-head"><div class="section-title" style="margin:0">الأرصدة حسب العملة</div></div>
        <div id="d-currs">${renderCurrencyBreakdown(perCurr, currs, settings, oweUs, oweThem)}</div>
      </div>
    </div>

    <div class="grid grid-2" style="margin-bottom:16px">
      <div class="card">
        <div class="cc-head"><div class="section-title" style="margin:0">الحركة الشهرية</div></div>
        <div class="bars" id="d-month-bars" style="height:120px">${renderMonthBars(monthly)}</div>
      </div>
      <div class="card">
        <div class="section-title">الحسابات الأكثر نشاطاً</div>
        ${activeAccounts.length ? activeAccounts.map(x => `
          <div class="settings-row" data-acc="${x.a.id}" style="cursor:pointer">
            <span>${ACCOUNT_KINDS[x.a.kind].icon} <b>${esc(x.a.name)}</b> <span class="muted">(${x.n} عملية)</span></span>
            <span class="pill ${x.bal >= 0 ? 'red' : 'green'}">${fmt(x.bal)}</span>
          </div>`).join('') : '<div class="muted">لا توجد حسابات بعد</div>'}
      </div>
    </div>

    <div class="grid grid-2">
      <div class="card">
        <div class="cc-head"><div class="section-title" style="margin:0">آخر العمليات المالية</div><button class="btn sm ghost" data-nav="transactions">الكل</button></div>
        ${recent.length ? recent.map(t => renderTxRow(t, settings, state)).join('') : '<div class="muted">لا توجد عمليات بعد</div>'}
      </div>
      <div class="card">
        <div class="section-title">اختصارات سريعة</div>
        <div class="grid grid-2" style="gap:10px">
          <button class="btn ghost" data-nav="pos">🛒 المبيعات ونقاط البيع</button>
          <button class="btn ghost" data-quick="tx">💸 عملية جديدة</button>
          <button class="btn ghost" data-quick="account">👤 حساب جديد</button>
          <button class="btn ghost" data-quick="voucher">🧾 سند جديد</button>
        </div>
        <div class="divider"></div>
        <div class="section-title">التنبيهات</div>
        <div id="d-alerts">
          ${alerts.length ? alerts.map(a => `<div class="alert ${a.type}" style="margin-bottom:6px;padding:10px 12px"><span class="a-ic">${a.type === 'danger' ? '🚨' : '⏰'}</span><div style="font-size:13px">${a.text}</div></div>`).join('') : '<div class="muted">لا توجد تنبيهات مستحقة ✅</div>'}
        </div>
      </div>
    </div>
  `;

  // أحداث
  container.addEventListener('click', (e) => {
    const q = e.target.closest('[data-quick]');
    if (q) { if (q.dataset.quick === 'tx') go('transactions', { new: 1 }); else if (q.dataset.quick === 'account') go('accounts', { new: 1 }); else go('vouchers', { new: 1 }); return; }
    const nav = e.target.closest('[data-nav]');
    if (nav) { go(nav.dataset.nav); return; }
    const acc = e.target.closest('[data-acc]');
    if (acc) { go('accounts', { id: acc.dataset.acc }); return; }
    const cur = e.target.closest('[data-cur]');
    if (cur) { go('reports', { currency: cur.dataset.cur }); return; }
  });
}

function totalOf(perCurr, key) {
  let sum = 0;
  for (const c in perCurr) sum += perCurr[c][key];
  return sum;
}

function renderCurrencyBreakdown(perCurr, currs, settings, oweUs, oweThem) {
  if (!Object.keys(perCurr).length) return '<div class="muted">لا توجد أرصدة بعد</div>';
  return Object.entries(perCurr).map(([code, d]) => {
    const c = store.currency(code);
    return `<div class="settings-row" data-cur="${code}" style="cursor:pointer">
      <span><b>${esc(c.name)}</b> <span class="currency-badge">${esc(c.symbol)}</span></span>
      <span class="pill ${d.net >= 0 ? 'red' : 'green'}">${fmt(d.net)}</span>
    </div>`;
  }).join('');
}

function renderTxRow(t, settings, state) {
  const acc = store.getAccount(t.accountId);
  const op = OP_TYPES[t.type] || OP_TYPES.settle;
  const name = acc ? acc.name : t.type === 'transfer' ? 'تحويل' : 'حساب';
  const bal = accountBalance(acc || {}, store.col('transactions'));
  return `
    <div class="settings-row" data-tx="${t.id}" style="cursor:pointer">
      <span>${op.icon} <b>${esc(t.desc || op.label)}</b>
        <span class="muted">— ${esc(name)}</span></span>
      <span style="text-align:left">
        <span class="amount-display ${t.amount >= 0 ? '' : ''}">${fmt(Math.abs(t.amount))} ${esc(store.currency(t.currency).symbol)}</span>
        <span class="muted" style="display:block;font-size:11px">${esc(t.date)}</span>
      </span>
    </div>`;
}

// آخر 7 أيام
function lastDays(n, txs, cur) {
  const days = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const label = d.toLocaleDateString('ar-EG-u-ca-gregory-nu-latn', { weekday: 'short' });
    let up = 0, down = 0;
    for (const t of txs) {
      if (t.currency !== cur) continue;
      if (t.date !== key) continue;
      const g = t.type === 'revenue' || t.type === 'in' ? 'up' : t.type === 'expense' || t.type === 'out' ? 'down' : null;
      if (g === 'up') up += Math.abs(t.amount);
      else if (g === 'down') down += Math.abs(t.amount);
    }
    days.push({ label, up, down });
  }
  return days;
}
function lastMonths(n, txs, cur) {
  const months = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    let up = 0, down = 0;
    for (const t of txs) {
      if (t.currency !== cur) continue;
      if (!t.date) continue;
      const tk = t.date.slice(0, 7);
      if (tk !== key) continue;
      const g = t.type === 'revenue' || t.type === 'in' ? 'up' : t.type === 'expense' || t.type === 'out' ? 'down' : null;
      if (g === 'up') up += Math.abs(t.amount);
      else if (g === 'down') down += Math.abs(t.amount);
    }
    months.push({ label: d.toLocaleDateString('ar-EG-u-ca-gregory-nu-latn', { month: 'short' }), up, down });
  }
  return months;
}
function renderBars(daily) {
  const max = Math.max(1, ...daily.map(d => Math.max(d.up, d.down)));
  return daily.map(d => `
    <div class="bar-col" title="${esc(d.label)}: قبض ${fmt(d.up)} / صرف ${fmt(d.down)}">
      <div class="bar up" style="height:${Math.round(d.up / max * 100)}%"></div>
      <div class="bar down" style="height:${Math.round(d.down / max * 100)}%"></div>
      <span class="bar-label">${esc(d.label)}</span>
    </div>`).join('');
}
function renderMonthBars(monthly) {
  const max = Math.max(1, ...monthly.map(d => Math.max(d.up, d.down)));
  return monthly.map(d => `
    <div class="bar-col" title="${esc(d.label)}">
      <div class="bar primary" style="height:${Math.round(Math.max(d.up, d.down) / max * 100)}%"></div>
      <span class="bar-label">${esc(d.label)}</span>
    </div>`).join('');
}
