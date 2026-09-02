// سجل النشاط — آخر التغييرات
import { $, $$, esc, fmt, relTime } from '../utils.js';
import { store } from '../store.js';
import { dbClear } from '../db.js';

export function render(container, params, state) {
  const acts = store.list('activity');
  const settings = store.settings();
  container.innerHTML = `
    <div class="view-head">
      <div><div class="view-title">سجل النشاط 🕒</div><small>آخر التغييرات في النظام</small></div>
      <div class="view-actions"><button class="btn ghost" data-clear>🗑️ مسح السجل</button></div>
    </div>
    <div class="card">
      ${acts.length ? acts.map(a => `
        <div class="settings-row">
          <span style="display:flex;align-items:center;gap:8px">
            <span class="pill teal" style="width:8px;height:8px;border-radius:50%;padding:0"></span>
            ${esc(a.text)}
          </span>
          <span class="muted" style="font-size:12px;text-align:left">
            <span>${esc(a.userName || a.user || '')}</span><br>${esc(relTime(a.createdAt))}
          </span>
        </div>`).join('') : '<div class="empty"><div class="e-ic">🕒</div><h3>لا نشاط بعد</h3></div>'}
    </div>
  `;
  container.addEventListener('click', async (e) => {
    if (e.target.closest('[data-clear]')) {
      if (!confirm('هل تريد مسح كل سجل النشاط؟')) return;
      await dbClear('activity');
      store.state.activity = [];
      render(container, params, state);
    }
  });
}
