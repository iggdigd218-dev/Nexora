// نظام السندات الاحترافي
import { $, $$, esc, fmt, uid, todayISO, fmtDate, numberToWords, printHTML, openWhatsApp } from '../utils.js';
import { store } from '../store.js';
import { toast, toastErr, confirmDialog, openModal, field, readForm } from '../components.js';
import { ACCOUNT_KINDS, OP_TYPES } from '../accounting.js';
import { go } from '../app.js';

const VOUCHER_TYPES = {
  receipt: { label: 'سند قبض', icon: '🧾', num: 'ق' },
  payment: { label: 'سند صرف', icon: '💳', num: 'ص' },
  debit: { label: 'سند قيد مدين', icon: '📥', num: 'ق' },
  credit: { label: 'سند قيد دائن', icon: '📤', num: 'د' },
  transfer: { label: 'سند تحويل', icon: '🔁', num: 'تح' },
};

export function render(container, params, state) {
  if (params.id) return renderDetail(container, params, state);
  renderList(container, params, state);
  if (params.new) openVoucherForm();
}

function renderList(container, params, state) {
  const st = store.settings();
  const vouchers = store.col('vouchers').slice().sort((a,b) => (b.createdAt||'').localeCompare(a.createdAt||''));
  container.innerHTML = `
    <div class="view-head">
      <div><div class="view-title">السندات 🧾</div><small>سندات قبض وصرف وقيد وتحويل — ترقيم تلقائي وطباعة A4</small></div>
      <div class="view-actions">
        <button class="btn ghost" data-act="search">🔍 برقم السند</button>
        <button class="btn primary" data-act="new">＋ سند جديد</button>
      </div>
    </div>
    <div class="toolbar">
      <div class="search-input"><input id="v-q" placeholder="ابحث برقم السند أو الحساب أو البيان..."><span class="s-ic">🔍</span></div>
      <select class="select" id="v-type"><option value="">كل الأنواع</option>${Object.entries(VOUCHER_TYPES).map(([k,v])=>`<option value="${k}">${v.label}</option>`).join('')}</select>
      <select class="select" id="v-status"><option value="">الكل</option><option value="approved">معتمد</option><option value="draft">مسودة</option><option value="cancelled">ملغى</option></select>
    </div>
    <div class="table-wrap" id="v-table"></div>
    <div class="empty" id="v-empty" hidden><div class="e-ic">🧾</div><h3>لا توجد سندات</h3></div>
  `;

  function apply() {
    const q = $('#v-q', container).value.trim().toLowerCase();
    const type = $('#v-type', container).value;
    const status = $('#v-status', container).value;
    let list = vouchers.filter(v => {
      const acc = store.getAccount(v.accountId);
      if (q && !(v.number + ' ' + (acc?acc.name:'') + ' ' + (v.desc||'')).toLowerCase().includes(q)) return false;
      if (type && v.type !== type) return false;
      if (status && v.status !== status) return false;
      return true;
    });
    const box = $('#v-table', container);
    if (!list.length) { $('#v-empty', container).hidden = false; box.innerHTML=''; return; }
    $('#v-empty', container).hidden = true;
    box.innerHTML = `<table class="tbl"><thead><tr><th>رقم السند</th><th>النوع</th><th>الحساب</th><th>البيان</th><th>المبلغ</th><th>التاريخ</th><th>الحالة</th><th></th></tr></thead><tbody>
      ${list.map(v => { const acc = store.getAccount(v.accountId); const vt = VOUCHER_TYPES[v.type]; return `
        <tr class="row-click" data-open="${v.id}">
          <td><b>${esc(v.number)}</b></td>
          <td><span class="pill ${vt ? vt.icon : ''}">${vt ? vt.icon : '🧾'} ${vt ? vt.label : ''}</span></td>
          <td>${acc ? esc(acc.name) : '—'}</td>
          <td>${esc(v.desc||'')}</td>
          <td class="amount">${fmt(v.amount)} ${esc(store.currency(v.currency).symbol)}</td>
          <td>${esc(v.date)}</td>
          <td><span class="pill ${v.status==='approved'?'green':v.status==='cancelled'?'red':'accent'}">${v.status==='approved'?'معتمد':v.status==='cancelled'?'ملغى':'مسودة'}</span></td>
          <td><button class="btn sm soft" data-print="${v.id}">🖨️</button></td>
        </tr>`; }).join('')}
    </tbody></table>`;
    $$('[data-open]', box).forEach(el => el.onclick = () => go('vouchers', { id: el.dataset.open }));
    $$('[data-print]', box).forEach(el => el.onclick = (e) => { e.stopPropagation(); const v = store.get('vouchers', el.dataset.print); printVoucher(v); });
  }

  $('#v-q', container).addEventListener('input', apply);
  ['v-type','v-status'].forEach(id => $('#'+id, container).addEventListener('change', apply));
  container.addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]');
    if (act && act.dataset.act === 'new') openVoucherForm();
    if (act && act.dataset.act === 'search') searchByNumber();
  });
  apply();
}

function searchByNumber() {
  const m = openModal({
    title: '🔍 البحث برقم السند',
    body: `<div class="search-input"><input id="vnum" placeholder="أدخل رقم السند..." autofocus><span class="s-ic">🔍</span></div>
      <div id="vnum-res" style="margin-top:12px"></div>`,
  });
  const input = $('#vnum', m.overlay);
  const res = $('#vnum-res', m.overlay);
  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase();
    if (q.length < 2) { res.innerHTML = ''; return; }
    const found = store.col('vouchers').filter(v => v.number.toLowerCase().includes(q));
    res.innerHTML = found.length ? found.map(v => {
      const acc = store.getAccount(v.accountId);
      return `<div class="settings-row" data-vid="${v.id}" style="cursor:pointer"><span><b>${esc(v.number)}</b> — ${esc(acc?acc.name:'')}</span><span class="muted">${esc(v.date)}</span></div>`;
    }).join('') : '<div class="muted">لا توجد نتائج</div>';
    $$('[data-vid]', res).forEach(el => el.onclick = () => { m.close(); go('vouchers', { id: el.dataset.vid }); });
  });
}

function openVoucherForm() {
  const st = store.settings();
  const accs = store.accounts(true);
  const defaultType = 'receipt';
  const m = openModal({
    title: '🧾 سند جديد',
    cls: 'lg',
    body: `
      <form id="v-form">
        <div class="field-row">
          ${field({ type: 'select', name: 'type', label: 'نوع السند', value: 'receipt', options: Object.entries(VOUCHER_TYPES).map(([k,v]) => ({ value: k, label: v.icon + ' ' + v.label })) })}
          ${field({ type: 'select', name: 'accountId', label: 'الحساب', value: accs[0] ? accs[0].id : '', options: accs.map(a => ({ value: a.id, label: ACCOUNT_KINDS[a.kind].icon + ' ' + a.name })) })}
        </div>
        <div class="field-row">
          ${field({ type: 'date', name: 'date', label: 'التاريخ', value: todayISO() })}
          ${field({ type: 'select', name: 'currency', label: 'العملة', value: st.defaultCurrency || 'YER', options: store.getCurrencies().map(c => ({ value: c.code, label: c.name + ' (' + c.symbol + ')' })) })}
        </div>
        ${field({ type: 'text', name: 'amount', label: 'المبلغ', required: true, placeholder: '0.00' })}
        ${field({ type: 'textarea', name: 'desc', label: 'بيان السند / وصف العملية', value: '' })}
        ${field({ type: 'textarea', name: 'notes', label: 'ملاحظات إضافية', value: '' })}
        ${field({ type: 'text', name: 'receiver', label: 'اسم المستلم', value: st.defaultReceiver || '' })}
      </form>`,
    foot: `<button class="btn ghost" data-close>إلغاء</button><button class="btn primary" id="v-save">معاينة وحفظ</button>`,
  });
  $('#v-save', m.overlay).onclick = async () => {
    const d = readForm('#v-form', m.overlay);
    const amount = Number(d.amount);
    if (!amount || amount <= 0) { toastErr('أدخل مبلغاً صحيحاً'); return; }
    if (!d.accountId) { toastErr('اختر الحساب'); return; }
    const vtype = VOUCHER_TYPES[d.type];
    const number = store.nextSequence(d.type);
    const obj = {
      id: uid('vou'),
      number,
      type: d.type,
      accountId: d.accountId,
      date: d.date || todayISO(),
      currency: d.currency,
      amount,
      desc: d.desc,
      notes: d.notes,
      receiver: d.receiver,
      status: 'draft',
      approvedBy: null,
      createdBy: (store.findBy('users', u => u.me) || {}).name || 'المدير',
      cancelLog: [],
      createdAt: new Date().toISOString(),
    };
    // معاينة قبل الحفظ
    previewVoucher(obj, async (confirmed) => {
      if (confirmed) {
        await store.create('vouchers', obj);
        toast('تم إنشاء السند ' + number + ' ✅');
        m.close();
        go('vouchers', {});
      }
    });
  };
}

function previewVoucher(v, onDone) {
  const m = openModal({
    title: `معاينة السند ${esc(v.number)}`,
    cls: 'xl',
    body: voucherHTML(v),
    foot: `<button class="btn ghost" data-close>إلغاء</button>
           <button class="btn soft" data-wa>🟢 واتساب</button>
           <button class="btn ghost" data-print>🖨️ طباعة/PDF</button>
           <button class="btn primary" data-save>✔️ اعتماد وحفظ</button>`,
  });
  $('[data-save]', m.overlay).onclick = () => { v.status = 'approved'; onDone(true); m.close(); };
  $('[data-print]', m.overlay).onclick = () => printVoucher(v);
  $('[data-wa]', m.overlay).onclick = () => {
    const acc = store.getAccount(v.accountId);
    if (acc) openWhatsApp(acc.whatsapp || acc.phone, voucherText(v));
    else toastErr('لا يوجد واتساب للحساب');
  };
}

function voucherHTML(v) {
  const st = store.settings();
  const vt = VOUCHER_TYPES[v.type] || VOUCHER_TYPES.receipt;
  const acc = store.getAccount(v.accountId);
  const cur = store.currency(v.currency);
  const words = numberToWords(v.amount) + ' ' + cur.name;
  return `<div class="voucher-sheet"><div class="voucher">
    <div class="v-head">
      <div class="v-org">
        <h1>${esc(st.businessName || 'مؤسسة')}</h1>
        ${st.businessNameEn ? `<p style="font-weight:700;color:#333">${esc(st.businessNameEn)}</p>` : ''}
        ${st.address ? `<p>📍 ${esc(st.address)}</p>` : ''}
        ${st.phone || st.whatsapp ? `<p>📞 ${esc([st.phone, st.whatsapp].filter(Boolean).join(' — '))}</p>` : ''}
        ${st.email ? `<p>✉️ ${esc(st.email)}</p>` : ''}
      </div>
      <div class="v-logo">${st.logo ? `<img src="${esc(st.logo)}" alt="الشعار" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"><span class="v-logo-fallback" style="display:none">${esc(st.businessName || 'المؤسسة')}</span>` : `<span class="v-logo-fallback">${esc(st.businessName || 'المؤسسة')}</span>`}</div>
    </div>
    <div class="v-info">
      <div class="vi"><div class="k">التاريخ</div><div class="v">${esc(fmtDate(v.date, 'long'))}</div></div>
      <div class="vi"><div class="k">رقم السند</div><div class="v">${esc(v.number)}</div></div>
      <div class="vi"><div class="k">نوع السند</div><div class="v">${vt.label}</div></div>
    </div>
    <div class="v-body">
      <div class="v-line"><span class="k">اسم الحساب</span><span class="val">${acc ? esc(acc.name) : '—'}</span></div>
      ${acc && acc.phone ? `<div class="v-line"><span class="k">رقم الهاتف</span><span class="val">${esc(acc.phone)}</span></div>` : ''}
      <div class="v-line"><span class="k">رقم الحساب</span><span class="val">${acc ? esc(acc.id.slice(0, 8)) : '—'}</span></div>
      ${v.desc ? `<div class="v-line"><span class="k">بيان العملية</span><span class="val">${esc(v.desc)}</span></div>` : ''}
      <div class="v-line"><span class="k">العملة</span><span class="val">${esc(cur.name)} (${esc(cur.symbol)})</span></div>
    </div>
    <div class="v-amount-box">
      <div class="n">${fmt(v.amount)} ${esc(cur.symbol)}</div>
      <div class="w">فقط: ${esc(words)} لا غير</div>
    </div>
    ${v.notes ? `<div class="v-note"><b>ملاحظات:</b> ${esc(v.notes)}</div>` : ''}
    <div class="v-sig">
      <div class="vs"><div class="sl"></div><span>اسم المستلم: ${esc(v.receiver || '')}</span></div>
      <div class="vs"><div class="sl"></div><span>توقيع المستلم</span></div>
      <div class="vs"><div class="sl"></div><span>توقيع المسؤول: ${esc(v.approvedBy || st.managerName || '')}</span></div>
    </div>
    <div class="v-foot">${esc(st.voucherFooter || 'هذا السند آلي ولا يحتاج إلى ختم أو توقيع.')}</div>
    <div class="v-stamp">
      <span>تاريخ الإصدار: ${esc(fmtDate(v.createdAt, 'long'))} — ${esc(new Date(v.createdAt).toLocaleTimeString('ar-EG-u-ca-gregory-nu-latn', {hour:'2-digit',minute:'2-digit'}))}</span>
      <span>أُصدر بواسطة: ${esc(v.createdBy || '')}</span>
    </div>
  </div></div>`;
}

function voucherText(v) {
  const st = store.settings();
  const vt = VOUCHER_TYPES[v.type];
  const acc = store.getAccount(v.accountId);
  const cur = store.currency(v.currency);
  return `📄 ${vt.label} رقم ${v.number}\nالتاريخ: ${v.date}\nالحساب: ${acc ? acc.name : '—'}\nالمبلغ: ${fmt(v.amount)} ${cur.symbol}\nالبيان: ${v.desc || '—'}\n${st.businessName || ''}`;
}

export function printVoucher(v) {
  const st = store.settings();
  printHTML(`السند ${v.number}`, voucherHTML(v));
}

// ============================ تفاصيل سند ============================
function renderDetail(container, params, state) {
  const v = store.get('vouchers', params.id);
  if (!v) { container.innerHTML = '<div class="empty"><div class="e-ic">❓</div><h3>السند غير موجود</h3></div>'; return; }
  const acc = store.getAccount(v.accountId);
  container.innerHTML = `
    <button class="btn ghost sm" data-back style="margin-bottom:12px">→ رجوع للسندات</button>
    <div class="card" style="max-width:520px;margin-bottom:16px">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <span class="pill ${v.status==='approved'?'green':v.status==='cancelled'?'red':'accent'}">${v.status==='approved'?'معتمد':v.status==='cancelled'?'ملغى':'مسودة'}</span>
        <b style="font-size:18px">${esc(v.number)}</b>
      </div>
      <div class="settings-row"><span>النوع</span><b>${VOUCHER_TYPES[v.type].icon} ${VOUCHER_TYPES[v.type].label}</b></div>
      <div class="settings-row"><span>الحساب</span><b>${acc ? esc(acc.name) : '—'}</b></div>
      <div class="settings-row"><span>المبلغ</span><b>${fmt(v.amount)} ${esc(store.currency(v.currency).symbol)}</b></div>
      <div class="settings-row"><span>التاريخ</span><b>${esc(v.date)}</b></div>
      ${v.desc ? `<div class="settings-row"><span>البيان</span><b>${esc(v.desc)}</b></div>` : ''}
      <div class="settings-row"><span>أُنشئ بواسطة</span><b>${esc(v.createdBy||'')}</b></div>
      ${v.cancelLog && v.cancelLog.length ? `<div class="settings-row"><span>سجل الإلغاء</span><b style="color:var(--danger)">${esc(v.cancelLog.join(' | '))}</b></div>` : ''}
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn primary" data-print>🖨️ طباعة / حفظ PDF</button>
      <button class="btn soft" data-wa>🟢 مشاركة واتساب</button>
      ${v.status === 'approved' ? '' : v.status === 'cancelled' ? '' : `<button class="btn success" data-approve>✔️ اعتماد</button>`}
      ${v.status !== 'cancelled' ? `<button class="btn danger" data-cancel>🗑️ إلغاء السند</button>` : ''}
    </div>
    <div style="margin-top:20px" id="v-preview">${voucherHTML(v)}</div>
  `;
  container.addEventListener('click', (e) => {
    if (e.target.closest('[data-back]')) { go('vouchers'); return; }
    if (e.target.closest('[data-print]')) { printVoucher(v); return; }
    if (e.target.closest('[data-wa]')) { if (acc) openWhatsApp(acc.whatsapp || acc.phone, voucherText(v)); return; }
    if (e.target.closest('[data-approve]')) { approveVoucher(v); return; }
    if (e.target.closest('[data-cancel]')) { cancelVoucher(v); return; }
  });
}
async function approveVoucher(v) {
  const ok = await confirmDialog({ title: 'اعتماد السند', message: 'بعد الاعتماد لا يمكن تعديل السند إلا بصلاحية خاصة. هل تريد الاعتماد؟' });
  if (!ok) return;
  v.status = 'approved';
  v.approvedBy = (store.findBy('users', u => u.me) || {}).name || 'المدير';
  await store.save('vouchers', v);
  toast('تم اعتماد السند ✅');
  go('vouchers', { id: v.id });
}
async function cancelVoucher(v) {
  const reason = prompt('سبب الإلغاء (اختياري):');
  const ok = await confirmDialog({ title: 'إلغاء السند', message: 'سيتم إلغاء السند مع الاحتفاظ بسجل الإلغاء. متابعة؟', danger: true });
  if (!ok) return;
  v.status = 'cancelled';
  v.cancelLog = [...(v.cancelLog || []), `أُلغي بواسطة ${(store.findBy('users', u => u.me)||{}).name||''} — ${new Date().toLocaleString('ar-EG-u-ca-gregory-nu-latn')} ${reason ? '(' + reason + ')' : ''}`];
  await store.save('vouchers', v);
  toast('تم إلغاء السند مع حفظ السجل');
  go('vouchers', { id: v.id });
}
