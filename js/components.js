// مكونات واجهة مشتركة: مودالات، تنبيهات، نماذج
import { $, $$, esc, fmt, beep, numberToWords, fileToBase64, compressImage } from './utils.js';
import { store } from './store.js';

export function toast(msg, type = 'success', icon = '') {
  const root = $('#toast-root');
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  const icons = { success: '✅', error: '⚠️', warn: '🔔', info: 'ℹ️' };
  el.innerHTML = `<span class="t-ic">${icon || icons[type]}</span><span>${esc(msg)}</span>`;
  root.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transform = 'translateY(10px)'; }, 2800);
  setTimeout(() => el.remove(), 3200);
}
export const toastErr = (msg) => toast(msg, 'error');
export const toastOk = (msg) => toast(msg, 'success');

export function openModal({ title, body, foot = '', cls = '', onClose } = {}) {
  const root = $('#modal-root');
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal ${cls}">
      <div class="modal-head"><h3>${title}</h3>
        <button class="modal-close" data-close>✕</button>
      </div>
      <div class="modal-body">${body}</div>
      ${foot ? `<div class="modal-foot">${foot}</div>` : ''}
    </div>`;
  root.appendChild(overlay);
  const close = () => { overlay.remove(); if (onClose) onClose(); };
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay || e.target.closest('[data-close]')) close();
  });
  const api = {
    overlay,
    close,
    bodyEl: $('.modal-body', overlay),
    footEl: $('.modal-foot', overlay),
  };
  return api;
}

export function confirmDialog({ title, message, confirmText = 'تأكيد', danger = false, icon = '⚠️' }) {
  return new Promise((resolve) => {
    const m = openModal({
      title,
      body: `<div style="text-align:center;padding:6px 0">
        <div style="font-size:44px;margin-bottom:10px">${icon}</div>
        <p style="color:var(--text2)">${message}</p></div>`,
      foot: `<button class="btn ghost" data-no>إلغاء</button>
             <button class="btn ${danger ? 'danger' : 'primary'}" data-yes>${confirmText}</button>`,
    });
    $('[data-no]', m.overlay).onclick = () => { m.close(); resolve(false); };
    $('[data-yes]', m.overlay).onclick = () => { m.close(); resolve(true); };
  });
}

export function field({ type = 'text', name, label, value = '', required = false, placeholder = '', options = null, hint = '' }) {
  let input;
  if (type === 'select') {
    const opts = (options || []).map(o => {
      const v = typeof o === 'object' ? o.value : o;
      const l = typeof o === 'object' ? o.label : o;
      return `<option value="${esc(v)}" ${String(v) === String(value) ? 'selected' : ''}>${esc(l)}</option>`;
    }).join('');
    input = `<select id="f-${name}" name="${name}">${opts}</select>`;
  } else if (type === 'textarea') {
    input = `<textarea id="f-${name}" name="${name}" class="resizable" placeholder="${esc(placeholder)}">${esc(value)}</textarea>`;
  } else {
    const numeric = type === 'number' ? ' inputmode="decimal"' : '';
    input = `<input id="f-${name}" name="${name}" type="${type === 'money' ? 'number' : type === 'number' ? 'number' : 'text'}" step="any" value="${esc(value)}" placeholder="${esc(placeholder)}" ${required ? 'required' : ''} ${numeric} />`;
  }
  return `
    <div class="field">
      <label for="f-${name}">${label} ${required ? '<span style="color:var(--danger)">*</span>' : ''}</label>
      ${input}
      ${hint ? `<div class="hint">${hint}</div>` : ''}
    </div>`;
}

// قراءة قيم النموذج من عنصر الحاوية
export function readForm(container) {
  const data = {};
  if (typeof container === 'string') container = document.querySelector(container);
  if (!container) return data;
  $$('select, input, textarea', container).forEach(el => {
    if (el.name) {
      if (el.type === 'checkbox') data[el.name] = el.checked;
      else if (el.type === 'number') data[el.name] = el.value === '' ? '' : Number(el.value);
      else data[el.name] = el.value;
    }
  });
  return data;
}

// صورة / مرفق
export async function handleAttachment(file, compress = true) {
  if (!file) return null;
  if (file.type.startsWith('image/') && compress) {
    try { return await compressImage(file, 900, 0.7); } catch (e) { return await fileToBase64(file); }
  }
  return await fileToBase64(file);
}

// بطاقة اختيار
export function radioCards(name, options, value) {
  return `<div class="grid grid-4" style="gap:8px">` + options.map(o => {
    const sel = String(o.value) === String(value) ? 'checked' : '';
    return `<label class="chk" style="background:${sel ? 'var(--primary-soft)' : 'var(--surface2)'};border:2px solid ${sel ? 'var(--primary)' : 'var(--border)'};border-radius:12px;padding:12px;justify-content:center;cursor:pointer">
      <input type="radio" name="${name}" value="${esc(o.value)}" ${sel}> <span style="font-size:20px">${o.icon}</span> ${o.label}
    </label>`;
  }).join('') + `</div>`;
}

export const money = (n, cur, settings) => {
  const c = store.currency(cur);
  const dec = c.decimal !== undefined ? c.decimal : (n % 1 !== 0 ? 2 : 0);
  const s = fmt(n, dec);
  return `<span class="amount-display">${s} ${esc(c.symbol)}</span>`;
};

export { numberToWords, beep };
