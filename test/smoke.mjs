// اختبار شامل لطبقة البيانات والمحاسبة (يعمل في node بدون DOM كامل)
import 'fake-indexeddb/auto';
import { store } from '../js/store.js';
import { accountBalance, txEffect, OP_TYPES, balanceLabels } from '../js/accounting.js';
import { numberToWords } from '../js/utils.js';

let pass = 0, fail = 0;
function check(name, cond) { if (cond) { pass++; } else { fail++; console.log('FAIL:', name); } }

// 1) تحميل فارغ
await store.load();
check('load ready', store.ready === true);

// 2) إعدادات وعملة
await store.setSetting('initialized', true);
await store.setSetting('businessName', 'مؤسسة اختبار');
await store.setSetting('defaultCurrency', 'YER');
check('settings saved', store.settings().businessName === 'مؤسسة اختبار');

// 3) إضافة حساب عميل برصيد افتتاحي 0
const c = await store.saveAccount({ id: 'c1', name: 'أحمد', kind: 'customer', currency: 'YER', openingBalance: 0 });
check('account created', store.getAccount('c1').name === 'أحمد');

// 4) عمليات: له 1000، قبض 400، له 200، صرف 100 → 1000-400+200+100 = 900
await store.saveTransaction({ id: 't1', accountId: 'c1', accountKind: 'customer', type: 'debit', amount: 1000, currency: 'YER', date: '2026-01-01' });
await store.saveTransaction({ id: 't2', accountId: 'c1', accountKind: 'customer', type: 'in', amount: 400, currency: 'YER', date: '2026-01-02' });
await store.saveTransaction({ id: 't3', accountId: 'c1', accountKind: 'customer', type: 'debit', amount: 200, currency: 'YER', date: '2026-01-03' });
await store.saveTransaction({ id: 't4', accountId: 'c1', accountKind: 'customer', type: 'out', amount: 100, currency: 'YER', date: '2026-01-04' });
const bal = store.balance('c1');
check('balance = 900', bal === 900);

// 5) حذف عملية تحدّث الرصيد: حذف t2 (قبض 400) → 900+400=1300
await store.remove('transactions', 't2');
check('balance after delete = 1300', store.balance('c1') === 1300);

// 6) تعديل عملية: t3 من 200 إلى 500 → 1300+300=1600
const t3 = store.get('transactions', 't3'); t3.amount = 500; await store.saveTransaction(t3);
check('balance after edit = 1600', store.balance('c1') === 1600);

// 7) تحويل بين حسابين
const g = await store.saveAccount({ id: 'g1', name: 'الصندوق', kind: 'general', currency: 'YER', openingBalance: 1000 });
await store.saveTransaction({ id: 'tf', accountId: 'c1', accountKind: 'customer', type: 'transfer', amount: 200, currency: 'YER', fromId: 'g1', toId: 'c1', rate: 1, date: '2026-01-05' });
check('cash after transfer = 800', store.balance('g1') === 800);
check('customer after transfer = 1800', store.balance('c1') === 1800);

// 8) حساب عام: قبض +200، صرف -50، إيراد +300، مصروف -100
const cash = await store.saveAccount({ id: 'g2', name: 'بنك', kind: 'general', currency: 'YER', openingBalance: 500 });
await store.saveTransaction({ id: 'x1', accountId: 'g2', accountKind: 'general', type: 'in', amount: 200, currency: 'YER', date: '2026-02-01' });
await store.saveTransaction({ id: 'x2', accountId: 'g2', accountKind: 'general', type: 'out', amount: 50, currency: 'YER', date: '2026-02-02' });
await store.saveTransaction({ id: 'x3', accountId: 'g2', accountKind: 'general', type: 'revenue', amount: 300, currency: 'YER', date: '2026-02-03' });
await store.saveTransaction({ id: 'x4', accountId: 'g2', accountKind: 'general', type: 'expense', amount: 100, currency: 'YER', date: '2026-02-04' });
check('bank balance = 850', store.balance('g2') === 850);

// 9) حساب مورد برصيد افتتاحي سالب (علينا)
const sup = await store.saveAccount({ id: 's1', name: 'مورد', kind: 'supplier', currency: 'YER', openingBalance: -500 });
check('supplier negative opening = -500', store.balance('s1') === -500);

// 10) رصيد افتتاحي موجب مع طبيعة
const cust2 = await store.saveAccount({ id: 'c2', name: 'خالد', kind: 'customer', currency: 'YER', openingBalance: 250 });
check('customer opening positive = 250', store.balance('c2') === 250);

// 11) الأرقام بالحروف
check('numberToWords 123 = ' + numberToWords(123), numberToWords(123).includes('مائة') && numberToWords(123).includes('ثلاثة'));
check('numberToWords 0 = صفر', numberToWords(0).includes('صفر'));
check('numberToWords 1050', numberToWords(1050).includes('ألف'));

// 12) تسلسل السندات
await store.setSetting('counters', {});
const n1 = store.nextSequence('receipt');
const n2 = store.nextSequence('receipt');
check('sequence increments', n2 > n1);

// 13) مسميات الأرصدة
const lbl = balanceLabels(store.settings());
check('labels default', lbl.oweUs === 'عليه' && lbl.oweThem === 'له');

// 14) استعلامات الحسابات
check('accounts count = 5', store.accounts(true).length === 5);
check('transactions count = 8', store.col("transactions").length === 8);

// 15) العملة الافتراضية
check('default currency YER', store.settings().defaultCurrency === 'YER');

console.log(`\nنتيجة: ${pass} نجحت، ${fail} فشلت`);
process.exit(fail ? 1 : 0);
