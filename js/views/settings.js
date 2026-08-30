// الإعدادات
import { $, $$, esc, fmt, uid, todayISO } from '../utils.js';
import { store } from '../store.js';
import { toast, toastErr, confirmDialog, openModal, field, readForm, handleAttachment } from '../components.js';
import { OP_TYPES } from '../accounting.js';
import { dbClear } from '../db.js';
import { can, currentUser } from './users.js';

export function render(container, params, state) {
  const s = store.settings();
  const me = currentUser();
  container.innerHTML = `
    <div class="view-head">
      <div><div class="view-title">الإعدادات ⚙️</div><small>تخصيص التطبيق حسب احتياجك</small></div>
    </div>

    <div class="grid grid-2">
      <div>
        <div class="settings-group">
          <h4>🎨 المظهر</h4>
          <div class="settings-row"><div><div class="s-label">المظهر</div><div class="s-desc">فاته / ليلي / تلقائي</div></div>
            <select class="select" id="st-theme">
              <option value="light" ${s.theme==='light'?'selected':''}>فاتح</option>
              <option value="dark" ${s.theme==='dark'?'selected':''}>ليلي</option>
              <option value="system" ${s.theme==='system'?'selected':''}>متابعة النظام</option>
            </select></div>
          <div class="settings-row"><div><div class="s-label">إخفاء الأرصدة في الشاشة الرئيسية</div><div class="s-desc">لا تظهر الأرقام إلا بالضغط</div></div>
            <label class="switch"><input type="checkbox" id="st-hidebal" ${s.hideBalances?'checked':''}><span class="slider"></span></label></div>
          <div class="settings-row"><div><div class="s-label">حجم الخط</div><div class="s-desc">يُطبّق على واجهة التطبيق ويحفظ محليًا</div></div>
            <select class="select" id="st-font-size"><option value="small" ${s.fontSize==='small'?'selected':''}>صغير</option><option value="medium" ${!s.fontSize || s.fontSize==='medium'?'selected':''}>متوسط</option><option value="large" ${s.fontSize==='large'?'selected':''}>كبير</option></select></div>
        </div>

        <div class="settings-group">
          <h4>👥 الحسابات</h4>
          <div class="settings-row"><div><div class="s-label">مسمى «له»</div></div>
            <input class="select" id="st-label-oweThem" value="${esc(s.labelOweThem || 'له')}" style="width:120px"></div>
          <div class="settings-row"><div><div class="s-label">مسمى «عليه»</div></div>
            <input class="select" id="st-label-oweUs" value="${esc(s.labelOweUs || 'عليه')}" style="width:120px"></div>
          <div class="settings-row"><div><div class="s-label">نوع العملية الافتراضي</div></div>
            <select class="select" id="st-default-op">${Object.entries(OP_TYPES).map(([k,v])=>`<option value="${k}" ${s.defaultOp===k?'selected':''}>${v.icon} ${v.label}</option>`).join('')}</select></div>
        </div>

        <div class="settings-group">
          <h4>🏢 النشاط التجاري</h4>
          <div class="field"><label>اسم النشاط</label><input id="st-biz" class="field-input" value="${esc(s.businessName||'')}" style="width:100%;padding:11px;border-radius:12px;border:1.5px solid var(--border);background:var(--surface2)"></div>
          <div class="field"><label>الاسم بالإنجليزية</label><input id="st-biz-en" class="field-input" value="${esc(s.businessNameEn||'')}" style="width:100%;padding:11px;border-radius:12px;border:1.5px solid var(--border);background:var(--surface2)"></div>
          <div class="field-row">
            <div class="field"><label>العنوان</label><input id="st-addr" value="${esc(s.address||'')}" style="width:100%;padding:11px;border-radius:12px;border:1.5px solid var(--border);background:var(--surface2)"></div>
            <div class="field"><label>الهاتف</label><input id="st-phone" value="${esc(s.phone||'')}" style="width:100%;padding:11px;border-radius:12px;border:1.5px solid var(--border);background:var(--surface2)"></div>
          </div>
          <div class="field-row">
            <div class="field"><label>واتساب</label><input id="st-wa" value="${esc(s.whatsapp||'')}" style="width:100%;padding:11px;border-radius:12px;border:1.5px solid var(--border);background:var(--surface2)"></div>
            <div class="field"><label>البريد</label><input id="st-email" value="${esc(s.email||'')}" style="width:100%;padding:11px;border-radius:12px;border:1.5px solid var(--border);background:var(--surface2)"></div>
          </div>
          <div class="field"><label>اسم المدير/المسؤول (يظهر في السندات)</label><input id="st-manager" value="${esc(s.managerName||'')}" style="width:100%;padding:11px;border-radius:12px;border:1.5px solid var(--border);background:var(--surface2)"></div>
          <div class="field"><label>شعار المؤسسة</label><input type="file" id="st-logo" accept="image/*">
            <div class="hint">يُحفظ الشعار محليًا مع الإعدادات ويظهر في كل سند جديد وصورة إيصال.</div>
            ${s.logo ? `<div class="logo-setting-preview"><img src="${esc(s.logo)}" alt="معاينة شعار المؤسسة" onerror="this.style.display='none';this.nextElementSibling.hidden=false"><span hidden>تعذّر تحميل الشعار — ستُستخدم الترويسة النصية في السند.</span><button type="button" class="btn danger sm" id="st-logo-remove">🗑️ حذف الشعار</button></div>` : '<div class="hint">لا يوجد شعار محفوظ؛ ستظهر ترويسة المؤسسة النصية بدلًا منه.</div>'}</div>
          <div class="field"><label>العبارة السفلية في السند</label><input id="st-footer" value="${esc(s.voucherFooter || 'هذا السند آلي ولا يحتاج إلى ختم أو توقيع.')}" style="width:100%;padding:11px;border-radius:12px;border:1.5px solid var(--border);background:var(--surface2)"></div>
        </div>
      </div>

      <div>
        <div class="settings-group">
          <h4>🔒 الأمان</h4>
          <div class="settings-row"><div><div class="s-label">تفعيل رمز PIN</div><div class="s-desc">قفل التطبيق عند الفتح</div></div>
            <label class="switch"><input type="checkbox" id="st-pin" ${s.pinEnabled?'checked':''}><span class="slider"></span></label></div>
          <div class="field"><label>رمز PIN (6 أرقام)</label><input id="st-pin-code" type="password" maxlength="6" inputmode="numeric" value="${esc((me&&me.pin)||'')}" style="width:100%;padding:11px;border-radius:12px;border:1.5px solid var(--border);background:var(--surface2)"></div>
          <div class="settings-row"><div><div class="s-label">قفل تلقائي عند فتح التطبيق</div></div>
            <label class="switch"><input type="checkbox" id="st-autolock" ${s.autoLock?'checked':''}><span class="slider"></span></label></div>
        </div>

        <div class="settings-group">
          <h4>📁 التصنيفات</h4>
          <div style="display:flex;gap:8px;margin-bottom:10px">
            <input id="cat-new" placeholder="اسم تصنيف جديد..." style="flex:1;padding:11px;border-radius:12px;border:1.5px solid var(--border);background:var(--surface2)">
            <button class="btn primary" id="cat-add">＋</button>
          </div>
          <div id="cat-list">${store.list('categories').map(c=>`<div class="settings-row"><span>🗂️ ${esc(c.name)}</span><button class="btn sm ghost" data-cat-del="${c.id}">🗑️</button></div>`).join('') || '<div class="muted">لا توجد تصنيفات</div>'}</div>
        </div>

        <div class="settings-group">
          <h4>🧾 ترقيم السندات</h4>
          <div class="field-row">
            <div class="field"><label>بادئة سند القبض</label><input id="st-prefix-receipt" value="${esc((s.voucherPrefix&&s.voucherPrefix.receipt)||'ق')}" style="width:100%;padding:11px;border-radius:12px;border:1.5px solid var(--border);background:var(--surface2)"></div>
            <div class="field"><label>بادئة سند الصرف</label><input id="st-prefix-payment" value="${esc((s.voucherPrefix&&s.voucherPrefix.payment)||'ص')}" style="width:100%;padding:11px;border-radius:12px;border:1.5px solid var(--border);background:var(--surface2)"></div>
          </div>
        </div>

        <div class="settings-group">
          <h4>🛟 خدمة العملاء</h4>
          <p class="muted" style="margin-bottom:10px">التواصل مع الدعم عبر واتساب مباشرة.</p>
          <button class="btn warn block" id="st-support">💬 تواصل مع خدمة العملاء</button>
        </div>

        <div class="settings-group">
          <h4>⚠️ منطقة الخطر</h4>
          <button class="btn danger block" id="st-reset">🗑️ إعادة تعيين كل البيانات</button>
        </div>
      </div>
    </div>
  `;

  // حفظ المظهر
  $('#st-theme', container).addEventListener('change', (e) => {
    store.setSetting('theme', e.target.value);
    applyThemeFromSettings(e.target.value);
    toast('تم تغيير المظهر');
  });
  $('#st-hidebal', container).addEventListener('change', (e) => {
    store.setSetting('hideBalances', e.target.checked);
    document.documentElement.dataset.hideBal = e.target.checked ? '1' : '0';
  });
  $('#st-font-size', container).addEventListener('change', (e) => {
    store.setSetting('fontSize', e.target.value);
    applyFontSize(e.target.value);
    toast('تم تحديث حجم الخط');
  });
  // مسميات
  ['st-label-oweThem','st-label-oweUs','st-default-op'].forEach(id => $('#'+id, container).addEventListener('change', (e) => {
    const key = { 'st-label-oweThem':'labelOweThem', 'st-label-oweUs':'labelOweUs', 'st-default-op':'defaultOp' }[id];
    store.setSetting(key, e.target.value);
  }));
  // النشاط التجاري
  $('#st-biz', container).addEventListener('change', (e) => store.setSetting('businessName', e.target.value));
  $('#st-biz-en', container).addEventListener('change', (e) => store.setSetting('businessNameEn', e.target.value));
  $('#st-addr', container).addEventListener('change', (e) => store.setSetting('address', e.target.value));
  $('#st-phone', container).addEventListener('change', (e) => store.setSetting('phone', e.target.value));
  $('#st-wa', container).addEventListener('change', (e) => store.setSetting('whatsapp', e.target.value));
  $('#st-email', container).addEventListener('change', (e) => store.setSetting('email', e.target.value));
  $('#st-manager', container).addEventListener('change', (e) => store.setSetting('managerName', e.target.value));
  $('#st-footer', container).addEventListener('change', (e) => store.setSetting('voucherFooter', e.target.value));
  $('#st-logo', container).addEventListener('change', async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      const data = await handleAttachment(f, true);
      if (!data) throw new Error('empty logo');
      await store.setSetting('logo', data);
      toast('تم حفظ الشعار محليًا وسيظهر في السندات والصور ✅');
      render(container, params, state);
    } catch (err) {
      toastErr('تعذّر قراءة الشعار؛ لم تتأثر بيانات التطبيق');
    }
  });
  const removeLogo = $('#st-logo-remove', container);
  if (removeLogo) removeLogo.onclick = async () => {
    const ok = await confirmDialog({ title: 'حذف شعار المؤسسة', message: 'سيُحذف الشعار المحفوظ محليًا، وستستخدم السندات ترويسة نصية. متابعة؟', danger: true, confirmText: 'حذف الشعار' });
    if (!ok) return;
    await store.setSetting('logo', '');
    toast('تم حذف الشعار؛ ستظهر الترويسة النصية في السندات');
    render(container, params, state);
  };
  ['st-prefix-receipt','st-prefix-payment'].forEach(id => $('#'+id, container).addEventListener('change', (e) => {
    const pre = store.settings().voucherPrefix || {};
    pre[id === 'st-prefix-receipt' ? 'receipt' : 'payment'] = e.target.value;
    store.setSetting('voucherPrefix', pre);
  }));

  // الأمان
  $('#st-pin', container).addEventListener('change', async (e) => {
    store.setSetting('pinEnabled', e.target.checked);
    if (e.target.checked && !(me&&me.pin)) toast('أدخل رمز PIN في الحقل أدناه', 'warn');
  });
  $('#st-pin-code', container).addEventListener('change', async (e) => {
    const pin = e.target.value.trim();
    if (me) { me.pin = pin; await store.save('users', me, { noActivity: true }); }
    store.setSetting('pinEnabled', true);
    toast(pin ? 'تم تعيين رمز PIN' : 'تم إزالة رمز PIN');
  });
  $('#st-autolock', container).addEventListener('change', (e) => store.setSetting('autoLock', e.target.checked));

  // التصنيفات
  $('#cat-add', container).onclick = async () => {
    const v = $('#cat-new', container).value.trim();
    if (!v) return;
    await store.create('categories', { name: v, createdAt: new Date().toISOString() });
    $('#cat-new', container).value = '';
    toast('تمت إضافة التصنيف');
    render(container, params, state);
  };
  container.addEventListener('click', async (e) => {
    const d = e.target.closest('[data-cat-del]');
    if (d) { await store.remove('categories', d.dataset.catDel); render(container, params, state); return; }
  });

  $('#st-support', container).onclick = () => window.open('https://wa.me/967774190040?text=' + encodeURIComponent('مرحباً، أحتاج المساعدة في تطبيق إدارة البيانات'), '_blank');
  $('#st-reset', container).onclick = async () => {
    const ok = await confirmDialog({ title: '⚠️ إعادة تعيين', message: 'سيتم حذف كل الحسابات والعمليات والسندات نهائياً. هذا الإجراء لا يمكن التراجع عنه!', danger: true, confirmText: 'حذف كل شيء' });
    if (!ok) return;
    await dbClear('accounts'); await dbClear('transactions'); await dbClear('transactionItems'); await dbClear('vouchers');
    await dbClear('items'); await dbClear('categories'); await dbClear('conversations'); await dbClear('messages');
    await dbClear('backups'); await dbClear('activity');
    await store.load();
    toast('تمت إعادة التعيين');
    render(container, params, state);
  };
}

function applyThemeFromSettings(theme) {
  const t = theme === 'system' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : theme;
  document.documentElement.dataset.theme = t;
}

function applyFontSize(size) {
  document.documentElement.dataset.fontSize = size || 'medium';
}
