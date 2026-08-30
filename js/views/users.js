// المستخدمون والصلاحيات
import { $, $$, esc, fmt, uid } from '../utils.js';
import { store } from '../store.js';
import { toast, toastErr, confirmDialog, openModal, field, readForm } from '../components.js';

const ROLES = {
  admin: { label: 'مدير النظام', icon: '👑' },
  accountant: { label: 'محاسب', icon: '🧮' },
  dataentry: { label: 'موظف إدخال', icon: '⌨️' },
  viewer: { label: 'عرض فقط', icon: '👁️' },
};
const PERMS = [
  { key: 'add_tx', label: 'إضافة العمليات' },
  { key: 'edit_tx', label: 'تعديل العمليات' },
  { key: 'delete_tx', label: 'حذف العمليات' },
  { key: 'view_reports', label: 'عرض التقارير' },
  { key: 'export', label: 'تصدير البيانات' },
  { key: 'manage_backup', label: 'إدارة النسخ الاحتياطي' },
  { key: 'manage_users', label: 'إدارة المستخدمين' },
  { key: 'approve_vouchers', label: 'اعتماد/إلغاء السندات' },
  { key: 'manage_inventory', label: 'إدارة المخزون والأصناف' },
];

export const defaultPerms = (role) => {
  if (role === 'admin') return Object.fromEntries(PERMS.map(p => [p.key, true]));
  if (role === 'accountant') return { add_tx:true, edit_tx:true, delete_tx:true, view_reports:true, export:true, approve_vouchers:true, manage_backup:false, manage_users:false, manage_inventory:true };
  if (role === 'dataentry') return { add_tx:true, edit_tx:true, delete_tx:false, view_reports:false, export:false, approve_vouchers:false, manage_backup:false, manage_users:false, manage_inventory:true };
  return { add_tx:false, edit_tx:false, delete_tx:false, view_reports:true, export:false, approve_vouchers:false, manage_backup:false, manage_users:false, manage_inventory:false };
};

export function can(user, perm) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  const perms = user.perms || {};
  return perms[perm] === undefined ? !!defaultPerms(user.role)[perm] : !!perms[perm];
}
export function currentUser() {
  return store.findBy('users', u => u.me) || store.findBy('users', u => u.role === 'admin') || null;
}

export function render(container, params, state) {
  const users = store.list('users');
  const me = currentUser();
  container.innerHTML = `
    <div class="view-head">
      <div><div class="view-title">المستخدمون والصلاحيات 🛡️</div><small>التحكم بمن يستطيع ماذا</small></div>
      <div class="view-actions"><button class="btn primary" data-add>＋ مستخدم</button></div>
    </div>
    ${!can(me, 'manage_users') ? '<div class="alert danger"><span class="a-ic">🔒</span><div>ليست لديك صلاحية إدارة المستخدمين.</div></div>' : ''}
    <div class="table-wrap"><table class="tbl"><thead><tr><th>المستخدم</th><th>الدور</th><th>الصياحيات</th><th>الحالي</th><th></th></tr></thead><tbody>
      ${users.map(u => `<tr>
        <td><div style="display:flex;align-items:center;gap:10px"><span class="chat-item"><div class="ava">${esc((u.name||'?')[0])}</div></span> <div><b>${esc(u.name)}</b>${u.me ? ' <span class="pill teal">أنت</span>' : ''}</div></div></td>
        <td><span class="pill ${u.role==='admin'?'accent':u.role==='accountant'?'info':'gray'}">${ROLES[u.role]?.icon || '👤'} ${ROLES[u.role]?.label || u.role}</span></td>
        <td><span class="muted" style="font-size:12px">${permSummary(u)}</span></td>
        <td>${u.me ? '<span class="pill green">✓</span>' : `<button class="btn sm soft" data-switch="${u.id}">تفعيل</button>`}</td>
        <td style="white-space:nowrap">
          ${can(me,'manage_users') ? `<button class="btn sm ghost" data-edit="${u.id}">✏️</button>
          ${!u.me ? `<button class="btn sm ghost" data-del="${u.id}">🗑️</button>` : ''}` : ''}
        </td>
      </tr>`).join('')}
    </tbody></table></div>
    <div class="card" style="margin-top:14px">
      <div class="section-title">أدوار النظام</div>
      <div class="grid grid-4">
        ${Object.entries(ROLES).map(([k,v]) => `<div class="card" style="padding:12px;text-align:center"><div style="font-size:26px">${v.icon}</div><b>${v.label}</b></div>`).join('')}
      </div>
    </div>
  `;

  container.addEventListener('click', (e) => {
    const me2 = currentUser();
    const add = e.target.closest('[data-add]');
    if (add && can(me2,'manage_users')) userForm(null, () => render(container, params, state)); return;
    const ed = e.target.closest('[data-edit]');
    if (ed && can(me2,'manage_users')) userForm(store.get('users', ed.dataset.edit), () => render(container, params, state)); return;
    const dl = e.target.closest('[data-del]');
    if (dl && can(me2,'manage_users')) delUser(dl.dataset.del, () => render(container, params, state)); return;
    const sw = e.target.closest('[data-switch]');
    if (sw) switchUser(sw.dataset.switch, () => render(container, params, state)); return;
  });
}

function permSummary(u) {
  const perms = u.perms || defaultPerms(u.role);
  const granted = PERMS.filter(p => perms[p.key]).map(p => p.label);
  return granted.length ? granted.join('، ') : 'بدون صلاحيات';
}

function userForm(existing, cb) {
  const u = existing || {};
  const perms = u.perms || defaultPerms(u.role || 'dataentry');
  const m = openModal({
    title: u.id ? '✏️ تعديل مستخدم' : '➕ إضافة مستخدم',
    cls: 'lg',
    body: `<form>
      ${field({ type: 'text', name: 'name', label: 'اسم المستخدم', value: u.name || '', required: true })}
      <div class="field-row">
        ${field({ type: 'select', name: 'role', label: 'الدور', value: u.role || 'dataentry', options: Object.entries(ROLES).map(([k,v]) => ({ value: k, label: v.icon + ' ' + v.label })) })}
        ${field({ type: 'password', name: 'pin', label: 'رمز PIN', value: u.pin || '', hint: 'للدخول بالحساب' })}
      </div>
      <div class="section-title" style="margin-top:12px">الصلاحيات التفصيلية</div>
      ${PERMS.map(p => `<label class="chk" style="margin-bottom:8px"><input type="checkbox" name="p_${p.key}" ${perms[p.key] ? 'checked' : ''}> ${p.label}</label>`).join('')}
    </form>`,
    foot: `<button class="btn ghost" data-close>إلغاء</button><button class="btn primary" id="save">💾 حفظ</button>`,
  });
  // عند تغيير الدور يتم تحديث الصلاحيات الافتراضية
  $('#f-role', m.overlay).addEventListener('change', () => {
    const role = $('#f-role', m.overlay).value;
    const def = defaultPerms(role);
    PERMS.forEach(p => { const cb = $(`[name="p_${p.key}"]`, m.overlay); if (cb) cb.checked = !!def[p.key]; });
  });
  $('#save', m.overlay).onclick = async () => {
    const d = readForm('form', m.overlay);
    if (!d.name) { toastErr('أدخل الاسم'); return; }
    const newPerms = {};
    PERMS.forEach(p => newPerms[p.key] = !!d['p_' + p.key]);
    const obj = {
      id: u.id || uid('user'),
      name: d.name,
      role: d.role,
      pin: d.pin || u.pin || '',
      perms: newPerms,
      me: u.me || false,
      createdAt: u.createdAt || new Date().toISOString(),
    };
    await store.save('users', obj);
    toast('تم حفظ المستخدم'); m.close(); if (cb) cb();
  };
}

async function delUser(id, cb) {
  const ok = await confirmDialog({ title: 'حذف مستخدم', message: 'هل تريد حذف هذا المستخدم؟', danger: true });
  if (!ok) return;
  await store.remove('users', id);
  toast('تم حذف المستخدم'); if (cb) cb();
}
function switchUser(id, cb) {
  const users = store.list('users');
  users.forEach(async u => { u.me = u.id === id; await store.save('users', u, { noActivity: true }); });
  toast('تم تبديل المستخدم');
  store.emit({ type: 'user-switch' });
  if (cb) cb();
}
