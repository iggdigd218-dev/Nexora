// المخزون والأصناف — إدارة بيانات الأصناف فقط
// لا تُسجّل هذه الشاشة شراءً أو بيعًا أو مرتجعًا أو تسوية أو سجل حركات؛
// العمليات المالية تختار الصنف عند إعداد تفاصيل البيع فقط.
import { $, $$, esc, fmt, uid } from '../utils.js';
import { store } from '../store.js';
import { toast, toastErr, confirmDialog, openModal, field, readForm } from '../components.js';
import { can, currentUser } from './users.js';

export function render(container, params, state) {
  const me = currentUser();
  let items = store.list('items').filter(item => item.archived !== true);
  const canManage = can(me, 'manage_inventory');

  container.innerHTML = `
    <div class="view-head">
      <div><div class="view-title">المخزون والأصناف 📦</div><small>إضافة وتعديل بيانات الأصناف والأسعار والكميات وحد التنبيه</small></div>
      <div class="view-actions">${canManage ? '<button class="btn primary" data-add-item>＋ إضافة صنف</button>' : ''}</div>
    </div>
    ${!canManage ? '<div class="alert info"><span class="a-ic">🔒</span><div>لديك صلاحية العرض فقط. تعديل الأصناف متاح للمستخدم المخوّل.</div></div>' : ''}
    <div class="toolbar">
      <div class="search-input"><input id="inventory-q" placeholder="بحث باسم الصنف أو الوحدة..."><span class="s-ic">🔍</span></div>
      <select class="select" id="inventory-stock"><option value="">كل الأصناف</option><option value="low">تحت حد التنبيه</option><option value="ok">الكمية كافية</option></select>
    </div>
    <div id="inventory-list"></div>
    <div class="empty" id="inventory-empty" hidden><div class="e-ic">📦</div><h3>لا توجد أصناف</h3><p class="muted">أضف أصنافك هنا لتظهر في تفاصيل البيع الآجل.</p></div>
  `;

  function apply() {
    const q = $('#inventory-q', container).value.trim().toLowerCase();
    const filter = $('#inventory-stock', container).value;
    const list = items.filter(item => {
      if (q && !(`${item.name || ''} ${item.unit || ''} ${item.notes || ''}`).toLowerCase().includes(q)) return false;
      const low = Number(item.quantity || 0) <= Number(item.alertQty || 0);
      if (filter === 'low' && !low) return false;
      if (filter === 'ok' && low) return false;
      return true;
    });
    const box = $('#inventory-list', container);
    $('#inventory-empty', container).hidden = !!list.length;
    if (!list.length) { box.innerHTML = ''; return; }
    box.innerHTML = `<div class="table-wrap"><table class="tbl"><thead><tr><th>الصنف</th><th>الوحدة</th><th>سعر الشراء</th><th>سعر البيع</th><th>الكمية</th><th>حد التنبيه</th><th></th></tr></thead><tbody>${list.map(itemRow).join('')}</tbody></table></div>`;
  }

  function itemRow(item) {
    const low = Number(item.quantity || 0) <= Number(item.alertQty || 0);
    return `<tr>
      <td><b>${esc(item.name)}</b>${item.notes ? `<div class="muted" style="font-size:11px">${esc(item.notes)}</div>` : ''}</td>
      <td>${esc(item.unit || 'حبة')}</td>
      <td>${fmt(item.buyPrice || 0)}</td>
      <td>${fmt(item.sellPrice || 0)}</td>
      <td><span class="pill ${low ? 'red' : 'green'}">${fmt(item.quantity || 0, quantityDecimals(item.quantity))}</span></td>
      <td>${fmt(item.alertQty || 0, quantityDecimals(item.alertQty))}</td>
      <td style="white-space:nowrap">${canManage ? `<button class="btn sm ghost" data-edit-item="${esc(item.id)}">✏️ تعديل</button><button class="btn sm ghost" data-del-item="${esc(item.id)}" style="color:var(--danger)">🗑️ حذف</button>` : '—'}</td>
    </tr>`;
  }

  $('#inventory-q', container).addEventListener('input', apply);
  $('#inventory-stock', container).addEventListener('change', apply);
  container.addEventListener('click', (event) => {
    const add = event.target.closest('[data-add-item]');
    if (add && canManage) { itemForm(null, () => { items = store.list('items').filter(item => item.archived !== true); apply(); }); return; }
    const edit = event.target.closest('[data-edit-item]');
    if (edit && canManage) { itemForm(store.get('items', edit.dataset.editItem), () => { items = store.list('items').filter(item => item.archived !== true); apply(); }); return; }
    const del = event.target.closest('[data-del-item]');
    if (del && canManage) deleteItem(del.dataset.delItem, () => { items = store.list('items').filter(item => item.archived !== true); apply(); });
  });
  apply();
}

function quantityDecimals(value) {
  return Number.isInteger(Number(value)) ? 0 : 2;
}

function itemForm(existing, done) {
  const item = existing || {};
  const modal = openModal({
    title: item.id ? '✏️ تعديل بيانات الصنف' : '＋ إضافة صنف للمخزون',
    body: `<form id="item-form">
      ${field({ type: 'text', name: 'name', label: 'اسم الصنف', value: item.name || '', required: true })}
      <div class="field-row">
        ${field({ type: 'text', name: 'unit', label: 'الوحدة', value: item.unit || 'حبة' })}
        ${field({ type: 'number', name: 'quantity', label: 'الكمية الحالية', value: item.quantity ?? 0, required: true })}
      </div>
      <div class="field-row">
        ${field({ type: 'number', name: 'buyPrice', label: 'سعر الشراء', value: item.buyPrice ?? 0 })}
        ${field({ type: 'number', name: 'sellPrice', label: 'سعر البيع', value: item.sellPrice ?? 0 })}
      </div>
      ${field({ type: 'number', name: 'alertQty', label: 'حد التنبيه', value: item.alertQty ?? 0, hint: 'يظهر تنبيه عندما تصبح الكمية مساوية أو أقل من هذا الحد.' })}
      ${field({ type: 'textarea', name: 'notes', label: 'ملاحظات', value: item.notes || '' })}
    </form>`,
    foot: '<button class="btn ghost" data-close>إلغاء</button><button class="btn primary" id="item-save">💾 حفظ</button>',
  });
  $('#item-save', modal.overlay).onclick = async () => {
    const data = readForm('#item-form', modal.overlay);
    const quantity = Number(data.quantity);
    const buyPrice = Number(data.buyPrice || 0);
    const sellPrice = Number(data.sellPrice || 0);
    const alertQty = Number(data.alertQty || 0);
    if (!String(data.name || '').trim()) { toastErr('أدخل اسم الصنف'); return; }
    if (![quantity, buyPrice, sellPrice, alertQty].every(Number.isFinite) || quantity < 0 || buyPrice < 0 || sellPrice < 0 || alertQty < 0) { toastErr('تحقق من الكمية والأسعار وحد التنبيه'); return; }
    await store.save('items', {
      id: item.id || uid('item'),
      name: String(data.name).trim(),
      unit: String(data.unit || 'حبة').trim() || 'حبة',
      quantity,
      buyPrice,
      sellPrice,
      alertQty,
      notes: String(data.notes || '').trim(),
      archived: false,
      createdAt: item.createdAt || new Date().toISOString(),
    });
    toast(item.id ? 'تم تعديل بيانات الصنف ✅' : 'تمت إضافة الصنف ✅');
    modal.close();
    if (done) done();
  };
}

async function deleteItem(id, done) {
  const item = store.get('items', id);
  if (!item) return;
  const ok = await confirmDialog({ title: 'حذف صنف', message: `سيُحذف «${esc(item.name)}» من قائمة المخزون. تفاصيل الفواتير السابقة محفوظة كما هي. متابعة؟`, danger: true, confirmText: 'حذف' });
  if (!ok) return;
  await store.remove('items', id);
  toast('تم حذف الصنف');
  if (done) done();
}
