// النسخ الاحتياطي والاستعادة والتصدير/الاستيراد والتكامل مع Google Drive
import { $, $$, esc, fmt, uid, todayISO, nowStamp, downloadFile } from '../utils.js';
import { store } from '../store.js';
import { toast, toastErr, confirmDialog } from '../components.js';
import { exportAllData, importAllData, resetAllData, dbGetAll, dbSize } from '../db.js';
import {
  authenticateGoogleAccount,
  disconnectGoogleAccount,
  getSavedGoogleAccount,
  uploadOrUpdateDriveBackup,
  downloadDriveBackup,
  prepareBackupPayload,
  BACKUP_FILE_NAME
} from '../drive.js';

export function render(container, params, state) {
  const backups = store.list('backups');
  const settings = store.settings();
  const est = dbSize();
  const googleAcc = getSavedGoogleAccount();
  const lastCloud = settings.lastCloudBackup;

  container.innerHTML = `
    <div class="view-head">
      <div>
        <div class="view-title">النسخ الاحتياطي والمزامنة السحابية 💾</div>
        <small>حماية بياناتك وأرشفتها — سحابياً عبر Google Drive أو محلياً</small>
      </div>
    </div>

    <!-- البطاقة السحابية المميزة: Google Drive Backup Hub -->
    <div class="card" style="border:2px solid ${googleAcc ? 'var(--primary)' : 'var(--border)'};background:linear-gradient(180deg,var(--surface),var(--surface2));margin-bottom:18px;position:relative;overflow:hidden">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:14px;flex-wrap:wrap;margin-bottom:14px">
        <div style="display:flex;align-items:center;gap:14px">
          <div style="width:52px;height:52px;border-radius:16px;background:var(--surface);border:1.5px solid var(--border);display:flex;align-items:center;justify-content:center;box-shadow:var(--shadow)">
            <svg width="32" height="32" viewBox="0 0 87.3 78" xmlns="http://www.w3.org/2000/svg">
              <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8H0c0 1.55.4 3.1 1.2 4.5z" fill="#0066da"/>
              <path d="M43.65 25 29.9 1.2c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44C.4 50 0 51.55 0 53.1h27.5z" fill="#00ac47"/>
              <path d="M73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5H59.8l5.85 10.1z" fill="#ea4335"/>
              <path d="M43.65 25 57.4 1.2C56.05.4 54.5 0 52.9 0H34.4c-1.6 0-3.15.4-4.5 1.2z" fill="#00832d"/>
              <path d="M59.8 53.1H27.5L13.75 76.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.4 4.5-1.2z" fill="#2684fc"/>
              <path d="M73.4 26.5 60.7 4.5c-.8-1.4-1.95-2.5-3.3-3.3L43.65 25l16.15 28.1h27.5c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00"/>
            </svg>
          </div>
          <div>
            <h3 style="font-size:17px;font-weight:800;color:var(--text);margin:0;display:flex;align-items:center;gap:8px">
              النسخ الاحتياطي السحابي عبر Google Drive
              ${googleAcc ? '<span class="pill green" style="font-size:12px">🟢 متصل ومفعّل</span>' : '<span class="pill gray" style="font-size:12px">غير مربوط</span>'}
            </h3>
            <small style="color:var(--text2);font-size:13px">حساب Google واحد يتم ربطه بالكامل بالمؤسسة لتخزين وتحديث نسخة موحدة تلقائياً أو يدوياً</small>
          </div>
        </div>

        <div id="drive-auth-actions" style="display:flex;gap:8px;align-items:center">
          ${googleAcc ? `
            <button class="btn danger sm" id="btn-disconnect-drive">🔌 فك ربط الحساب</button>
            <button class="btn primary sm" id="btn-sync-drive-now">☁️ مزامنة فورية الآن</button>
          ` : `
            <button class="btn primary big" id="btn-connect-drive" style="gap:10px">
              <svg width="20" height="20" viewBox="0 0 48 48">
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
              </svg>
              <span>ربط ومصادقة حساب Google</span>
            </button>
          `}
        </div>
      </div>

      ${googleAcc ? `
        <div style="background:var(--surface);border-radius:14px;border:1px solid var(--border);padding:14px 18px;margin-bottom:14px">
          <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px">
            <div style="display:flex;align-items:center;gap:12px">
              ${googleAcc.picture ? `<img src="${esc(googleAcc.picture)}" style="width:42px;height:42px;border-radius:50%;border:2px solid var(--primary)">` : '<div style="width:42px;height:42px;border-radius:50%;background:var(--primary-soft);color:var(--primary);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:18px">G</div>'}
              <div>
                <b style="font-size:15px;color:var(--text);display:block">${esc(googleAcc.name || 'حساب Google')}</b>
                <span style="font-size:13px;color:var(--text2)">${esc(googleAcc.email || '')}</span>
              </div>
            </div>
            <div style="text-align:left">
              <div style="font-size:12px;color:var(--text3)">اسم الملف الموحد في السحابة:</div>
              <code style="font-size:12px;color:var(--primary);background:var(--surface2);padding:3px 8px;border-radius:6px;font-weight:700">${BACKUP_FILE_NAME}</code>
            </div>
          </div>
        </div>

        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px;margin-bottom:12px">
          <div style="background:var(--surface2);border-radius:12px;padding:12px 14px;border:1px solid var(--border)">
            <div style="font-size:12.5px;color:var(--text2);margin-bottom:4px">🕒 آخر مزامنة سحابية ناجحة:</div>
            <b style="font-size:14px;color:var(--text)">${lastCloud ? esc(lastCloud.date) : 'لم تتم المزامنة بعد'}</b>
            ${lastCloud ? `<small style="display:block;color:var(--text3);margin-top:2px">الحجم: ${esc(lastCloud.size)}</small>` : ''}
          </div>
          <div style="background:var(--surface2);border-radius:12px;padding:12px 14px;border:1px solid var(--border)">
            <div style="font-size:12.5px;color:var(--text2);margin-bottom:4px">🛡️ وضع حماية البيانات:</div>
            <b style="font-size:14px;color:var(--green)">شامل كل البيانات والصور (توليد السندات ديناميكياً)</b>
          </div>
        </div>

        <div style="display:flex;gap:10px;flex-wrap:wrap">
          <button class="btn soft" id="btn-cloud-upload-now" style="flex:1">☁️ رفع وتحديث النسخة السحابية الآن</button>
          <button class="btn outline" id="btn-cloud-restore-now" style="flex:1">↩️ فحص واستعادة النسخة من Google Drive</button>
        </div>
      ` : `
        <div style="background:var(--accent-soft);border-radius:12px;padding:14px;border:1px solid color-mix(in srgb,var(--accent) 25%,transparent);color:var(--text)">
          <div style="display:flex;gap:10px;align-items:flex-start">
            <span style="font-size:22px">💡</span>
            <div>
              <b>ميزة النسخ الاحتياطي السحابي عبر حسابك الشخصي في Google:</b>
              <p style="font-size:13px;color:var(--text2);margin-top:4px">
                يمكن لكل مستخدم ومؤسسة ربط حساب Google الخاص بها. يتم تخزين وتحديث ملف نسخة احتياطية واحد موحد ومحدث دائماً في مساحة الـ Drive الخاصة بك، مع إمكانية التبديل أو الحذف في أي وقت بأمان تام.
              </p>
            </div>
          </div>
        </div>
      `}
    </div>

    <!-- شبكة النسخ المحلي والتصدير -->
    <div class="grid grid-2">
      <!-- 1. النسخ الاحتياطي المحلي -->
      <div class="card">
        <div class="section-title">نسخة احتياطية محلية (على هذا الجهاز)</div>
        <p class="muted" style="margin-bottom:14px">إنشاء وحفظ نسخة كاملة سريعة في متصفحك أو جهازك الحالي. <span id="bk-size"></span></p>
        <button class="btn primary block big" data-backup>⬇️ إنشاء نسخة محلية فورية</button>
        
        <div class="divider"></div>
        
        <div class="section-title">استعادة نسخة محلية سابقة</div>
        <p class="muted" style="margin-bottom:14px">استرجاع نسخة محفوظة مسبقاً. <b style="color:var(--danger)">سيتم استبدال البيانات الحالية!</b></p>
        <select class="select" id="bk-list" style="width:100%;margin-bottom:10px">
          <option value="">— اختر نسخة احتياطية من السجل —</option>
          ${backups.map(b => `<option value="${b.id}">${esc(b.name)} — ${esc(b.date)} (${esc(b.size || '')})</option>`).join('')}
        </select>
        <button class="btn danger block" data-restore>↩️ استعادة النسخة المختارة</button>
      </div>

      <!-- 2. التصدير والاستيراد والتلقائي -->
      <div class="card">
        <div class="section-title">تصدير / استيراد ملف خارجي</div>
        <p class="muted" style="margin-bottom:14px">تصدير ملف JSON يحتوي كل بياناتك لنقله لأي هاتف أو حاسوب آخر، أو استيراده هنا.</p>
        <button class="btn soft block" data-export>📤 تصدير قاعدة البيانات كملف (JSON)</button>
        
        <div class="divider"></div>
        
        <label class="btn ghost block" style="cursor:pointer">📥 استيراد قاعدة بيانات من ملف خارجي
          <input type="file" id="import-file" accept=".json" style="display:none">
        </label>
        
        <div class="divider"></div>
        
        <div class="section-title">إعدادات الجدولة والتلقائية</div>
        <label class="chk" style="margin-bottom:10px">
          <input type="checkbox" id="auto-bk" ${settings.autoBackup !== false ? 'checked' : ''}>
          <span>تفعيل النسخ الاحتياطي التلقائي عند تسجيل العمليات</span>
        </label>
        
        <div class="field">
          <label>الوجهة الافتراضية للنسخ التلقائي</label>
          <select id="bk-loc" class="select" style="width:100%">
            <option value="local" ${settings.autoBackupLoc !== 'drive' ? 'selected' : ''}>💻 محلياً داخل ذاكرة التطبيق</option>
            <option value="drive" ${settings.autoBackupLoc === 'drive' ? 'selected' : ''}>☁️ سحابياً إلى Google Drive (يوصى به)</option>
          </select>
        </div>
        <p class="hint" style="font-size:12px;color:var(--text3);margin-top:6px">
          💡 عند تفعيل النسخ السحابي، يتم تحديث الملف الموحد في Google Drive دورياً وعند فشل النسخ يتم إرسال إشعار وإعادة المحاولة بعد 15 دقيقة.
        </p>
      </div>
    </div>

    <!-- سجل النسخ المحفوظة -->
    <div class="card" style="margin-top:16px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
        <div class="section-title" style="margin-bottom:0">سجل النسخ الاحتياطية المحفوظة محلياً</div>
        <span class="tag">${backups.length} نسخة محفوظة</span>
      </div>
      ${backups.length ? `
        <div class="table-wrap">
          <table class="tbl">
            <thead>
              <tr>
                <th>الاسم</th>
                <th>التاريخ والوقت</th>
                <th>الحجم</th>
                <th>النوع</th>
                <th style="width:120px">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              ${backups.map(b => `
                <tr>
                  <td><b>${esc(b.name)}</b></td>
                  <td>${esc(b.date)}</td>
                  <td>${esc(b.size || '—')}</td>
                  <td><span class="pill ${b.type === 'تلقائي' ? 'teal' : 'blue'}">${esc(b.type || 'تلقائي')}</span></td>
                  <td>
                    <button class="btn sm soft" data-download-bk="${b.id}" title="تنزيل كملف">📥</button>
                    <button class="btn sm danger" data-del-bk="${b.id}" title="حذف">🗑️</button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      ` : '<div class="muted" style="text-align:center;padding:24px 0">لا توجد نسخ احتياطية محفوظة بعد — قم بإنشاء أول نسخة الآن لحماية بياناتك.</div>'}
    </div>
  `;

  // الحجم التقديري
  est.then(bytes => {
    const size = $('#bk-size', container);
    if (size && bytes) size.textContent = `(حجم البيانات الحالي: ${(bytes/1024).toFixed(1)} KB)`;
  });

  // أحداث المصادقة مع Google Drive
  const btnConnect = $('#btn-connect-drive', container);
  if (btnConnect) {
    btnConnect.onclick = async () => {
      btnConnect.disabled = true;
      btnConnect.innerHTML = 'جاري الاتصال بـ Google... ⏳';
      try {
        const result = await authenticateGoogleAccount(true);
        toast(`تم ربط حساب Google (${result.user.name || result.user.email}) بنجاح ✅`);
        render(container, params, state);
      } catch (err) {
        toastErr(`تعذر ربط حساب Google: ${err.message || err}`);
        btnConnect.disabled = false;
        btnConnect.innerHTML = 'ربط ومصادقة حساب Google';
      }
    };
  }

  const btnDisconnect = $('#btn-disconnect-drive', container);
  if (btnDisconnect) {
    btnDisconnect.onclick = async () => {
      const ok = await confirmDialog({
        title: '🔌 فك ربط حساب Google Drive',
        message: 'هل أنت متأكد من رغبتك في إزالة حساب Google الحالي؟ لن يتم حذف أي ملفات في Google Drive.',
        danger: true,
        confirmText: 'فك الربط الآن',
      });
      if (!ok) return;
      await disconnectGoogleAccount();
      toast('تم فك ربط حساب Google بنجاح');
      render(container, params, state);
    };
  }

  // مزامنة ورفع فوري إلى Google Drive
  const handleDriveUpload = async (btn) => {
    if (btn) { btn.disabled = true; btn.innerHTML = 'جاري المزامنة مع Drive... ⏳'; }
    try {
      const summary = await uploadOrUpdateDriveBackup();
      toast(`تمت المزامنة بنجاح وحفظ الملف الموحد (${summary.size}) على Google Drive ✅`);
      render(container, params, state);
    } catch (err) {
      console.error('Drive upload failed:', err);
      toastErr(`فشل الرفع إلى Google Drive: ${err.message || 'حدث خطأ غير متوقع'}`);
      if (btn) { btn.disabled = false; btn.innerHTML = '☁️ مزامنة فورية الآن'; }
    }
  };

  const btnSyncNow = $('#btn-sync-drive-now', container);
  if (btnSyncNow) btnSyncNow.onclick = () => handleDriveUpload(btnSyncNow);

  const btnCloudUpload = $('#btn-cloud-upload-now', container);
  if (btnCloudUpload) btnCloudUpload.onclick = () => handleDriveUpload(btnCloudUpload);

  // استعادة من Google Drive
  const btnCloudRestore = $('#btn-cloud-restore-now', container);
  if (btnCloudRestore) {
    btnCloudRestore.onclick = async () => {
      btnCloudRestore.disabled = true;
      btnCloudRestore.innerHTML = 'جاري فحص Google Drive... ⏳';
      try {
        const { file, data } = await downloadDriveBackup();
        const modDate = file.modifiedTime ? new Date(file.modifiedTime).toLocaleString('ar-EG-u-ca-gregory-nu-latn') : 'غير محدد';
        const ok = await confirmDialog({
          title: '⚠️ استعادة من Google Drive',
          message: `تم العثور على النسخة السحابية الموحدة (${file.name}) بتاريخ ${modDate}.\n\nتحذير: سيتم استبدال البيانات المحلية الحالية بالبيانات السحابية بالكامل. هل ترغب بالمتابعة؟`,
          danger: true,
          confirmText: 'استعادة واستبدال البيانات',
        });
        if (!ok) {
          btnCloudRestore.disabled = false;
          btnCloudRestore.innerHTML = '↩️ فحص واستعادة النسخة من Google Drive';
          return;
        }

        await importAllData(data);
        await store.load();
        toast('تم استرجاع ومزامنة البيانات من Google Drive بنجاح ✅');
        render(container, params, state);
      } catch (err) {
        toastErr(`تعذرت استعادة النسخة السحابية: ${err.message}`);
        btnCloudRestore.disabled = false;
        btnCloudRestore.innerHTML = '↩️ فحص واستعادة النسخة من Google Drive';
      }
    };
  }

  // أحداث النسخ والاستعادة المحلية والتصدير
  container.addEventListener('click', async (e) => {
    if (e.target.closest('[data-backup]')) await doBackup(container, params, state);
    if (e.target.closest('[data-restore]')) await doRestore(container, params, state);
    if (e.target.closest('[data-export]')) await doExport();
    
    // تنزيل نسخة مسجلة كملف
    const dlBtn = e.target.closest('[data-download-bk]');
    if (dlBtn) {
      const id = dlBtn.dataset.downloadBk;
      const bk = store.get('backups', id);
      if (bk && bk.data) {
        downloadFile(`${bk.name.replace(/\s+/g, '_')}.json`, JSON.stringify(bk.data, null, 2), 'application/json');
        toast('تم بدء تنزيل النسخة');
      }
    }

    // حذف نسخة محلية
    const delBtn = e.target.closest('[data-del-bk]');
    if (delBtn) {
      const id = delBtn.dataset.delBk;
      const ok = await confirmDialog({
        title: 'حذف نسخة احتياطية',
        message: 'هل أنت متأكد من حذف هذه النسخة من السجل المحلي؟',
        danger: true,
        confirmText: 'حذف',
      });
      if (!ok) return;
      await store.remove('backups', id);
      toast('تم حذف النسخة من السجل');
      render(container, params, state);
    }
  });

  $('#auto-bk', container).addEventListener('change', async (e) => {
    await store.setSetting('autoBackup', e.target.checked);
    toast('تم تحديث إعداد النسخ التلقائي');
  });

  $('#bk-loc', container).addEventListener('change', async (e) => {
    await store.setSetting('autoBackupLoc', e.target.value);
    if (e.target.value === 'drive' && !getSavedGoogleAccount()) {
      toast('يرجى ربط حساب Google أولاً لتمكين النسخ السحابي التلقائي', 'warn');
    } else {
      toast('تم تحديث الوجهة الافتراضية للنسخ');
    }
  });

  const fileInput = $('#import-file', container);
  fileInput.addEventListener('change', async () => {
    const f = fileInput.files[0];
    if (!f) return;
    try {
      const text = await f.text();
      const payload = JSON.parse(text);
      const ok = await confirmDialog({
        title: '⚠️ تحذير استيراد ملف خارجي',
        message: 'سيتم استبدال كل البيانات الحالية بالبيانات المستوردة من هذا الملف. لا يمكن التراجع عن هذا الإجراء!',
        danger: true,
        confirmText: 'استيراد واستبدال الآن'
      });
      if (!ok) { fileInput.value = ''; return; }
      await importAllData(payload);
      await store.load();
      toast('تم استيراد البيانات بنجاح ✅');
      render(container, params, state);
    } catch (err) {
      toastErr('ملف غير صالح أو تعذّر الاستيراد: ' + (err.message || ''));
    }
    fileInput.value = '';
  });
}

async function doBackup(container, params, state) {
  const data = await prepareBackupPayload();
  const now = new Date();
  const name = `نسخة يدوية ${todayISO()} ${now.toTimeString().slice(0, 5)}`;
  const rawStr = JSON.stringify(data);
  const rec = {
    id: uid('bk'),
    name,
    date: now.toLocaleString('ar-EG-u-ca-gregory-nu-latn'),
    size: (rawStr.length / 1024).toFixed(1) + ' KB',
    type: 'يدوي',
    data,
    createdAt: now.toISOString(),
  };
  await store.create('backups', rec, { noActivity: true });
  toast('تم إنشاء وحفظ النسخة الاحتياطية محلياً بنجاح ✅');
  if (container) render(container, params, state);
}

async function doRestore(container, params, state) {
  const sel = $('#bk-list', container).value;
  if (!sel) { toastErr('يرجى اختيار نسخة احتياطية من القائمة أولاً'); return; }
  const bk = store.get('backups', sel);
  if (!bk || !bk.data) { toastErr('النسخة المختارة غير صالحة أو تالفة'); return; }
  const ok = await confirmDialog({
    title: '⚠️ استعادة نسخة احتياطية',
    message: `سيتم استبدال البيانات الحالية بالكامل ببيانات "${bk.name}" (${bk.date}). متابعة؟`,
    danger: true,
    confirmText: 'استعادة وتطبيق البيانات'
  });
  if (!ok) return;
  await importAllData(bk.data);
  await store.load();
  toast('تمت استعادة البيانات بنجاح ✅');
  render(container, params, state);
}

async function doExport() {
  const data = await prepareBackupPayload();
  downloadFile(`edara-backup-${todayISO()}.json`, JSON.stringify(data, null, 2), 'application/json');
  toast('تم تصدير ملف قاعدة البيانات الكاملة بنجاح ✅');
}
