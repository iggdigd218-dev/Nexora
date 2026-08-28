/// محرك المحاسبة — قلب النظام.
///
/// الاتفاقية المحاسبية (منقولة حرفيًا من نسخة الويب، ولا يجوز تغييرها
/// وإلا انعكست كل الأرصدة في التطبيق):
///   الرصيد الموجب (+) = مبلغ مستحق لنا من الحساب  → يُعرض «عليه»
///   الرصيد السالب (−) = مبلغ مستحق منا للحساب     → يُعرض «له»
library;

/// أنواع الحسابات.
enum AccountKind {
  customer('عميل', '👤', 'customer'),
  supplier('مورد', '🏭', 'supplier'),
  general('حساب عام', '🏦', 'general');

  const AccountKind(this.label, this.icon, this.code);
  final String label;
  final String icon;
  final String code;

  static AccountKind fromCode(String c) => AccountKind.values
      .firstWhere((e) => e.code == c, orElse: () => AccountKind.general);
}

/// أنواع العمليات المالية — كما في نسخة الويب تمامًا.
enum OpType {
  inflow('قبض', '🔄', 'in'),
  outflow('صرف', '💸', 'out'),
  debit('مبلغ له (مدين)', '➕', 'debit'),
  credit('مبلغ عليه (دائن)', '➖', 'credit'),
  revenue('إيراد', '📈', 'revenue'),
  expense('مصروف', '📉', 'expense'),
  transfer('تحويل', '🔁', 'transfer'),
  settle('تسوية', '⚖️', 'settle');

  const OpType(this.label, this.icon, this.code);
  final String label;
  final String icon;
  final String code;

  static OpType fromCode(String c) =>
      OpType.values.firstWhere((e) => e.code == c, orElse: () => OpType.debit);
}

/// العملات الافتراضية.
class CurrencyDef {
  final String code;
  final String name;
  final String symbol;
  final int decimal;
  const CurrencyDef(this.code, this.name, this.symbol, this.decimal);

  Map<String, Object?> toMap() =>
      {'code': code, 'name': name, 'symbol': symbol, 'decimal': decimal};

  factory CurrencyDef.fromMap(Map<String, Object?> m) => CurrencyDef(
        (m['code'] ?? '') as String,
        (m['name'] ?? '') as String,
        (m['symbol'] ?? '') as String,
        (m['decimal'] ?? 0) as int,
      );
}

const kDefaultCurrencies = <CurrencyDef>[
  CurrencyDef('YER', 'الريال اليمني', 'ر.ي', 0),
  CurrencyDef('USD', 'الدولار الأمريكي', '\$', 2),
  CurrencyDef('SAR', 'الريال السعودي', 'ر.س', 2),
];

/// أثر نوع العملية على الرصيد.
///
/// يعيد صفرًا للتحويل والتسوية لأنهما يُعالجان معالجة خاصة:
/// التحويل له ساقان، والتسوية علامتها يختارها المستخدم.
int opEffect(OpType type, AccountKind kind) {
  switch (type) {
    case OpType.inflow:
      // قبض: الحساب العام يستلم نقدًا فيزيد أصله، أما العميل/المورد
      // فالقبض منه سداد ينقص ذمته.
      return kind == AccountKind.general ? 1 : -1;
    case OpType.outflow:
      return kind == AccountKind.general ? -1 : 1;
    case OpType.debit:
      return 1;
    case OpType.credit:
      return -1;
    case OpType.revenue:
      return 1;
    case OpType.expense:
      return -1;
    case OpType.settle:
      return 0;
    case OpType.transfer:
      return 0;
  }
}

/// مجموعة العملية لأغراض التقارير.
String opGroup(OpType type) {
  if (type == OpType.revenue || type == OpType.inflow) return 'inflow';
  if (type == OpType.expense || type == OpType.outflow) return 'outflow';
  if (type == OpType.debit) return 'receivable';
  if (type == OpType.credit) return 'payable';
  return 'other';
}

/// طبيعة الرصيد.
String balanceNature(double bal) =>
    bal > 0 ? 'positive' : (bal < 0 ? 'negative' : 'zero');
