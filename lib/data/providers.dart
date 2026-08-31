import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/accounting.dart';
import '../core/models.dart';
import 'repository.dart';

final repoProvider = Provider<Repo>((ref) => Repo());

/// عدّاد يُزاد بعد كل تعديل ليُعيد بناء كل ما يعتمد على البيانات.
final refreshProvider = StateProvider<int>((ref) => 0);

void bump(WidgetRef ref) => ref.read(refreshProvider.notifier).state++;

/// الإعدادات كخريطة مفتاح/قيمة — تقابل settings() في نسخة الويب.
final settingsProvider = FutureProvider<Map<String, String>>((ref) async {
  ref.watch(refreshProvider);
  return ref.read(repoProvider).settings();
});

/// وضع السمة.
final themeModeProvider = StateProvider<ThemeMode>((ref) => ThemeMode.system);

/// إخفاء الأرصدة.
final hideBalancesProvider = StateProvider<bool>((ref) => false);

/// العملات المعرَّفة.
final currenciesProvider = FutureProvider<List<CurrencyDef>>((ref) async {
  ref.watch(refreshProvider);
  return ref.read(repoProvider).currencies();
});

/// فلاتر شاشة الحسابات.
class AccountFilter {
  final String query;
  final AccountKind? kind;
  final String? currency;
  final bool showArchived;
  const AccountFilter({
    this.query = '',
    this.kind,
    this.currency,
    this.showArchived = false,
  });

  AccountFilter copyWith({
    String? query,
    AccountKind? kind,
    bool clearKind = false,
    String? currency,
    bool clearCurrency = false,
    bool? showArchived,
  }) =>
      AccountFilter(
        query: query ?? this.query,
        kind: clearKind ? null : (kind ?? this.kind),
        currency: clearCurrency ? null : (currency ?? this.currency),
        showArchived: showArchived ?? this.showArchived,
      );
}

final accountFilterProvider =
    StateProvider<AccountFilter>((ref) => const AccountFilter());

/// الحسابات مع أرصدتها، مطبَّقًا عليها الفلتر.
final accountsProvider = FutureProvider<List<AccountWithBalance>>((ref) async {
  ref.watch(refreshProvider);
  final f = ref.watch(accountFilterProvider);
  final repo = ref.read(repoProvider);

  final all = await repo.accounts(includeArchived: f.showArchived);
  final balances = await repo.allBalances(all);

  final q = f.query.trim().toLowerCase();
  final out = <AccountWithBalance>[];
  for (final a in all) {
    if (f.showArchived && !a.archived) continue;
    if (f.kind != null && a.kind != f.kind) continue;
    if (f.currency != null && a.currency != f.currency) continue;
    if (q.isNotEmpty) {
      final hay = '${a.name} ${a.phone} ${a.whatsapp} ${a.notes} '
              '${a.tags.join(' ')}'
          .toLowerCase();
      if (!hay.contains(q)) continue;
    }
    out.add(AccountWithBalance(a, balances[a.id] ?? a.openingBalance));
  }
  return out;
});

/// كل الحسابات بلا فلتر — للقوائم المنسدلة.
final allAccountsProvider = FutureProvider<List<Account>>((ref) async {
  ref.watch(refreshProvider);
  return ref.read(repoProvider).accounts();
});

/// ملخّص لوحة التحكم.
class Summary {
  /// مستحق لنا (أرصدة موجبة) لكل عملة.
  final Map<String, double> owedToUs;

  /// مستحق علينا (أرصدة سالبة) لكل عملة.
  final Map<String, double> owedByUs;
  final Map<String, double> net;
  final double inflow;
  final double outflow;
  final int accountsCount;
  final int txCount;

  const Summary({
    required this.owedToUs,
    required this.owedByUs,
    required this.net,
    required this.inflow,
    required this.outflow,
    required this.accountsCount,
    required this.txCount,
  });
}

/// ملخّص مالي — الأرصدة لا تُخلط بين العملات أبدًا.
final summaryProvider = FutureProvider<Summary>((ref) async {
  ref.watch(refreshProvider);
  final repo = ref.read(repoProvider);
  final accounts = await repo.accounts();
  final balances = await repo.allBalances(accounts);
  final txs = await repo.transactions();

  final toUs = <String, double>{};
  final byUs = <String, double>{};
  final net = <String, double>{};

  for (final a in accounts) {
    final b = balances[a.id] ?? 0;
    net[a.currency] = (net[a.currency] ?? 0) + b;
    if (b > 0) {
      toUs[a.currency] = (toUs[a.currency] ?? 0) + b;
    } else if (b < 0) {
      byUs[a.currency] = (byUs[a.currency] ?? 0) + b.abs();
    }
  }

  var inflow = 0.0;
  var outflow = 0.0;
  for (final t in txs) {
    final g = opGroup(t.type);
    if (g == 'inflow') inflow += t.amount;
    if (g == 'outflow') outflow += t.amount;
  }

  return Summary(
    owedToUs: toUs,
    owedByUs: byUs,
    net: net,
    inflow: inflow,
    outflow: outflow,
    accountsCount: accounts.length,
    txCount: txs.length,
  );
});

/// آخر العمليات.
final recentTxProvider = FutureProvider<List<Tx>>((ref) async {
  ref.watch(refreshProvider);
  final all = await ref.read(repoProvider).transactions();
  return all.take(12).toList();
});

/// عمليات حساب بعينه.
final accountTxProvider = FutureProvider.family<List<Tx>, int>((ref, id) async {
  ref.watch(refreshProvider);
  return ref.read(repoProvider).transactions(accountId: id);
});

/// تنبيهات: تجاوز الحد الائتماني.
final alertsProvider = FutureProvider<List<AccountWithBalance>>((ref) async {
  ref.watch(refreshProvider);
  final repo = ref.read(repoProvider);
  final accounts = await repo.accounts();
  final balances = await repo.allBalances(accounts);
  return accounts
      .map((a) => AccountWithBalance(a, balances[a.id] ?? 0))
      .where((x) => x.overLimit)
      .toList();
});

/// سجل النشاط.
final activityProvider =
    FutureProvider<List<Map<String, Object?>>>((ref) async {
  ref.watch(refreshProvider);
  return ref.read(repoProvider).recentActivity();
});

// ==================== تصفية العمليات ====================

/// معايير تصفية شاشة العمليات — مطابقة لأشرطة الأدوات في نسخة الويب.
class TxFilter {
  final String query;
  final OpType? type;
  final int? accountId;
  final String? currency;
  final DateTime? from;
  final DateTime? to;
  final TxSort sort;

  const TxFilter({
    this.query = '',
    this.type,
    this.accountId,
    this.currency,
    this.from,
    this.to,
    this.sort = TxSort.newest,
  });

  TxFilter copyWith({
    String? query,
    OpType? type,
    int? accountId,
    String? currency,
    DateTime? from,
    DateTime? to,
    TxSort? sort,
    bool clearType = false,
    bool clearAccount = false,
    bool clearCurrency = false,
    bool clearFrom = false,
    bool clearTo = false,
  }) =>
      TxFilter(
        query: query ?? this.query,
        type: clearType ? null : (type ?? this.type),
        accountId: clearAccount ? null : (accountId ?? this.accountId),
        currency: clearCurrency ? null : (currency ?? this.currency),
        from: clearFrom ? null : (from ?? this.from),
        to: clearTo ? null : (to ?? this.to),
        sort: sort ?? this.sort,
      );

  /// هل هناك أي مرشّح فعّال غير الترتيب؟
  bool get isActive =>
      query.isNotEmpty ||
      type != null ||
      accountId != null ||
      currency != null ||
      from != null ||
      to != null;
}

enum TxSort {
  newest('الأحدث أولاً'),
  amount('الأكبر مبلغًا'),
  account('بالحساب');

  const TxSort(this.label);
  final String label;
}

final txFilterProvider = StateProvider<TxFilter>((ref) => const TxFilter());

/// نتيجة شاشة العمليات: العمليات المصفّاة + خريطة أسماء الحسابات + الإجماليات.
class TxPage {
  final List<Tx> items;
  final Map<int, Account> accounts;
  final Map<String, double> inflowByCurrency;
  final Map<String, double> outflowByCurrency;

  const TxPage({
    required this.items,
    required this.accounts,
    required this.inflowByCurrency,
    required this.outflowByCurrency,
  });
}

final txPageProvider = FutureProvider<TxPage>((ref) async {
  ref.watch(refreshProvider);
  final f = ref.watch(txFilterProvider);
  final repo = ref.watch(repoProvider);

  final all = await repo.transactions(
    accountId: f.accountId,
    from: f.from,
    to: f.to,
    type: f.type,
  );
  final accs = await repo.accounts(includeArchived: true);
  final byId = {for (final a in accs) a.id!: a};

  final q = f.query.trim().toLowerCase();
  var list = all.where((t) {
    if (f.currency != null && t.currency != f.currency) return false;
    if (q.isEmpty) return true;
    final accName =
        t.type == OpType.transfer ? 'تحويل' : (byId[t.accountId]?.name ?? '');
    final hay =
        '${t.description} ${t.reference} $accName ${t.notes}'.toLowerCase();
    return hay.contains(q);
  }).toList();

  switch (f.sort) {
    case TxSort.amount:
      list.sort((a, b) => b.amount.compareTo(a.amount));
    case TxSort.account:
      list.sort((a, b) => (byId[a.accountId]?.name ?? '')
          .compareTo(byId[b.accountId]?.name ?? ''));
    case TxSort.newest:
      list.sort((a, b) => b.date.compareTo(a.date));
  }

  // إجماليات الداخل والخارج لكل عملة على المجموعة المعروضة.
  final inflow = <String, double>{};
  final outflow = <String, double>{};
  for (final t in list) {
    final g = opGroup(t.type);
    if (g == 'inflow') {
      inflow[t.currency] = (inflow[t.currency] ?? 0) + t.amount;
    } else if (g == 'outflow') {
      outflow[t.currency] = (outflow[t.currency] ?? 0) + t.amount;
    }
  }

  return TxPage(
    items: list,
    accounts: byId,
    inflowByCurrency: inflow,
    outflowByCurrency: outflow,
  );
});

// ==================== السندات ====================

class VoucherFilter {
  final String query;
  final VoucherKind? kind;
  final String? status;
  const VoucherFilter({this.query = '', this.kind, this.status});

  VoucherFilter copyWith({
    String? query,
    VoucherKind? kind,
    String? status,
    bool clearKind = false,
    bool clearStatus = false,
  }) =>
      VoucherFilter(
        query: query ?? this.query,
        kind: clearKind ? null : (kind ?? this.kind),
        status: clearStatus ? null : (status ?? this.status),
      );
}

final voucherFilterProvider =
    StateProvider<VoucherFilter>((ref) => const VoucherFilter());

final vouchersProvider = FutureProvider<List<Voucher>>((ref) async {
  ref.watch(refreshProvider);
  final f = ref.watch(voucherFilterProvider);
  final repo = ref.watch(repoProvider);
  final list = await repo.vouchers(kind: f.kind, status: f.status);
  final accs = await repo.accounts(includeArchived: true);
  final byId = {for (final a in accs) a.id!: a};
  final q = f.query.trim().toLowerCase();
  if (q.isEmpty) return list;
  return list.where((v) {
    final name = byId[v.accountId]?.name ?? '';
    return '${v.number} $name ${v.statement}'.toLowerCase().contains(q);
  }).toList();
});

// ==================== المستخدمون ====================

final usersProvider = FutureProvider<List<AppUser>>((ref) async {
  ref.watch(refreshProvider);
  return ref.watch(repoProvider).users();
});

final currentUserProvider = FutureProvider<AppUser?>((ref) async {
  ref.watch(refreshProvider);
  return ref.watch(repoProvider).currentUser();
});

// ==================== التقارير ====================

/// نطاق التقرير: الفترة والعملة والحساب.
class ReportScope {
  final DateTime from;
  final DateTime to;
  final String? currency;
  final int? accountId;

  const ReportScope({
    required this.from,
    required this.to,
    this.currency,
    this.accountId,
  });

  ReportScope copyWith({
    DateTime? from,
    DateTime? to,
    String? currency,
    int? accountId,
    bool clearCurrency = false,
    bool clearAccount = false,
  }) =>
      ReportScope(
        from: from ?? this.from,
        to: to ?? this.to,
        currency: clearCurrency ? null : (currency ?? this.currency),
        accountId: clearAccount ? null : (accountId ?? this.accountId),
      );
}

final reportScopeProvider = StateProvider<ReportScope>((ref) {
  final now = DateTime.now();
  return ReportScope(
    from: DateTime(now.year, now.month, 1),
    to: DateTime(now.year, now.month, now.day, 23, 59, 59),
  );
});

/// بيانات التقرير الخام: العمليات المصفّاة + الحسابات + أرصدتها ضمن النطاق.
class ReportData {
  final List<Tx> txs;
  final List<Account> accounts;
  final Map<int, double> balances;
  final Map<int, int> txCount;

  const ReportData({
    required this.txs,
    required this.accounts,
    required this.balances,
    required this.txCount,
  });
}

final reportDataProvider = FutureProvider<ReportData>((ref) async {
  ref.watch(refreshProvider);
  final s = ref.watch(reportScopeProvider);
  final repo = ref.watch(repoProvider);

  final txs = (await repo.transactions(
    from: s.from,
    to: s.to,
    accountId: s.accountId,
  ))
      .where((t) => s.currency == null || t.currency == s.currency)
      .toList();

  final accounts = await repo.accounts(includeArchived: true);

  // الرصيد ضمن النطاق = الافتتاحي + أثر عمليات النطاق فقط،
  // تمامًا كما يفعل accountBalance(a, d.txs) في نسخة الويب.
  final balances = <int, double>{};
  final counts = <int, int>{};
  for (final a in accounts) {
    var bal = a.openingBalance;
    var n = 0;
    for (final t in txs) {
      final e = t.effectOn(a.id!);
      if (e != null) {
        bal += e;
        n++;
      }
    }
    balances[a.id!] = bal;
    counts[a.id!] = n;
  }

  return ReportData(
    txs: txs,
    accounts: accounts,
    balances: balances,
    txCount: counts,
  );
});

// ==================== التصنيفات وسلة المهملات ====================

final categoriesProvider = FutureProvider<List<String>>((ref) async {
  ref.watch(refreshProvider);
  return ref.watch(repoProvider).categories();
});

final trashProvider = FutureProvider<List<Map<String, Object?>>>((ref) async {
  ref.watch(refreshProvider);
  return ref.watch(repoProvider).trash();
});

final countsProvider = FutureProvider<Map<String, int>>((ref) async {
  ref.watch(refreshProvider);
  return ref.watch(repoProvider).counts();
});

// ==================== الدردشة ====================

final conversationsProvider =
    FutureProvider<List<Map<String, Object?>>>((ref) async {
  ref.watch(refreshProvider);
  return ref.watch(repoProvider).conversations();
});

final messagesProvider =
    FutureProvider.family<List<ChatMessage>, int>((ref, convId) async {
  ref.watch(refreshProvider);
  return ref.watch(repoProvider).messages(convId);
});

// ==================== الأصناف والمخزون ====================

/// فئات الأصناف التي تظهر أولًا في شاشة المخزون.
final itemCategoriesProvider = FutureProvider<List<ItemCategory>>((ref) async {
  ref.watch(refreshProvider);
  return ref.read(repoProvider).itemCategories();
});

/// نص البحث في شاشة المخزون.
final itemQueryProvider = StateProvider<String>((ref) => '');

/// الأصناف المطابقة للبحث الحالي.
final itemsProvider = FutureProvider<List<Item>>((ref) async {
  ref.watch(refreshProvider);
  final q = ref.watch(itemQueryProvider);
  return ref.read(repoProvider).items(q: q);
});

/// ملخّص المخزون: التكلفة والقيمة والأرباح.
final inventorySummaryProvider =
    FutureProvider<Map<String, double>>((ref) async {
  ref.watch(refreshProvider);
  return ref.read(repoProvider).inventorySummary();
});

/// حركات صنف بعينه.
final stockMovesProvider =
    FutureProvider.family<List<StockMove>, int>((ref, itemId) async {
  ref.watch(refreshProvider);
  return ref.read(repoProvider).stockMoves(itemId: itemId);
});
