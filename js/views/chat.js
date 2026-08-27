// نظام الدردشة داخل التطبيق
import { $, $$, esc, fmt, uid, nowStamp, relTime, fileToBase64, compressImage } from '../utils.js';
import { store } from '../store.js';
import { toast, toastErr, confirmDialog, openModal } from '../components.js';
import { ACCOUNT_KINDS, accountBalance } from '../accounting.js';
import { go } from '../app.js';
import { openTxForm } from './transactions.js';

export function render(container, params, state) {
  lastRender = { container, params, state };
  const settings = store.settings();
  const me = store.findBy('users', u => u.me) || { name: 'المدير' };

  // قائمة المحادثات
  const convs = store.list('conversations').filter(c => !c.archived || params.id);
  container.innerHTML = `
    <div class="view-head">
      <div><div class="view-title">المراسلات 💬</div><small>دردشة مباشرة بين المستخدمين داخل التطبيق</small></div>
    </div>
    <div class="chat-layout">
      <div class="chat-list" id="chat-list">${convList()}</div>
      <div id="chat-main" class="chat-window">
        ${params.accountId ? renderChatWindow(params.accountId) : defaultWindow()}
      </div>
    </div>
  `;

  function convList() {
    if (!convs.length) return '<div class="empty"><div class="e-ic">💬</div><h3>لا توجد محادثات</h3><p class="muted">افتح صفحة أي حساب واختر «مراسلة» للبدء.</p></div>';
    return convs.map(c => {
      const acc = store.getAccount(c.accountId);
      const unread = store.filter('messages', m => m.conversationId === c.id && !m.fromMe && !m.read).length;
      const last = store.list('messages').find(m => m.conversationId === c.id);
      return `<div class="chat-item ${params.accountId === c.accountId ? 'active' : ''}" data-acc="${c.accountId}">
        <div class="ava">${esc((acc?acc.name:c.otherName||'?')[0])}</div>
        <div style="flex:1;min-width:0">
          <div class="ci-n"><span>${esc(acc?acc.name:c.otherName||'')}</span><span class="ci-t">${last ? esc(relTime(last.createdAt)) : ''}</span></div>
          <div class="ci-p">${last ? esc(last.text || (last.type === 'voucher' ? '🧾 سند' : '📎 مرفق')) : 'لا رسائل بعد'}</div>
        </div>
        ${unread ? `<span class="unread">${unread}</span>` : ''}
      </div>`;
    }).join('');
  }

  $('#chat-list', container).addEventListener('click', (e) => {
    const item = e.target.closest('[data-acc]');
    if (!item) return;
    render(container, { ...params, accountId: item.dataset.acc }, state);
  });

  if (params.accountId) bindChatWindow($('#chat-main', container), params.accountId, me, container, params, state);
}

function renderChatWindow(accountId) {
  const acc = store.getAccount(accountId);
  if (!acc) return defaultWindow();
  // هل المستخدم مسجل في التطبيق؟
  const linked = findAppUser(acc);
  const conv = store.findBy('conversations', c => c.accountId === accountId);
  if (!linked) {
    return `<div class="chat-window">
      <div class="chat-head">
        <div class="ava">${esc(acc.name[0])}</div>
        <div><b>${esc(acc.name)}</b><div class="muted" style="font-size:12px">${ACCOUNT_KINDS[acc.kind].label}</div></div>
      </div>
      <div class="empty" style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:12px">
        <div class="e-ic">🚫</div>
        <h3>هذا العميل لا يستخدم التطبيق حاليًا</h3>
        <p class="muted">المحادثة غير متاحة، لأن ${esc(acc.name)} ليس لديه حساب نشط داخل التطبيق.</p>
        <button class="btn soft" data-invite>📨 دعوة للانضمام إلى التطبيق</button>
        ${acc.whatsapp ? `<button class="btn ghost" data-wa>🟢 مراسلة عبر واتساب بدلاً من ذلك</button>` : ''}
      </div></div>`;
  }
  const msgs = store.filter('messages', m => m.conversationId === conv.id).sort((a,b) => a.createdAt.localeCompare(b.createdAt));
  return `<div class="chat-window" data-acc="${accountId}">
    <div class="chat-head">
      <div class="ava">${esc(acc.name[0])}</div>
      <div style="flex:1"><b>${esc(acc.name)}</b><div class="muted" style="font-size:12px">${esc(linked.name)} · متصل عبر التطبيق</div></div>
      <div style="display:flex;gap:6px">
        <button class="icon-btn" style="width:34px;height:34px" data-doc title="كشف حساب">📄</button>
        <button class="icon-btn" style="width:34px;height:34px" data-vou title="إرسال سند">🧾</button>
        <button class="icon-btn" style="width:34px;height:34px" data-sum title="ملخص الرصيد">💰</button>
        <button class="icon-btn" style="width:34px;height:34px" data-tx title="عملية مالية">＋</button>
      </div>
    </div>
    <div class="chat-msgs" id="chat-msgs">
      ${msgs.map(m => msgHTML(m, acc)).join('') || '<div class="muted" style="text-align:center;padding:30px">ابدأ المحادثة مع هذا العميل</div>'}
    </div>
    <div class="chat-input">
      <button class="icon-btn" data-att title="إرفاق">📎</button>
      <input id="chat-text" placeholder="اكتب رسالة...">
      <button class="btn primary" id="chat-send">إرسال</button>
    </div>
  </div>`;
}

function msgHTML(m, acc) {
  const me = store.findBy('users', u => u.me) || {};
  if (m.type === 'voucher') {
    const v = store.get('vouchers', m.voucherId);
    return `<div class="msg ${m.fromMe ? 'mine' : 'theirs'}">
      <div class="att" data-view-voucher="${v ? v.id : ''}">🧾 سند ${v ? esc(v.number) : ''}</div>
      <div class="m-t">${esc(relTime(m.createdAt))} ${m.fromMe ? '✓' : ''}</div>
    </div>`;
  }
  return `<div class="msg ${m.fromMe ? 'mine' : 'theirs'}">
    ${m.attachments && m.attachments.length ? m.attachments.map(a => `<img src="${a}" style="max-width:180px;border-radius:10px;display:block;margin-bottom:6px">`).join('') : ''}
    ${esc(m.text || '')}
    <div class="m-t">${esc(relTime(m.createdAt))} ${m.fromMe ? '✓✓' : ''}${m.fromMe ? (m.read ? ' قرأها' : '') : ''}</div>
  </div>`;
}

function findAppUser(acc) {
  const phone = String(acc.whatsapp || acc.phone || '').replace(/\D/g, '');
  const me = store.findBy('users', u => u.me);
  if (!phone) return null;
  return store.findBy('users', u => !u.me && u.id !== (me && me.id)) || null; // محاكاة: أي مستخدم آخر مسجل
}

function bindChatWindow(main, accountId, me, container, params, state) {
  const acc = store.getAccount(accountId);
  const linked = findAppUser(acc);
  const invite = $('[data-invite]', main);
  if (invite) invite.onclick = () => {
    toast('تم إرسال دعوة الانضمام إلى ' + acc.name + ' 📨');
  };
  const wa = $('[data-wa]', main);
  if (wa) wa.onclick = () => {
    window.open('https://wa.me/' + String(acc.whatsapp || acc.phone || '').replace(/[^0-9]/g,''), '_blank');
  };
  const win = $('.chat-window', main);
  if (!win) return;
  let conv = store.findBy('conversations', c => c.accountId === accountId);
  if (!conv) {
    conv = { id: uid('conv'), accountId, otherName: acc.name, archived: false, blocked: false, createdAt: new Date().toISOString() };
    store.create('conversations', conv, { noActivity: true });
  }

  async function send(text, extra = {}) {
    const msg = {
      id: uid('msg'),
      conversationId: conv.id,
      accountId,
      text: text || '',
      fromMe: true,
      read: false,
      type: extra.type || 'text',
      attachments: extra.attachments || [],
      voucherId: extra.voucherId,
      createdAt: new Date().toISOString(),
    };
    await store.create('messages', msg, { noActivity: true });
    // محاكاة استلام/قراءة
    setTimeout(() => { msg.read = true; store.save('messages', msg, { noActivity: true }); }, 1500);
    render(container, { ...params, accountId }, state);
    scrollBottom();
  }
  function scrollBottom() {
    const box = $('#chat-msgs', container);
    if (box) box.scrollTop = box.scrollHeight;
  }

  const input = $('#chat-text', container);
  const sendBtn = $('#chat-send', container);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') doSend(); });
  sendBtn.onclick = doSend;
  function doSend() {
    const t = input.value.trim();
    if (!t) return;
    input.value = '';
    send(t);
  }

  $('[data-att]', container).onclick = async () => {
    const file = await pickFile();
    if (!file) return;
    let data;
    if (file.type.startsWith('image/')) data = await compressImage(file, 800, 0.7);
    else data = await fileToBase64(file);
    send('📎 مرفق', { attachments: [data] });
  };
  $('[data-sum]', container).onclick = () => {
    const bal = accountBalance(acc, store.transactions());
    const nature = bal >= 0 ? 'عليه (مستحق لنا)' : 'له (مستحق له)';
    send(`💰 ملخص الرصيد: ${fmt(Math.abs(bal))} ${store.currency(acc.currency).symbol} — ${nature}`);
  };
  $('[data-doc]', container).onclick = () => sendStatement(acc, conv);
  $('[data-vou]', container).onclick = () => sendVoucher(acc, conv);
  $('[data-tx]', container).onclick = () => openTxForm(null, accountId);

  main.addEventListener('click', (e) => {
    const vv = e.target.closest('[data-view-voucher]');
    if (vv) { go('vouchers', { id: vv.dataset.viewVoucher }); return; }
    const ct = e.target.closest('[data-msg-tx]');
    if (ct) { openTxForm(null, accountId); return; }
  });

  function pickFile() {
    return new Promise((res) => {
      const inp = document.createElement('input');
      inp.type = 'file'; inp.accept = 'image/*,.pdf,.doc,.docx';
      inp.onchange = () => res(inp.files[0] || null);
      inp.click();
    });
  }
}

async function sendStatement(acc, conv) {
  const bal = accountBalance(acc, store.transactions());
  const txs = store.filter('transactions', t => t.accountId === acc.id);
  const lines = txs.slice(0, 10).map(t => `• ${t.date} ${OP_TYPES_T[t.type] || ''}: ${fmt(t.amount)} ${store.currency(t.currency).symbol}`).join('\n');
  const text = `📄 كشف حساب ${acc.name}\nالرصيد الحالي: ${fmt(bal)} ${store.currency(acc.currency).symbol}\n${lines}`;
  // إرسال كرسالة
  const msg = { id: uid('msg'), conversationId: conv.id, accountId: acc.id, text, fromMe: true, read: false, type: 'text', createdAt: new Date().toISOString() };
  await store.create('messages', msg, { noActivity: true });
  render(lastRender.container, { ...lastRender.params, accountId: acc.id }, lastRender.state);
  toast('تم إرسال كشف الحساب');
}

async function sendVoucher(acc, conv) {
  const m = openModal({
    title: 'إرسال سند',
    body: `<div class="muted" style="margin-bottom:10px">اختر سنداً لإرساله إلى ${esc(acc.name)}</div>
      <div id="sv-list">${store.list('vouchers').filter(v => v.accountId === acc.id).slice(0, 20).map(v => `
        <div class="settings-row" data-sv="${v.id}" style="cursor:pointer"><span>🧾 ${esc(v.number)}</span><span class="muted">${esc(v.date)} · ${fmt(v.amount)}</span></div>`).join('') || '<div class="muted">لا توجد سندات لهذا الحساب</div>'}</div>`,
  });
  $$('[data-sv]', m.overlay).forEach(el => el.onclick = async () => {
    const v = store.get('vouchers', el.dataset.sv);
    const msg = { id: uid('msg'), conversationId: conv.id, accountId: acc.id, text: `🧾 سند ${v.number} — ${fmt(v.amount)} ${store.currency(v.currency).symbol}`, fromMe: true, read: false, type: 'voucher', voucherId: v.id, createdAt: new Date().toISOString() };
    await store.create('messages', msg, { noActivity: true });
    m.close();
    render(lastRender.container, { ...lastRender.params, accountId: acc.id }, lastRender.state);
    toast('تم إرسال السند');
  });
}
const OP_TYPES_T = { in:'قبض', out:'صرف', debit:'له', credit:'عليه', revenue:'إيراد', expense:'مصروف', transfer:'تحويل' };
let lastRender = { container: null, params: {}, state: {} };
function defaultWindow() {
  return `<div class="empty" style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%">
    <div class="e-ic">💬</div><h3>اختر محادثة من القائمة</h3>
    <p class="muted">أو افتح صفحة عميل واختر «مراسلة»</p></div>`;
}
