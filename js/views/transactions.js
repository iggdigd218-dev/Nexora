// العمليات المالية — إدخال سريع، أرصدة تلقائية، تسويات، تحويلات
import { $, $$, esc, fmt, uid, todayISO, nowTime, parseDate, fmtDate, fmtDateTime, relTime, printHTML, exportExcel, exportCSV, openWhatsApp } from '../utils.js';
import { store } from '../store.js';
import { toast, toastErr, confirmDialog, openModal, field, readForm, handleAttachment, numberToWords } from '../components.js';
import { accountBalance, ACCOUNT_KINDS, OP_TYPES, balanceLabels, txEffect, opEffect } from '../accounting.js';
import { go } from '../app.js';

export function render(container, params, state) {
  if (params.id) return renderDetail(container, params, state);
  return renderList(container, params, state);
}

function renderList(container, params, state) {
  const settings = store.settings();
  const txs = store.transactions();

  container.innerHTML = `
    <div class="view-head">
      <div>
        <div class="view-title">العمليات المالية 💸</div>
        <small>سجل كامل لكل المعاملات مع تحديث فوري للأرصدة</small>
      </div>
      <div class="view-actions">
        <button class="btn ghost" data-act="export">📤 تصدير</button>
        <button class="btn primary" data-act="new">＋ عملية جديدة</button>
      </div>
    </div>
    <div class="toolbar">
      <div class="search-input"><input id="tx-q" placeholder="بحث بالبيان، المرجع، الحساب..."><span class="s-ic">🔍</span></div>
      <select class="select" id="tx-type"><option value="">كل الأنواع</option>${Object.entries(OP_TYPES).map(([k,v]) => `<option value="${k}">${v.icon} ${v.label}</option>`).join('')}</select>
      <select class="select" id="tx-acc"><option value="">كل الحسابات</option>${store.accounts(true).map(a => `<option value="${a.id}">${ACCOUNT_KINDS[a.kind].icon} ${esc(a.name)}</option>`).join('')}</select>
      <select class="select" id="tx-cur"><option value="">كل العملات</option>${store.getCurrencies().map(c => `<option value="${c.code}">${esc(c.name)}</option>`).join('')}</select>
      <input type="date" class="select" id="tx-from">
      <input type="date" class="select" id="tx-to">
      <select class="select" id="tx-sort"><option value="date">الأحدث أولاً</option><option value="amount">الأكبر مبلغاً</option><option value="account">بالحساب</option></select>
    </div>
    <div id="tx-list"></div>
    <div class="empty" id="tx-empty" hidden><div class="e-ic">💸</div><h3>لا توجد عمليات مطابقة</h3></div>
  `;

  function apply() {
    const q = $('#tx-q', container).value.trim().toLowerCase();
    const type = $('#tx-type', container).value;
    const acc = $('#tx-acc', container).value;
    const cur = $('#tx-cur', container).value;
    const from = $('#tx-from', container).value;
    const to = $('#tx-to', container).value;
    const sort = $('#tx-sort', container).value;
    let list = txs.filter(t => {
      const accName = t.accountId ? (store.getAccount(t.accountId)||{}).name || '' : (t.type === 'transfer' ? 'تحويل' : '');
      if (q && !(t.desc + ' ' + (t.ref||'') + ' ' + accName).toLowerCase().includes(q)) return false;
      if (type && t.type !== type) return false;
      if (acc && !(t.accountId === acc || t.fromId === acc || t.toId === acc)) return false;
      if (cur && t.currency !== cur) return false;
      if (from && t.date < from) return false;
      if (to && t.date > to) return false;
      return true;
    });
    if (sort === 'amount') list.sort((a,b) => b.amount - a.amount);
    else if (sort === 'account') list.sort((a,b) => (store.getAccount(a.accountId)||{}).name?.localeCompare((store.getAccount(b.accountId)||{}).name||'', 'ar'));
    else list.sort((a,b) => (b.date+' '+b.time).localeCompare(a.date+' '+a.time));

    const box = $('#tx-list', container);
    if (!list.length) { $('#tx-empty', container).hidden = false; box.innerHTML=''; return; }
    $('#tx-empty', container).hidden = true;
    const balances = {};
    box.innerHTML = `<div class="table-wrap"><table class="tbl"><thead><tr>
      <th>التاريخ</th><th>النوع</th><th>الحساب</th><th>البيان</th><th>المبلغ</th><th>المرجع</th><th></th></tr></thead><tbody>
      ${list.map(t => txRow(t)).join('')}
    </tbody></table></div>`;
    $$('[data-open-tx]', box).forEach(el => el.onclick = () => go('transactions', { id: el.dataset.openTx }));
    $$('[data-del-tx]', box).forEach(el => el.onclick = (e) => { e.stopPropagation(); delTx(el.dataset.delTx); });
    $$('[data-dup-tx]', box).forEach(el => el.onclick = (e) => { e.stopPropagation(); dupTx(el.dataset.dupTx); });
  }

  function txRow(t) {
    const op = OP_TYPES[t.type];
    const acc = store.getAccount(t.accountId);
    let accName = '', accKind = '';
    if (t.type === 'transfer') { accName = 'تحويل بين حسابات'; }
    else { accName = acc ? acc.name : '—'; accKind = acc ? ACCOUNT_KINDS[acc.kind].label : ''; }
    return `<tr class="row-click" data-open-tx="${t.id}">
      <td style="white-space:nowrap">${esc(t.date)} <span class="muted" style="font-size:11px">${esc(t.time||'')}</span></td>
      <td><span class="pill ${op.cls}">${op.icon} ${op.label}</span></td>
      <td><b>${esc(accName)}</b>${accKind ? `<div class="muted" style="font-size:11px">${esc(accKind)}</div>` : ''}</td>
      <td>${esc(t.desc || '—')}${t.tags && t.tags.length ? `<div>${t.tags.map(x=>`<span class="tag">${esc(x)}</span>`).join('')}</div>`:''}</td>
      <td class="amount ${t.type==='expense'||t.type==='out'?'down':'up'}">${fmt(t.amount)} ${esc(store.currency(t.currency).symbol)}</td>
      <td class="muted">${esc(t.ref || '—')}</td>
      <td style="white-space:nowrap">
        <button class="icon-btn" style="width:30px;height:30px" data-dup-tx="${t.id}" title="تكرار العملية">🔁</button>
        <button class="icon-btn" style="width:30px;height:30px;color:var(--danger)" data-del-tx="${t.id}" title="حذف">🗑️</button>
      </td></tr>`;
  }

  ['tx-q','tx-type','tx-acc','tx-cur','tx-from','tx-to','tx-sort'].forEach(id => {
    const el = $('#' + id, container);
    el.addEventListener(id === 'tx-q' ? 'input' : 'change', apply);
  });
  container.addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]');
    if (act && act.dataset.act === 'new') openTxForm(null, params.accountId || null);
    if (act && act.dataset.act === 'export') exportTxs(txs, apply);
  });
  apply();
  if (params.new) openTxForm(null, params.accountId || null);
}

function exportTxs(txs) {
  exportExcel('العمليات المالية', ['التاريخ','الوقت','النوع','الحساب','البيان','المبلغ','العملة','المرجع'],
    txs.map(t => {
      const acc = store.getAccount(t.accountId);
      return [t.date, t.time, OP_TYPES[t.type].label, acc ? acc.name : 'تحويل', t.desc||'', t.amount, store.currency(t.currency).symbol, t.ref||''];
    }));
  toast('تم تصدير العمليات ✅');
}

async function delTx(id) {
  const ok = await confirmDialog({ title: 'حذف عملية', message: 'سيتم حذف العملية وسيُحدَّث رصيد الحساب تلقائياً. هل تريد المتابعة؟', danger: true });
  if (!ok) return;
  const t = store.get('transactions', id);
  await store.remove('transactions', id);
  await store.create('trash', { ...t, trashAt: new Date().toISOString() }, { noActivity: true });
  toast('تم حذف العملية وتحديث الرصيد');
  go('transactions');
}

function dupTx(id) {
  const t = store.get('transactions', id);
  if (!t) return;
  const copy = { ...t, id: undefined, createdAt: undefined, ref: (t.ref || '') + ' (نسخة)' };
  openTxForm(copy, null, true);
}

// ============================ نموذج العملية ============================
export function openTxForm(existing, presetAccountId, isCopy) {
  const t = existing || {};
  const settings = store.settings();
  const isTransfer = t.type === 'transfer' || (!existing && !presetAccountId ? false : false);
  const accs = store.accounts(true);
  const defaultAccId = presetAccountId || t.accountId || (accs[0] ? accs[0].id : '');
  const defaultAcc = store.getAccount(defaultAccId) || accs[0] || {};
  const defaultCur = defaultAcc.currency || settings.defaultCurrency;

  const m = openModal({
    title: isCopy ? '🔁 تكرار عملية' : (t.id ? '✏️ تعديل عملية' : '＋ عملية مالية جديدة'),
    cls: 'lg',
    body: `
      <form id="tx-form">
        <div class="field-row">
          ${field({ type: 'select', name: 'accountId', label: 'الحساب', value: t.accountId || defaultAccId || '', options: accs.map(a => ({ value: a.id, label: ACCOUNT_KINDS[a.kind].icon + ' ' + a.name + ' — ' + esc(store.currency(a.currency).symbol) })) })}
          ${field({ type: 'select', name: 'type', label: 'نوع العملية', value: t.type || 'in', options: Object.entries(OP_TYPES).map(([k,v]) => ({ value: k, label: v.icon + ' ' + v.label })) })}
        </div>
        <div id="tx-type-hint"></div>
        <div id="tx-transfer-box" class="hidden"></div>
        <div class="field-row">
          <div class="field">
            <label>المبلغ *</label>
            <div style="display:flex;gap:6px">
              <input type="number" id="tx-amount" name="amount" step="any" value="${t.amount ?? ''}" placeholder="0.00" style="flex:1;padding:12px;border-radius:12px;border:1.5px solid var(--border);background:var(--surface2)">
              <select id="tx-currency" name="currency" class="select" style="width:110px">
                ${store.getCurrencies().map(c => `<option value="${c.code}" ${c.code===defaultCur?'selected':''}>${esc(c.symbol)}</option>`).join('')}
              </select>
            </div>
          </div>
          <div class="field">
            <label>سعر الصرف (إلى عملة الحساب إن اختلفت)</label>
            <input type="number" id="tx-rate" name="rate" step="any" value="${t.rate ?? 1}" style="padding:12px;border-radius:12px;border:1.5px solid var(--border);background:var(--surface2);width:100%">
          </div>
        </div>
        <div class="field-row">
          ${field({ type: 'date', name: 'date', label: 'التاريخ', value: t.date || todayISO() })}
          ${field({ type: 'time', name: 'time', label: 'الوقت', value: t.time || nowTime() })}
        </div>
        ${field({ type: 'textarea', name: 'desc', label: 'البيان / الوصف', value: t.desc || '' })}
        <div class="field-row">
          ${field({ type: 'text', name: 'ref', label: 'رقم مرجعي', value: t.ref || '' })}
          ${field({ type: 'text', name: 'tags', label: 'علامات', value: (t.tags||[]).join(', ') })}
        </div>
        ${field({ type: 'select', name: 'status', label: 'حالة العملية', value: t.status || 'completed', options: [{value:'completed',label:'مكتملة'},{value:'pending',label:'معلقة'},{value:'cancelled',label:'ملغاة'}] })}
        <div class="field"><label>مرفقات / صور فواتير</label><input type="file" id="tx-att" multiple accept="image/*,.pdf"></div>
        <div id="tx-att-preview"></div>
      </form>`,
    foot: `<button class="btn ghost" data-close>إلغاء</button><button class="btn primary" id="tx-save">💾 حفظ</button>`,
  });

  // آلة حاسبة سريعة
  const amountBox = $('#tx-amount', m.overlay);
  const calcHint = document.createElement('div');
  calcHint.style.cssText = 'font-size:12px;color:var(--text3);margin-top:4px;cursor:pointer';
  calcHint.textContent = '🧮 آلة حاسبة سريعة';
  amountBox.parentElement.appendChild(calcHint);
  calcHint.onclick = () => openQuickCalc(amountBox);

  function refreshTypeHint() {
    const type = $('#f-type', m.overlay).value;
    const accId = $('#f-accountId', m.overlay).value;
    const acc = store.getAccount(accId);
    const hint = $('#tx-type-hint', m.overlay);
    const transferBox = $('#tx-transfer-box', m.overlay);
    if (type === 'transfer') {
      transferBox.classList.remove('hidden');
      const others = store.accounts(true).filter(a => a.id !== accId);
      transferBox.innerHTML = `<div class="field"><label>تحويل إلى حساب</label>
        <select id="tx-to-account" class="select" style="width:100%;padding:12px">
          ${others.map(a => `<option value="${a.id}">${ACCOUNT_KINDS[a.kind].icon} ${esc(a.name)} (${esc(store.currency(a.currency).symbol)})</option>`).join('')}
        </select>
        <div class="hint">سيُخصم المبلغ من الحساب الأول ويُضاف للثاني (يُراعى سعر الصرف).</div></div>`;
      hint.innerHTML = '';
    } else {
      transferBox.classList.add('hidden');
      const eff = opEffect(type, acc ? acc.kind : 'general');
      const dir = eff > 0 ? 'زيادة الرصيد (+)' : eff < 0 ? 'نقصان الرصيد (−)' : 'حسب التسوية';
      hint.innerHTML = `<div class="hint" style="margin:2px 0 10px">الأثر المتوقع على رصيد «${esc(acc ? acc.name : '')}»: <b>${dir}</b></div>`;
    }
  }
  $('#f-type', m.overlay).addEventListener('change', refreshTypeHint);
  $('#f-accountId', m.overlay).addEventListener('change', () => {
    const acc = store.getAccount($('#f-accountId', m.overlay).value);
    if (acc) $('#tx-currency', m.overlay).value = acc.currency;
    refreshTypeHint();
  });
  refreshTypeHint();

  const attInput = $('#tx-att', m.overlay);
  const preview = $('#tx-att-preview', m.overlay);
  let attachments = (t.attachments || []).slice();
  (t.attachments || []).forEach(a => showAtt(a));
  attInput.addEventListener('change', async () => {
    for (const f of attInput.files) {
      const data = await handleAttachment(f, true);
      showAtt(data);
      attachments.push(data);
    }
  });
  function showAtt(data) {
    preview.innerHTML += `<span style="display:inline-block;margin:4px;position:relative"><img src="${data}" style="width:52px;height:52px;object-fit:cover;border-radius:8px"></span>`;
  }

  $('#tx-save', m.overlay).onclick = async () => {
    const d = readForm('#tx-form', m.overlay);
    const amount = Number(d.amount);
    if (!amount || amount <= 0) { toastErr('أدخل مبلغاً صحيحاً'); return; }
    if (!d.accountId) { toastErr('اختر الحساب'); return; }
    const type = d.type;
    const obj = {
      id: t.id || uid('tx'),
      accountId: d.accountId,
      fromId: type === 'transfer' ? d.accountId : undefined,
      toId: type === 'transfer' ? ($('#tx-to-account', m.overlay) ? $('#tx-to-account', m.overlay).value : undefined) : undefined,
      type,
      amount,
      currency: d.currency,
      rate: Number(d.rate || 1),
      date: d.date || todayISO(),
      time: d.time || nowTime(),
      desc: d.desc,
      ref: d.ref,
      tags: (d.tags||'').split(',').map(x=>x.trim()).filter(Boolean),
      status: d.status || 'completed',
      attachments,
      accountKind: (store.getAccount(d.accountId)||{}).kind || 'general',
      sign: type === 'settle' ? (d.sign || '+') : undefined,
      createdBy: (store.findBy('users', u => u.me) || {}).name || 'المدير',
      createdAt: t.createdAt || new Date().toISOString(),
    };
    // كشف التكرار
    const dups = store.findDuplicates(obj);
    if (dups.length && !isCopy && !t.id) {
      const ok = await confirmDialog({ title: '⚠️ عملية مكررة محتملة', message: `يُوجد ${dups.length} عملية مماثلة بنفس المبلغ والبيان في آخر دقيقتين. هل تريد المتابعة؟`, confirmText: 'متابعة', danger: false });
      if (!ok) return;
    }
    await store.saveTransaction(obj);
    // تحديث آخر نشاط للحساب
    const acc = store.getAccount(d.accountId);
    if (acc) { acc.lastTxAt = new Date().toISOString(); await store.save('accounts', acc, { silent: true, noActivity: true }); }
    toast(t.id ? 'تم تعديل العملية ✅' : 'تمت إضافة العملية وتحديث الرصيد ✅');
    m.close();
    go('transactions', {});
  };
}

function openQuickCalc(input) {
  const m = openModal({
    title: '🧮 آلة حاسبة سريعة',
    body: `<div style="font-size:28px;font-weight:800;text-align:left;padding:16px;background:var(--surface2);border-radius:12px;margin-bottom:10px;min-height:50px" id="calc-display">0</div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px" id="calc-pad"></div>`,
  });
  const disp = $('#calc-display', m.overlay);
  const pad = $('#calc-pad', m.overlay);
  let expr = '';
  const keys = ['7','8','9','÷','4','5','6','×','1','2','3','−','0','.','=','+'];
  pad.innerHTML = keys.map(k => `<button style="padding:16px;border-radius:10px;background:var(--surface2);font-size:18px;font-weight:700" data-k="${k}">${k}</button>`).join('');
  pad.addEventListener('click', (e) => {
    const k = e.target.closest('[data-k]');
    if (!k) return;
    const v = k.dataset.k;
    if (v === '=') {
      try {
        const safe = expr.replace(/÷/g,'/').replace(/×/g,'*').replace(/−/g,'-');
        expr = String(Function('"use strict";return(' + safe + ')')());
      } catch (err) { expr = ''; }
    } else if (v === 'C') expr = '';
    else expr += v;
    disp.textContent = expr || '0';
  });
  m.footEl.innerHTML = `<button class="btn ghost" data-close>إلغاء</button><button class="btn primary" id="calc-use">استخدام الناتج</button>`;
  $('#calc-use', m.overlay).onclick = () => {
    try { const safe = expr.replace(/÷/g,'/').replace(/×/g,'*').replace(/−/g,'-'); input.value = Function('"use strict";return(' + safe + ')')(); } catch (e) {}
    m.close();
  };
}

// ============================ تفاصيل عملية ============================
function renderDetail(container, params, state) {
  const t = store.get('transactions', params.id);
  const settings = store.settings();
  if (!t) { container.innerHTML = '<div class="empty"><div class="e-ic">❓</div><h3>العملية غير موجودة</h3><button class="btn primary" data-back>العودة</button></div>';
    container.addEventListener('click', (e)=>{ if(e.target.closest('[data-back]')) go('transactions'); }); return; }
  const op = OP_TYPES[t.type];
  const acc = t.type === 'transfer' ? null : store.getAccount(t.accountId);
  const fromAcc = t.type === 'transfer' ? store.getAccount(t.fromId) : null;
  const toAcc = t.type === 'transfer' ? store.getAccount(t.toId) : null;
  const bal = acc ? accountBalance(acc, store.transactions()) : null;

  container.innerHTML = `
    <button class="btn ghost sm" data-back style="margin-bottom:12px">→ رجوع للعمليات</button>
    <div class="card" style="max-width:640px">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
        <span class="pill ${op.cls}" style="font-size:14px;padding:6px 14px">${op.icon} ${op.label}</span>
        <span class="muted">${esc(fmtDateTime(t))}</span>
      </div>
      <h2 style="margin:16px 0;font-size:26px" class="amount-display ${state.hideBalance?'hide':''}">${fmt(t.amount)} <span style="font-size:16px">${esc(store.currency(t.currency).symbol)}</span></h2>
      <div class="divider"></div>
      ${t.desc ? `<div class="muted" style="margin-bottom:10px">📝 <b>البيان:</b> ${esc(t.desc)}</div>` : ''}
      ${t.ref ? `<div class="muted">🔖 <b>المرجع:</b> ${esc(t.ref)}</div>` : ''}
      ${t.tags && t.tags.length ? `<div style="margin-top:8px">${t.tags.map(x=>`<span class="tag">${esc(x)}</span>`).join('')}</div>` : ''}
      <div class="settings-row"><span>الحساب</span><b>${t.type === 'transfer' ? 'تحويل' : acc ? esc(acc.name) : '—'}</b></div>
      ${t.type === 'transfer' ? `
        <div class="settings-row"><span>من</span><b>${fromAcc ? esc(fromAcc.name) : '—'}</b></div>
        <div class="settings-row"><span>إلى</span><b>${toAcc ? esc(toAcc.name) : '—'} ${t.rate && t.rate !== 1 ? '(×' + fmt(t.rate,4) + ' = ' + fmt(t.amount * t.rate) + ')' : ''}</b></div>` : ''}
      ${t.type === 'settle' ? `<div class="settings-row"><span>الاتجاه</span><b>${t.sign === '+' ? 'زيادة (+) له/مدين' : 'نقصان (−) عليه/دائن'}</b></div>` : ''}
      <div class="settings-row"><span>الحالة</span><span class="pill ${t.status === 'completed' ? 'green' : t.status === 'cancelled' ? 'red' : 'accent'}">${t.status === 'completed' ? 'مكتملة' : t.status === 'cancelled' ? 'ملغاة' : 'معلقة'}</span></div>
      ${bal !== null ? `<div class="settings-row"><span>رصيد الحساب بعد العملية</span><b class="amount-display ${state.hideBalance?'hide':''}">${fmt(bal)} ${esc(store.currency(acc.currency).symbol)}</b></div>` : ''}
      <div class="settings-row"><span>أضيفت بواسطة</span><b>${esc(t.createdBy || '—')}</b></div>
      ${t.attachments && t.attachments.length ? `<div style="margin-top:10px"><div class="section-title">المرفقات</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">${t.attachments.map(a => `<a href="${a}" target="_blank" style="width:70px;height:70px;border-radius:10px;overflow:hidden;border:1px solid var(--border)"><img src="${a}" style="width:100%;height:100%;object-fit:cover"></a>`).join('')}</div></div>` : ''}
      <div style="display:flex;gap:8px;margin-top:18px;flex-wrap:wrap">
        <button class="btn ghost sm" data-edit>✏️ تعديل</button>
        <button class="btn ghost sm" data-dup>🔁 تكرار</button>
        <button class="btn ghost sm" data-wa>🟢 واتساب</button>
        <button class="btn danger sm" data-del>🗑️ حذف</button>
      </div>
    </div>
  `;
  container.addEventListener('click', (e) => {
    if (e.target.closest('[data-back]')) { go('transactions'); return; }
    if (e.target.closest('[data-edit]')) { openTxForm(t, null); return; }
    if (e.target.closest('[data-dup]')) { dupTx(t.id); return; }
    if (e.target.closest('[data-del]')) { delTx(t.id); return; }
    if (e.target.closest('[data-wa]')) {
      const a = acc || fromAcc;
      if (a) openWhatsApp(a.whatsapp || a.phone, `بخصوص العملية (${esc(t.desc||op.label)}): المبلغ ${fmt(t.amount)} ${store.currency(t.currency).symbol} بتاريخ ${esc(t.date)}.`);
    }
  });
}
