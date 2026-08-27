// مركز التقارير
import { $, $$, esc, fmt, todayISO, parseDate, fmtDate, printHTML, exportExcel, openWhatsApp } from '../utils.js';
import { store } from '../store.js';
import { toast, toastErr, openModal } from '../components.js';
import { accountBalance, ACCOUNT_KINDS, OP_TYPES, balanceLabels, txEffect } from '../accounting.js';

const REPORT_TABS = [
  { id: 'summary', label: '📋 ملخص إجمالي المبالغ' },
  { id: 'detail', label: '🧾 تفصيل العمليات' },
  { id: 'categories', label: '🗂️ التصنيفات' },
  { id: 'period', label: '🗓️ يومي/أسبوعي/شهري/سنوي' },
  { id: 'account', label: '👤 حسب عميل/مورد' },
  { id: 'currency', label: '💱 حسب العملة' },
  { id: 'pl', label: '📈 إيرادات ومصروفات' },
  { id: 'top-debt', label: '💸 أكثر الحسابات مديونية' },
  { id: 'top-active', label: '⚡ أكثر الحسابات نشاطاً' },
  { id: 'overdue', label: '⏰ عمليات مستحقة/متأخرة' },
];

export function render(container, params, state) {
  let current = 'summary';
  const settings = store.settings();

  container.innerHTML = `
    <div class="view-head">
      <div><div class="view-title">التقارير 📈</div><small>تقارير احترافية قابلة للتصدير PDF وExcel والمشاركة</small></div>
    </div>
    <div class="toolbar" style="flex-wrap:wrap">
      <input type="date" class="select" id="r-from" value="${daysAgo(90)}">
      <input type="date" class="select" id="r-to" value="${todayISO()}">
      <select class="select" id="r-currency"><option value="">كل العملات</option>${store.getCurrencies().map(c=>`<option value="${c.code}">${esc(c.name)}</option>`).join('')}</select>
      <select class="select" id="r-account"><option value="">كل الحسابات</option>${store.accounts(true).map(a=>`<option value="${a.id}">${ACCOUNT_KINDS[a.kind].icon} ${esc(a.name)}</option>`).join('')}</select>
      <button class="btn soft" id="r-run">توليد التقرير</button>
    </div>
    <div class="tabs" id="r-tabs">${REPORT_TABS.map(t=>`<button class="tab ${t.id===current?'active':''}" data-tab="${t.id}">${t.label}</button>`).join('')}</div>
    <div id="r-output"></div>
  `;

  $('#r-tabs', container).addEventListener('click', (e) => {
    const tab = e.target.closest('[data-tab]');
    if (!tab) return;
    current = tab.dataset.tab;
    $$('#r-tabs .tab', container).forEach(t => t.classList.toggle('active', t.dataset.tab === current));
    run();
  });
  $('#r-run', container).addEventListener('click', run);
  ['r-from','r-to','r-currency','r-account'].forEach(id => $('#'+id, container).addEventListener('change', run));

  function run() {
    const from = $('#r-from', container).value;
    const to = $('#r-to', container).value;
    const cur = $('#r-currency', container).value;
    const accId = $('#r-account', container).value;
    const data = compute({ from, to, cur, accId });
    renderOutput(data);
  }
  run();

  function renderOutput(data) {
    const box = $('#r-output', container);
    const r = REPORT_TABS.find(t => t.id === current);
    box.innerHTML = `
      <div class="report-preview" id="rp">
        <h2><span>${r.label}</span><span style="font-size:13px;font-weight:400">${esc(store.settings().businessName||'')}</span></h2>
        <div class="meta" style="color:#666;font-size:12px">الفترة: ${esc(fromLabel(data))} — ${esc(toLabel(data))} · التاريخ: ${esc(fmtDate(new Date(),'short'))}</div>
        <div id="rp-body">${renderReport(data)}</div>
      </div>
      <div style="display:flex;gap:8px;margin-top:14px;justify-content:center;flex-wrap:wrap">
        <button class="btn primary" id="rp-print">🖨️ تصدير PDF</button>
        <button class="btn success" id="rp-excel">📊 تصدير Excel</button>
        <button class="btn soft" id="rp-wa">🟢 مشاركة</button>
      </div>`;
    $('#rp-print', box).onclick = () => printHTML(r.label, $('#rp', box).innerHTML);
    $('#rp-excel', box).onclick = () => { exportReport(data, r); };
    // الربط الديناميكي لتقرير الفترة
    const unit = $('#rp-unit', box);
    if (unit) unit.addEventListener('change', () => {
      $('#rp-period-out', box).innerHTML = periodTable(data, unit.value === 'day' ? 'day' : unit.value);
    });
    $('#rp-wa', box).onclick = () => {
      const text = reportText(data, r);
      openWhatsApp(store.settings().whatsapp, text);
    };
  }
  function fromLabel(data){ return data.from; }
  function toLabel(data){ return data.to; }
}

function daysAgo(n) { const d = new Date(); d.setDate(d.getDate()-n); return d.toISOString().slice(0,10); }

function compute({ from, to, cur, accId }) {
  const txs = store.transactions().filter(t => {
    if (!t.date) return false;
    if (from && t.date < from) return false;
    if (to && t.date > to) return false;
    if (cur && t.currency !== cur) return false;
    if (accId && !(t.accountId === accId || t.fromId === accId || t.toId === accId)) return false;
    return true;
  });
  const accounts = store.accounts(true);
  return { from, to, cur, accId, txs, accounts, settings: store.settings() };
}

function renderReport(d) {
  switch (currentTab()) {
    case 'summary': return rSummary(d);
    case 'detail': return rDetail(d);
    case 'categories': return rCategories(d);
    case 'period': return rPeriod(d);
    case 'account': return rAccount(d);
    case 'currency': return rCurrency(d);
    case 'pl': return rPL(d);
    case 'top-debt': return rTopDebt(d);
    case 'top-active': return rTopActive(d);
    case 'overdue': return rOverdue(d);
    default: return rSummary(d);
  }
}
function currentTab() {
  const el = document.querySelector('#r-tabs .tab.active');
  return el ? el.dataset.tab : 'summary';
}

function tableHead(...cols) { return `<table><thead><tr>${cols.map(c=>`<th>${c}</th>`).join('')}</tr></thead>`; }

function rSummary(d) {
  // ملخص حسب العملة: المستحق لنا / علينا / الصافي
  const perCur = {};
  for (const a of d.accounts) {
    const bal = accountBalance(a, d.txs);
    const c = a.currency;
    if (!perCur[c]) perCur[c] = { receivable: 0, payable: 0, net: 0 };
    if (bal > 0) perCur[c].receivable += bal;
    else perCur[c].payable += Math.abs(bal);
    perCur[c].net += bal;
  }
  let tRec=0,tPay=0,tNet=0;
  const rows = Object.entries(perCur).map(([code, x]) => {
    const c = store.currency(code);
    tRec+=x.receivable; tPay+=x.payable; tNet+=x.net;
    return `<tr><td>${esc(c.name)} (${esc(c.symbol)})</td><td style="text-align:left">${fmt(x.receivable)}</td><td style="text-align:left">${fmt(x.payable)}</td><td style="text-align:left"><b>${fmt(x.net)}</b></td></tr>`;
  }).join('');
  return `<div class="r-summary">
      <div class="rs"><div class="k">إجمالي المستحق لنا</div><div class="v">${fmt(tRec)}</div></div>
      <div class="rs"><div class="k">إجمالي المستحق علينا</div><div class="v">${fmt(tPay)}</div></div>
      <div class="rs"><div class="k">صافي الرصيد</div><div class="v">${fmt(tNet)}</div></div>
      <div class="rs"><div class="k">عدد العمليات</div><div class="v">${d.txs.length}</div></div>
    </div>${tableHead('العملة','مستحق لنا','مستحق علينا','الصافي')}<tbody>${rows||'<tr><td colspan="4">لا بيانات</td></tr>'}</tbody></table>`;
}

function rDetail(d) {
  const rows = d.txs.slice().sort((a,b)=>(a.date).localeCompare(b.date)).map(t => {
    const acc = store.getAccount(t.accountId);
    const op = OP_TYPES[t.type];
    return `<tr><td>${esc(t.date)}</td><td>${op.icon} ${op.label}</td><td>${acc?esc(acc.name):'تحويل'}</td><td>${esc(t.desc||'')}</td><td style="text-align:left">${fmt(t.amount)}</td><td>${esc(store.currency(t.currency).symbol)}</td><td>${esc(t.ref||'')}</td></tr>`;
  }).join('');
  return tableHead('التاريخ','النوع','الحساب','البيان','المبلغ','العملة','المرجع') + `<tbody>${rows||'<tr><td colspan="7">لا عمليات في هذه الفترة</td></tr>'}</tbody></table>`;
}

function rCategories(d) {
  // إجمالي التصنيفات والتفصيل
  const catData = {};
  for (const a of d.accounts) {
    const catId = a.categoryId || 'none';
    if (!catData[catId]) catData[catId] = { bal: 0, count: 0 };
    catData[catId].bal += accountBalance(a, d.txs);
    catData[catId].count += 1;
  }
  const catName = id => id === 'none' ? 'بدون تصنيف' : (store.get('categories', id)||{}).name || 'تصنيف';
  const rows = Object.entries(catData).map(([id, x]) => `<tr><td>${esc(catName(id))}</td><td>${x.count}</td><td style="text-align:left"><b>${fmt(x.bal)}</b></td></tr>`).join('');
  return tableHead('التصنيف','عدد الحسابات','إجمالي الرصيد') + `<tbody>${rows||'<tr><td colspan="3">لا بيانات</td></tr>'}</tbody></table>`;
}

function rPeriod(d) {
  // يومي / أسبوعي / شهري / سنوي — اختر وحدة
  const groupKey = { 'day':'يومي','week':'أسبوعي','month':'شهري','year':'سنوي' };
  const unitSel = `<select class="select" id="rp-unit" style="margin-bottom:10px">${Object.entries(groupKey).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select>`;
  // (يتم الحساب ديناميكياً)
  return unitSel + `<div id="rp-period-out">${periodTable(d, 'month')}</div>`;
}

function periodTable(d, unit) {
  const buckets = {};
  for (const t of d.txs) {
    let key;
    if (unit === 'day') key = t.date;
    else if (unit === 'week') { const dt = parseDate(t.date); const start = new Date(dt); start.setDate(dt.getDate() - dt.getDay()); key = start.toISOString().slice(0,10); }
    else if (unit === 'month') key = (t.date||'').slice(0,7);
    else key = (t.date||'').slice(0,4);
    if (!buckets[key]) buckets[key] = { inflow: 0, outflow: 0 };
    const g = (t.type === 'revenue' || t.type === 'in') ? 'inflow' : (t.type === 'expense' || t.type === 'out') ? 'outflow' : null;
    if (g === 'inflow') buckets[key].inflow += t.amount;
    if (g === 'outflow') buckets[key].outflow += t.amount;
  }
  const rows = Object.entries(buckets).sort().map(([k, x]) => `<tr><td>${esc(k)}</td><td style="text-align:left">${fmt(x.inflow)}</td><td style="text-align:left">${fmt(x.outflow)}</td><td style="text-align:left"><b>${fmt(x.inflow - x.outflow)}</b></td></tr>`).join('');
  return tableHead('الفترة','الإيرادات/القبض','المصروفات/الصرف','الصافي') + `<tbody>${rows||'<tr><td colspan="4">لا بيانات</td></tr>'}</tbody></table>`;
}

function rAccount(d) {
  // ملخص لكل حساب
  const rows = d.accounts.map(a => {
    const bal = accountBalance(a, d.txs);
    const n = d.txs.filter(t => t.accountId === a.id || t.fromId === a.id || t.toId === a.id).length;
    const kind = ACCOUNT_KINDS[a.kind];
    return `<tr><td>${kind.icon} ${esc(a.name)}</td><td>${kind.label}</td><td>${n}</td><td style="text-align:left">${fmt(bal)}</td><td>${esc(store.currency(a.currency).symbol)}</td></tr>`;
  }).join('');
  return tableHead('الحساب','النوع','عدد العمليات','الرصيد','العملة') + `<tbody>${rows||'<tr><td colspan="5">لا بيانات</td></tr>'}</tbody></table>`;
}

function rCurrency(d) {
  const perCur = {};
  for (const t of d.txs) {
    if (!perCur[t.currency]) perCur[t.currency] = { in: 0, out: 0, count: 0 };
    const g = (t.type === 'revenue' || t.type === 'in') ? 'in' : (t.type === 'expense' || t.type === 'out') ? 'out' : null;
    if (g) perCur[t.currency][g] += t.amount;
    perCur[t.currency].count++;
  }
  const rows = Object.entries(perCur).map(([code, x]) => {
    const c = store.currency(code);
    return `<tr><td>${esc(c.name)} (${esc(c.symbol)})</td><td>${x.count}</td><td style="text-align:left">${fmt(x.in)}</td><td style="text-align:left">${fmt(x.out)}</td><td style="text-align:left"><b>${fmt(x.in - x.out)}</b></td></tr>`;
  }).join('');
  return tableHead('العملة','العمليات','قبض/إيراد','صرف/مصروف','الصافي') + `<tbody>${rows||'<tr><td colspan="5">لا بيانات</td></tr>'}</tbody></table>`;
}

function rPL(d) {
  let revenue = 0, expense = 0, receivable = 0, payable = 0;
  for (const t of d.txs) {
    if (t.type === 'revenue' || t.type === 'in') revenue += t.amount;
    else if (t.type === 'expense' || t.type === 'out') expense += t.amount;
    else if (t.type === 'debit') receivable += t.amount;
    else if (t.type === 'credit') payable += t.amount;
  }
  const profit = revenue - expense;
  return `<div class="r-summary">
      <div class="rs"><div class="k">الإيرادات</div><div class="v" style="color:#15803d">${fmt(revenue)}</div></div>
      <div class="rs"><div class="k">المصروفات</div><div class="v" style="color:#dc2626">${fmt(expense)}</div></div>
      <div class="rs"><div class="k">صافي الربح/الخسارة</div><div class="v">${fmt(profit)}</div></div>
      <div class="rs"><div class="k">ذمم مدينة (له)</div><div class="v">${fmt(receivable)}</div></div>
      <div class="rs"><div class="k">ذمم دائنة (عليه)</div><div class="v">${fmt(payable)}</div></div>
    </div>
    ${tableHead('البند','المبلغ')}<tbody>
      <tr><td>إجمالي الإيرادات</td><td style="text-align:left">${fmt(revenue)}</td></tr>
      <tr><td>إجمالي المصروفات</td><td style="text-align:left">${fmt(expense)}</td></tr>
      <tr class="total-row"><td>صافي الأرباح / الخسائر</td><td style="text-align:left">${fmt(profit)}</td></tr>
    </tbody></table>`;
}

function rTopDebt(d) {
  const list = d.accounts.map(a => ({ a, bal: accountBalance(a, d.txs) })).filter(x => x.bal > 0).sort((x,y) => y.bal - x.bal).slice(0, 20);
  const rows = list.map((x,i) => `<tr><td>${i+1}</td><td>${ACCOUNT_KINDS[x.a.kind].icon} ${esc(x.a.name)}</td><td style="text-align:left">${fmt(x.bal)}</td><td>${esc(store.currency(x.a.currency).symbol)}</td></tr>`).join('');
  return tableHead('#','الحساب','المبلغ المستحق لنا','العملة') + `<tbody>${rows||'<tr><td colspan="4">لا ذمم مدينة</td></tr>'}</tbody></table>`;
}

function rTopActive(d) {
  const count = {};
  for (const t of d.txs) if (t.accountId) count[t.accountId] = (count[t.accountId]||0) + 1;
  const list = Object.entries(count).map(([id, n]) => ({ a: store.getAccount(id), n })).filter(x=>x.a).sort((x,y)=>y.n-x.n).slice(0,20);
  const rows = list.map((x,i) => `<tr><td>${i+1}</td><td>${ACCOUNT_KINDS[x.a.kind].icon} ${esc(x.a.name)}</td><td>${x.n}</td><td style="text-align:left">${fmt(accountBalance(x.a, d.txs))}</td></tr>`).join('');
  return tableHead('#','الحساب','عدد العمليات','الرصيد') + `<tbody>${rows||'<tr><td colspan="4">لا نشاط</td></tr>'}</tbody></table>`;
}

function rOverdue(d) {
  const today = todayISO();
  const rows = d.accounts.filter(a => a.dueDate && a.dueDate < today && !a.archived).map(a => {
    const bal = accountBalance(a, d.txs);
    return `<tr><td>${ACCOUNT_KINDS[a.kind].icon} ${esc(a.name)}</td><td style="text-align:left">${fmt(bal)}</td><td>${esc(store.currency(a.currency).symbol)}</td><td style="color:#dc2626">${esc(a.dueDate)} (متأخر)</td></tr>`;
  }).join('');
  return tableHead('الحساب','الرصيد','العملة','موعد الاستحقاق') + `<tbody>${rows||'<tr><td colspan="4">لا توجد عمليات متأخرة أو مستحقة</td></tr>'}</tbody></table>`;
}

function exportReport(d, r) {
  const rows = [];
  if (currentTab() === 'summary') {
    for (const a of d.accounts) { const bal = accountBalance(a, d.txs); rows.push([a.name, ACCOUNT_KINDS[a.kind].label, fmt(bal), a.currency]); }
    exportExcel(r.label, ['الحساب','النوع','الرصيد','العملة'], rows);
  } else if (currentTab() === 'detail') {
    rows.push(...d.txs.map(t => { const acc = store.getAccount(t.accountId); return [t.date, OP_TYPES[t.type].label, acc?acc.name:'تحويل', t.desc||'', t.amount, t.currency, t.ref||'']; }));
    exportExcel(r.label, ['التاريخ','النوع','الحساب','البيان','المبلغ','العملة','المرجع'], rows);
  } else if (currentTab() === 'top-debt') {
    d.accounts.map(a => accountBalance(a, d.txs)).forEach((bal,i)=>{ if(bal>0) rows.push([d.accounts[i].name, fmt(bal), d.accounts[i].currency]); });
    exportExcel(r.label, ['الحساب','المبلغ','العملة'], rows);
  } else {
    exportExcel(r.label, ['التاريخ','النوع','الحساب','البيان','المبلغ','العملة'], d.txs.map(t => { const acc=store.getAccount(t.accountId); return [t.date, OP_TYPES[t.type].label, acc?acc.name:'', t.desc||'', t.amount, t.currency]; }));
  }
  toast('تم تصدير التقرير ✅');
}

function reportText(d, r) {
  let s = `📈 ${r.label}\nالفترة: ${d.from} إلى ${d.to}\n${store.settings().businessName||''}\n`;
  if (currentTab() === 'summary') {
    for (const a of d.accounts) s += `\n• ${a.name}: ${fmt(accountBalance(a, d.txs))} ${a.currency}`;
  } else {
    for (const t of d.txs.slice(0, 30)) { const acc = store.getAccount(t.accountId); s += `\n• ${t.date} ${OP_TYPES[t.type].label} ${acc?acc.name:''}: ${fmt(t.amount)} ${t.currency}`; }
  }
  return s;
}
