// النسخ الاحتياطي والاستعادة والتصدير/الاستيراد
import { $, $$, esc, fmt, uid, todayISO, nowStamp, downloadFile } from '../utils.js';
import { store } from '../store.js';
import { toast, toastErr, confirmDialog } from '../components.js';
import { exportAllData, importAllData, resetAllData, dbGetAll, dbSize } from '../db.js';

export function render(container, params, state) {
  const backups = store.list('backups');
  const settings = store.settings();
  const est = dbSize();

  container.innerHTML = `
    <div class="view-head">
      <div><div class="view-title">النسخ الاحتياطي 💾</div><small>حماية بياناتك — محلياً أو بتصدير ملف</small></div>
    </div>
    <div class="grid grid-2">
      <div class="card">
        <div class="section-title">نسخة احتياطية محلية</div>
        <p class="muted" style="margin-bottom:14px">إنشاء نسخة كاملة من كل بياناتك (الحسابات، العمليات، السندات، الإعدادات).</p>
        <button class="btn primary block big" data-backup>⬇️ إنشاء نسخة احتياطية الآن</button>
        <div class="divider"></div>
        <div class="section-title">استعادة نسخة</div>
        <p class="muted" style="margin-bottom:14px">استرجاع نسخة محفوظة مسبقاً. <b style="color:var(--danger)">سيتم استبدال البيانات الحالية!</b></p>
        <select class="select" id="bk-list" style="width:100%;margin-bottom:10px">
          <option value="">— اختر نسخة احتياطية —</option>
          ${backups.map(b => `<option value="${b.id}">${esc(b.name)} — ${esc(b.date)}</option>`).join('')}
        </select>
        <button class="btn danger block" data-restore>↩️ استعادة النسخة المختارة</button>
      </div>
      <div class="card">
        <div class="section-title">تصدير / استيراد قاعدة البيانات</div>
        <p class="muted" style="margin-bottom:14px">تصدير ملف JSON يحتوي كل بياناتك لاستخدامه في أي جهاز، أو استيراده هنا.</p>
        <button class="btn soft block" data-export>📤 تصدير قاعدة البيانات (JSON)</button>
        <div class="divider"></div>
        <label class="btn ghost block" style="cursor:pointer">📥 استيراد ملف JSON
          <input type="file" id="import-file" accept=".json" style="display:none">
        </label>
        <div class="divider"></div>
        <div class="section-title">النسخ الاحتياطي التلقائي</div>
        <label class="chk" style="margin-bottom:8px"><input type="checkbox" id="auto-bk" ${settings.autoBackup ? 'checked' : ''}> تفعيل نسخ احتياطي تلقائي</label>
        <div class="field"><label>الموقع</label><select id="bk-loc" class="select" style="width:100%">
          <option value="local" ${settings.autoBackupLoc !== 'drive' ? 'selected' : ''}>محلياً داخل التطبيق</option>
          <option value="drive" ${settings.autoBackupLoc === 'drive' ? 'selected' : ''}>Google Drive (عند التوفر)</option>
        </select></div>
        <p class="hint" style="font-size:12px;color:var(--text3);margin-top:6px">يتم إنشاء نسخة تلقائياً عند فتح التطبيق كل يوم (إن كان هناك تغييرات).</p>
      </div>
    </div>
    <div class="card" style="margin-top:16px">
      <div class="section-title">سجل النسخ الاحتياطية</div>
      ${backups.length ? `<div class="table-wrap"><table class="tbl"><thead><tr><th>الاسم</th><th>التاريخ</th><th>الحجم</th><th>النوع</th><th></th></tr></thead><tbody>
        ${backups.map(b => `<tr><td><b>${esc(b.name)}</b></td><td>${esc(b.date)}</td><td>${esc(b.size || '—')}</td><td><span class="pill teal">${esc(b.type || 'تلقائي')}</span></td>
        <td><button class="btn sm soft" data-del-bk="${b.id}">🗑️</button></td></tr>`).join('')}
      </tbody></table></div>` : '<div class="muted">لا توجد نسخ احتياطية بعد</div>'}
    </div>
  `;

  // الحجم
  est.then(bytes => { if (bytes) container.querySelector('.muted b').textContent = ' (' + (bytes/1024).toFixed(1) + ' KB)'; });

  container.addEventListener('click', async (e) => {
    if (e.target.closest('[data-backup]')) await doBackup();
    if (e.target.closest('[data-restore]')) await doRestore();
    if (e.target.closest('[data-export]')) await doExport();
    if (e.target.closest('[data-del-bk]')) {
      const id = e.target.closest('[data-del-bk]').dataset.delBk;
      await store.remove('backups', id);
      render(container, params, state);
    }
  });

  $('#auto-bk', container).addEventListener('change', (e) => {
    store.setSetting('autoBackup', e.target.checked);
    toast('تم تحديث إعداد النسخ التلقائي');
  });
  $('#bk-loc', container).addEventListener('change', (e) => {
    store.setSetting('autoBackupLoc', e.target.value);
    toast('تم تحديث موقع النسخ التلقائي');
  });
  const fileInput = $('#import-file', container);
  fileInput.addEventListener('change', async () => {
    const f = fileInput.files[0];
    if (!f) return;
    try {
      const text = await f.text();
      const payload = JSON.parse(text);
      const ok = await confirmDialog({ title: '⚠️ تحذير', message: 'سيتم استبدال كل البيانات الحالية بالبيانات المستوردة. لا يمكن التراجع!', danger: true, confirmText: 'استيراد الآن' });
      if (!ok) { fileInput.value=''; return; }
      await importAllData(payload);
      await store.load();
      toast('تم استيراد البيانات بنجاح ✅');
      render(container, params, state);
    } catch (err) {
      toastErr('ملف غير صالح أو تعذّر الاستيراد');
    }
    fileInput.value = '';
  });
}

async function doBackup() {
  const data = await exportAllData();
  const name = 'نسخة ' + todayISO() + ' ' + new Date().toTimeString().slice(0,5);
  const rec = {
    id: uid('bk'),
    name,
    date: new Date().toLocaleString('ar-EG-u-ca-gregory-nu-latn'),
    size: (JSON.stringify(data).length/1024).toFixed(1) + ' KB',
    type: 'يدوي',
    data,
    createdAt: new Date().toISOString(),
  };
  await store.create('backups', rec, { noActivity: true });
  toast('تم إنشاء النسخة الاحتياطية ✅');
}

async function doRestore() {
  const sel = $('#bk-list', container).value;
  if (!sel) { toastErr('اختر نسخة احتياطية أولاً'); return; }
  const bk = store.get('backups', sel);
  if (!bk || !bk.data) { toastErr('نسخة غير صالحة'); return; }
  const ok = await confirmDialog({ title: '⚠️ استعادة نسخة', message: 'سيتم استبدال البيانات الحالية ببيانات النسخة المختارة. متابعة؟', danger: true });
  if (!ok) return;
  await importAllData(bk.data);
  await store.load();
  toast('تمت الاستعادة بنجاح ✅');
}

async function doExport() {
  const data = await exportAllData();
  downloadFile('nexora-backup-' + todayISO() + '.json', JSON.stringify(data), 'application/json');
  toast('تم تصدير قاعدة البيانات ✅');
}
