// إدارة العملات وأسعار الصرف والتحويل
import { $, $$, esc, fmt, uid } from '../utils.js';
import { store } from '../store.js';
import { toast, toastErr, confirmDialog, openModal, field, readForm } from '../components.js';
import { DEFAULT_CURRENCIES } from '../accounting.js';

export function render(container, params, state) {
  const settings = store.settings();
  const defaultCur = settings.defaultCurrency || 'YER';
  const currs = store.getCurrencies();

  container.innerHTML = `
    <div class="view-head">
      <div><div class="view-title">العملات 💱</div><small>إدارة العملات وأسعار الصرف والتحويل</small></div>
      <div class="view-actions"><button class="btn primary" data-add>＋ عملة</button></div>
    </div>
    <div class="grid grid-3">
      <div class="card" style="grid-column:span 2">
        <div class="section-title">العملات</div>
        <div class="table-wrap"><table class="tbl"><thead><tr><th>العملة</th><th>الرمز</th><th>افتراضية</th><th>سعر الصرف مقابل الأساس</th><th></th></tr></thead><tbody>
          ${currs.map(c => `<tr>
            <td><b>${esc(c.name)}</b></td>
            <td><span class="currency-badge">${esc(c.symbol)}</span></td>
            <td>${c.code === defaultCur ? '<span class="pill green">✓ الافتراضية</span>' : `<button class="btn sm soft" data-default="${c.code}">تعيين افتراضية</button>`}</td>
            <td>${c.code === defaultCur ? '— (الأساس)' : `<input type="number" step="any" class="rate-input" data-rate="${c.code}" value="${c.rate ?? ''}" style="width:110px;padding:8px;border-radius:8px;border:1.5px solid var(--border);background:var(--surface2)" placeholder="1 = ?">`}</td>
            <td style="white-space:nowrap">
              <button class="btn sm ghost" data-edit="${c.code}">✏️</button>
              ${!DEFAULT_CURRENCIES.find(d=>d.code===c.code) ? `<button class="btn sm ghost" data-del="${c.code}">🗑️</button>` : ''}
            </td>
          </tr>`).join('')}
        </tbody></table></div>
      </div>
      <div class="card">
        <div class="section-title">🔄 تحويل العملات</div>
        <div class="field"><label>المبلغ</label><input type="number" id="cv-amount" class="field-input" value="100" style="width:100%;padding:12px;border-radius:12px;border:1.5px solid var(--border);background:var(--surface2)"></div>
        <div class="field-row">
          <div class="field"><label>من</label><select id="cv-from" class="select" style="width:100%">${currs.map(c=>`<option value="${c.code}">${esc(c.name)}</option>`).join('')}</select></div>
          <div class="field"><label>إلى</label><select id="cv-to" class="select" style="width:100%">${currs.map(c=>`<option value="${c.code}">${esc(c.name)}</option>`).join('')}</select></div>
        </div>
        <div id="cv-result" style="margin-top:14px;padding:14px;border-radius:12px;background:var(--primary-soft);color:var(--primary);font-weight:800;text-align:center;font-size:18px">—</div>
        <div class="hint" style="margin-top:8px;font-size:12px;color:var(--text3)">يُستخدم سعر الصرف المدخل مقابل العملة الأساسية للتحويل.</div>
      </div>
    </div>
  `;

  // أسعار الصرف
  $$('.rate-input', container).forEach(inp => inp.addEventListener('change', async () => {
    const code = inp.dataset.rate;
    const c = store.getCurrencies().find(x => x.code === code);
    if (c) { c.rate = Number(inp.value); await store.save('currencies', c, { noActivity: true }); toast('تم تحديث سعر الصرف'); }
  }));

  // التحويل
  function convert() {
    const amt = Number($('#cv-amount', container).value || 0);
    const from = $('#cv-from', container).value;
    const to = $('#cv-to', container).value;
    const base = store.currency(defaultCur);
    const cf = store.currency(from), ct = store.currency(to);
    // القيمة بالعملة الأساسية ثم إلى العملة المطلوبة
    let valueInBase = from === defaultCur ? amt : amt * (cf.rate || 1);
    if (from === defaultCur) valueInBase = amt;
    else valueInBase = amt * (cf.rate || 0);
    if (to === defaultCur) valueInBase = amt;
    const result = to === defaultCur ? valueInBase : valueInBase / (ct.rate || 1);
    $('#cv-result', container).textContent = `${fmt(result)} ${ct.symbol}`;
  }
  ['#cv-amount','#cv-from','#cv-to'].forEach(id => $(id, container).addEventListener('input', convert));
  convert();

  container.addEventListener('click', (e) => {
    const d = e.target.closest('[data-default]');
    if (d) { store.setSetting('defaultCurrency', d.dataset.default); toast('تم تعيين العملة الافتراضية'); render(container, params, state); return; }
    const ed = e.target.closest('[data-edit]');
    if (ed) editCurrency(ed.dataset.edit, () => render(container, params, state)); return;
    const dd = e.target.closest('[data-del]');
    if (dd) delCurrency(dd.dataset.del, () => render(container, params, state)); return;
    const add = e.target.closest('[data-add]');
    if (add) editCurrency(null, () => render(container, params, state)); return;
  });
}

function editCurrency(code, cb) {
  const existing = store.getCurrencies().find(c => c.code === code) || {};
  const m = openModal({
    title: existing.code ? '✏️ تعديل عملة' : '➕ إضافة عملة',
    body: `<form>
      ${field({ type: 'text', name: 'code', label: 'رمز العملة', value: existing.code || '', required: true })}
      ${field({ type: 'text', name: 'name', label: 'اسم العملة', value: existing.name || '', required: true })}
      ${field({ type: 'text', name: 'symbol', label: 'الرمز/الاختصار', value: existing.symbol || '' })}
      ${field({ type: 'number', name: 'rate', label: 'سعر الصرف مقابل الأساس', value: existing.rate ?? '' })}
    </form>`,
    foot: `<button class="btn ghost" data-close>إلغاء</button><button class="btn primary" id="save">💾 حفظ</button>`,
  });
  $('#save', m.overlay).onclick = async () => {
    const d = readForm('form', m.overlay);
    if (!d.code || !d.name) { toastErr('أكمل البيانات'); return; }
    const obj = { code: d.code.toUpperCase(), name: d.name, symbol: d.symbol || d.code, decimal: d.code === 'USD' ? 2 : 0, rate: d.rate === '' ? null : Number(d.rate) };
    await store.save('currencies', obj, { noActivity: true });
    toast('تم حفظ العملة');
    m.close(); if (cb) cb();
  };
}

async function delCurrency(code, cb) {
  const ok = await confirmDialog({ title: 'حذف عملة', message: 'هل تريد حذف هذه العملة؟', danger: true });
  if (!ok) return;
  await store.remove('currencies', code);
  toast('تم حذف العملة'); if (cb) cb();
}
