// العمليات المالية — إدخال سريع، أرصدة تلقائية، تفاصيل الفاتورة ومشاركة السند
import { $, $$, esc, fmt, uid, todayISO, nowTime, fmtDate, fmtDateTime, printHTML, exportExcel, openWhatsApp, openSMS, cleanPhoneNumber } from '../utils.js';
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
        <div class="field-row" style="margin-bottom:8px">
          ${field({ type: 'select', name: 'accountId', label: 'الحساب *', value: t.accountId || defaultAccId || '', options: accs.map(a => ({ value: a.id, label: (ACCOUNT_KINDS[a.kind] || {}).icon + ' ' + a.name + ' — ' + esc(store.currency(a.currency).symbol) })) })}
          ${field({ type: 'select', name: 'type', label: 'نوع العملية *', value: t.type || 'in', options: Object.entries(OP_TYPES).map(([k,v]) => ({ value: k, label: v.icon + ' ' + v.label })) })}
        </div>
        <div id="tx-type-hint"></div>
        <div id="tx-transfer-box" class="hidden"></div>
        <div id="tx-invoice-box" class="invoice-box hidden">
          <div class="invoice-box-head"><div><b>🛒 تفاصيل البيع</b><div class="hint">اختياري: تظهر البنود في السند والصورة ورسالة واتساب.</div></div><button type="button" class="btn soft sm" data-add-invoice-line>＋ إضافة صنف</button></div>
          <div id="tx-invoice-lines"></div>
        </div>

        <!-- حقل المبلغ المالي بتصميم واسع ومريح مع عملة مختصرة وحاسبة سريعة -->
        <div class="field" style="margin-bottom:10px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
            <label style="font-weight:800;font-size:14px;color:var(--text);margin:0">💵 المبلغ المطلوب تسجيله *</label>
            <button type="button" id="tx-calc-hint" class="btn soft sm" style="padding:2px 8px;font-size:12px;height:auto">🧮 حاسبة سريعة</button>
          </div>
          <div style="display:flex;gap:6px;align-items:center;width:100%">
            <input type="number" id="tx-amount" name="amount" step="any" inputmode="decimal" value="${esc(t.amount ?? '')}" placeholder="0.00" style="flex:1;min-width:0;padding:10px 14px;border-radius:12px;border:2px solid var(--primary);background:var(--surface);font-size:22px;font-weight:800;color:var(--text);outline:none">
            <select id="tx-currency" name="currency" class="select" title="العملة" style="width:75px;min-width:65px;max-width:85px;font-weight:800;font-size:14px;padding:10px 6px;text-align:center;border-radius:12px;border:1.5px solid var(--border);background:var(--surface2)">
              ${store.getCurrencies().map(c => `<option value="${esc(c.code)}" ${c.code===defaultCur?'selected':''}>${esc(c.symbol || c.code)}</option>`).join('')}
            </select>
          </div>
        </div>

        <div class="field-row" style="margin-bottom:8px">
          ${field({ type: 'date', name: 'date', label: 'التاريخ', value: t.date || todayISO() })}
          ${field({ type: 'text', name: 'desc', label: 'البيان / الوصف', value: t.desc || '', placeholder: 'بيان العملية (مثال: دفعة حساب، مبيعات)' })}
        </div>

        <details style="margin-top:6px;border:1px solid var(--border);border-radius:12px;padding:8px 12px;background:var(--surface2)">
          <summary style="font-size:13px;font-weight:700;color:var(--text2);cursor:pointer;user-select:none">⚙️ خيارات إضافية (الوقت، الرقم المرجعي، المرفقات)</summary>
          <div style="margin-top:10px">
            <div class="field-row">
              ${field({ type: 'time', name: 'time', label: 'الوقت', value: t.time || nowTime() })}
              ${field({ type: 'text', name: 'ref', label: 'رقم مرجعي / إيصال', value: t.ref || '' })}
            </div>
            <div class="field-row">
              ${field({ type: 'text', name: 'tags', label: 'علامات Tags', value: (t.tags||[]).join(', ') })}
              ${field({ type: 'select', name: 'status', label: 'حالة العملية', value: t.status || 'completed', options: [{value:'completed',label:'مكتملة'},{value:'pending',label:'معلقة'},{value:'cancelled',label:'ملغاة'}] })}
            </div>
            <div class="field"><label>مرفقات / صور فواتير</label><input type="file" id="tx-att" multiple accept="image/*,.pdf"></div>
            <div id="tx-att-preview"></div>
          </div>
        </details>
        ${t.type === 'debit' || !t.type ? '<div class="hint invoice-send-hint" style="margin-top:6px">عند حفظ بيع آجل سيتم تجهيز سند بصورة البنود وتوجيهه فوراً إلى واتساب العميل.</div>' : ''}
      </form>`,
    foot: `<button class="btn ghost" data-close>إلغاء</button><button class="btn primary" id="tx-save">💾 حفظ</button>`,
  });

  // ربط الآلة الحاسبة السريعة والتركيز التلقائي على حقل المبلغ
  const amountBox = $('#tx-amount', m.overlay);
  const calcHintBtn = $('#tx-calc-hint', m.overlay);
  if (calcHintBtn && amountBox) {
    calcHintBtn.onclick = () => openQuickCalc(amountBox);
  }
  setTimeout(() => {
    if (amountBox) {
      amountBox.focus();
      if (!t.amount) amountBox.select();
    }
  }, 120);

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
  const bal = acc ? store.balance(acc.id) : null;
  const isDebit = t.type === 'debit';
  const isPartial = (t.tags && (t.tags.includes('فاتورة_جزئية') || t.tags.includes('دين_جزئي'))) || (t.paidAmount !== undefined && t.remainingDebt !== undefined);
  const business = st.businessName || 'مركز عثمان الوصابي';
  const phone = st.phone || st.whatsapp || '';

  const title = isPartial ? '🧾 فاتورة مبيعات جزئية' : (isDebit ? '🧾 سند مبيعات آجل (دين)' : `📄 ${op.label}`);
  const linesOut = [];
  
  if (acc && acc.name) {
    linesOut.push(`مرحباً بك أ/ *${acc.name}* 🌹`);
  }
  linesOut.push(`إشعار عملية جديدة لدى *${business}*:`);
  linesOut.push(`────────────────────`);
  linesOut.push(`🔖 *نوع السند:* ${title}`);
  if (t.ref) linesOut.push(`🔢 *رقم المرجع:* ${t.ref}`);
  linesOut.push(`🗓️ *التاريخ والوقت:* ${t.date || '—'}${t.time ? ` — ${t.time}` : ''}`);
  if (acc) linesOut.push(`👤 *الحساب:* ${acc.name}${acc.phone ? ` (${acc.phone})` : ''}`);

  if (lines.length) {
    linesOut.push(`────────────────────`);
    linesOut.push(`🛍️ *تفاصيل الأصناف (${lines.length}):*`);
    lines.forEach((line, index) => {
      linesOut.push(`${index + 1}. *${line.name}* — الكمية: ${fmt(line.quantity, quantityDecimals(line.quantity))} ${line.unit || 'حبة'}، سعر الوحدة: ${fmt(line.unitPrice, cur.decimal)} ${cur.symbol}، إجمالي البند: ${fmt(lineTotal(line), cur.decimal)} ${cur.symbol}`);
    });
  }

  linesOut.push(`────────────────────`);
  linesOut.push(`💰 الإجمالي: ${fmt(t.amount, cur.decimal)} ${cur.symbol}`);
  
  if (isPartial) {
    if (t.paidAmount !== undefined) linesOut.push(`💵 *المدفوع نقداً:* ${fmt(t.paidAmount, cur.decimal)} ${cur.symbol}`);
    if (t.remainingDebt !== undefined) linesOut.push(`📝 *المتبقي كدين (عليك):* *${fmt(t.remainingDebt, cur.decimal)} ${cur.symbol}*`);
  }

  if (bal !== null) {
    const balState = bal > 0 ? '(عليك)' : (bal < 0 ? '(لك)' : '(خالص)');
    linesOut.push(`📊 *الرصيد بعد العملية:* *${fmt(Math.abs(bal), cur.decimal)} ${cur.symbol} ${balState}*`);
  }

  if (t.desc) linesOut.push(`📝 *البيان:* ${t.desc}`);
  linesOut.push(`────────────────────`);
  linesOut.push(`شكراً لتعاملكم معنا - نتمنى لكم أطيب الأوقات 🌹`);
  if (phone) linesOut.push(`📞 للتواصل والاستفسار: ${phone}`);

  return linesOut.join('\n');
}

export function transactionSmsText(t) {
  const st = store.settings();
  const acc = t.type === 'transfer' ? store.getAccount(t.fromId) : store.getAccount(t.accountId);
  const cur = store.currency(t.currency);
  const bal = acc ? store.balance(acc.id) : null;
  const isPartial = (t.tags && (t.tags.includes('فاتورة_جزئية') || t.tags.includes('دين_جزئي'))) || (t.paidAmount !== undefined && t.remainingDebt !== undefined);
  const business = st.businessName || 'مركز عثمان الوصابي';
  const ref = t.ref || (t.id ? t.id.slice(-6) : '');
  
  let text = `${business}: سند ${ref} للعميل ${acc ? acc.name : ''}. `;
  text += `المبلغ: ${fmt(t.amount, cur.decimal)} ${cur.symbol}. `;
  if (isPartial) {
    text += `(مدفوع: ${fmt(t.paidAmount || 0)} | متبقي دين: ${fmt(t.remainingDebt || 0)}). `;
  }
  if (bal !== null) {
    text += `الرصيد: ${fmt(Math.abs(bal), cur.decimal)} ${cur.symbol} (${bal > 0 ? 'عليك' : bal < 0 ? 'لك' : 'خالص'}). `;
  }
  text += `التاريخ: ${t.date || ''}. شكراً لتعاملكم.`;
  return text;
}

export function receiptHTML(t) {
  const st = store.settings();
  const op = OP_TYPES[t.type] || OP_TYPES.in;
  const acc = t.type === 'transfer' ? store.getAccount(t.fromId) : store.getAccount(t.accountId);
  const cur = store.currency(t.currency);
  const lines = invoiceItems(t);
  const totalLines = lines.reduce((sum, line) => sum + lineTotal(line), 0);
  const isPartial = (t.tags && (t.tags.includes('فاتورة_جزئية') || t.tags.includes('دين_جزئي'))) || (t.paidAmount !== undefined && t.remainingDebt !== undefined);
  const title = isPartial ? 'فاتورة مبيعات جزئية' : (t.type === 'debit' ? 'سند بيع آجل (دين)' : op.label);
  const bal = acc ? store.balance(acc.id) : null;
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
      ${isPartial && t.paidAmount !== undefined ? `<div class="receipt-row" style="color:var(--success)"><span>المدفوع نقداً</span><b>${fmt(t.paidAmount, cur.decimal)} ${esc(cur.symbol)}</b></div>` : ''}
      ${isPartial && t.remainingDebt !== undefined ? `<div class="receipt-row" style="color:var(--danger)"><span>المتبقي كدين (عليك)</span><b>${fmt(t.remainingDebt, cur.decimal)} ${esc(cur.symbol)}</b></div>` : ''}
      ${bal !== null ? `<div class="receipt-row" style="font-weight:bold;background:var(--surface2);padding:6px 10px;border-radius:8px"><span>الرصيد بعد العملية</span><b>${fmt(Math.abs(bal), cur.decimal)} ${esc(cur.symbol)} (${bal > 0 ? 'عليه' : bal < 0 ? 'له' : 'خالص'})</b></div>` : ''}
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
    title: '🧾 سند العملية ومشاركته',
    cls: 'xl',
    body: `
      <div id="receipt-preview-html">${receiptHTML(t)}</div>
      <div id="receipt-image-state" class="muted" style="margin-top:14px;text-align:center">جارٍ تجهيز صورة السند بجودة عالية...</div>
      <div class="share-options-box" style="margin-top:16px;padding:12px;border:1px solid var(--border);border-radius:12px;background:var(--surface2)">
        <div style="font-weight:bold;margin-bottom:8px">📲 خيارات إرسال الإشعار والمشاركة السريعة:</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn primary sm" id="modal-send-wa">🟢 واتساب العادي</button>
          <button class="btn secondary sm" id="modal-send-wab">💼 واتساب للأعمال</button>
          <button class="btn soft sm" id="modal-send-sms">💬 رسائل SMS</button>
          <button class="btn ghost sm" id="modal-send-share">📤 مشاركة عامة</button>
        </div>
      </div>
    `,
    foot: `<button class="btn ghost" data-close>إغلاق</button><button class="btn ghost" data-receipt-print>🖨️ طباعة / PDF</button><button class="btn soft" data-receipt-download disabled>⬇️ تنزيل الصورة (HD)</button>`,
  });
  const stateBox = $('#receipt-image-state', m.overlay);
  const image = await generateReceiptImage(t);
  if (!document.body.contains(m.overlay)) return;
  
  if (image) {
    try { await store.save('transactions', { ...t, receiptImage: image }, { silent: true, noActivity: true }); } catch (_) {}
    stateBox.innerHTML = `<img src="${esc(image)}" alt="صورة سند العملية" style="max-width:100%;border:1.5px solid var(--border);border-radius:14px;box-shadow:0 4px 12px rgba(0,0,0,0.06);margin-top:8px">`;
    const download = $('[data-receipt-download]', m.overlay);
    download.disabled = false;
    download.onclick = () => downloadDataUrl('receipt-' + (t.id || 'transaction') + '.png', image);
  } else {
    stateBox.innerHTML = '<span style="color:var(--danger)">تعذّر توليد صورة السند عبر المتصفح؛ يمكنك استخدام خيارات المشاركة أو الطباعة.</span>';
  }

  $('[data-receipt-print]', m.overlay).onclick = () => printTransaction(t);
  $('#modal-send-wa', m.overlay).onclick = () => dispatchTransactionNotification(t, { forceChannel: 'whatsapp', waType: 'regular' });
  $('#modal-send-wab', m.overlay).onclick = () => dispatchTransactionNotification(t, { forceChannel: 'whatsapp', waType: 'business' });
  $('#modal-send-sms', m.overlay).onclick = () => dispatchTransactionNotification(t, { forceChannel: 'sms' });
  $('#modal-send-share', m.overlay).onclick = () => dispatchTransactionNotification(t, { forceChannel: 'share' });
}

// دالة مساعدة لرسم مستطيل بحواف مستديرة على Canvas
function drawRoundedRect(ctx, x, y, width, height, radius, fillStyle = null, strokeStyle = null, lineWidth = 1) {
  ctx.save();
  ctx.beginPath();
  if (ctx.roundRect) {
    ctx.roundRect(x, y, width, height, radius);
  } else {
    const r = typeof radius === 'number' ? radius : 10;
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + width - r, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + r);
    ctx.lineTo(x + width, y + height - r);
    ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    ctx.lineTo(x + r, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
  }
  ctx.closePath();
  if (fillStyle) {
    ctx.fillStyle = fillStyle;
    ctx.fill();
  }
  if (strokeStyle) {
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }
  ctx.restore();
}

export async function generateReceiptImage(t) {
  try {
    if (typeof document === 'undefined' || !document.createElement) return null;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext && canvas.getContext('2d');
    if (!ctx) return null;

    const st = store.settings();
    const cur = store.currency(t.currency);
    const isYER = cur.code === 'YER' || cur.symbol === 'ر.ي' || cur.name === 'الريال اليمني';
    const curLabel = isYER ? 'محلي' : cur.symbol;

    const acc = t.type === 'transfer' ? store.getAccount(t.fromId) : store.getAccount(t.accountId);
    const balance = acc ? store.balance(acc.id) : 0;
    const lines = invoiceItems(t);
    const isDebit = t.type === 'debit';
    const isPartial = (t.tags && (t.tags.includes('فاتورة_جزئية') || t.tags.includes('دين_جزئي'))) || (t.paidAmount !== undefined && t.remainingDebt !== undefined);

    const width = 1080;
    let computedHeight = 1180;
    if (lines.length > 0) computedHeight += (lines.length * 68) + 60;
    if (isPartial) computedHeight += 90;
    if (t.desc && t.desc.length > 30) computedHeight += 40;

    const height = Math.max(1260, computedHeight);
    canvas.width = width;
    canvas.height = height;

    // خلفية بيضاء نقية
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.direction = 'rtl';
    ctx.textAlign = 'right';

    const rightMargin = width - 64;
    const leftMargin = 64;
    const contentWidth = width - 128;

    // 1. الترويسة العلوية الفيروزية المماثلة تماماً للصورة (#0f766e)
    const headerHeight = 220;
    ctx.fillStyle = '#0f766e';
    ctx.fillRect(0, 0, width, headerHeight);

    // معالجة الشعار والترويسة
    let textStartX = rightMargin;
    if (st.logo) {
      try {
        const image = await loadImage(st.logo);
        if (image) {
          const boxSize = 148;
          const boxX = rightMargin - boxSize;
          const boxY = 36;
          // صندوق الشعار الأبيض الدائري
          drawRoundedRect(ctx, boxX, boxY, boxSize, boxSize, 22, '#ffffff', '#14b8a6', 2);
          const ratio = Math.min((boxSize - 16) / image.width, (boxSize - 16) / image.height);
          const w = image.width * ratio;
          const h = image.height * ratio;
          ctx.drawImage(image, boxX + (boxSize - w) / 2, boxY + (boxSize - h) / 2, w, h);
          textStartX = boxX - 28;
        }
      } catch (_) {}
    }

    // كتابة بيانات المؤسسة بالترويسة
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 36px Tahoma, "Segoe UI", Arial, sans-serif';
    ctx.fillText(fitCanvasText(ctx, st.businessName || 'مركز عثمان الوصابي', textStartX - leftMargin), textStartX, 84);

    ctx.fillStyle = '#e6fffa';
    ctx.font = '24px Tahoma, "Segoe UI", Arial, sans-serif';
    const bPhone = st.phone || st.whatsapp || '774190040';
    ctx.fillText(fitCanvasText(ctx, bPhone, textStartX - leftMargin), textStartX, 130);

    ctx.fillStyle = '#ccfbf1';
    ctx.font = '22px Tahoma, "Segoe UI", Arial, sans-serif';
    const bAddr = st.address || 'ارحب - خط بوسان';
    ctx.fillText(fitCanvasText(ctx, bAddr, textStartX - leftMargin), textStartX, 172);

    // 2. شريط السند الرمادي الفاتح (#f3f4f6)
    const subheaderY = headerHeight;
    const subheaderHeight = 72;
    ctx.fillStyle = '#f3f4f6';
    ctx.fillRect(0, 0 + subheaderY, width, subheaderHeight);

    ctx.fillStyle = '#111827';
    ctx.font = 'bold 26px Tahoma, Arial, sans-serif';
    const titleText = isPartial ? 'سند فاتورة جزئية' : (isDebit ? 'سند عملية (آجل)' : 'سند عملية');
    ctx.fillText(titleText, rightMargin, subheaderY + 46);

    ctx.textAlign = 'left';
    ctx.fillStyle = '#4b5563';
    ctx.font = 'bold 24px Tahoma, Arial, sans-serif';
    const refCode = t.ref || ('R' + (t.date || todayISO()).replace(/-/g, '').slice(2) + '-0001');
    ctx.fillText(refCode, leftMargin, subheaderY + 46);
    ctx.textAlign = 'right';

    let currentY = subheaderY + subheaderHeight + 48;

    // 3. بيانات الحساب (مماثلة للصورة: اسم الحساب، رقم الهاتف، التصنيف)
    const drawMetaRow = (label, value, isBoldVal = true) => {
      ctx.fillStyle = '#6b7280';
      ctx.font = '24px Tahoma, Arial, sans-serif';
      ctx.fillText(label, rightMargin, currentY);

      ctx.textAlign = 'left';
      ctx.fillStyle = '#111827';
      ctx.font = isBoldVal ? 'bold 26px Tahoma, Arial, sans-serif' : '24px Tahoma, Arial, sans-serif';
      ctx.fillText(fitCanvasText(ctx, String(value || '—'), 540), leftMargin, currentY);
      ctx.textAlign = 'right';
      currentY += 46;
    };

    drawMetaRow('اسم الحساب', acc ? acc.name : '—', true);
    drawMetaRow('رقم الهاتف', acc ? (acc.phone || acc.whatsapp || '—') : '—', false);
    drawMetaRow('التصنيف', acc && ACCOUNT_KINDS[acc.kind] ? ACCOUNT_KINDS[acc.kind].label : 'عام', false);

    currentY += 12;

    // خط فاصل رفيع
    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(leftMargin, currentY);
    ctx.lineTo(rightMargin, currentY);
    ctx.stroke();

    currentY += 36;

    // 4. الصندوق البارز للمبلغ (عليه / له) بتصميم الصورة تماماً
    const boxHeight = 110;
    if (isDebit) {
      // عليه (أحمر / وردي فاتح)
      drawRoundedRect(ctx, leftMargin, currentY, contentWidth, boxHeight, 18, '#fff1f2', '#fecdd3', 2);
      ctx.fillStyle = '#e11d48';
      ctx.font = 'bold 32px Tahoma, Arial, sans-serif';
      ctx.fillText('عليه', rightMargin - 32, currentY + 68);

      ctx.textAlign = 'left';
      ctx.font = 'bold 44px Tahoma, Arial, sans-serif';
      ctx.fillText(`${fmt(t.amount, cur.decimal)} ${curLabel}`, leftMargin + 32, currentY + 70);
      ctx.textAlign = 'right';
    } else {
      // له (أخضر زمردي فاتح)
      drawRoundedRect(ctx, leftMargin, currentY, contentWidth, boxHeight, 18, '#ecfdf5', '#a7f3d0', 2);
      ctx.fillStyle = '#059669';
      ctx.font = 'bold 32px Tahoma, Arial, sans-serif';
      ctx.fillText('له', rightMargin - 32, currentY + 68);

      ctx.textAlign = 'left';
      ctx.font = 'bold 44px Tahoma, Arial, sans-serif';
      ctx.fillText(`${fmt(t.amount, cur.decimal)} ${curLabel}`, leftMargin + 32, currentY + 70);
      ctx.textAlign = 'right';
    }

    currentY += boxHeight + 40;

    // 5. إذا كانت هناك أصناف مسجلة بالفاتورة
    if (lines.length > 0) {
      drawRoundedRect(ctx, leftMargin, currentY - 26, contentWidth, 46, 8, '#f8fafc', '#e2e8f0', 1);
      ctx.fillStyle = '#0f766e';
      ctx.font = 'bold 22px Tahoma, Arial, sans-serif';
      ctx.fillText('الصنف', rightMargin - 16, currentY + 4);
      
      ctx.textAlign = 'left';
      ctx.fillText('الكمية', leftMargin + 380, currentY + 4);
      ctx.fillText('السعر', leftMargin + 200, currentY + 4);
      ctx.fillText('الإجمالي', leftMargin + 20, currentY + 4);
      ctx.textAlign = 'right';

      currentY += 46;

      lines.forEach(line => {
        ctx.fillStyle = '#111827';
        ctx.font = 'bold 22px Tahoma, Arial, sans-serif';
        ctx.fillText(fitCanvasText(ctx, line.name, 380), rightMargin - 16, currentY);

        ctx.textAlign = 'left';
        ctx.font = '22px Tahoma, Arial, sans-serif';
        ctx.fillStyle = '#4b5563';
        ctx.fillText(`${fmt(line.quantity, quantityDecimals(line.quantity))} ${line.unit || 'حبة'}`, leftMargin + 380, currentY);
        ctx.fillText(`${fmt(line.unitPrice, cur.decimal)}`, leftMargin + 200, currentY);
        
        ctx.font = 'bold 22px Tahoma, Arial, sans-serif';
        ctx.fillStyle = '#111827';
        ctx.fillText(`${fmt(lineTotal(line), cur.decimal)} ${curLabel}`, leftMargin + 20, currentY);
        ctx.textAlign = 'right';

        currentY += 42;
      });

      currentY += 12;
      ctx.strokeStyle = '#e5e7eb';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(leftMargin, currentY);
      ctx.lineTo(rightMargin, currentY);
      ctx.stroke();
      currentY += 34;
    }

    // 6. تفاصيل العملية والتاريخ
    if (isPartial) {
      if (t.paidAmount !== undefined) {
        drawMetaRow('المدفوع نقداً', `${fmt(t.paidAmount, cur.decimal)} ${curLabel}`, true);
      }
      if (t.remainingDebt !== undefined) {
        drawMetaRow('المتبقي كدين', `${fmt(t.remainingDebt, cur.decimal)} ${curLabel} (عليه)`, true);
      }
    }

    const descText = t.desc || (isPartial ? 'فاتورة مبيعات جزئية' : (isDebit ? 'دين' : 'سند نقدي'));
    drawMetaRow('التفاصيل', descText, true);

    const formattedTime = (t.time ? t.time + ' — ' : '') + (t.date || todayISO());
    drawMetaRow('التاريخ والوقت', formattedTime, false);

    currentY += 16;

    // خط فاصل
    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(leftMargin, currentY);
    ctx.lineTo(rightMargin, currentY);
    ctx.stroke();

    currentY += 36;

    // 7. صندوق الرصيد بعد العملية (المطابق للصورة)
    const balBoxHeight = 90;
    const isBalDebt = balance > 0;
    const isBalCredit = balance < 0;
    const balStateText = isBalDebt ? '(عليه)' : (isBalCredit ? '(له)' : '(خالص)');
    const balColor = isBalDebt ? '#dc2626' : (isBalCredit ? '#059669' : '#4b5563');

    drawRoundedRect(ctx, leftMargin, currentY, contentWidth, balBoxHeight, 16, '#f8fafc', '#e2e8f0', 1.5);
    
    ctx.fillStyle = '#111827';
    ctx.font = 'bold 26px Tahoma, Arial, sans-serif';
    ctx.fillText('الرصيد بعد العملية', rightMargin - 28, currentY + 56);

    ctx.textAlign = 'left';
    ctx.fillStyle = balColor;
    ctx.font = 'bold 30px Tahoma, Arial, sans-serif';
    ctx.fillText(`${fmt(Math.abs(balance), cur.decimal)} ${curLabel} ${balStateText}`, leftMargin + 28, currentY + 56);
    ctx.textAlign = 'right';

    currentY += balBoxHeight + 54;

    // 8. التذييل السفلي المتطابق مع الصورة
    ctx.textAlign = 'center';
    ctx.fillStyle = '#0f766e';
    ctx.font = 'bold 24px Tahoma, Arial, sans-serif';
    ctx.fillText('شكراً لتعاملكم معنا - نتمنى لكم أطيب الأوقات', width / 2, currentY);

    const subBusiness = st.businessName || st.systemName || '';
    if (subBusiness) {
      ctx.fillStyle = '#9ca3af';
      ctx.font = '19px Tahoma, Arial, sans-serif';
      ctx.fillText(subBusiness, width / 2, currentY + 36);
    }

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

export async function dispatchTransactionNotification(t, { forceChannel = null, waType = null, automatic = false } = {}) {
  const st = store.settings();
  const channel = forceChannel || st.notificationChannel || 'whatsapp';
  const activeWaType = waType || st.whatsappType || 'regular';
  const autoSend = st.autoSendNotification !== false;

  if (automatic && !autoSend && !forceChannel) {
    return true; // المستخدم اختار في الإعدادات عدم التوجيه التلقائي
  }

  const acc = t.type === 'transfer' ? store.getAccount(t.fromId) : store.getAccount(t.accountId);
  const rawPhone = acc && (acc.whatsapp || acc.phone);

  if (!rawPhone) {
    if (!automatic) toastErr('يرجى إضافة رقم هاتف أو واتساب للعميل لإرسال الإشعار');
    return false;
  }

  // 1. إذا كانت القناة المحددة هي الرسائل النصية SMS
  if (channel === 'sms') {
    const smsMessage = transactionSmsText(t);
    openSMS(rawPhone, smsMessage);
    toast('تم فتح تطبيق الرسائل القصيرة SMS بنص الإشعار الواضح 💬');
    return true;
  }

  // 2. تجهيز صورة السند عالية الجودة والنص المنسق للواتساب والمشاركة
  const image = await generateReceiptImage(t);
  const message = transactionText(t);

  if (image) {
    try { await store.save('transactions', { ...t, receiptImage: image }, { silent: true, noActivity: true }); } catch (_) {}
  }

  // 3. دعم Capacitor Native Plugin لواتساب إن وجد في بيئة التطبيق المجمعة
  const nativeShare = globalThis.Capacitor && globalThis.Capacitor.Plugins && globalThis.Capacitor.Plugins.WhatsAppShare;
  if (nativeShare && typeof nativeShare.shareReceipt === 'function') {
    try {
      await nativeShare.shareReceipt({ phone: String(rawPhone), text: message, dataUrl: image });
      toast(automatic ? 'تم حفظ العملية وفتح واتساب مع صورة السند والنص ✅' : 'فُتح واتساب مع صورة السند والنص ✅');
      return true;
    } catch (_) {}
  }

  // 4. إذا كانت القناة هي المشاركة العامة المحددة صراحة
  const file = image ? dataUrlToFile(image, `receipt-${t.id || 'transaction'}.png`) : null;
  const nav = typeof navigator !== 'undefined' ? navigator : {};

  if (channel === 'share') {
    try {
      if (file && typeof nav.share === 'function' && (typeof nav.canShare !== 'function' || nav.canShare({ files: [file] }))) {
        await nav.share({ title: 'سند العملية', text: message, files: [file] });
        toast('تمت مشاركة صورة السند والنص بنجاح ✅');
        return true;
      }
    } catch (err) {
      if (err && err.name === 'AbortError') return false;
    }
  }

  // 5. التوجيه المباشر للواتساب وفتح محادثة فورية مع العميل
  openWhatsApp(rawPhone, message, activeWaType);
  toast(`تم التوجه المباشر لواتساب ${activeWaType === 'business' ? 'الأعمال' : ''} لفتح محادثة مع العميل 🟢`);
  return true;
}

export async function shareTransactionReceipt(t, options = {}) {
  return dispatchTransactionNotification(t, options);
}
