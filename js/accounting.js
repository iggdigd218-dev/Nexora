// محرك المحاسبة — قلب النظام
// الاتفاقية المحاسبية:
//   الرصيد الموجب (+) = مبلغ مستحق لنا من الحساب (ذمم مدينة / أصل) → يُعرض «عليه»
//   الرصيد السالب (−) = مبلغ مستحق منا للحساب (ذمم دائنة / التزام) → يُعرض «له»
// يجب ألا يتغير هذا الاتفاق في كل النظام حتى لا تنعكس الأرصدة.

export const ACCOUNT_KINDS = {
  customer: { label: 'عميل', icon: '👤', color: 'info' },
  supplier: { label: 'مورد', icon: '🏭', color: 'violet' },
  general:  { label: 'حساب عام', icon: '🏦', color: 'teal' },
};

export const OP_TYPES = {
  in:       { label: 'قبض',            icon: '🔄', cls: 'green'  },
  out:      { label: 'صرف',            icon: '💸', cls: 'red'    },
  debit:    { label: 'مبلغ له (مدين)', icon: '➕', cls: 'teal'   },
  credit:   { label: 'مبلغ عليه (دائن)', icon: '➖', cls: 'accent' },
  revenue:  { label: 'إيراد',          icon: '📈', cls: 'green'  },
  expense:  { label: 'مصروف',          icon: '📉', cls: 'red'    },
  transfer: { label: 'تحويل',          icon: '🔁', cls: 'info'   },
  settle:   { label: 'تسوية',          icon: '⚖️', cls: 'violet' },
};

export const DEFAULT_CURRENCIES = [
  { code: 'YER', name: 'الريال اليمني', symbol: 'ر.ي', decimal: 0 },
  { code: 'USD', name: 'الدولار الأمريكي', symbol: '$', decimal: 2 },
  { code: 'SAR', name: 'الريال السعودي', symbol: 'ر.س', decimal: 2 },
];

// أثر العملية على الرصيد (موجبة تزيد الرصيد / سالبة تنقصه)
// sign: +1 يعني أن المبلغ «له» (مدين) بالنسبة للتعامل، -1 يعني «عليه» (دائن)
export function opEffect(opType, accountKind) {
  switch (opType) {
    case 'in':
      // قبض: للحساب العام استلام نقد = زيادة الأصل (+1)، للعميل/المورد سداد = نقصان الذمة (-1)
      return accountKind === 'general' ? 1 : -1;
    case 'out':
      return accountKind === 'general' ? -1 : 1;
    case 'debit':
      return 1;
    case 'credit':
      return -1;
    case 'revenue':
      return 1;
    case 'expense':
      return -1;
    case 'settle':
      // تُحدَّد العلامة حسب اختيار المستخدم عند التسوية (نُخزَّن في transaction.sign)
      return 0; // تعامل بشكل خاص
    case 'transfer':
      return 0; // تعامل بشكل خاص (ساقان)
    default:
      return 0;
  }
}

// حساب الأثر الكامل لعملية على حساب معيّن (بالعملة الخاصة بالحساب)
// يُرجع مقدار التغيّر في رصيد الحساب، أو null إن لم تُؤثّر العملية عليه.
export function txEffect(t, accountId) {
  if (t.type === 'transfer') {
    if (t.fromId === accountId) return -t.amount;
    if (t.toId === accountId) return t.amount * (t.rate || 1);
    return null;
  }
  if (t.accountId !== accountId) return null;
  let eff = opEffect(t.type, t.accountKind);
  if (t.type === 'settle') {
    eff = (t.sign === '+' || t.sign === 1) ? 1 : -1;
  }
  return eff * t.amount;
}

// حساب رصيد حساب واحد = رصيد افتتاحي + مجموع آثار كل العمليات النشطة
export function accountBalance(account, transactions) {
  let bal = Number(account.openingBalance || 0);
  if (!transactions) return bal;
  for (const t of transactions) {
    const e = txEffect(t, account.id);
    if (e !== null) bal += e;
  }
  return bal;
}

// تسمية طبيعة الرصيد
export function balanceLabels(settings) {
  const oweUs = (settings && settings.labelOweUs) || 'عليه';      // موجب → مستحق لنا
  const oweThem = (settings && settings.labelOweThem) || 'له';    // سالب → مستحق منا
  return { oweUs, oweThem };
}

// هل الرصيد «له» أم «عليه»
export function balanceNature(bal) {
  return bal > 0 ? 'positive' : bal < 0 ? 'negative' : 'zero';
}

// العملية: تصنيف العملية حسب نوعها لمجموعات التقارير
export function opGroup(type) {
  if (type === 'revenue' || type === 'in') return 'inflow';
  if (type === 'expense' || type === 'out') return 'outflow';
  if (type === 'debit') return 'receivable';
  if (type === 'credit') return 'payable';
  return 'other';
}
