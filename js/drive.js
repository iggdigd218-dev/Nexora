// محرك التكامل والمزامنة الحقيقية مع Google Drive للنسخ الاحتياطي السحابي
import { store } from './store.js';
import { exportAllData, importAllData } from './db.js';
import { todayISO, uid } from './utils.js';

// معرّف ملف النسخة الاحتياطية الموحد الخاص بالتطبيق
export const BACKUP_FILE_NAME = 'edara_data_accounting_backup.json';
export const APP_FOLDER_NAME = 'إدارة البيانات - النسخ الاحتياطي';

// ذاكرة الوصول المؤقتة للرمز التعريفي (In-Memory Access Token Cache)
let inMemoryAccessToken = null;
let googleAccountInfo = null; // { name, email, picture, id }

// قراءة بيانات التكوين من ملف التطبيق
let firebaseConfigCache = null;
export async function getFirebaseConfig() {
  if (firebaseConfigCache) return firebaseConfigCache;
  try {
    const res = await fetch('./firebase-applet-config.json');
    if (res.ok) {
      firebaseConfigCache = await res.json();
      return firebaseConfigCache;
    }
  } catch (e) {
    console.warn('Failed to load firebase-applet-config.json', e);
  }
  return {
    oAuthClientId: '427793881806-heq9105s544ul68tqo2ha1t3fa5r43ci.apps.googleusercontent.com',
    projectId: 'gen-lang-client-0219241493',
  };
}

// استرجاع معلومات الحساب المحفوظة محلياً إن وجدت
export function getSavedGoogleAccount() {
  const st = store.settings();
  return st.googleDriveAccount || null;
}

// حفظ معلومات حساب جوجل المرتبط
export async function saveGoogleAccount(accInfo) {
  googleAccountInfo = accInfo;
  await store.setSetting('googleDriveAccount', accInfo);
}

// إزالة وفك ربط حساب جوجل
export async function disconnectGoogleAccount() {
  inMemoryAccessToken = null;
  googleAccountInfo = null;
  await store.setSetting('googleDriveAccount', null);
  await store.setSetting('googleDriveFileId', null);
  await store.setSetting('autoBackupLoc', 'local');
}

// إرجاع رمز الوصول الحالي أو محاولة الحصول عليه
export function getCachedToken() {
  return inMemoryAccessToken;
}

export function setCachedToken(token) {
  inMemoryAccessToken = token;
}

/**
 * تسجيل الدخول والمصادقة الحقيقية عبر Google Identity Services (GIS) / OAuth 2.0 Token Client
 * يتم الفتح بنافذة Google الأصلية للموافقة على الصلاحيات
 */
export async function authenticateGoogleAccount(interactive = true) {
  const config = await getFirebaseConfig();
  const clientId = config?.oAuthClientId || (config?.projectId ? `${config.projectId}.apps.googleusercontent.com` : '');

  return new Promise((resolve, reject) => {
    // التأكد من تحميل مكتبة Google Identity Services
    if (typeof window.google === 'undefined' || !window.google.accounts || !window.google.accounts.oauth2) {
      // تحميل الاسكريبت ديناميكياً إن لم يكن محملاً
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.onload = () => {
        initGISFlow(clientId, interactive, resolve, reject);
      };
      script.onerror = () => {
        reject(new Error('تعذّر الاتصال بخدمات Google للمصادقة. تحقق من اتصال الإنترنت.'));
      };
      document.head.appendChild(script);
    } else {
      initGISFlow(clientId, interactive, resolve, reject);
    }
  });
}

function initGISFlow(clientId, interactive, resolve, reject) {
  try {
    if (!clientId) {
      reject(new Error('معرّف تطبيق Google OAuth Client ID غير موجود.'));
      return;
    }

    const tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email',
      callback: async (response) => {
        if (response.error) {
          console.error('GIS Error:', response);
          if (response.error === 'popup_closed_by_user') {
            reject(new Error('تم إغلاق نافذة تسجيل الدخول من قبل المستخدم.'));
          } else if (response.error === 'access_denied') {
            reject(new Error('تم رفض إعطاء الصلاحيات لحفظ النسخة في Google Drive.'));
          } else {
            reject(new Error(response.error_description || response.error || 'تم إلغاء المصادقة من قبل المستخدم'));
          }
          return;
        }
        if (response.access_token) {
          inMemoryAccessToken = response.access_token;
          // جلب معلومات الملف الشخصي للحساب المربوط
          try {
            const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
              headers: { Authorization: `Bearer ${inMemoryAccessToken}` }
            });
            if (userRes.ok) {
              const profile = await userRes.json();
              const accData = {
                id: profile.id,
                email: profile.email,
                name: profile.name || profile.email,
                picture: profile.picture,
                connectedAt: new Date().toISOString(),
              };
              await saveGoogleAccount(accData);
              resolve({ token: inMemoryAccessToken, user: accData });
              return;
            }
          } catch (profileErr) {
            console.warn('Could not fetch user profile details:', profileErr);
          }
          // نجاح بدون بروفايل كامل
          const basicAcc = { email: 'حساب Google متصل', name: 'Google User', connectedAt: new Date().toISOString() };
          await saveGoogleAccount(basicAcc);
          resolve({ token: inMemoryAccessToken, user: basicAcc });
        }
      },
      error_callback: (err) => {
        console.error('GIS Token Client Error Callback:', err);
        reject(new Error(err?.message || 'تعذّر فتح نافذة مصادقة Google (تأكد من السماح بالنوافذ المنبثقة).'));
      }
    });

    if (interactive) {
      tokenClient.requestAccessToken({ prompt: 'consent' });
    } else {
      tokenClient.requestAccessToken({ prompt: '' });
    }
  } catch (err) {
    console.error('Init token client failed:', err);
    reject(err);
  }
}

/**
 * تجهيز حزمة البيانات للتصدير والنسخ الاحتياطي:
 * - تجمع كافة جداول وبيانات النظام بما فيها الإعدادات والعمليات والمستخدمين
 * - تشتمل على صور المرفقات الحقيقية إن وُجدت
 * - تستثني صور السندات الموقتة/المولدة ليتم توليدها ديناميكياً عند الحاجة
 */
export async function prepareBackupPayload() {
  const raw = await exportAllData();
  
  // تصفية صور السندات المولدة مسبقاً وتخفيف الحجم مع الاحتفاظ بالمرفقات الأصلية
  if (raw.data && raw.data.vouchers) {
    raw.data.vouchers = raw.data.vouchers.map(v => {
      // إزالة حقل صورة السند المؤقتة إن وُجدت لأنها تولد فوراً
      const clean = { ...v };
      delete clean.generatedImageData;
      delete clean.tempReceiptImage;
      return clean;
    });
  }

  // إضافة معلومات وصفية للنسخة
  raw._meta = {
    appName: 'إدارة البيانات — النظام المحاسبي',
    version: '2.0.0',
    timestamp: new Date().toISOString(),
    exportedAtFormatted: new Date().toLocaleString('ar-EG-u-ca-gregory-nu-latn'),
    appletId: 'c4ce6e45-1797-431b-9b83-bb1f1eae4744',
  };

  return raw;
}

/**
 * البحث عن ملف النسخة الاحتياطية الموحد في Google Drive
 */
async function findUnifiedBackupFile(token) {
  const query = encodeURIComponent(`name = '${BACKUP_FILE_NAME}' and trashed = false`);
  const url = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,modifiedTime,size,webViewLink)&spaces=drive`;
  
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` }
  });

  if (!res.ok) {
    if (res.status === 401) {
      inMemoryAccessToken = null; // انتهت صلاحية التوكن
      throw new Error('انتهت صلاحية الجلسة مع Google. يرجى إعادة تسجيل الدخول.');
    }
    const errText = await res.text();
    throw new Error(`خطأ أثناء البحث في Google Drive (${res.status}): ${errText}`);
  }

  const result = await res.json();
  if (result.files && result.files.length > 0) {
    return result.files[0];
  }
  return null;
}

/**
 * رفع أو تحديث ملف النسخة الموحد على Google Drive (Multipart Upload / Update)
 * في كل مرة يتم تحديث الملف نفسه دون إنشاء نسخ مكررة
 */
export async function uploadOrUpdateDriveBackup() {
  let token = inMemoryAccessToken;
  if (!token) {
    // محاولة طلب المصادقة
    const authRes = await authenticateGoogleAccount(true);
    token = authRes.token;
  }

  const payload = await prepareBackupPayload();
  const contentStr = JSON.stringify(payload, null, 2);
  const blob = new Blob([contentStr], { type: 'application/json' });
  const sizeKb = (contentStr.length / 1024).toFixed(1);

  // 1. البحث عن الملف الموجود مسبقاً
  const existingFile = await findUnifiedBackupFile(token);

  let fileResult = null;
  if (existingFile && existingFile.id) {
    // 2. تحديث محتوى الملف نفسه
    const uploadUrl = `https://www.googleapis.com/upload/drive/v3/files/${existingFile.id}?uploadType=media`;
    const updateRes = await fetch(uploadUrl, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: blob,
    });

    if (!updateRes.ok) {
      const err = await updateRes.text();
      throw new Error(`فشل تحديث ملف النسخة السحابية: ${err}`);
    }

    fileResult = await updateRes.json();
    await store.setSetting('googleDriveFileId', existingFile.id);
  } else {
    // 3. إنشاء ملف جديد باسم النسخة الموحد لأول مرة (Multipart)
    const metadata = {
      name: BACKUP_FILE_NAME,
      mimeType: 'application/json',
      description: 'ملف النسخة الاحتياطية الموحد لتطبيق إدارة البيانات المحاسبي',
    };

    const boundary = '-------314159265358979323846';
    const delimiter = `\r\n--${boundary}\r\n`;
    const closeDelimiter = `\r\n--${boundary}--`;

    const multipartRequestBody =
      delimiter +
      'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
      JSON.stringify(metadata) +
      delimiter +
      'Content-Type: application/json\r\n\r\n' +
      contentStr +
      closeDelimiter;

    const createRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body: multipartRequestBody,
    });

    if (!createRes.ok) {
      const err = await createRes.text();
      throw new Error(`فشل رفع ملف النسخة السحابية الجديد: ${err}`);
    }

    fileResult = await createRes.json();
    if (fileResult && fileResult.id) {
      await store.setSetting('googleDriveFileId', fileResult.id);
    }
  }

  // تسجيل بيانات آخر نسخة في الإعدادات
  const backupSummary = {
    date: new Date().toLocaleString('ar-EG-u-ca-gregory-nu-latn'),
    iso: new Date().toISOString(),
    size: `${sizeKb} KB`,
    fileId: (fileResult && fileResult.id) || (existingFile && existingFile.id),
    status: 'success',
  };
  await store.setSetting('lastCloudBackup', backupSummary);

  return backupSummary;
}

/**
 * جلب وتنزيل ملف النسخة السحابية من Google Drive لاستعادتها
 */
export async function downloadDriveBackup() {
  let token = inMemoryAccessToken;
  if (!token) {
    const authRes = await authenticateGoogleAccount(true);
    token = authRes.token;
  }

  const existingFile = await findUnifiedBackupFile(token);
  if (!existingFile || !existingFile.id) {
    throw new Error('لم يتم العثور على أي ملف نسخة احتياطية موحد في حساب Google Drive هذا.');
  }

  const downloadUrl = `https://www.googleapis.com/drive/v3/files/${existingFile.id}?alt=media`;
  const res = await fetch(downloadUrl, {
    headers: { Authorization: `Bearer ${token}` }
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`تعذر تحميل النسخة الاحتياطية من Drive: ${err}`);
  }

  const data = await res.json();
  return { file: existingFile, data };
}
