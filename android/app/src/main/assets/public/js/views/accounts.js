// إدارة الحسابات — العملاء والموردين والحسابات العامة
import { $, $$, esc, fmt, uid, todayISO, parseDate, fmtDate, relTime, printHTML, exportExcel, openWhatsApp } from '../utils.js';
import { store } from '../store.js';
import { toast, toastErr, confirmDialog, openModal, field, readForm, money, numberToWords } from '../components.js';
import { accountBalance, ACCOUNT_KINDS, OP_TYPES, balanceLabels, txEffect, opEffect } from '../accounting.js';
import { go } from '../app.js';

export function render(container, params, state) {
  if (params.id) return renderDetail(container, params, state);
  return renderList(container, params, state);
}

// ============================ القائمة ============================
function renderList(container, params, state) {
  const settings = store.settings();
  const { oweUs, oweThem } = balanceLabels(settings);
  const accs = store.accounts(false); // كل الحسابات بما فيها المؤرشفة
  const cats = store.list('categories');
  const currs = store.getCurrencies();

  container.innerHTML = `
    <div class="view-head">
      <div>
        <div class="view-title">الحسابات 👥</div>
        <small>العملاء • الموردون • الحسابات العامة</small>
      </div>
      <div class="view-actions">
        <button class="btn ghost" data-act="trash">🗑️ المحذوفات</button>
        <button class="btn primary" data-act="new">＋ حساب جديد</button>
      </div>
    </div>
    <div class="toolbar">
      <div class="search-input"><input id="acc-q" placeholder="بحث سريع بالاسم أو الهاتف..."><span class="s-ic">🔍</span></div>
      <select class="select" id="acc-kind"><option value="">كل الأنواع</option>
        <option value="customer">عملاء</option><option value="supplier">موردون</option><option value="general">حسابات عامة</option></select>
      <select class="select" id="acc-cat"><option value="">كل التصنيفات</option>${cats.map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('')}</select>
      <select class="select" id="acc-cur"><option value="">كل العملات</option>${currs.map(c => `<option value="${esc(c.code)}">${esc(c.name)}</option>`).join('')}</select>
      <select class="select" id="acc-status"><option value="">الكل</option><option value="active">نشط</option><option value="archived">مؤرشف</option></select>
      <select class="select" id="acc-sort"><option value="name">الاسم</option><option value="balance">الرصيد</option><option value="recent">آخر عملية</option><option value="count">عدد العمليات</option></select>
    </div>
    <div id="acc-list"></div>
    <div class="empty" id="acc-empty" hidden><div class="e-ic">👥</div><h3>لا توجد حسابات مطابقة</h3></div>
  `;

  const listBox = $('#acc-list', container);
  const balances = store.allBalances(accs);
  const txCount = {};
  for (const t of store.transactions()) if (t.accountId) txCount[t.accountId] = (txCount[t.accountId] || 0) + 1;

  function applyFilters() {
    const q = $('#acc-q', container).value.trim().toLowerCase();
    const kind = $('#acc-kind', container).value;
    const cat = $('#acc-cat', container).value;
    const cur = $('#acc-cur', container).value;
    const status = $('#acc-status', container).value;
    const sort = $('#acc-sort', container).value;

    let list = accs.filter(a => {
      if (q && !(a.name + ' ' + (a.phone||'') + ' ' + (a.notes||'')).toLowerCase().includes(q)) return false;
      if (kind && a.kind !== kind) return false;
      if (cat && a.categoryId !== cat) return false;
      if (cur && a.currency !== cur) return false;
      if (status === 'active' && (a.archived || a.status === 'archived')) return false;
      if (status === 'archived' && !(a.archived || a.status === 'archived')) return false;
      return true;
    });
    if (sort === 'name') list.sort((a, b) => a.name.localeCompare(b.name, 'ar'));
    else if (sort === 'balance') list.sort((a, b) => balances[b.id] - balances[a.id]);
    else if (sort === 'count') list.sort((a, b) => (txCount[b.id]||0) - (txCount[a.id]||0));
    else list.sort((a, b) => (b.lastTxAt||'').localeCompare(a.lastTxAt||''));

    if (!list.length) { $('#acc-empty', container).hidden = false; listBox.innerHTML = ''; return; }
    $('#acc-empty', container).hidden = true;

    listBox.innerHTML = `<div class="account-grid">${list.map(a => cardHTML(a, balances[a.id], txCount[a.id]||0, oweUs, oweThem, settings, state)).join('')}</div>`;

    $$('[data-open-acc]', listBox).forEach(el => el.onclick = () => go('accounts', { id: el.dataset.openAcc }));
    $$('[data-chat-acc]', listBox).forEach(el => el.onclick = (e) => { e.stopPropagation(); chatAccount(el.dataset.chatAcc); });
    $$('[data-wa-acc]', listBox).forEach(el => el.onclick = (e) => { e.stopPropagation(); const a = store.getAccount(el.dataset.waAcc); openWhatsApp(a.whatsapp || a.phone, `مرحباً ${a.name}، نود التواصل معكم بخصوص حسابكم.`); });
    $$('[data-tx-acc]', listBox).forEach(el => el.onclick = (e) => { e.stopPropagation(); go('transactions', { new: 1, accountId: el.dataset.txAcc }); });
    $$('[data-edit-acc]', listBox).forEach(el => el.onclick = (e) => { e.stopPropagation(); go('accounts', { new: 1, id: el.dataset.editAcc }); });
  }

  ['acc-q','acc-kind','acc-cat','acc-cur','acc-status','acc-sort'].forEach(id => {
    const el = $('#' + id, container);
    if (id === 'acc-q') el.addEventListener('input', applyFilters);
    else el.addEventListener('change', applyFilters);
  });

  container.addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]');
    if (act && act.dataset.act === 'new') openAccountForm(null, () => applyFilters());
    if (act && act.dataset.act === 'trash') openTrash();
    const aDel = e.target.closest('[data-del-acc]');
    if (aDel) { e.stopPropagation(); archiveAccount(aDel.dataset.delAcc); }
  });

  applyFilters();
  if (params.new) openAccountForm(null, () => applyFilters());
}

function cardHTML(a, bal, n, oweUs, oweThem, settings, state) {
  const kind = ACCOUNT_KINDS[a.kind];
  const nature = bal >= 0 ? 'positive' : 'negative';
  const label = bal >= 0 ? oweUs : oweThem;
  const archived = a.archived || a.status === 'archived';
  return `
    <div class="account-card" data-open-acc="${a.id}" style="${archived ? 'opacity:.6' : ''}">
      <div class="ac-type pill ${kind.color}">${kind.icon} ${kind.label} ${archived ? '· مؤرشف' : ''}</div>
      <div class="ac-name">${a.avatar ? `<img src="${a.avatar}" style="width:26px;height:26px;border-radius:50%;object-fit:cover">` : ''} ${esc(a.name)}</div>
      ${a.phone ? `<div class="ac-phone">📞 ${esc(a.phone)}</div>` : ''}
      <div class="ac-balance">
        <div>
          <div class="b-label">الرصيد (${nature === 'positive' ? oweUs : oweThem})</div>
          <div class="b-val amount-display ${state.hideBalance ? 'hide' : ''}">${fmt(bal)} <span style="font-size:12px">${esc(store.currency(a.currency).symbol)}</span></div>
        </div>
        <span class="pill ${nature === 'positive' ? 'red' : 'green'}">${nature === 'positive' ? '▲ ' + oweUs : '▼ ' + oweThem}</span>
      </div>
      <div class="ac-meta">
        <span>💸 ${n} عملية</span>
        ${a.categoryId ? `<span class="sep">•</span><span class="tag">${esc((store.get('categories', a.categoryId)||{}).name || '')}</span>` : ''}
        <span class="sep">•</span><span class="currency-badge">${esc(store.currency(a.currency).symbol)}</span>
      </div>
      <div class="ac-foot">
        <div class="ac-ops">
          <button class="icon-btn" style="width:34px;height:34px" data-tx-acc="${a.id}" title="إضافة عملية">＋</button>
          <button class="icon-btn" style="width:34px;height:34px" data-chat-acc="${a.id}" title="مراسلة">💬</button>
          <button class="icon-btn" style="width:34px;height:34px" data-wa-acc="${a.id}" title="واتساب">🟢</button>
          <button class="icon-btn" style="width:34px;height:34px" data-edit-acc="${a.id}" title="تعديل">✏️</button>
        </div>
        <button class="icon-btn" style="width:34px;height:34px;color:var(--danger)" data-del-acc="${a.id}" title="أرشفة">🗑️</button>
      </div>
    </div>`;
}

async function archiveAccount(id) {
  const ok = await confirmDialog({ title: 'أرشفة الحساب', message: 'سيُنقل الحساب إلى المحذوفات (أرشيف). يمكنك استعادته لاحقاً.', confirmText: 'أرشفة', danger: true });
  if (!ok) return;
  const a = store.getAccount(id);
  a.archived = true; a.status = 'archived';
  await store.saveAccount(a);
  toast('تم نقل الحساب إلى المحذوفات');
  go('accounts');
}

function chatAccount(id) {
  go('chat', { accountId: id });
}

// ============================ المحذوفات ============================
function openTrash() {
  const archived = store.accounts(false).filter(a => a.archived || a.status === 'archived');
  const m = openModal({
    title: '🗑️ المحذوفات (الأرشيف)',
    cls: 'lg',
    body: archived.length ? archived.map(a => `
      <div class="settings-row">
        <span>${ACCOUNT_KINDS[a.kind].icon} <b>${esc(a.name)}</b></span>
        <span>
          <button class="btn sm soft" data-restore="${a.id}">↩️ استعادة</button>
          <button class="btn sm danger" data-forever="${a.id}">حذف نهائي</button>
        </span>
      </div>`).join('') : '<div class="empty"><div class="e-ic">🗑️</div><h3>المحذوفات فارغة</h3></div>',
  });
  $$('[data-restore]', m.overlay).forEach(b => b.onclick = async () => {
    const a = store.getAccount(b.dataset.restore);
    a.archived = false; a.status = 'active';
    await store.saveAccount(a);
    toast('تمت استعادة الحساب');
    m.close(); go('accounts');
  });
  $$('[data-forever]', m.overlay).forEach(b => b.onclick = async () => {
    const ok = await confirmDialog({ title: 'حذف نهائي', message: 'سيتم حذف الحساب نهائياً مع كل عملياته. لا يمكن التراجع!', danger: true });
    if (!ok) return;
    const id = b.dataset.forever;
    for (const t of store.filter('transactions', x => x.accountId === id || x.fromId === id || x.toId === id)) {
      await store.deleteTransaction(t.id, { silent: true });
    }
    await store.remove('accounts', id);
    toast('تم حذف الحساب نهائياً');
    m.close(); go('accounts');
  });
}

// ============================ نموذج إضافة/تعديل ============================
export function openAccountForm(existing, cb) {
  const acc = existing || {};
  const m = openModal({
    title: acc.id ? '✏️ تعديل حساب' : '➕ إضافة حساب',
    cls: 'lg',
    body: `
      <form id="acc-form">
        <div class="field-row">
          ${field({ type: 'text', name: 'name', label: 'اسم الحساب', value: acc.name || '', required: true })}
          ${field({ type: 'select', name: 'kind', label: 'النوع', value: acc.kind || 'customer', options: [
            { value: 'customer', label: 'عميل 👤' }, { value: 'supplier', label: 'مورد 🏭' }, { value: 'general', label: 'حساب عام 🏦' }] })}
        </div>
        <div class="field-row">
          ${field({ type: 'money', name: 'openingBalance', label: 'الرصيد الافتتاحي', value: acc.openingBalance ?? '' })}
          ${field({ type: 'select', name: 'openingNature', label: 'الطبيعة', value: acc.openingBalance >= 0 ? 'debit' : 'credit', options: [
            { value: 'debit', label: 'له / مدين' }, { value: 'credit', label: 'عليه / دائن' }] })}
        </div>
        <div class="field-row">
          ${field({ type: 'select', name: 'currency', label: 'العملة', value: acc.currency || store.settings().defaultCurrency || 'YER', options: store.getCurrencies().map(c => ({ value: c.code, label: c.name })) })}
          ${field({ type: 'select', name: 'categoryId', label: 'التصنيف', value: acc.categoryId || '', options: [{ value: '', label: 'بدون' }, ...store.list('categories').map(c => ({ value: c.id, label: c.name }))] })}
        </div>
        <div class="field-row">
          ${field({ type: 'tel', name: 'phone', label: 'الهاتف', value: acc.phone || '' })}
          ${field({ type: 'tel', name: 'whatsapp', label: 'واتساب', value: acc.whatsapp || '' })}
        </div>
        ${field({ type: 'textarea', name: 'notes', label: 'ملاحظات / تفاصيل', value: acc.notes || '' })}
        <div class="field-row">
          ${field({ type: 'money', name: 'creditLimit', label: 'حد ائتماني', value: acc.creditLimit ?? '' })}
          ${field({ type: 'select', name: 'status', label: 'الحالة', value: acc.archived || acc.status === 'archived' ? 'archived' : 'active', options: [{ value: 'active', label: 'نشط' }, { value: 'archived', label: 'مؤرشف' }] })}
        </div>
        ${field({ type: 'text', name: 'tags', label: 'علامات Tags', value: (acc.tags || []).join(', ') })}
      </form>`,
    foot: `<button class="btn ghost" data-close>إلغاء</button><button class="btn primary" id="acc-save">💾 حفظ</button>`,
  });
  $('#acc-save', m.overlay).onclick = async () => {
    const d = readForm('#acc-form', m.overlay);
    if (!d.name) { toastErr('أدخل اسم الحساب'); return; }
    const obj = {
      id: acc.id || uid('acc'),
      name: d.name.trim(),
      kind: d.kind,
      openingBalance: Number(d.openingBalance || 0) * (d.openingNature === 'credit' ? -1 : 1),
      currency: d.currency,
      categoryId: d.categoryId,
      phone: d.phone,
      whatsapp: d.whatsapp,
      notes: d.notes,
      creditLimit: d.creditLimit === '' ? null : Number(d.creditLimit),
      tags: d.tags.split(',').map(t => t.trim()).filter(Boolean),
      archived: d.status === 'archived',
      status: d.status,
      createdAt: acc.createdAt || new Date().toISOString(),
    };
    await store.saveAccount(obj);
    toast(acc.id ? 'تم تحديث الحساب ✅' : 'تم إضافة الحساب ✅');
    m.close();
    if (cb) cb();
    else go('accounts', acc.id ? { id: acc.id } : {});
  };
}

// ============================ صفحة التفاصيل وكشف الحساب ============================
function renderDetail(container, params, state) {
  const acc = store.getAccount(params.id);
  const settings = store.settings();
  const { oweUs, oweThem } = balanceLabels(settings);
  if (!acc) { container.innerHTML = '<div class="empty"><div class="e-ic">❓</div><h3>الحساب غير موجود</h3><button class="btn primary" data-back>العودة</button></div>';
    container.addEventListener('click', (e) => { if (e.target.closest('[data-back]')) go('accounts'); }); return; }

  const kind = ACCOUNT_KINDS[acc.kind];
  const txs = store.filter('transactions', t => t.accountId === acc.id || t.fromId === acc.id || t.toId === acc.id)
    .sort((a, b) => (b.date + ' ' + b.time).localeCompare(a.date + ' ' + a.time));
  const bal = accountBalance(acc, store.transactions());
  let totalFor = 0, totalAgainst = 0;
  for (const t of txs) {
    const e = txEffect(t, acc.id);
    if (e > 0) totalFor += e; else if (e < 0) totalAgainst += Math.abs(e);
  }
  const nature = bal >= 0 ? 'positive' : 'negative';

  container.innerHTML = `
    <button class="btn ghost sm" data-back style="margin-bottom:12px">→ رجوع للقائمة</button>
    <div class="grid grid-2" style="margin-bottom:16px;grid-template-columns:1.4fr 1fr">
      <div class="card">
        <div style="display:flex;gap:16px;align-items:flex-start">
          ${acc.avatar ? `<img src="${acc.avatar}" style="width:72px;height:72px;border-radius:16px;object-fit:cover">` : `<div style="width:72px;height:72px;border-radius:16px;background:var(--primary-soft);color:var(--primary);display:flex;align-items:center;justify-content:center;font-size:30px">${kind.icon}</div>`}
          <div style="flex:1">
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
              <h2 style="font-size:22px">${esc(acc.name)}</h2>
              <span class="pill ${kind.color}">${kind.label}</span>
              ${acc.archived ? '<span class="pill gray">مؤرشف</span>' : ''}
            </div>
            ${acc.phone ? `<div class="muted" style="margin-top:3px">📞 ${esc(acc.phone)}</div>` : ''}
            ${acc.whatsapp ? `<div class="muted">🟢 واتساب: ${esc(acc.whatsapp)}</div>` : ''}
            ${acc.notes ? `<div class="muted">📝 ${esc(acc.notes)}</div>` : ''}
            ${(acc.tags||[]).length ? `<div style="margin-top:6px">${acc.tags.map(t => `<span class="tag">${esc(t)}</span>`).join('')}</div>` : ''}
          </div>
        </div>
        <div class="divider"></div>
        <div class="totals-row">
          <div class="stat-card card tone-teal" style="padding:14px;flex:1">
            <div class="label">إجمالي له (مستحق لك)</div>
            <div class="value amount-display ${state.hideBalance?'hide':''}" style="color:var(--green)">${fmt(totalFor)} <span style="font-size:13px">${esc(store.currency(acc.currency).symbol)}</span></div>
          </div>
          <div class="stat-card card tone-danger" style="padding:14px;flex:1">
            <div class="label">إجمالي عليه (مستحق منك)</div>
            <div class="value amount-display ${state.hideBalance?'hide':''}" style="color:var(--danger)">${fmt(totalAgainst)} <span style="font-size:13px">${esc(store.currency(acc.currency).symbol)}</span></div>
          </div>
        </div>
      </div>
      <div class="card" style="display:flex;flex-direction:column;justify-content:center">
        <div class="label muted">الرصيد الحالي</div>
        <div style="font-size:36px;font-weight:800" class="amount-display ${state.hideBalance?'hide':''}">${fmt(bal)} <span style="font-size:16px">${esc(store.currency(acc.currency).symbol)}</span></div>
        <div style="margin:6px 0 14px"><span class="pill ${nature==='positive'?'red':'green'}">${nature==='positive' ? '▲ ' + oweUs : '▼ ' + oweThem}</span>
        <span class="muted"> · ${txs.length} عملية</span></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn primary sm" data-add-tx>＋ عملية</button>
          <button class="btn soft sm" data-chat>💬 مراسلة</button>
          <button class="btn success sm" data-wa>🟢 واتساب</button>
          <button class="btn ghost sm" data-print>🖨️ كشف PDF</button>
          <button class="btn ghost sm" data-excel>📊 Excel</button>
          <button class="btn ghost sm" data-edit>✏️ تعديل</button>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="toolbar" style="margin-bottom:0;border:none;padding:0">
        <div class="search-input"><input id="st-q" placeholder="بحث داخل العمليات..."><span class="s-ic">🔍</span></div>
        <input type="date" class="select" id="st-from" value="${txs.length ? txs[txs.length-1].date : ''}">
        <input type="date" class="select" id="st-to" value="${todayISO()}">
        <select class="select" id="st-type"><option value="">كل الأنواع</option>${Object.entries(OP_TYPES).map(([k,v]) => `<option value="${k}">${v.icon} ${v.label}</option>`).join('')}</select>
      </div>
      <div class="table-wrap"><table class="tbl" id="st-table"></table></div>
      <div class="empty" id="st-empty" hidden><div class="e-ic">📄</div><h3>لا توجد عمليات في هذه الفترة</h3></div>
    </div>
  `;

  function renderStatement() {
    const q = $('#st-q', container).value.trim().toLowerCase();
    const from = $('#st-from', container).value;
    const to = $('#st-to', container).value;
    const type = $('#st-type', container).value;
    let list = txs.filter(t => {
      if (q && !(t.desc + ' ' + (t.ref||'')).toLowerCase().includes(q)) return false;
      if (from && t.date < from) return false;
      if (to && t.date > to) return false;
      if (type && t.type !== type) return false;
      return true;
    });
    const tbl = $('#st-table', container);
    if (!list.length) { $('#st-empty', container).hidden = false; tbl.innerHTML = ''; return; }
    $('#st-empty', container).hidden = true;
    let running = acc.openingBalance || 0;
    // الرصيد الجاري يُحسب من بداية كل العمليات
    const allDates = [...txs].sort((a,b)=>(a.date+' '+a.time).localeCompare(b.date+' '+b.time));
    const runningBefore = {}; runningBefore['start'] = acc.openingBalance || 0;
    tbl.innerHTML = `<thead><tr><th>#</th><th>التاريخ</th><th>نوع العملية</th><th>البيان</th><th>المبلغ</th><th>الرصيد الجاري</th></tr></thead><tbody>${list.map((t,i) => {
      const op = OP_TYPES[t.type];
      const e = txEffect(t, acc.id);
      return `<tr class="row-click" data-open-tx="${t.id}">
        <td>${esc(t.ref || '—')}</td>
        <td style="white-space:nowrap">${esc(t.date)}</td>
        <td><span class="pill ${op.cls}">${op.icon} ${op.label}</span></td>
        <td>${esc(t.desc || '')}</td>
        <td class="amount ${e>0?'up':'down'}">${e>0?'+':''}${fmt(Math.abs(t.amount))}</td>
        <td class="amount-display ${state.hideBalance?'hide':''}">${fmt(currentRunning(t))}</td>
      </tr>`;
    }).join('')}</tbody>`;
    function currentRunning(t) {
      let run = acc.openingBalance || 0;
      for (const x of allDates) {
        const e = txEffect(x, acc.id);
        if (e !== null) run += e;
        if (x.id === t.id) break;
      }
      return run;
    }
  }

  ['st-q','st-from','st-to','st-type'].forEach(id => {
    const el = $('#' + id, container);
    const ev = id === 'st-q' ? 'input' : 'change';
    el.addEventListener(ev, renderStatement);
  });
  renderStatement();

  container.addEventListener('click', (e) => {
    const el = e.target.closest('[data-open-tx]');
    if (el) { go('transactions', { id: el.dataset.openTx }); return; }
    if (e.target.closest('[data-back]')) { go('accounts'); return; }
    if (e.target.closest('[data-add-tx]')) { go('transactions', { new: 1, accountId: acc.id }); return; }
    if (e.target.closest('[data-chat]')) { go('chat', { accountId: acc.id }); return; }
    if (e.target.closest('[data-wa]')) { openWhatsApp(acc.whatsapp || acc.phone, `مرحباً ${acc.name}، نود إخباركم بخصوص حسابكم لدينا. الرصيد الحالي: ${fmt(bal)} ${store.currency(acc.currency).symbol}`); return; }
    if (e.target.closest('[data-edit]')) { openAccountForm(acc, () => go('accounts', { id: acc.id })); return; }
    if (e.target.closest('[data-print]')) { exportStatementPdf(acc, txs); return; }
    if (e.target.closest('[data-excel]')) { exportStatementExcel(acc, txs); return; }
  });
}

export function exportStatementPdf(acc, txs) {
  const rows = txs.map(t => {
    const op = OP_TYPES[t.type];
    const e = txEffect(t, acc.id);
    return `<tr><td>${esc(t.date)}</td><td>${op.icon} ${op.label}</td><td>${esc(t.desc||'')}</td><td style="text-align:left">${e>0?'+':''}${fmt(Math.abs(t.amount))}</td></tr>`;
  }).join('');
  const bal = accountBalance(acc, store.transactions());
  printHTML('كشف حساب — ' + acc.name, `
    <div class="meta">الحساب: <b>${esc(acc.name)}</b> — النوع: ${ACCOUNT_KINDS[acc.kind].label} — العملة: ${esc(store.currency(acc.currency).name)}</div>
    <table><thead><tr><th>التاريخ</th><th>النوع</th><th>البيان</th><th>المبلغ</th></tr></thead><tbody>
    ${rows}
    <tr class="tot"><td colspan="3">الرصيد الحالي</td><td style="text-align:left">${fmt(bal)} ${esc(store.currency(acc.currency).symbol)}</td></tr>
    </tbody></table>`);
}
export function exportStatementExcel(acc, txs) {
  exportExcel('كشف حساب - ' + acc.name,
    ['التاريخ','النوع','البيان','المبلغ','العملة'],
    txs.map(t => [t.date, OP_TYPES[t.type].label, t.desc || '', Math.abs(t.amount), store.currency(t.currency).symbol]));
  toast('تم تصدير كشف الحساب Excel ✅');
}
