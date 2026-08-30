// العمليات المالية — إدخال سريع، أرصدة تلقائية، تفاصيل الفاتورة ومشاركة السند
import { $, $$, esc, fmt, uid, todayISO, nowTime, fmtDate, fmtDateTime, printHTML, exportExcel } from '../utils.js';
import { store } from '../store.js';
import { toast, toastErr, confirmDialog, openModal, field, readForm, handleAttachment, numberToWords } from '../components.js';
import { accountBalance, ACCOUNT_KINDS, OP_TYPES, opEffect } from '../accounting.js';
import { go } from '../app.js';

export function render(container, params, state) {
  if (params.id) return renderDetail(container, params, state);
  return renderList(container, params, state);
}

function renderList(container, params, state) {
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
      <div class="search-input"><input id="tx-q" placeholder="بحث بالبيان، المرجع، الحساب، الصنف..."><span class="s-ic">🔍</span></div>
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
      const itemNames = invoiceItems(t).map(x => x.name).join(' ');
      if (q && !((t.desc || '') + ' ' + (t.ref||'') + ' ' + accName + ' ' + itemNames).toLowerCase().includes(q)) return false;
      if (type && t.type !== type) return false;
      if (acc && !(t.accountId === acc || t.fromId === acc || t.toId === acc)) return false;
      if (cur && t.currency !== cur) return false;
      if (from && t.date < from) return false;
      if (to && t.date > to) return false;
      return true;
    });
    if (sort === 'amount') list.sort((a,b) => b.amount - a.amount);
    else if (sort === 'account') list.sort((a,b) => ((store.getAccount(a.accountId)||{}).name || '').localeCompare((store.getAccount(b.accountId)||{}).name || '', 'ar'));
    else list.sort((a,b) => (b.date+' '+(b.time||'')).localeCompare(a.date+' '+(a.time||'')));

    const box = $('#tx-list', container);
    if (!list.length) { $('#tx-empty', container).hidden = false; box.innerHTML=''; return; }
    $('#tx-empty', container).hidden = true;
    box.innerHTML = `<div class="table-wrap"><table class="tbl"><thead><tr>
      <th>التاريخ</th><th>النوع</th><th>الحساب</th><th>البيان</th><th>المبلغ</th><th>المرجع</th><th></th></tr></thead><tbody>
      ${list.map(t => txRow(t)).join('')}
    </tbody></table></div>`;
    $$('[data-open-tx]', box).forEach(el => el.onclick = () => go('transactions', { id: el.dataset.openTx }));
    $$('[data-del-tx]', box).forEach(el => el.onclick = (e) => { e.stopPropagation(); delTx(el.dataset.delTx); });
    $$('[data-dup-tx]', box).forEach(el => el.onclick = (e) => { e.stopPropagation(); dupTx(el.dataset.dupTx); });
  }

  function txRow(t) {
    const op = OP_TYPES[t.type] || OP_TYPES.in;
    const acc = store.getAccount(t.accountId);
    let accName = '', accKind = '';
    if (t.type === 'transfer') { accName = 'تحويل بين حسابات'; }
    else { accName = acc ? acc.name : '—'; accKind = acc ? (ACCOUNT_KINDS[acc.kind] || {}).label : ''; }
    const lines = invoiceItems(t);
    return `<tr class="row-click" data-open-tx="${esc(t.id)}">
      <td style="white-space:nowrap">${esc(t.date)} <span class="muted" style="font-size:11px">${esc(t.time||'')}</span></td>
      <td><span class="pill ${op.cls}">${op.icon} ${op.label}</span></td>
      <td><b>${esc(accName)}</b>${accKind ? `<div class="muted" style="font-size:11px">${esc(accKind)}</div>` : ''}</td>
      <td>${esc(t.desc || '—')}${lines.length ? `<div class="muted" style="font-size:11px">🛒 ${lines.length} صنف</div>` : ''}${t.tags && t.tags.length ? `<div>${t.tags.map(x=>`<span class="tag">${esc(x)}</span>`).join('')}</div>`:''}</td>
      <td class="amount ${t.type==='expense'||t.type==='out'?'down':'up'}">${fmt(t.amount)} ${esc(store.currency(t.currency).symbol)}</td>
      <td class="muted">${esc(t.ref || '—')}</td>
      <td style="white-space:nowrap">
        <button class="icon-btn" style="width:30px;height:30px" data-dup-tx="${esc(t.id)}" title="تكرار العملية">🔁</button>
        <button class="icon-btn" style="width:30px;height:30px;color:var(--danger)" data-del-tx="${esc(t.id)}" title="حذف">🗑️</button>
      </td></tr>`;
  }

  ['tx-q','tx-type','tx-acc','tx-cur','tx-from','tx-to','tx-sort'].forEach(id => {
    const el = $('#' + id, container);
    el.addEventListener(id === 'tx-q' ? 'input' : 'change', apply);
  });
  container.addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]');
    if (act && act.dataset.act === 'new') openTxForm(null, params.accountId || null);
    if (act && act.dataset.act === 'export') exportTxs(txs);
  });
  apply();
  if (params.new) openTxForm(null, params.accountId || null);
}

function exportTxs(txs) {
  exportExcel('العمليات المالية', ['التاريخ','الوقت','النوع','الحساب','البيان','الأصناف','المبلغ','العملة','المرجع'],
    txs.map(t => {
      const acc = store.getAccount(t.accountId);
      const lines = invoiceItems(t);
      return [t.date, t.time, (OP_TYPES[t.type] || OP_TYPES.in).label, acc ? acc.name : 'تحويل', t.desc||'', lines.map(x => `${x.name} × ${x.quantity} = ${x.total}`).join(' | '), t.amount, store.currency(t.currency).symbol, t.ref||''];
    }));
  toast('تم تصدير العمليات ✅');
}

async function delTx(id) {
  const ok = await confirmDialog({ title: 'حذف عملية', message: 'سيتم حذف العملية وسيُحدَّث رصيد الحساب تلقائياً. هل تريد المتابعة؟', danger: true });
  if (!ok) return;
  const t = store.get('transactions', id);
  await store.deleteTransaction(id);
  await store.create('trash', { ...t, trashAt: new Date().toISOString() }, { noActivity: true });
  toast('تم حذف العملية وتحديث الرصيد');
  go('transactions');
}

function dupTx(id) {
  const t = store.get('transactions', id);
  if (!t) return;
  const copy = {
    ...t,
    id: undefined,
    createdAt: undefined,
    updatedAt: undefined,
    ref: (t.ref || '') + ' (نسخة)',
    invoiceItems: invoiceItems(t).map(x => ({ ...x })),
  };
  openTxForm(copy, null, true);
}

// ============================ نموذج العملية ============================
export function openTxForm(existing, presetAccountId, isCopy) {
  const t = existing || {};
  const settings = store.settings();
  const accs = store.accounts(true);
  const inventory = store.list('items').filter(item => item.archived !== true);
  const defaultAccId = presetAccountId || t.accountId || (accs[0] ? accs[0].id : '');
  const defaultAcc = store.getAccount(defaultAccId) || accs[0] || {};
  const defaultCur = defaultAcc.currency || settings.defaultCurrency;
  let lines = invoiceItems(t).map(x => ({ ...x }));

  const m = openModal({
    title: isCopy ? '🔁 تكرار عملية' : (t.id ? '✏️ تعديل عملية' : '＋ عملية مالية جديدة'),
    cls: 'lg',
    body: `
      <form id="tx-form">
        <div class="field-row">
          ${field({ type: 'select', name: 'accountId', label: 'الحساب', value: t.accountId || defaultAccId || '', options: accs.map(a => ({ value: a.id, label: (ACCOUNT_KINDS[a.kind] || {}).icon + ' ' + a.name + ' — ' + esc(store.currency(a.currency).symbol) })) })}
          ${field({ type: 'select', name: 'type', label: 'نوع العملية', value: t.type || 'in', options: Object.entries(OP_TYPES).map(([k,v]) => ({ value: k, label: v.icon + ' ' + v.label })) })}
        </div>
        <div id="tx-type-hint"></div>
        <div id="tx-transfer-box" class="hidden"></div>
        <div id="tx-invoice-box" class="invoice-box hidden">
          <div class="invoice-box-head"><div><b>🛒 تفاصيل البيع</b><div class="hint">اختياري: تظهر البنود في السند والصورة ورسالة واتساب.</div></div><button type="button" class="btn soft sm" data-add-invoice-line>＋ إضافة صنف</button></div>
          <div id="tx-invoice-lines"></div>
        </div>
        <div class="field-row">
          <div class="field">
            <label>المبلغ *</label>
            <div style="display:flex;gap:6px">
              <input type="number" id="tx-amount" name="amount" step="any" value="${esc(t.amount ?? '')}" placeholder="0.00" style="flex:1;padding:12px;border-radius:12px;border:1.5px solid var(--border);background:var(--surface2)">
              <select id="tx-currency" name="currency" class="select" style="width:110px">
                ${store.getCurrencies().map(c => `<option value="${esc(c.code)}" ${c.code===defaultCur?'selected':''}>${esc(c.symbol)}</option>`).join('')}
              </select>
            </div>
          </div>
          <div class="field">
            <label>سعر الصرف (إلى عملة الحساب إن اختلفت)</label>
            <input type="number" id="tx-rate" name="rate" step="any" value="${esc(t.rate ?? 1)}" style="padding:12px;border-radius:12px;border:1.5px solid var(--border);background:var(--surface2);width:100%">
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
        ${t.type === 'debit' || !t.type ? '<div class="hint invoice-send-hint">عند حفظ بيع آجل سيتم تجهيز سند بصورة البنود وإرساله مع النص إلى واتساب العميل. إذا لم يدعم الجهاز إرفاق الملفات سيظهر تنبيه ولن يُرسل النص وحده.</div>' : ''}
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

  const invoiceBox = $('#tx-invoice-box', m.overlay);
  const invoiceLinesBox = $('#tx-invoice-lines', m.overlay);

  function renderInvoiceLines() {
    const cur = store.currency($('#tx-currency', m.overlay).value || defaultCur);
    if (!lines.length) {
      invoiceLinesBox.innerHTML = `<div class="invoice-empty">لم تتم إضافة أصناف بعد. أضفها لتظهر تفاصيل الاسم والكمية وسعر الوحدة والإجمالي.</div>`;
      return;
    }
    const total = lines.reduce((sum, line) => sum + lineTotal(line), 0);
    invoiceLinesBox.innerHTML = `${lines.map((line, i) => `
      <div class="invoice-line-row">
        <div class="invoice-line-main"><b>${esc(line.name)}</b><small>${fmt(line.quantity, quantityDecimals(line.quantity))} ${esc(line.unit || 'حبة')} × ${fmt(line.unitPrice, cur.decimal)} ${esc(cur.symbol)}</small></div>
        <b class="invoice-line-total">${fmt(lineTotal(line), cur.decimal)} ${esc(cur.symbol)}</b>
        <button type="button" class="icon-btn sm" data-edit-invoice-line="${i}" title="تعديل الصنف">✏️</button>
        <button type="button" class="icon-btn sm" data-del-invoice-line="${i}" title="حذف الصنف">🗑️</button>
      </div>`).join('')}
      <div class="invoice-total-row"><span>إجمالي البنود</span><b>${fmt(total, cur.decimal)} ${esc(cur.symbol)}</b><button type="button" class="btn ghost sm" data-use-invoice-total>استخدامه كمبلغ العملية</button></div>`;
  }

  function refreshTypeHint() {
    const type = $('#f-type', m.overlay).value;
    const accId = $('#f-accountId', m.overlay).value;
    const acc = store.getAccount(accId);
    const hint = $('#tx-type-hint', m.overlay);
    const transferBox = $('#tx-transfer-box', m.overlay);
    const isSale = type === 'debit';
    invoiceBox.classList.toggle('hidden', !isSale);
    if (isSale) renderInvoiceLines();
    if (type === 'transfer') {
      transferBox.classList.remove('hidden');
      const others = store.accounts(true).filter(a => a.id !== accId);
      transferBox.innerHTML = `<div class="field"><label>تحويل إلى حساب</label>
        <select id="tx-to-account" class="select" style="width:100%;padding:12px">
          ${others.map(a => `<option value="${esc(a.id)}">${(ACCOUNT_KINDS[a.kind] || {}).icon} ${esc(a.name)} (${esc(store.currency(a.currency).symbol)})</option>`).join('')}
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
  $('#tx-currency', m.overlay).addEventListener('change', renderInvoiceLines);
  invoiceBox.addEventListener('click', (e) => {
    const add = e.target.closest('[data-add-invoice-line]');
    if (add) { editInvoiceLine(); return; }
    const ed = e.target.closest('[data-edit-invoice-line]');
    if (ed) { editInvoiceLine(Number(ed.dataset.editInvoiceLine)); return; }
    const del = e.target.closest('[data-del-invoice-line]');
    if (del) { lines.splice(Number(del.dataset.delInvoiceLine), 1); renderInvoiceLines(); return; }
    if (e.target.closest('[data-use-invoice-total]')) {
      const total = lines.reduce((sum, line) => sum + lineTotal(line), 0);
      $('#tx-amount', m.overlay).value = total ? String(total) : '';
      toast('تم وضع إجمالي البنود كمبلغ العملية');
    }
  });
  refreshTypeHint();

  const attInput = $('#tx-att', m.overlay);
  const preview = $('#tx-att-preview', m.overlay);
  let attachments = (t.attachments || []).slice();
  (t.attachments || []).forEach(a => showAtt(a));
  attInput.addEventListener('change', async () => {
    for (const f of attInput.files) {
      try {
        const data = await handleAttachment(f, true);
        if (data) { showAtt(data); attachments.push(data); }
      } catch (err) { toastErr('تعذّر قراءة المرفق'); }
    }
  });
  function showAtt(data) {
    preview.innerHTML += `<span style="display:inline-block;margin:4px;position:relative"><img src="${esc(data)}" alt="مرفق" style="width:52px;height:52px;object-fit:cover;border-radius:8px"></span>`;
  }

  $('#tx-save', m.overlay).onclick = async () => {
    const d = readForm('#tx-form', m.overlay);
    const type = d.type;
    const invoiceTotal = lines.reduce((sum, line) => sum + lineTotal(line), 0);
    const enteredAmount = Number(d.amount);
    const amount = enteredAmount > 0 ? enteredAmount : (type === 'debit' ? invoiceTotal : 0);
    if (!amount || amount <= 0) { toastErr('أدخل مبلغاً صحيحاً أو أضف بنوداً للفاتورة'); return; }
    if (!d.accountId) { toastErr('اختر الحساب'); return; }
    if (type === 'debit' && invoiceTotal > 0 && Math.abs(amount - invoiceTotal) > 0.005) {
      const same = await confirmDialog({ title: '⚠️ اختلاف إجمالي الفاتورة', message: `مبلغ العملية ${fmt(amount)} يختلف عن إجمالي البنود ${fmt(invoiceTotal)}. هل تريد المتابعة؟`, confirmText: 'متابعة', danger: false });
      if (!same) return;
    }
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
      invoiceItems: type === 'debit' ? lines.map(line => ({
        itemId: line.itemId || null,
        name: line.name,
        unit: line.unit || 'حبة',
        quantity: Number(line.quantity),
        unitPrice: Number(line.unitPrice),
        total: lineTotal(line),
      })) : [],
      receiptImage: t.receiptImage || '',
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
    const acc = store.getAccount(d.accountId);
    if (acc) { acc.lastTxAt = new Date().toISOString(); await store.save('accounts', acc, { silent: true, noActivity: true }); }

    // بيع آجل: لا نفتح رابط نصي منفردًا. نولّد الصورة ونرسلها مع النص عبر الجسر الأصلي أو Web Share.
    const shared = type === 'debit' ? await shareTransactionReceipt(obj, { automatic: true }) : true;

    toast(type === 'debit' && !shared
      ? (t.id ? 'تم تعديل العملية، لكن لم يتم إرفاق السند في واتساب' : 'تم حفظ العملية، لكن لم يتم إرفاق السند في واتساب')
      : (t.id ? 'تم تعديل العملية ✅' : 'تمت إضافة العملية وتحديث الرصيد ✅'));
    m.close();
    go('transactions', {});
  };

  async function editInvoiceLine(index = null) {
    const old = index === null ? null : lines[index];
    const selectedItem = old && inventory.find(item => item.id === old.itemId) || inventory[0];
    const defaultName = old?.name || selectedItem?.name || '';
    const defaultUnit = old?.unit || selectedItem?.unit || 'حبة';
    const defaultPrice = old?.unitPrice ?? selectedItem?.sellPrice ?? '';
    const itemOptions = inventory.map(item => ({ value: item.id, label: `${item.name} — ${item.unit || 'حبة'} — ${fmt(item.sellPrice || 0)} ${store.currency($('#tx-currency', m.overlay).value || defaultCur).symbol}` }));
    const lineModal = openModal({
      title: old ? '✏️ تعديل صنف الفاتورة' : '＋ إضافة صنف للفاتورة',
      body: `<form id="invoice-line-form">
        ${itemOptions.length ? field({ type: 'select', name: 'itemId', label: 'الصنف من المخزون والأصناف', value: selectedItem?.id || '', options: itemOptions }) : '<div class="alert warn"><span class="a-ic">📦</span><div>لا توجد أصناف مسجلة بعد. يمكنك إدخال السطر يدويًا، ثم إضافة الأصناف الأساسية من شاشة «المخزون والأصناف».</div></div>'}
        ${field({ type: 'text', name: 'name', label: 'اسم الصنف', value: defaultName, required: true, hint: itemOptions.length ? 'يُملأ تلقائيًا عند اختيار صنف، ويمكن تعديله لهذا السطر فقط.' : '' })}
        <div class="field-row">
          ${field({ type: 'text', name: 'unit', label: 'الوحدة', value: defaultUnit })}
          ${field({ type: 'number', name: 'quantity', label: 'الكمية', value: old?.quantity ?? 1, required: true })}
        </div>
        ${field({ type: 'number', name: 'unitPrice', label: 'سعر الوحدة', value: defaultPrice, required: true })}
        <div class="hint" id="invoice-line-total-hint"></div>
      </form>`,
      foot: `<button class="btn ghost" data-close>إلغاء</button><button class="btn primary" id="invoice-line-save">حفظ الصنف</button>`,
    });
    const itemSelect = $('#f-itemId', lineModal.overlay);
    const qtyInput = $('#f-quantity', lineModal.overlay);
    const priceInput = $('#f-unitPrice', lineModal.overlay);
    const nameInput = $('#f-name', lineModal.overlay);
    const unitInput = $('#f-unit', lineModal.overlay);
    const totalHint = $('#invoice-line-total-hint', lineModal.overlay);
    function refreshLineFields() {
      const item = inventory.find(x => x.id === (itemSelect && itemSelect.value));
      if (item) {
        nameInput.value = item.name;
        unitInput.value = item.unit || 'حبة';
        if (!old) priceInput.value = item.sellPrice ?? '';
      }
      const total = (Number(qtyInput.value) || 0) * (Number(priceInput.value) || 0);
      totalHint.textContent = `إجمالي هذا السطر: ${fmt(total)} ${store.currency($('#tx-currency', m.overlay).value || defaultCur).symbol}`;
    }
    if (itemSelect) itemSelect.addEventListener('change', refreshLineFields);
    [qtyInput, priceInput].forEach(input => input && input.addEventListener('input', refreshLineFields));
    refreshLineFields();
    $('#invoice-line-save', lineModal.overlay).onclick = () => {
      const d = readForm('#invoice-line-form', lineModal.overlay);
      const quantity = Number(d.quantity);
      const unitPrice = Number(d.unitPrice);
      if (!String(d.name || '').trim()) { toastErr('أدخل اسم الصنف'); return; }
      if (!Number.isFinite(quantity) || quantity <= 0) { toastErr('أدخل كمية صحيحة'); return; }
      if (!Number.isFinite(unitPrice) || unitPrice < 0) { toastErr('أدخل سعر وحدة صحيحاً'); return; }
      const line = { itemId: d.itemId || null, name: String(d.name).trim(), unit: String(d.unit || 'حبة').trim() || 'حبة', quantity, unitPrice, total: quantity * unitPrice };
      if (index === null) lines.push(line); else lines[index] = line;
      lineModal.close();
      renderInvoiceLines();
    };
  }
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
    } else expr += v;
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
  if (!t) { container.innerHTML = '<div class="empty"><div class="e-ic">❓</div><h3>العملية غير موجودة</h3><button class="btn primary" data-back>العودة</button></div>';
    container.addEventListener('click', (e)=>{ if(e.target.closest('[data-back]')) go('transactions'); }); return; }
  const op = OP_TYPES[t.type] || OP_TYPES.in;
  const acc = t.type === 'transfer' ? null : store.getAccount(t.accountId);
  const fromAcc = t.type === 'transfer' ? store.getAccount(t.fromId) : null;
  const toAcc = t.type === 'transfer' ? store.getAccount(t.toId) : null;
  const bal = acc ? accountBalance(acc, store.transactions()) : null;
  const lines = invoiceItems(t);

  container.innerHTML = `
    <button class="btn ghost sm" data-back style="margin-bottom:12px">→ رجوع للعمليات</button>
    <div class="card" style="max-width:720px">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
        <span class="pill ${op.cls}" style="font-size:14px;padding:6px 14px">${op.icon} ${op.label}</span>
        <span class="muted">${esc(fmtDateTime(t.date && t.time ? `${t.date}T${t.time}` : (t.date || t.createdAt)))}</span>
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
      ${lines.length ? `<div class="invoice-details-view"><div class="section-title">تفاصيل البنود</div><div class="table-wrap"><table class="tbl"><thead><tr><th>الصنف</th><th>الكمية</th><th>سعر الوحدة</th><th>الإجمالي</th></tr></thead><tbody>${lines.map(line => `<tr><td><b>${esc(line.name)}</b></td><td>${fmt(line.quantity, quantityDecimals(line.quantity))} ${esc(line.unit || 'حبة')}</td><td>${fmt(line.unitPrice, store.currency(t.currency).decimal)} ${esc(store.currency(t.currency).symbol)}</td><td><b>${fmt(lineTotal(line), store.currency(t.currency).decimal)} ${esc(store.currency(t.currency).symbol)}</b></td></tr>`).join('')}</tbody><tfoot><tr><td colspan="3"><b>إجمالي البنود</b></td><td><b>${fmt(lines.reduce((sum, line) => sum + lineTotal(line), 0), store.currency(t.currency).decimal)} ${esc(store.currency(t.currency).symbol)}</b></td></tr></tfoot></table></div></div>` : ''}
      ${t.attachments && t.attachments.length ? `<div style="margin-top:10px"><div class="section-title">المرفقات</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">${t.attachments.map(a => `<a href="${esc(a)}" target="_blank" style="width:70px;height:70px;border-radius:10px;overflow:hidden;border:1px solid var(--border)"><img src="${esc(a)}" alt="مرفق" style="width:100%;height:100%;object-fit:cover"></a>`).join('')}</div></div>` : ''}
      <div style="display:flex;gap:8px;margin-top:18px;flex-wrap:wrap">
        <button class="btn ghost sm" data-receipt>🧾 معاينة السند</button>
        <button class="btn ghost sm" data-print-receipt>🖨️ طباعة / PDF</button>
        <button class="btn soft sm" data-wa>🟢 واتساب: صورة + نص</button>
        <button class="btn ghost sm" data-edit>✏️ تعديل</button>
        <button class="btn ghost sm" data-dup>🔁 تكرار</button>
        <button class="btn danger sm" data-del>🗑️ حذف</button>
      </div>
    </div>
  `;
  container.addEventListener('click', async (e) => {
    if (e.target.closest('[data-back]')) { go('transactions'); return; }
    if (e.target.closest('[data-edit]')) { openTxForm(t, null); return; }
    if (e.target.closest('[data-dup]')) { dupTx(t.id); return; }
    if (e.target.closest('[data-del]')) { delTx(t.id); return; }
    if (e.target.closest('[data-receipt]')) { openReceiptPreview(t); return; }
    if (e.target.closest('[data-print-receipt]')) { printTransaction(t); return; }
    if (e.target.closest('[data-wa]')) { await shareTransactionReceipt(t); return; }
  });
}

function invoiceItems(t) {
  const stored = t && t.id && typeof store.transactionItems === 'function' ? store.transactionItems(t.id) : [];
  const source = stored.length ? stored : (Array.isArray(t && t.invoiceItems) ? t.invoiceItems : []);
  return source.filter(Boolean).map((line, index) => ({
    itemId: line.itemId || null,
    name: String(line.name || `صنف ${index + 1}`),
    unit: String(line.unit || 'حبة'),
    quantity: Number(line.quantity) || 0,
    unitPrice: Number(line.unitPrice) || 0,
    total: lineTotal(line),
  })).filter(line => line.quantity > 0);
}

function lineTotal(line) {
  const total = Number(line && line.total);
  if (Number.isFinite(total) && total >= 0) return total;
  return (Number(line && line.quantity) || 0) * (Number(line && line.unitPrice) || 0);
}

function quantityDecimals(value) {
  return Number.isInteger(Number(value)) ? 0 : 2;
}

export function transactionText(t) {
  const st = store.settings();
  const op = OP_TYPES[t.type] || OP_TYPES.in;
  const acc = t.type === 'transfer' ? store.getAccount(t.fromId) : store.getAccount(t.accountId);
  const cur = store.currency(t.currency);
  const lines = invoiceItems(t);
  const title = t.type === 'debit' ? '🧾 بيع آجل / جزئي' : `📄 ${op.label}`;
  const out = [
    `${title}${st.businessName ? ` — ${st.businessName}` : ''}`,
    `التاريخ: ${t.date || '—'}${t.time ? ` ${t.time}` : ''}`,
    `العميل/الحساب: ${acc ? acc.name : '—'}`,
  ];
  if (acc && (acc.phone || acc.whatsapp)) out.push(`الهاتف: ${acc.whatsapp || acc.phone}`);
  if (lines.length) {
    out.push('تفاصيل الأصناف:');
    lines.forEach((line, index) => out.push(`${index + 1}. ${line.name} — الكمية: ${fmt(line.quantity, quantityDecimals(line.quantity))} ${line.unit}، سعر الوحدة: ${fmt(line.unitPrice, cur.decimal)} ${cur.symbol}، إجمالي البند: ${fmt(lineTotal(line), cur.decimal)} ${cur.symbol}`));
  }
  out.push(`الإجمالي: ${fmt(t.amount, cur.decimal)} ${cur.symbol}`);
  out.push(`العملة: ${cur.name} (${cur.symbol})`);
  if (t.desc) out.push(`البيان: ${t.desc}`);
  if (t.ref) out.push(`المرجع: ${t.ref}`);
  out.push(`الحالة: ${t.status === 'completed' ? 'مكتملة' : t.status === 'cancelled' ? 'ملغاة' : (t.status || 'معلقة')}`);
  return out.join('\n');
}

export function receiptHTML(t) {
  const st = store.settings();
  const op = OP_TYPES[t.type] || OP_TYPES.in;
  const acc = t.type === 'transfer' ? store.getAccount(t.fromId) : store.getAccount(t.accountId);
  const cur = store.currency(t.currency);
  const lines = invoiceItems(t);
  const totalLines = lines.reduce((sum, line) => sum + lineTotal(line), 0);
  const title = t.type === 'debit' ? 'سند بيع آجل' : op.label;
  const logo = st.logo
    ? `<img src="${esc(st.logo)}" alt="الشعار" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"><span class="receipt-logo-fallback" style="display:none">${esc(st.businessName || 'المؤسسة')}</span>`
    : `<span class="receipt-logo-fallback">${esc(st.businessName || 'المؤسسة')}</span>`;
  return `<div class="transaction-receipt" dir="rtl">
    <div class="receipt-head"><div class="receipt-org"><h1>${esc(st.businessName || 'مؤسسة')}</h1>${st.businessNameEn ? `<p>${esc(st.businessNameEn)}</p>` : ''}${st.address ? `<p>📍 ${esc(st.address)}</p>` : ''}${st.phone || st.whatsapp ? `<p>📞 ${esc([st.phone, st.whatsapp].filter(Boolean).join(' — '))}</p>` : ''}${st.email ? `<p>✉️ ${esc(st.email)}</p>` : ''}</div><div class="receipt-logo">${logo}</div></div>
    <div class="receipt-title"><strong>${esc(title)}</strong><span>${esc(op.icon)} ${esc(t.ref || '')}</span></div>
    <div class="receipt-meta"><div><small>التاريخ</small><b>${esc(t.date || '—')} ${esc(t.time || '')}</b></div><div><small>الحساب</small><b>${esc(acc ? acc.name : '—')}</b></div><div><small>العملة</small><b>${esc(cur.name)} (${esc(cur.symbol)})</b></div></div>
    <div class="receipt-body">
      ${lines.length ? `<table><thead><tr><th>الصنف</th><th>الكمية</th><th>سعر الوحدة</th><th>إجمالي البند</th></tr></thead><tbody>${lines.map(line => `<tr><td>${esc(line.name)}</td><td>${fmt(line.quantity, quantityDecimals(line.quantity))} ${esc(line.unit)}</td><td>${fmt(line.unitPrice, cur.decimal)} ${esc(cur.symbol)}</td><td><b>${fmt(lineTotal(line), cur.decimal)} ${esc(cur.symbol)}</b></td></tr>`).join('')}</tbody><tfoot><tr><td colspan="3">إجمالي البنود</td><td>${fmt(totalLines, cur.decimal)} ${esc(cur.symbol)}</td></tr></tfoot></table>` : `<div class="receipt-row"><span>البيان</span><b>${esc(t.desc || '—')}</b></div>`}
      ${lines.length && t.desc ? `<div class="receipt-row"><span>البيان</span><b>${esc(t.desc)}</b></div>` : ''}
      ${t.ref ? `<div class="receipt-row"><span>المرجع</span><b>${esc(t.ref)}</b></div>` : ''}
    </div>
    <div class="receipt-grand"><div><small>الإجمالي</small><strong>${fmt(t.amount, cur.decimal)} ${esc(cur.symbol)}</strong></div><div class="receipt-words">فقط ${esc(numberToWords(t.amount))} ${esc(cur.name)} لا غير</div></div>
    <div class="receipt-footer">${esc(st.voucherFooter || 'هذا السند آلي ولا يحتاج إلى ختم أو توقيع.')}</div>
    <div class="receipt-generated">أُصدر بواسطة: ${esc(t.createdBy || 'المدير')} — ${esc(st.businessName || 'المؤسسة')}</div>
  </div>`;
}

export function printTransaction(t) {
  printHTML(t.type === 'debit' ? 'سند بيع آجل' : 'سند العملية', receiptHTML(t));
}

async function openReceiptPreview(t) {
  const m = openModal({
    title: '🧾 معاينة سند العملية',
    cls: 'xl',
    body: `<div id="receipt-preview-html">${receiptHTML(t)}</div><div id="receipt-image-state" class="muted" style="margin-top:10px;text-align:center">جارٍ تجهيز صورة السند...</div>`,
    foot: `<button class="btn ghost" data-close>إغلاق</button><button class="btn ghost" data-receipt-print>🖨️ طباعة / PDF</button><button class="btn soft" data-receipt-download disabled>⬇️ حفظ الصورة</button><button class="btn primary" data-receipt-wa disabled>🟢 واتساب</button>`,
  });
  const stateBox = $('#receipt-image-state', m.overlay);
  const image = await generateReceiptImage(t);
  if (!document.body.contains(m.overlay)) return;
  if (image) {
    try { await store.save('transactions', { ...t, receiptImage: image }, { silent: true, noActivity: true }); } catch (_) {}
    stateBox.innerHTML = `<img src="${esc(image)}" alt="صورة سند العملية" style="max-width:100%;border:1px solid var(--border);border-radius:12px;margin-top:8px">`;
    const download = $('[data-receipt-download]', m.overlay);
    const wa = $('[data-receipt-wa]', m.overlay);
    download.disabled = false;
    wa.disabled = false;
    download.onclick = () => downloadDataUrl('receipt-' + (t.id || 'transaction') + '.png', image);
    wa.onclick = () => shareTransactionReceipt(t);
  } else {
    stateBox.innerHTML = '<span style="color:var(--danger)">تعذّر توليد صورة السند. لم يتم إرسال النص وحده؛ استخدم الطباعة/PDF أو أصلح دعم الصور في الجهاز.</span>';
  }
  $('[data-receipt-print]', m.overlay).onclick = () => printTransaction(t);
}

export async function generateReceiptImage(t) {
  try {
    if (typeof document === 'undefined' || !document.createElement) return null;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext && canvas.getContext('2d');
    if (!ctx) return null;
    const st = store.settings();
    const cur = store.currency(t.currency);
    const acc = t.type === 'transfer' ? store.getAccount(t.fromId) : store.getAccount(t.accountId);
    const lines = invoiceItems(t);
    const width = 1200;
    const height = Math.max(820, 720 + lines.length * 82);
    canvas.width = width;
    canvas.height = height;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.direction = 'rtl';
    ctx.textAlign = 'right';
    const right = width - 64;
    const draw = (text, x, y, font = '28px Tahoma, Arial, sans-serif', color = '#111827') => {
      ctx.font = font;
      ctx.fillStyle = color;
      ctx.fillText(fitCanvasText(ctx, String(text ?? ''), 620), x, y);
    };
    const drawLeft = (text, x, y, font = '24px Tahoma, Arial, sans-serif', color = '#111827') => {
      ctx.textAlign = 'left';
      ctx.font = font;
      ctx.fillStyle = color;
      ctx.fillText(fitCanvasText(ctx, String(text ?? ''), 420), x, y);
      ctx.textAlign = 'right';
    };
    ctx.fillStyle = '#0f766e';
    ctx.fillRect(0, 0, width, 14);
    draw(st.businessName || 'مؤسسة', right, 78, '700 38px Tahoma, Arial, sans-serif', '#0f766e');
    draw(st.businessNameEn || '', right, 116, '22px Tahoma, Arial, sans-serif', '#4b5563');
    draw(t.type === 'debit' ? 'سند بيع آجل' : ((OP_TYPES[t.type] || OP_TYPES.in).label), right, 166, '700 34px Tahoma, Arial, sans-serif', '#111827');
    draw(`التاريخ: ${t.date || '—'} ${t.time || ''}`, right, 208, '22px Tahoma, Arial, sans-serif', '#4b5563');
    draw(`الحساب: ${acc ? acc.name : '—'}`, right, 242, '22px Tahoma, Arial, sans-serif', '#4b5563');
    if (st.logo) {
      try {
        const image = await loadImage(st.logo);
        if (image) {
          const size = 132;
          const ratio = Math.min(size / image.width, size / image.height);
          const w = image.width * ratio;
          const h = image.height * ratio;
          ctx.drawImage(image, 64 + (size - w) / 2, 36 + (size - h) / 2, w, h);
        }
      } catch (_) {
        // الترويسة النصية المرسومة أعلاه هي البديل عند غياب الشعار أو فشل تحميله.
      }
    }
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(64, 276); ctx.lineTo(width - 64, 276); ctx.stroke();
    let y = 326;
    draw('تفاصيل العملية', right, y, '700 26px Tahoma, Arial, sans-serif', '#0f766e');
    y += 52;
    if (lines.length) {
      ctx.fillStyle = '#f0fdfa'; ctx.fillRect(64, y - 30, width - 128, 48);
      draw('الصنف', right - 10, y, '700 22px Tahoma, Arial, sans-serif', '#115e59');
      drawLeft('الكمية', 600, y, '700 22px Tahoma, Arial, sans-serif', '#115e59');
      drawLeft('سعر الوحدة', 390, y, '700 22px Tahoma, Arial, sans-serif', '#115e59');
      drawLeft('الإجمالي', 160, y, '700 22px Tahoma, Arial, sans-serif', '#115e59');
      y += 58;
      for (const line of lines) {
        draw(line.name, right - 10, y, '700 22px Tahoma, Arial, sans-serif');
        drawLeft(`${fmt(line.quantity, quantityDecimals(line.quantity))} ${line.unit}`, 600, y, '22px Tahoma, Arial, sans-serif');
        drawLeft(`${fmt(line.unitPrice, cur.decimal)} ${cur.symbol}`, 390, y, '22px Tahoma, Arial, sans-serif');
        drawLeft(`${fmt(lineTotal(line), cur.decimal)} ${cur.symbol}`, 160, y, '700 22px Tahoma, Arial, sans-serif');
        ctx.strokeStyle = '#e5e7eb'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(64, y + 25); ctx.lineTo(width - 64, y + 25); ctx.stroke();
        y += 64;
      }
    } else {
      draw(`البيان: ${t.desc || '—'}`, right, y, '24px Tahoma, Arial, sans-serif');
      y += 58;
    }
    if (t.desc && lines.length) { draw(`البيان: ${t.desc}`, right, y, '22px Tahoma, Arial, sans-serif', '#4b5563'); y += 48; }
    if (t.ref) { draw(`المرجع: ${t.ref}`, right, y, '22px Tahoma, Arial, sans-serif', '#4b5563'); y += 48; }
    y += 22;
    ctx.fillStyle = '#111827'; ctx.fillRect(64, y - 38, width - 128, 106);
    draw('الإجمالي', right - 22, y + 2, '700 24px Tahoma, Arial, sans-serif', '#ffffff');
    drawLeft(`${fmt(t.amount, cur.decimal)} ${cur.symbol}`, 260, y + 2, '700 32px Tahoma, Arial, sans-serif', '#ffffff');
    y += 96;
    draw(`فقط ${numberToWords(t.amount)} ${cur.name} لا غير`, right, y, '22px Tahoma, Arial, sans-serif', '#374151');
    y += 52;
    draw(st.voucherFooter || 'هذا السند آلي ولا يحتاج إلى ختم أو توقيع.', width / 2, y, '20px Tahoma, Arial, sans-serif', '#6b7280');
    return canvas.toDataURL('image/png');
  } catch (err) {
    return null;
  }
}

function fitCanvasText(ctx, text, maxWidth) {
  let value = String(text ?? '');
  if (ctx.measureText(value).width <= maxWidth) return value;
  while (value.length > 3 && ctx.measureText('…' + value).width > maxWidth) value = value.slice(0, -1);
  return '…' + value;
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    if (typeof Image === 'undefined') return reject(new Error('Image is not available'));
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

function dataUrlToFile(dataUrl, name) {
  const match = String(dataUrl).match(/^data:([^;,]+)?(;base64)?,(.*)$/);
  if (!match) return null;
  const mime = match[1] || 'image/png';
  const binary = match[2] ? atob(match[3]) : decodeURIComponent(match[3]);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  try { return new File([bytes], name, { type: mime }); } catch (_) { return new Blob([bytes], { type: mime }); }
}

function downloadDataUrl(name, dataUrl) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => a.remove(), 300);
}

export async function shareTransactionReceipt(t, { automatic = false } = {}) {
  const acc = t.type === 'transfer' ? store.getAccount(t.fromId) : store.getAccount(t.accountId);
  const phone = acc && (acc.whatsapp || acc.phone);
  if (!phone) {
    toastErr('أضف رقم واتساب أو هاتف العميل أولاً؛ لم يُرسل النص وحده.');
    return false;
  }
  const image = await generateReceiptImage(t);
  if (!image) {
    toastErr('تم حفظ العملية، لكن تعذّر توليد صورة السند؛ لم يُرسل النص وحده. استخدم الطباعة/PDF أو حاول من جهاز يدعم الصور.');
    return false;
  }
  // الاحتفاظ بآخر صورة صحيحة لإعادة استخدامها في المعاينة والنسخ الاحتياطي.
  try { await store.save('transactions', { ...t, receiptImage: image }, { silent: true, noActivity: true }); } catch (_) {}
  const message = transactionText(t);
  // في APK المبني بـ Capacitor نستخدم الجسر الأصلي لإرسال الملف إلى واتساب
  // مع رقم العميل؛ المتصفح يستخدم Web Share كمسار بديل.
  const nativeShare = globalThis.Capacitor && globalThis.Capacitor.Plugins && globalThis.Capacitor.Plugins.WhatsAppShare;
  if (nativeShare && typeof nativeShare.shareReceipt === 'function') {
    try {
      await nativeShare.shareReceipt({ phone: String(phone), text: message, dataUrl: image });
      toast(automatic ? 'تم حفظ العملية وفتح واتساب مع صورة السند والنص ✅' : 'فُتح واتساب مع صورة السند والنص ✅');
      return true;
    } catch (_) {
      // إذا لم يكن واتساب مثبتًا أو أُلغي الإرسال، نجرّب Web Share أو نعرض فشل الإرفاق صراحة.
    }
  }
  const file = dataUrlToFile(image, `receipt-${t.id || 'transaction'}.png`);
  const nav = typeof navigator !== 'undefined' ? navigator : {};
  try {
    const canFileShare = file && (typeof nav.canShare !== 'function' || nav.canShare({ files: [file] }));
    if (file && typeof nav.share === 'function' && canFileShare) {
      await nav.share({ title: 'سند العملية', text: message, files: [file] });
      toast(automatic ? 'تم حفظ العملية وإرسال صورة السند والنص للمشاركة عبر واتساب ✅' : 'تمت مشاركة صورة السند والنص ✅');
      return true;
    }
  } catch (err) {
    if (err && err.name === 'AbortError') {
      toast('أُلغيَت المشاركة؛ لم يُرسل النص وحده', 'warn');
      return false;
    }
    // نكمل إلى مسار الفشل الصريح أدناه ولا نفتح رابط واتساب نصيًا.
  }
  downloadDataUrl(`receipt-${t.id || 'transaction'}.png`, image);
  toastErr('هذا الجهاز لا يدعم إرفاق الصورة مباشرة عبر المشاركة. تم حفظ الصورة، ولم يُرسل النص وحده؛ أرفقها يدويًا في واتساب.');
  return false;
}
