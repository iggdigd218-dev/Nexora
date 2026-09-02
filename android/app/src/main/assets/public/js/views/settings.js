// الإعدادات — إعادة تنظيم متقدمة ومبوبة حسب الفئات مع أيقونات واضحة وإدارة كاملة للشعار
import { $, $$, esc, fmt, uid, todayISO } from '../utils.js';
import { store } from '../store.js';
import { toast, toastErr, confirmDialog, openModal, field, readForm, handleAttachment } from '../components.js';
import { OP_TYPES } from '../accounting.js';
import { dbClear } from '../db.js';
import { can, currentUser } from './users.js';
import {
  isNotificationSupported,
  isPushSupported,
  getNotificationPermission,
  requestNotificationPermission,
  sendSystemNotification,
  runInventoryAndSalesAudit,
  performAutoBackupWithNotification,
  testSleepModePushNotification,
  registerBackgroundPeriodicSync
} from '../notifications.js';
import { getSavedGoogleAccount } from '../drive.js';

export function render(container, params, state) {
  const s = store.settings();
  const me = currentUser();
  const notifPerm = getNotificationPermission();
  const googleAcc = getSavedGoogleAccount();

  // علامة التبويب النشطة
  const activeTab = params?.tab || state?.settingsTab || 'biz';

  let notifStatusBadge = '';
  if (!isNotificationSupported()) {
    notifStatusBadge = '<span class="pill gray">⚠️ غير مدعوم بالمتصفح</span>';
  } else if (notifPerm === 'granted') {
    notifStatusBadge = '<span class="pill green">🟢 مفعلة ونشطة</span>';
  } else if (notifPerm === 'denied') {
    notifStatusBadge = '<span class="pill red">❌ محظورة</span>';
  } else {
    notifStatusBadge = '<span class="pill yellow">⚠️ بحاجة لتفعيل الإذن</span>';
  }

  container.innerHTML = `
    <div class="view-head">
      <div>
        <div class="view-title">إعدادات النظام ⚙️</div>
        <small>تخصيص الهوية التجارية، السندات، المبيعات، الإشعارات، والأمان</small>
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn soft sm" id="btn-goto-backup">💾 إدارة النسخ الاحتياطي السحابي</button>
      </div>
    </div>

    <!-- بطاقات الفئات السريعة (Icon-based Category Grid) -->
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;margin-bottom:20px">
      <button class="settings-nav-card ${activeTab==='biz'?'active':''}" data-tab="biz">
        <div class="settings-nav-icon" style="background:linear-gradient(135deg,#0f766e,#0d9488);color:#fff">🏢</div>
        <div class="settings-nav-title">الهوية والشعار</div>
        <small class="settings-nav-sub">الاسم، الشعار، المدير</small>
      </button>

      <button class="settings-nav-card ${activeTab==='sales'?'active':''}" data-tab="sales">
        <div class="settings-nav-icon" style="background:linear-gradient(135deg,#2563eb,#3b82f6);color:#fff">🛒</div>
        <div class="settings-nav-title">المبيعات والسندات</div>
        <small class="settings-nav-sub">واتساب، الفواتير، POS</small>
      </button>

      <button class="settings-nav-card ${activeTab==='notif'?'active':''}" data-tab="notif">
        <div class="settings-nav-icon" style="background:linear-gradient(135deg,#f59e0b,#f97316);color:#fff">🔔</div>
        <div class="settings-nav-title">مركز الإشعارات</div>
        <small class="settings-nav-sub">النسخ، المخزون، السكون</small>
      </button>

      <button class="settings-nav-card ${activeTab==='theme'?'active':''}" data-tab="theme">
        <div class="settings-nav-icon" style="background:linear-gradient(135deg,#7c3aed,#8b5cf6);color:#fff">🎨</div>
        <div class="settings-nav-title">المظهر والخصوصية</div>
        <small class="settings-nav-sub">ليلي/فاتح، الأرصدة</small>
      </button>

      <button class="settings-nav-card ${activeTab==='security'?'active':''}" data-tab="security">
        <div class="settings-nav-icon" style="background:linear-gradient(135deg,#e11d48,#f43f5e);color:#fff">🔒</div>
        <div class="settings-nav-title">الأمان والقفل</div>
        <small class="settings-nav-sub">رمز PIN، القفل الآلي</small>
      </button>

      <button class="settings-nav-card ${activeTab==='system'?'active':''}" data-tab="system">
        <div class="settings-nav-icon" style="background:linear-gradient(135deg,#475569,#64748b);color:#fff">🗂️</div>
        <div class="settings-nav-title">التصنيفات والنظام</div>
        <small class="settings-nav-sub">الفئات، منطقة الخطر</small>
      </button>
    </div>

    <!-- محتوى الفئة النشطة -->
    <div id="settings-tab-content">
      ${renderTabContent(activeTab, s, me, notifPerm, notifStatusBadge, googleAcc)}
    </div>
  `;

  // أحداث التبديل بين الفئات
  $$('.settings-nav-card', container).forEach(card => {
    card.onclick = () => {
      const tab = card.dataset.tab;
      if (state) state.settingsTab = tab;
      render(container, { ...params, tab }, state);
    };
  });

  const btnBackup = $('#btn-goto-backup', container);
  if (btnBackup) btnBackup.onclick = () => location.hash = '#/backup';

  // تفعيل الأحداث الخاصة بالتبويب الحالي
  bindTabEvents(activeTab, container, params, state, s, me);
}

function renderTabContent(tab, s, me, notifPerm, notifStatusBadge, googleAcc) {
  if (tab === 'biz') {
    return `
      <div class="grid grid-2">
        <div class="settings-group">
          <h4>🏢 النشاط التجاري والهوية</h4>
          <div class="field">
            <label>اسم المؤسسة / النشاط التجاري</label>
            <input id="st-biz" value="${esc(s.businessName||'')}" placeholder="اسم المتجر أو المؤسسة">
          </div>
          <div class="field-row">
            <div class="field">
              <label>العنوان والمدينة</label>
              <input id="st-addr" value="${esc(s.address||'')}" placeholder="المدينة / الشارع">
            </div>
            <div class="field">
              <label>رقم الهاتف أو الواتساب</label>
              <input id="st-phone" value="${esc(s.phone||s.whatsapp||'')}" placeholder="770000000">
            </div>
          </div>
          <div class="field">
            <label>اسم المدير / المسؤول (يظهر في تذييل السندات المطبوعة للتوقيع)</label>
            <input id="st-manager" value="${esc(s.managerName||'')}" placeholder="اسم المدير العام أو المسؤول">
          </div>
        </div>

        <div class="settings-group">
          <h4>🖼️ شعار المؤسسة الرسمي</h4>
          <p class="muted" style="margin-bottom:12px;font-size:13px">
            يظهر الشعار في ترويسة السندات المطبوعة، فواتير المبيعات، صور المشاركة، وكذلك في أيقونات إشعارات النظام.
          </p>

          <div style="background:var(--surface2);border-radius:14px;border:1px dashed var(--border);padding:18px;text-align:center;margin-bottom:14px">
            ${s.logo ? `
              <div style="display:flex;flex-direction:column;align-items:center;gap:12px">
                <div style="width:110px;height:110px;border-radius:18px;background:var(--surface);border:2px solid var(--border);padding:6px;box-shadow:var(--shadow);display:flex;align-items:center;justify-content:center;overflow:hidden">
                  <img src="${esc(s.logo)}" style="max-width:100%;max-height:100%;object-fit:contain" alt="شعار المؤسسة">
                </div>
                <div style="display:flex;gap:8px">
                  <label class="btn soft sm" style="cursor:pointer">
                    🔄 تغيير الشعار
                    <input type="file" id="st-logo" accept="image/*" style="display:none">
                  </label>
                  <button type="button" class="btn danger sm" id="st-logo-remove">🗑️ حذف الشعار</button>
                </div>
              </div>
            ` : `
              <div style="display:flex;flex-direction:column;align-items:center;gap:10px">
                <div style="width:70px;height:70px;border-radius:16px;background:var(--surface);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;font-size:32px;color:var(--text3)">
                  🏛️
                </div>
                <div style="font-size:13px;color:var(--text2)">لم يتم تعيين شعار حتى الآن (تُستخدم ترويسة نصية).</div>
                <label class="btn primary sm" style="cursor:pointer">
                  ➕ رفع شعار المؤسسة
                  <input type="file" id="st-logo" accept="image/*" style="display:none">
                </label>
              </div>
            `}
          </div>

          <div style="background:var(--surface2);border-radius:10px;padding:10px 12px;font-size:12px;color:var(--text3)">
            💡 يفضل استخدام صورة بدقة عالية وخلفية شفافة (PNG) أو بيضاء. يتم حفظ الصورة محلياً وضغطها لتسريع طباعة السندات وإرسالها.
          </div>
        </div>
      </div>
    `;
  }

  if (tab === 'sales') {
    return `
      <div class="grid grid-2">
        <div class="settings-group">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
            <h4>📱 قنوات إرسال الفواتير والسندات</h4>
            <button class="btn primary sm" id="btn-open-full-sales">⚙️ تخصيص متقدم</button>
          </div>

          <div class="settings-row">
            <div>
              <div class="s-label">قناة الإرسال الافتراضية للعميل</div>
              <div class="s-desc">القناة المستخدمة فور حفظ السند أو الفاتورة</div>
            </div>
            <select class="select" id="st-notif-channel">
              <option value="whatsapp" ${(s.notificationChannel||'whatsapp')==='whatsapp'?'selected':''}>🟢 واتساب (صورة السند + النص)</option>
              <option value="sms" ${s.notificationChannel==='sms'?'selected':''}>💬 رسائل SMS (نص فقط)</option>
              <option value="share" ${s.notificationChannel==='share'?'selected':''}>📤 نافذة المشاركة العامة</option>
              <option value="manual" ${s.notificationChannel==='manual'?'selected':''}>⚙️ يدوي / عند الطلب فقط</option>
            </select>
          </div>

          <div class="settings-row" id="st-wa-type-box">
            <div>
              <div class="s-label">تطبيق الواتساب المستخدم</div>
              <div class="s-desc">اختر نوع الواتساب المثبت على هاتفك لفتح المحادثة تلقائياً</div>
            </div>
            <select class="select" id="st-wa-type">
              <option value="regular" ${(s.whatsappType||'regular')==='regular'?'selected':''}>🟢 واتساب ماسنجر</option>
              <option value="business" ${s.whatsappType==='business'?'selected':''}>💼 واتساب للأعمال (Business)</option>
              <option value="web" ${s.whatsappType==='web'?'selected':''}>🌐 رابط مباشر (wa.me)</option>
            </select>
          </div>

          <div class="settings-row">
            <div>
              <div class="s-label">التوجيه التلقائي للمحادثة</div>
              <div class="s-desc">فتح محادثة العميل فور تسجيل العملية أو السند</div>
            </div>
            <label class="switch"><input type="checkbox" id="st-auto-send" ${s.autoSendNotification!==false?'checked':''}><span class="slider"></span></label>
          </div>
        </div>

        <div class="settings-group">
          <h4>🧾 ترويسة وتذييل السندات المطبوعة</h4>
          <div class="field">
            <label>نص التذييل / الشكر في أسفل السند</label>
            <input id="st-inv-footer" value="${esc(s.invoiceFooter || 'شكراً لتعاملكم معنا - نتمنى لكم أطيب الأوقات')}" placeholder="نص الشكر في أسفل السند">
          </div>
          <div class="field">
            <label>ملاحظات وشروط افتراضية في السند</label>
            <input id="st-inv-notes" value="${esc(s.defaultVoucherNotes || '')}" placeholder="مثال: البضاعة المباعة لا ترد بعد 3 أيام">
          </div>
          <div class="settings-row">
            <div>
              <div class="s-label">نوع العملية الافتراضي</div>
              <div class="s-desc">النوع المختار تلقائياً عند فتح شاشة تسجيل حركة جديدة</div>
            </div>
            <select class="select" id="st-default-op">
              ${Object.entries(OP_TYPES).map(([k,v])=>`<option value="${k}" ${s.defaultOp===k?'selected':''}>${v.icon} ${v.label}</option>`).join('')}
            </select>
          </div>
        </div>
      </div>
    `;
  }

  if (tab === 'notif') {
    const stagnantDays = s.stagnantDaysThreshold || 20;
    return `
      <div class="grid grid-2">
        <div class="settings-group">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
            <h4>🔔 إشعارات الدفع (Push) ووضع السكون</h4>
            <div>${notifStatusBadge}</div>
          </div>

          <div class="settings-row">
            <div>
              <div class="s-label">🌙 تفعيل المزامنة في وضع السكون (Background Sync)</div>
              <div class="s-desc">إرسال التنبيهات حتى عند قفل الشاشة أو سكون الهاتف عبر Service Worker</div>
            </div>
            <label class="switch"><input type="checkbox" id="st-notif-sleep-sync" ${s.sleepSyncEnabled!==false?'checked':''}><span class="slider"></span></label>
          </div>

          <div class="settings-row">
            <div>
              <div class="s-label">💾 إشعار النسخ الاحتياطي التلقائي (نجاح / فشل)</div>
              <div class="s-desc">تنبيه بحالة النسخ بعد كل حركة مع إعادة المحاولة التلقائية بعد 15 دقيقة عند الفشل</div>
            </div>
            <label class="switch"><input type="checkbox" id="st-notif-auto-bk" ${s.autoBackupNotification!==false?'checked':''}><span class="slider"></span></label>
          </div>

          <div class="settings-row">
            <div>
              <div class="s-label">❌ تنبيهات نفاد وقرب نفاد المخزون</div>
              <div class="s-desc">إشعار فوري عند نفاد أي صنف بالمخزن أو اقترابه من الحد الأدنى للطلب</div>
            </div>
            <label class="switch"><input type="checkbox" id="st-notif-stock" ${s.stockNotificationsEnabled!==false?'checked':''}><span class="slider"></span></label>
          </div>

          <div class="settings-row">
            <div>
              <div class="s-label">⏳ تنبيهات الأصناف الراكدة وبطيئة الحركة</div>
              <div class="s-desc">تنبيه ذكي بالأصناف المتوفرة التي لم تسجل أي حركة بيع لفترة محددة</div>
            </div>
            <label class="switch"><input type="checkbox" id="st-notif-stagnant" ${s.stagnantAlertsEnabled!==false?'checked':''}><span class="slider"></span></label>
          </div>

          <div class="field" style="margin-top:10px">
            <label>عتبة ركود الصنف (المدة بدون مبيعات لإرسال التنبيه)</label>
            <select class="select" id="st-stagnant-days" style="width:100%">
              <option value="10" ${stagnantDays==10?'selected':''}>10 أيام بدون بيع</option>
              <option value="15" ${stagnantDays==15?'selected':''}>15 يوماً بدون بيع</option>
              <option value="20" ${stagnantDays==20?'selected':''}>20 يوماً بدون بيع (افتراضي يوصى به)</option>
              <option value="30" ${stagnantDays==30?'selected':''}>30 يوماً (شهر كامل)</option>
              <option value="45" ${stagnantDays==45?'selected':''}>45 يوماً</option>
              <option value="60" ${stagnantDays==60?'selected':''}>60 يوماً (شهران)</option>
            </select>
          </div>

          <div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap">
            ${notifPerm !== 'granted' ? `<button class="btn primary sm" id="btn-request-notif" style="flex:1">🔔 تفعيل إذن الإشعارات والدفع</button>` : ''}
            <button class="btn soft sm" id="btn-test-sleep-notif" style="flex:1" title="يعطيك 4 ثوانٍ لقفل الشاشة ومشاهدة وصول التنبيه">🌙 تجربة تنبيه وضع السكون (بعد 4 ثوانٍ)</button>
            <button class="btn ghost sm" id="btn-test-notif" style="flex:1">🧪 إشعار فوري</button>
            <button class="btn ghost sm" id="btn-audit-stock" style="flex:1">🔍 فحص المخزون والنسخ الآن</button>
          </div>
        </div>

        <div class="settings-group">
          <h4>☁️ النسخ الاحتياطي السحابي</h4>
          <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0">
            <div>
              <b>حساب Google Drive:</b>
              <div class="muted">${googleAcc ? esc(googleAcc.email || googleAcc.name) : 'غير متصل'}</div>
            </div>
            <button class="btn ${googleAcc?'soft':'primary'} sm" onclick="location.hash='#/backup'">
              ${googleAcc ? '⚙️ إدارة النسخ' : '➕ ربط حساب Google'}
            </button>
          </div>
          <div class="divider"></div>
          <div class="muted" style="font-size:13px;line-height:1.6">
            💡 <b>آلية عمل تنبيهات وضع السكون:</b><br>
            يتم تشغيل محرك المزامنة الخلفي (Service Worker + Periodic Sync) لفحص المخزون والنسخ الاحتياطي، وإرسال تنبيهات شريط النظام وشاشة القفل تلقائياً عند نفاد صنف، أو عند ركود صنف، أو عند فشل المزامنة السحابية.
          </div>
        </div>
      </div>
    `;
  }

  if (tab === 'theme') {
    return `
      <div class="grid grid-2">
        <div class="settings-group">
          <h4>🎨 مظهر التطبيق والألوان</h4>
          <div class="settings-row">
            <div>
              <div class="s-label">نمط المظهر (Theme)</div>
              <div class="s-desc">فاتح أو ليلي مريح للعين أو متابعة تلقائية لإعدادات جهازك</div>
            </div>
            <select class="select" id="st-theme">
              <option value="light" ${s.theme==='light'?'selected':''}>☀️ مظهر فاتح</option>
              <option value="dark" ${s.theme==='dark'?'selected':''}>🌙 مظهر ليلي (داكن)</option>
              <option value="system" ${s.theme==='system'?'selected':''}>💻 متابعة مظهر النظام</option>
            </select>
          </div>
        </div>

        <div class="settings-group">
          <h4>👁️ الخصوصية وإخفاء الأرقام</h4>
          <div class="settings-row">
            <div>
              <div class="s-label">إخفاء الأرصدة في الشاشة الرئيسية</div>
              <div class="s-desc">تعتيم الأرقام الحساسة وإظهارها فقط بالنقر المباشر عليها</div>
            </div>
            <label class="switch"><input type="checkbox" id="st-hidebal" ${s.hideBalances?'checked':''}><span class="slider"></span></label>
          </div>
        </div>
      </div>
    `;
  }

  if (tab === 'security') {
    return `
      <div class="grid grid-2">
        <div class="settings-group">
          <h4>🔒 حماية وقفل التطبيق (PIN Lock)</h4>
          <div class="settings-row">
            <div>
              <div class="s-label">تفعيل رمز PIN للحماية</div>
              <div class="s-desc">قفل التطبيق برمز سري لمنع الدخول غير المصرح به</div>
            </div>
            <label class="switch"><input type="checkbox" id="st-pin" ${s.pinEnabled?'checked':''}><span class="slider"></span></label>
          </div>

          <div class="field" style="margin-top:12px">
            <label>رمز PIN السري (6 أرقام)</label>
            <input id="st-pin-code" type="password" maxlength="6" inputmode="numeric" placeholder="••••••" value="${esc((me&&me.pin)||'')}" style="padding:11px;border-radius:12px;border:1.5px solid var(--border);background:var(--surface2);width:100%">
          </div>

          <div class="settings-row">
            <div>
              <div class="s-label">قفل تلقائي عند فتح التطبيق</div>
              <div class="s-desc">المطالبة برمز PIN دائماً عند إعادة فتح أو تحميل الصفحة</div>
            </div>
            <label class="switch"><input type="checkbox" id="st-autolock" ${s.autoLock?'checked':''}><span class="slider"></span></label>
          </div>
        </div>

        <div class="settings-group">
          <h4>👥 إدارة المستخدمين والصلاحيات</h4>
          <p class="muted" style="margin-bottom:12px;font-size:13px">
            إضافة مستخدمين متعددين (مدير، محاسب، كاشير، مراقب) مع تخصيص الصلاحيات بدقة.
          </p>
          <button class="btn soft block" onclick="location.hash='#/users'">👥 فتح إدارة المستخدمين والصلاحيات</button>
        </div>
      </div>
    `;
  }

  if (tab === 'system') {
    return `
      <div class="grid grid-2">
        <div class="settings-group">
          <h4>📁 إدارة التصنيفات المخصصة</h4>
          <div style="display:flex;gap:8px;margin-bottom:12px">
            <input id="cat-new" placeholder="اسم تصنيف جديد..." style="flex:1;padding:11px;border-radius:12px;border:1.5px solid var(--border);background:var(--surface2)">
            <button class="btn primary" id="cat-add">＋ إضافة</button>
          </div>
          <div id="cat-list">
            ${store.list('categories').map(c=>`
              <div class="settings-row">
                <span>🗂️ ${esc(c.name)}</span>
                <button class="btn sm ghost" data-cat-del="${c.id}">🗑️</button>
              </div>
            `).join('') || '<div class="muted" style="padding:10px 0">لا توجد تصنيفات مخصصة</div>'}
          </div>
        </div>

        <div class="settings-group" style="border:1.5px solid var(--danger-soft)">
          <h4 style="color:var(--danger)">⚠️ منطقة الخطر</h4>
          <p class="muted" style="margin-bottom:12px;font-size:13px">
            حذف كافة السجلات والعمليات والحسابات للبدء من جديد مع الاحتفاظ ببيانات المؤسسة والمستخدمين.
          </p>
          <button class="btn danger block" id="st-reset">🗑️ إعادة تعيين ومسح بيانات العمليات</button>
        </div>
      </div>
    `;
  }

  return '';
}

function bindTabEvents(tab, container, params, state, s, me) {
  const setIf = (id, key) => {
    const el = $('#' + id, container);
    if (el) el.addEventListener('change', (e) => store.setSetting(key, e.target.value));
  };

  if (tab === 'biz') {
    setIf('st-biz', 'businessName');
    setIf('st-addr', 'address');
    setIf('st-phone', 'phone');
    setIf('st-manager', 'managerName');

    const logoInput = $('#st-logo', container);
    if (logoInput) {
      logoInput.addEventListener('change', async (e) => {
        const f = e.target.files[0];
        if (!f) return;
        try {
          const data = await handleAttachment(f, true);
          if (!data) throw new Error('empty logo');
          await store.setSetting('logo', data);
          toast('تم حفظ الشعار بنجاح ✅ وسيظهر في السندات والإشعارات');
          render(container, params, state);
        } catch (err) {
          toastErr('تعذّر قراءة الشعار؛ يرجى اختيار ملف صورة صالح');
        }
      });
    }

    const removeLogo = $('#st-logo-remove', container);
    if (removeLogo) {
      removeLogo.onclick = async () => {
        const ok = await confirmDialog({
          title: 'حذف شعار المؤسسة',
          message: 'سيُحذف الشعار المحفوظ وستستخدم السندات والإشعارات الترويسة النصية الافتراضية. متابعة؟',
          danger: true,
          confirmText: 'حذف الشعار',
        });
        if (!ok) return;
        await store.setSetting('logo', '');
        toast('تم حذف الشعار');
        render(container, params, state);
      };
    }
  }

  if (tab === 'sales') {
    const fullBtn = $('#btn-open-full-sales', container);
    if (fullBtn) fullBtn.onclick = () => openSalesSettingsModal(container, params, state);

    setIf('st-notif-channel', 'notificationChannel');
    setIf('st-wa-type', 'whatsappType');
    setIf('st-inv-footer', 'invoiceFooter');
    setIf('st-inv-notes', 'defaultVoucherNotes');
    setIf('st-default-op', 'defaultOp');

    const autoSend = $('#st-auto-send', container);
    if (autoSend) autoSend.addEventListener('change', (e) => store.setSetting('autoSendNotification', e.target.checked));
  }

  if (tab === 'notif') {
    const reqNotifBtn = $('#btn-request-notif', container);
    if (reqNotifBtn) {
      reqNotifBtn.onclick = async () => {
        const ok = await requestNotificationPermission();
        if (ok) render(container, params, state);
      };
    }

    const testSleepBtn = $('#btn-test-sleep-notif', container);
    if (testSleepBtn) {
      testSleepBtn.onclick = async () => {
        await testSleepModePushNotification(4);
      };
    }

    const testBtn = $('#btn-test-notif', container);
    if (testBtn) {
      testBtn.onclick = async () => {
        if (getNotificationPermission() !== 'granted') {
          const ok = await requestNotificationPermission();
          if (!ok) {
            toast('يرجى السماح بإذن الإشعارات من إعدادات المتصفح أولاً', 'warn');
            return;
          }
        }
        const sent = await sendSystemNotification('🔔 إشعار تجريبي من نظام الحسابات', {
          body: 'تم استلام الإشعار بنجاح مع شعار المؤسسة! التطبيق جاهز لإرسال تنبيهات المبيعات والنسخ.',
          tag: 'test-notification-' + Date.now(),
        });
        if (sent) toast('تم إرسال الإشعار التجريبي لشريط التنبيهات بنجاح 🟢');
      };
    }

    const auditBtn = $('#btn-audit-stock', container);
    if (auditBtn) {
      auditBtn.onclick = async () => {
        toast('جاري فحص المخزون والعمليات والأصناف الراكدة...');
        await runInventoryAndSalesAudit(true);
        toast('اكتمل فحص المخزون والعمليات ✅');
      };
    }

    const sleepSync = $('#st-notif-sleep-sync', container);
    if (sleepSync) {
      sleepSync.addEventListener('change', async (e) => {
        await store.setSetting('sleepSyncEnabled', e.target.checked);
        if (e.target.checked) {
          await registerBackgroundPeriodicSync();
          toast('تم تفعيل مزامنة وتنبيهات وضع السكون (Background Sync) 🌙');
        } else {
          toast('تم إيقاف مزامنة وضع السكون');
        }
      });
    }

    const autoBk = $('#st-notif-auto-bk', container);
    if (autoBk) autoBk.addEventListener('change', (e) => store.setSetting('autoBackupNotification', e.target.checked));

    const stockNotif = $('#st-notif-stock', container);
    if (stockNotif) stockNotif.addEventListener('change', (e) => store.setSetting('stockNotificationsEnabled', e.target.checked));

    const stagNotif = $('#st-notif-stagnant', container);
    if (stagNotif) stagNotif.addEventListener('change', (e) => store.setSetting('stagnantAlertsEnabled', e.target.checked));

    const stagDays = $('#st-stagnant-days', container);
    if (stagDays) {
      stagDays.addEventListener('change', async (e) => {
        await store.setSetting('stagnantDaysThreshold', Number(e.target.value));
        toast(`تم تحديث عتبة ركود الأصناف إلى ${e.target.value} يوماً ✅`);
      });
    }
  }

  if (tab === 'theme') {
    const themeEl = $('#st-theme', container);
    if (themeEl) {
      themeEl.addEventListener('change', (e) => {
        store.setSetting('theme', e.target.value);
        applyThemeFromSettings(e.target.value);
        toast('تم تحديث مظهر التطبيق');
      });
    }

    const hideBalEl = $('#st-hidebal', container);
    if (hideBalEl) {
      hideBalEl.addEventListener('change', (e) => {
        store.setSetting('hideBalances', e.target.checked);
        document.documentElement.dataset.hideBal = e.target.checked ? '1' : '0';
        toast(e.target.checked ? 'تم تفعيل إخفاء الأرصدة' : 'تم إظهار الأرصدة');
      });
    }
  }

  if (tab === 'security') {
    const pinEl = $('#st-pin', container);
    if (pinEl) {
      pinEl.addEventListener('change', (e) => {
        store.setSetting('pinEnabled', e.target.checked);
        if (e.target.checked && !(me && me.pin)) toast('أدخل رمز PIN في الحقل أدناه', 'warn');
      });
    }

    const pinCodeEl = $('#st-pin-code', container);
    if (pinCodeEl) {
      pinCodeEl.addEventListener('change', async (e) => {
        const pin = e.target.value.trim();
        if (me) { me.pin = pin; await store.save('users', me, { noActivity: true }); }
        store.setSetting('pinEnabled', true);
        toast(pin ? 'تم تعيين رمز PIN' : 'تم إزالة رمز PIN');
      });
    }

    const autoLockEl = $('#st-autolock', container);
    if (autoLockEl) autoLockEl.addEventListener('change', (e) => store.setSetting('autoLock', e.target.checked));
  }

  if (tab === 'system') {
    const catAddBtn = $('#cat-add', container);
    if (catAddBtn) {
      catAddBtn.onclick = async () => {
        const v = $('#cat-new', container).value.trim();
        if (!v) return;
        await store.create('categories', { name: v, createdAt: new Date().toISOString() });
        $('#cat-new', container).value = '';
        toast('تمت إضافة التصنيف');
        render(container, params, state);
      };
    }

    container.addEventListener('click', async (e) => {
      const d = e.target.closest('[data-cat-del]');
      if (d) {
        await store.remove('categories', d.dataset.catDel);
        render(container, params, state);
      }
    });

    const resetBtn = $('#st-reset', container);
    if (resetBtn) {
      resetBtn.onclick = async () => {
        const ok = await confirmDialog({
          title: '⚠️ إعادة تعيين بيانات العمليات',
          message: 'سيتم حذف كل الحسابات والعمليات والسندات والأصناف نهائياً. هذا الإجراء لا يمكن التراجع عنه!',
          danger: true,
          confirmText: 'حذف كل شيء',
        });
        if (!ok) return;
        await dbClear('accounts');
        await dbClear('transactions');
        await dbClear('transactionItems');
        await dbClear('vouchers');
        await dbClear('items');
        await dbClear('categories');
        await dbClear('conversations');
        await dbClear('messages');
        await dbClear('backups');
        await dbClear('activity');
        await store.load();
        toast('تمت إعادة تعيين البيانات بنجاح');
        render(container, params, state);
      };
    }
  }
}

// نافذة مخصصة وشاملة لإعدادات قسم المبيعات ونقاط البيع والفواتير
export function openSalesSettingsModal(container, params, state) {
  const s = store.settings();

  const m = openModal({
    title: '🛒 إعدادات قسم المبيعات ونقاط البيع والفواتير',
    cls: 'lg',
    body: `
      <div class="settings-group" style="margin-bottom:14px">
        <h4 style="color:var(--primary);font-size:15px">📱 قنوات الإرسال وإشعارات الفواتير للعملاء</h4>
        
        <div class="settings-row">
          <div><div class="s-label">طريقة الإرسال الافتراضية</div><div class="s-desc">القناة المستخدمة لإشعار العميل فور حفظ عملية البيع أو السند</div></div>
          <select class="select" id="m-notif-channel">
            <option value="whatsapp" ${(s.notificationChannel||'whatsapp')==='whatsapp'?'selected':''}>🟢 واتساب (صورة السند + النص)</option>
            <option value="sms" ${s.notificationChannel==='sms'?'selected':''}>💬 رسائل نصية SMS (نص فقط)</option>
            <option value="share" ${s.notificationChannel==='share'?'selected':''}>📤 قائمة المشاركة العامة (Web Share)</option>
            <option value="manual" ${s.notificationChannel==='manual'?'selected':''}>⚙️ يدوي / عند الطلب فقط</option>
          </select>
        </div>

        <div class="settings-row" id="m-wa-type-row">
          <div><div class="s-label">تطبيق الواتساب المفضل</div><div class="s-desc">تحديد تطبيق الواتساب المستخدم على جهازك لفتح المحادثة فوراً</div></div>
          <select class="select" id="m-wa-type">
            <option value="regular" ${(s.whatsappType||'regular')==='regular'?'selected':''}>🟢 واتساب ماسنجر (العادي)</option>
            <option value="business" ${s.whatsappType==='business'?'selected':''}>💼 واتساب للأعمال (WhatsApp Business)</option>
            <option value="web" ${s.whatsappType==='web'?'selected':''}>🌐 رابط واتساب المباشر (wa.me)</option>
          </select>
        </div>

        <div class="settings-row">
          <div><div class="s-label">توجيه تلقائي فور تسجيل البيع</div><div class="s-desc">فتح محادثة العميل فوراً بعد حفظ الفاتورة</div></div>
          <label class="switch"><input type="checkbox" id="m-auto-send" ${s.autoSendNotification!==false?'checked':''}><span class="slider"></span></label>
        </div>
      </div>

      <div class="settings-group" style="margin-bottom:14px">
        <h4 style="color:var(--primary);font-size:15px">🛍️ إعدادات شاشة نقطة البيع (POS) والمخزون</h4>
        
        <div class="settings-row">
          <div><div class="s-label">التنبيه عند نقص المخزون أثناء البيع</div><div class="s-desc">تحذير الكاشير إذا كانت الكمية المباعة تفوق المخزون الحالي</div></div>
          <label class="switch"><input type="checkbox" id="m-warn-stock" ${s.warnLowStock!==false?'checked':''}><span class="slider"></span></label>
        </div>

        <div class="settings-row">
          <div><div class="s-label">إظهار رصيد المخزون في بطاقة الصنف</div><div class="s-desc">عرض الكمية المتوفرة على بطاقات الأصناف بشاشة البيع</div></div>
          <label class="switch"><input type="checkbox" id="m-show-item-qty" ${s.showItemQty!==false?'checked':''}><span class="slider"></span></label>
        </div>

        <div class="settings-row">
          <div><div class="s-label">السماح بتعديل سعر البيع يدوياً</div><div class="s-desc">إمكانية تغيير سعر الصنف أثناء إضافة البند في الفاتورة</div></div>
          <label class="switch"><input type="checkbox" id="m-allow-price-edit" ${s.allowCustomPrice!==false?'checked':''}><span class="slider"></span></label>
        </div>
      </div>

      <div class="settings-group" style="margin-bottom:14px">
        <h4 style="color:var(--primary);font-size:15px">🧾 ترويسة وتذييل الفاتورة والسند</h4>
        <div class="field"><label>نص تذييل الفاتورة / السند المطبوع</label>
          <input id="m-invoice-footer" value="${esc(s.invoiceFooter || 'شكراً لتعاملكم معنا - نتمنى لكم أطيب الأوقات')}" placeholder="نص الشكر في أسفل السند" style="width:100%;padding:10px;border-radius:10px;border:1.5px solid var(--border);background:var(--surface2)">
        </div>
        <div class="field" style="margin-top:10px"><label>ملاحظات افتراضية في السند</label>
          <input id="m-default-notes" value="${esc(s.defaultVoucherNotes || '')}" placeholder="مثال: البضاعة المباعة لا ترد بعد 3 أيام" style="width:100%;padding:10px;border-radius:10px;border:1.5px solid var(--border);background:var(--surface2)">
        </div>
      </div>
    `,
    foot: `<button class="btn ghost" data-close>إغلاق</button><button class="btn primary" id="m-save-sales-settings">💾 حفظ الإعدادات</button>`,
  });

  const notifChanEl = $('#m-notif-channel', m.overlay);
  const waTypeRow = $('#m-wa-type-row', m.overlay);
  if (notifChanEl && waTypeRow) {
    const syncWaRow = () => { waTypeRow.style.display = notifChanEl.value === 'whatsapp' ? '' : 'none'; };
    notifChanEl.addEventListener('change', syncWaRow);
    syncWaRow();
  }

  $('#m-save-sales-settings', m.overlay).onclick = async () => {
    const channel = $('#m-notif-channel', m.overlay).value;
    const waType = $('#m-wa-type', m.overlay).value;
    const autoSend = $('#m-auto-send', m.overlay).checked;
    const warnStock = $('#m-warn-stock', m.overlay).checked;
    const showQty = $('#m-show-item-qty', m.overlay).checked;
    const allowPrice = $('#m-allow-price-edit', m.overlay).checked;
    const footer = $('#m-invoice-footer', m.overlay).value.trim();
    const notes = $('#m-default-notes', m.overlay).value.trim();

    await store.setSetting('notificationChannel', channel);
    await store.setSetting('whatsappType', waType);
    await store.setSetting('autoSendNotification', autoSend);
    await store.setSetting('warnLowStock', warnStock);
    await store.setSetting('showItemQty', showQty);
    await store.setSetting('allowCustomPrice', allowPrice);
    await store.setSetting('invoiceFooter', footer);
    await store.setSetting('defaultVoucherNotes', notes);

    toast('تم حفظ كافة إعدادات المبيعات بنجاح ✅');
    m.close();
    if (container) render(container, params, state);
  };
}

function applyThemeFromSettings(theme) {
  const t = theme === 'system' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : theme;
  document.documentElement.dataset.theme = t;
}
