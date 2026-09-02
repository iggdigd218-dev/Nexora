// أدوات مساعدة عامة
export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => [...el.querySelectorAll(s)];
export const uid = (p = 'id') => p + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

// الأرقام
export function fmtNum(n, dec = 0) {
  if (n === null || n === undefined || isNaN(n)) n = 0;
  return new Intl.NumberFormat('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec }).format(n);
}
export function fmt(n, dec = 0) {
  const s = fmtNum(Math.abs(n), dec);
  return (n < 0 ? '−' : '') + s;
}
// تحويل الأرقام إلى عربية
export function toArabicDigits(str) {
  const map = { '0':'٠','1':'١','2':'٢','3':'٣','4':'٤','5':'٥','6':'٦','7':'٧','8':'٨','9':'٩' };
  return String(str).replace(/[0-9]/g, d => map[d]);
}
export function toArabicDigitsKeep(str, keepFmt) { return keepFmt ? toArabicDigits(str) : String(str); }

// تاريخ
export function todayISO() { return new Date().toISOString().slice(0, 10); }
export function nowTime() { return new Date().toTimeString().slice(0, 5); }
export function nowStamp() { return new Date().toISOString(); }

export function parseDate(d) {
  if (!d) return new Date();
  return new Date(d + (d.length === 10 ? 'T00:00:00' : ''));
}
export function fmtDate(d, fmt = 'short') {
  const dt = d instanceof Date ? d : parseDate(d);
  const opts = fmt === 'short'
    ? { year: 'numeric', month: 'short', day: 'numeric' }
    : { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' };
  return dt.toLocaleDateString('ar-EG-u-ca-gregory-nu-latn', opts);
}
export function fmtDateTime(d) {
  const dt = d instanceof Date ? d : parseDate(d);
  return dt.toLocaleDateString('ar-EG-u-ca-gregory-nu-latn', { day: 'numeric', month: 'short', year: 'numeric' }) +
    ' — ' + dt.toLocaleTimeString('ar-EG-u-ca-gregory-nu-latn', { hour: '2-digit', minute: '2-digit' });
}
export function relTime(iso) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'الآن';
  if (m < 60) return 'منذ ' + m + ' د';
  const h = Math.floor(m / 60);
  if (h < 24) return 'منذ ' + h + ' س';
  const d = Math.floor(h / 24);
  if (d < 30) return 'منذ ' + d + ' يوم';
  return fmtDate(iso, 'short');
}

// المبالغ بالحروف العربية
const ONES = ['', 'واحد', 'اثنان', 'ثلاثة', 'أربعة', 'خمسة', 'ستة', 'سبعة', 'ثمانية', 'تسعة', 'عشرة', 'أحد عشر', 'اثنا عشر', 'ثلاثة عشر', 'أربعة عشر', 'خمسة عشر', 'ستة عشر', 'سبعة عشر', 'ثمانية عشر', 'تسعة عشر'];
const TENS = ['', 'عشرة', 'عشرون', 'ثلاثون', 'أربعون', 'خمسون', 'ستون', 'سبعون', 'ثمانون', 'تسعون'];
const HUNDREDS = ['', 'مائة', 'مائتان', 'ثلاثمائة', 'أربعمائة', 'خمسمائة', 'ستمائة', 'سبعمائة', 'ثمانمائة', 'تسعمائة'];
const THOUS = { 3: 'ألف', 6: 'مليون', 9: 'مليار' };

function three(n) {
  let s = '';
  const h = Math.floor(n / 100), r = n % 100;
  if (h) s += HUNDREDS[h] + ' ';
  if (r) {
    if (r < 20) s += ONES[r] + ' ';
    else s += ONES[r % 10] ? ONES[r % 10] + ' و' + TENS[Math.floor(r / 10)] + ' ' : TENS[Math.floor(r / 10)] + ' ';
  }
  return s.trim();
}
function group(n) {
  if (n === 0) return 'صفر';
  const parts = [];
  let g = 0;
  while (n > 0) {
    const chunk = n % 1000;
    if (chunk) {
      let w = three(chunk);
      const th = THOUS[g];
      if (th) w = (chunk === 1 ? th : chunk === 2 ? 'ألفا' : chunk >= 3 && chunk <= 10 ? w + ' ' + th : w + ' ' + th);
      parts.unshift(w + (th ? ' ' + th : ''));
    }
    n = Math.floor(n / 1000);
    g += 3;
  }
  return parts.join(' و').replace(/\s+/g, ' ').trim();
}
export function numberToWords(num) {
  num = Math.round(Math.abs(Number(num)) * 100) / 100;
  const intPart = Math.floor(num);
  const frac = Math.round((num - intPart) * 100);
  let s = group(intPart);
  if (frac > 0) {
    s += ' و' + group(frac) + ' من المائة';
  }
  return s;
}

export function debounce(fn, ms = 300) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

// تنزيل ملف
export function downloadFile(name, content, mime = 'application/json') {
  const blob = new Blob([content], { type: mime + ';charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 300);
}

export function fileToBase64(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}
export function compressImage(file, maxW = 900, quality = 0.75) {
  return new Promise((res, rej) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, maxW / img.width);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      res(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = rej;
    img.src = url;
  });
}

// تنبيه صوتي بسيط
// طباعة / حفظ PDF (عبر نافذة الطباعة دون مكتبات)
export function printHTML(title, html, landscape = false) {
  const w = window.open('', '_blank', 'width=900,height=700');
  if (!w) { alert('الرجاء السماح بالنوافذ المنبثقة للطباعة'); return; }
  w.document.write(`<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8">
    <title>${esc(title)}</title>
    <style>
      body{font-family:Tahoma,Arial,sans-serif;color:#111;margin:20px;direction:rtl}
      table{width:100%;border-collapse:collapse;font-size:12px}
      th,td{border:1px solid #aaa;padding:6px 8px;text-align:right}
      th{background:#f1f1f1}
      h2{margin:0 0 4px}
      .meta{color:#555;font-size:12px;margin-bottom:12px}
      .tot{font-weight:bold;background:#f7f7f7}
      .header{display:flex;justify-content:space-between;border-bottom:2px solid #333;padding-bottom:8px;margin-bottom:10px;align-items:center}
      @media print{@page{size:${landscape ? 'landscape' : 'A4'};margin:12mm}}
    </style></head><body>
    <div class="header"><div><h2>${title}</h2><div class="meta">${esc(new Date().toLocaleString('ar-EG-u-ca-gregory-nu-latn'))}</div></div></div>
    ${html}</body></html>`);
  w.document.close();
  w.focus();
  setTimeout(() => { w.print(); }, 300);
}

export function beep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.frequency.value = 880; o.type = 'sine';
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
    o.start(); o.stop(ctx.currentTime + 0.35);
  } catch (e) {}
}

export function cleanPhoneNumber(phone, defaultCountry = '967') {
  let p = String(phone || '').replace(/\D/g, '');
  if (p.startsWith('00')) p = p.slice(2);
  if (p.startsWith('+')) p = p.slice(1);
  if (p.startsWith('0') && p.length === 10) p = p.slice(1); // إزالة الصفر الأول إذا كان محلياً
  if (p.length === 9 && (p.startsWith('7') || p.startsWith('1'))) {
    p = (defaultCountry || '967') + p;
  } else if (p.length === 9 && p.startsWith('5')) {
    p = '966' + p;
  }
  return p;
}

export function openWhatsApp(phone, text, appType = 'regular') {
  const p = cleanPhoneNumber(phone);
  if (!p) return;
  const encoded = encodeURIComponent(text || '');
  
  // الرابط العالمي المباشر لفتح محادثة الرقم المحدد فوراً دون وسيط
  const directChatUrl = `https://api.whatsapp.com/send?phone=${p}&text=${encoded}`;
  const appSchemeUrl = `whatsapp://send?phone=${p}&text=${encoded}`;

  try {
    // فتح محادثة العميل مباشرة في واتساب
    const a = document.createElement('a');
    a.href = directChatUrl;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => a.remove(), 300);
  } catch (_) {
    window.location.href = appSchemeUrl;
  }
}

export function openSMS(phone, text) {
  let rawPhone = String(phone || '').trim();
  // إزالة الأحرف غير الرقمية ما عدا +
  let p = rawPhone.replace(/[^\d+]/g, '');
  const encoded = encodeURIComponent(text || '');
  // رابط SMS متوافق مع Android و iOS
  const url = `sms:${p}?&body=${encoded}`;
  try {
    window.location.href = url;
  } catch (_) {
    window.open(url, '_self');
  }
}

export function copyText(text) {
  if (navigator.clipboard) navigator.clipboard.writeText(text);
  else {
    const t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select();
    document.execCommand('copy'); t.remove();
  }
}

// تصدير Excel (جدول HTML بصيغة .xls)
export function exportExcel(filename, headers, rows) {
  const html = '<html xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="UTF-8"></head><body><table border="1">' +
    '<tr>' + headers.map(h => '<th style="background:#dde;font-weight:bold">' + esc(h) + '</th>').join('') + '</tr>' +
    rows.map(r => '<tr>' + r.map(c => '<td>' + esc(c) + '</td>').join('') + '</tr>').join('') +
    '</table></body></html>';
  downloadFile(filename + '.xls', html, 'application/vnd.ms-excel');
}
export function exportCSV(filename, headers, rows) {
  const escapeCsv = (v) => {
    v = String(v ?? '');
    if (/[",\n]/.test(v)) v = '"' + v.replace(/"/g, '""') + '"';
    return v;
  };
  // BOM لدعم العربية في Excel
  const content = '\uFEFF' + [headers, ...rows].map(r => r.map(escapeCsv).join(',')).join('\r\n');
  downloadFile(filename + '.csv', content, 'text/csv');
}
