// المخزن المركزي — يحمّل كل البيانات في الذاكرة للسرعة ويتزامن مع IndexedDB
import * as db from './db.js';
import { accountBalance, DEFAULT_CURRENCIES, opEffect } from './accounting.js';
import { uid, nowStamp } from './utils.js';

const STORES = ['settings','currencies','categories','accounts','transactions','transactionItems','vouchers','items',
  'conversations','messages','users','activity','templates','reminders','notifications','contacts','trash'];

class Store {
  constructor() {
    this.state = {};
    this.listeners = new Set();
    this.ready = false;
  }

  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit(payload) { this.listeners.forEach(fn => { try { fn(payload); } catch (e) { console.error(e); } }); }

  async load() {
    for (const s of STORES) {
      try { this.state[s] = await db.dbGetAll(s); } catch (e) { this.state[s] = []; }
    }
    this.ready = true;
    this.emit({ type: 'loaded' });
  }

  col(name) { return this.state[name] || (this.state[name] = []); }
  get(name, id) { return (this.state[name] || []).find(x => x.id === id); }
  list(name, sorted = true) {
    const arr = this.col(name).slice();
    if (sorted) arr.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    return arr;
  }
  findBy(name, fn) { return (this.state[name] || []).find(fn); }
  filter(name, fn) { return (this.state[name] || []).filter(fn); }

  async save(name, obj, { silent = false, noActivity = false } = {}) {
    obj.updatedAt = nowStamp();
    if (!obj.createdAt) obj.createdAt = nowStamp();
    if (!obj.id) obj.id = uid(name);
    const arr = this.col(name);
    const i = arr.findIndex(x => x.id === obj.id);
    if (i >= 0) arr[i] = obj; else arr.push(obj);
    await db.dbPut(name, obj);
    if (!silent) this.emit({ type: 'save', store: name, item: obj });
    if (!noActivity) this.activity('تم تحديث ' + name, obj.id, obj.id);
    return obj;
  }

  async create(name, obj, opts = {}) {
    return this.save(name, obj, opts);
  }

  async remove(name, id, { silent = false } = {}) {
    this.state[name] = (this.state[name] || []).filter(x => x.id !== id);
    await db.dbDelete(name, id);
    if (!silent) this.emit({ type: 'remove', store: name, id });
    return true;
  }

  // ---------- الإعدادات ----------
  settings() {
    const all = {};
    this.col('settings').forEach(s => all[s.key] = s.value);
    return all;
  }
  async setSetting(key, value) {
    await this.save('settings', { id: key, key, value }, { noActivity: true, silent: true });
  }

  // ---------- العملات ----------
  getCurrencies() {
    const list = this.col('currencies');
    if (!list.length) return DEFAULT_CURRENCIES;
    return list;
  }
  currency(code) {
    return this.getCurrencies().find(c => c.code === code) || { code: code || '', name: code || '', symbol: code || '', decimal: 0 };
  }

  // ---------- الحسابات ----------
  accounts(active = true) {
    const all = this.col('accounts');
    return active ? all.filter(a => a.archived !== true) : all;
  }
  getAccount(id) { return this.get('accounts', id); }
  async saveAccount(acc) { return this.create('accounts', acc); }
  balance(accountId) {
    const a = this.getAccount(accountId);
    if (!a) return 0;
    return accountBalance(a, this.col('transactions'));
  }
  // كل الأرصدة دفعة واحدة (معتمدة على المعاملات النشطة فقط)
  allBalances(accountList) {
    const txs = this.col('transactions');
    const map = {};
    for (const a of accountList) map[a.id] = accountBalance(a, txs);
    return map;
  }

  // ---------- العمليات ----------
  transactions() { return this.list('transactions'); }
  transactionItems(txId) {
    return this.col('transactionItems')
      .filter(item => String(item.txId) === String(txId))
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  }
  async replaceTransactionItems(txId, items = []) {
    const old = this.transactionItems(txId);
    for (const item of old) await db.dbDelete('transactionItems', item.id);
    this.state.transactionItems = this.col('transactionItems').filter(item => String(item.txId) !== String(txId));
    const saved = [];
    for (const [position, line] of items.entries()) {
      const item = {
        id: line.id || uid('txitem'),
        txId,
        position,
        itemId: line.itemId || null,
        name: String(line.name || ''),
        unit: String(line.unit || 'حبة'),
        quantity: Number(line.quantity) || 0,
        unitPrice: Number(line.unitPrice) || 0,
        total: Number.isFinite(Number(line.total)) ? Number(line.total) : (Number(line.quantity) || 0) * (Number(line.unitPrice) || 0),
        createdAt: line.createdAt || nowStamp(),
      };
      await db.dbPut('transactionItems', item);
      this.state.transactionItems.push(item);
      saved.push(item);
    }
    return saved;
  }
  async saveTransaction(t) {
    const saved = await this.create('transactions', t);
    await this.replaceTransactionItems(saved.id, Array.isArray(saved.invoiceItems) ? saved.invoiceItems : []);
    return saved;
  }
  async deleteTransaction(id, { silent = false } = {}) {
    await this.remove('transactions', id, { silent });
    await this.replaceTransactionItems(id, []);
  }
  // كشف العمليات المكررة (لتحذير المستخدم دون منعه)
  findDuplicates(t) {
    return this.col('transactions').filter(x =>
      x.id !== t.id && x.accountId === t.accountId &&
      x.type === t.type && x.amount === t.amount &&
      x.currency === t.currency && x.date === t.date &&
      Math.abs(new Date(x.createdAt).getTime() - new Date(t.createdAt || Date.now()).getTime()) < 120000
    );
  }

  // ---------- الأرقام التسلسلية ----------
  nextSequence(kind) {
    const st = this.settings();
    const prefix = (st.voucherPrefix && st.voucherPrefix[kind]) || this.defaultPrefix(kind);
    let counter = st.counters && st.counters[kind] || 0;
    counter++;
    this.setSetting('counters', { ...st.counters, [kind]: counter });
    return prefix + String(counter).padStart(4, '0');
  }
  defaultPrefix(kind) {
    const map = { receipt: 'ق', payment: 'ص', debit: 'ق', credit: 'د', transfer: 'تح' };
    return map[kind] || 'س';
  }

  // ---------- النشاط ----------
  activity(text, refType, refId) {
    const users = this.col('users');
    const me = users.find(u => u.me) || { name: 'المدير' };
    this.create('activity', {
      text,
      refType,
      refId,
      user: me.name,
      userName: me.name,
    }, { noActivity: true });
  }
  recentActivity(limit = 30) { return this.list('activity').slice(0, limit); }

  // ---------- العدادات ----------
  counts() {
    return {
      accounts: this.accounts(true).length,
      transactions: this.col('transactions').length,
      vouchers: this.col('vouchers').length,
      conversations: this.col('conversations').length,
      trash: this.col('trash').length,
    };
  }
}

export const store = new Store();
export { accountBalance, opEffect };
