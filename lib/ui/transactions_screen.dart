import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/accounting.dart';
import '../core/format.dart';
import '../core/models.dart';
import '../core/theme.dart';
import '../data/providers.dart';
import 'tx_form.dart';
import 'tx_share.dart';
import 'widgets.dart';

class TransactionsScreen extends ConsumerWidget {
  const TransactionsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final page = ref.watch(txPageProvider);
    final hidden = ref.watch(hideBalancesProvider);

    return Column(
      children: [
        const _TxFilterBar(),
        Expanded(
          child: page.when(
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (e, _) => EmptyState(
              icon: Icons.error_outline,
              title: 'تعذّر تحميل العمليات',
              message: '$e',
            ),
            data: (p) {
              if (p.items.isEmpty) {
                return const EmptyState(
                  icon: Icons.receipt_long_outlined,
                  title: 'لا توجد عمليات مطابقة',
                  message: 'غيّر معايير البحث أو سجّل عملية جديدة.',
                );
              }
              return ListView.separated(
                padding: const EdgeInsets.fromLTRB(14, 4, 14, 96),
                itemCount: p.items.length + 1,
                separatorBuilder: (_, __) => const SizedBox(height: 10),
                itemBuilder: (context, i) {
                  if (i == 0) return _Totals(page: p, hidden: hidden);
                  final t = p.items[i - 1];
                  return _TxCard(
                    tx: t,
                    account: t.type == OpType.transfer
                        ? p.accounts[t.fromId]
                        : p.accounts[t.accountId],
                    toAccount: p.accounts[t.toId],
                    hidden: hidden,
                  );
                },
              );
            },
          ),
        ),
      ],
    );
  }
}

/// شريط البحث والمرشّحات — يطابق أدوات نسخة الويب.
class _TxFilterBar extends ConsumerStatefulWidget {
  const _TxFilterBar();

  @override
  ConsumerState<_TxFilterBar> createState() => _TxFilterBarState();
}

class _TxFilterBarState extends ConsumerState<_TxFilterBar> {
  late final TextEditingController _q;

  @override
  void initState() {
    super.initState();
    _q = TextEditingController(text: ref.read(txFilterProvider).query);
  }

  @override
  void dispose() {
    _q.dispose();
    super.dispose();
  }

  void _set(TxFilter f) => ref.read(txFilterProvider.notifier).state = f;

  @override
  Widget build(BuildContext context) {
    final f = ref.watch(txFilterProvider);
    final accounts = ref.watch(allAccountsProvider).valueOrNull ?? [];
    final currencies = ref.watch(currenciesProvider).valueOrNull ?? [];

    return Container(
      color: AppColors.surfaceOf(context),
      padding: const EdgeInsets.fromLTRB(14, 10, 14, 10),
      child: Column(
        children: [
          TextField(
            controller: _q,
            decoration: InputDecoration(
              hintText: 'بحث بالبيان أو المرجع أو الحساب...',
              prefixIcon: const Icon(Icons.search),
              isDense: true,
              suffixIcon: f.query.isEmpty
                  ? null
                  : IconButton(
                      icon: const Icon(Icons.clear, size: 18),
                      onPressed: () {
                        _q.clear();
                        _set(f.copyWith(query: ''));
                      },
                    ),
            ),
            onChanged: (v) => _set(f.copyWith(query: v)),
          ),
          const SizedBox(height: 10),
          SizedBox(
            height: 34,
            child: ListView(
              scrollDirection: Axis.horizontal,
              children: [
                _chip(
                  label: f.type?.label ?? 'كل الأنواع',
                  active: f.type != null,
                  onTap: () => _pickType(f),
                ),
                _chip(
                  label: f.accountId == null
                      ? 'كل الحسابات'
                      : (accounts
                              .where((a) => a.id == f.accountId)
                              .firstOrNull
                              ?.name ??
                          'حساب'),
                  active: f.accountId != null,
                  onTap: () => _pickAccount(f, accounts),
                ),
                _chip(
                  label: f.currency ?? 'كل العملات',
                  active: f.currency != null,
                  onTap: () => _pickCurrency(f, currencies),
                ),
                _chip(
                  label: f.from == null && f.to == null
                      ? 'كل الفترات'
                      : '${f.from != null ? Fmt.date(f.from!) : '…'} → ${f.to != null ? Fmt.date(f.to!) : '…'}',
                  active: f.from != null || f.to != null,
                  onTap: () => _pickRange(f),
                ),
                _chip(
                  label: f.sort.label,
                  active: f.sort != TxSort.newest,
                  icon: Icons.sort,
                  onTap: () => _pickSort(f),
                ),
                if (f.isActive)
                  _chip(
                    label: 'مسح الكل',
                    active: false,
                    icon: Icons.filter_alt_off_outlined,
                    danger: true,
                    onTap: () {
                      _q.clear();
                      _set(const TxFilter());
                    },
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _chip({
    required String label,
    required bool active,
    required VoidCallback onTap,
    IconData? icon,
    bool danger = false,
  }) {
    final c = danger
        ? AppColors.dangerOf(context)
        : (active ? AppColors.primaryOf(context) : AppColors.text2Of(context));
    return Padding(
      padding: const EdgeInsetsDirectional.only(end: 8),
      child: InkWell(
        borderRadius: BorderRadius.circular(10),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12),
          decoration: BoxDecoration(
            color: active
                ? AppColors.primarySoftOf(context)
                : AppColors.surface2Of(context),
            borderRadius: BorderRadius.circular(10),
            border: Border.all(
                color: active ? c : AppColors.borderOf(context)),
          ),
          child: Row(
            children: [
              Icon(icon ?? Icons.expand_more, size: 15, color: c),
              const SizedBox(width: 5),
              Text(label,
                  style: TextStyle(
                      fontSize: 12.5, fontWeight: FontWeight.w700, color: c)),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _pickType(TxFilter f) async {
    final v = await showModalBottomSheet<Object>(
      context: context,
      builder: (_) => _SheetList(
        title: 'نوع العملية',
        items: [
          const _SheetItem(value: '', label: 'كل الأنواع'),
          ...OpType.values
              .map((t) => _SheetItem(value: t, label: '${t.icon}  ${t.label}')),
        ],
      ),
    );
    if (v == null) return;
    _set(v is OpType ? f.copyWith(type: v) : f.copyWith(clearType: true));
  }

  Future<void> _pickAccount(TxFilter f, List<Account> accounts) async {
    final v = await showModalBottomSheet<Object>(
      context: context,
      builder: (_) => _SheetList(
        title: 'الحساب',
        items: [
          const _SheetItem(value: '', label: 'كل الحسابات'),
          ...accounts.map((a) =>
              _SheetItem(value: a.id!, label: '${a.kind.icon}  ${a.name}')),
        ],
      ),
    );
    if (v == null) return;
    _set(v is int ? f.copyWith(accountId: v) : f.copyWith(clearAccount: true));
  }

  Future<void> _pickCurrency(TxFilter f, List<CurrencyDef> curs) async {
    final v = await showModalBottomSheet<Object>(
      context: context,
      builder: (_) => _SheetList(
        title: 'العملة',
        items: [
          const _SheetItem(value: '', label: 'كل العملات'),
          ...curs.map((c) =>
              _SheetItem(value: c.code, label: '${c.symbol}  ${c.name}')),
        ],
      ),
    );
    if (v == null) return;
    _set(v is String && v.isNotEmpty
        ? f.copyWith(currency: v)
        : f.copyWith(clearCurrency: true));
  }

  Future<void> _pickSort(TxFilter f) async {
    final v = await showModalBottomSheet<Object>(
      context: context,
      builder: (_) => _SheetList(
        title: 'الترتيب',
        items: TxSort.values
            .map((s) => _SheetItem(value: s, label: s.label))
            .toList(),
      ),
    );
    if (v is TxSort) _set(f.copyWith(sort: v));
  }

  Future<void> _pickRange(TxFilter f) async {
    final r = await showDateRangePicker(
      context: context,
      firstDate: DateTime(2015),
      lastDate: DateTime(2100),
      locale: const Locale('ar'),
      initialDateRange: f.from != null && f.to != null
          ? DateTimeRange(start: f.from!, end: f.to!)
          : null,
    );
    if (r == null) return;
    _set(f.copyWith(
      from: DateTime(r.start.year, r.start.month, r.start.day),
      to: DateTime(r.end.year, r.end.month, r.end.day, 23, 59, 59),
    ));
  }
}

class _SheetItem {
  final Object value;
  final String label;
  const _SheetItem({required this.value, required this.label});
}

class _SheetList extends StatelessWidget {
  final String title;
  final List<_SheetItem> items;
  const _SheetList({required this.title, required this.items});

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Padding(
            padding: const EdgeInsets.all(16),
            child: Text(title,
                style: Theme.of(context).textTheme.titleMedium),
          ),
          const Divider(height: 1),
          Flexible(
            child: ListView.builder(
              shrinkWrap: true,
              itemCount: items.length,
              itemBuilder: (context, i) => ListTile(
                title: Text(items[i].label),
                onTap: () => Navigator.pop(context, items[i].value),
              ),
            ),
          ),
          const SizedBox(height: 8),
        ],
      ),
    );
  }
}

class _Totals extends StatelessWidget {
  final TxPage page;
  final bool hidden;
  const _Totals({required this.page, required this.hidden});

  @override
  Widget build(BuildContext context) {
    final codes = {
      ...page.inflowByCurrency.keys,
      ...page.outflowByCurrency.keys,
    }.toList();
    if (codes.isEmpty) return const SizedBox.shrink();

    return Padding(
      padding: const EdgeInsets.only(top: 10, bottom: 2),
      child: Column(
        children: [
          for (final code in codes)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Row(
                children: [
                  Expanded(
                    child: StatCard(
                      title: 'وارد ($code)',
                      value: hidden
                          ? '••••'
                          : Fmt.money(page.inflowByCurrency[code] ?? 0),
                      icon: Icons.south_west,
                      color: AppColors.greenOf(context),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: StatCard(
                      title: 'صادر ($code)',
                      value: hidden
                          ? '••••'
                          : Fmt.money(page.outflowByCurrency[code] ?? 0),
                      icon: Icons.north_east,
                      color: AppColors.dangerOf(context),
                    ),
                  ),
                ],
              ),
            ),
          Row(
            children: [
              Text('${page.items.length} عملية',
                  style: TextStyle(
                      fontSize: 12.5,
                      fontWeight: FontWeight.w700,
                      color: AppColors.text2Of(context))),
              const Spacer(),
            ],
          ),
        ],
      ),
    );
  }
}

class _TxCard extends ConsumerWidget {
  final Tx tx;
  final Account? account;
  final Account? toAccount;
  final bool hidden;
  const _TxCard({
    required this.tx,
    required this.account,
    required this.toAccount,
    required this.hidden,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final isTransfer = tx.type == OpType.transfer;
    final group = opGroup(tx.type);
    final color = switch (group) {
      'inflow' => AppColors.greenOf(context),
      'outflow' => AppColors.dangerOf(context),
      'receivable' => AppColors.infoOf(context),
      'payable' => AppColors.accentOf(context),
      _ => AppColors.violetOf(context),
    };

    final title = isTransfer
        ? '${account?.name ?? '—'}  ←  ${toAccount?.name ?? '—'}'
        : (account?.name ?? '—');

    return Card(
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: () => _menu(context, ref),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Row(
            children: [
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  color: color.withValues(alpha: .12),
                  borderRadius: BorderRadius.circular(12),
                ),
                alignment: Alignment.center,
                child: Text(tx.type.icon,
                    style: const TextStyle(fontSize: 19)),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(title,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                            fontWeight: FontWeight.w700, fontSize: 14.5)),
                    const SizedBox(height: 3),
                    Row(
                      children: [
                        Pill(tx.type.label, color: color),
                        const SizedBox(width: 6),
                        Flexible(
                          child: Text(
                            tx.description.isEmpty
                                ? Fmt.date(tx.date)
                                : tx.description,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                                fontSize: 12,
                                color: AppColors.text3Of(context)),
                          ),
                        ),
                      ],
                    ),
                    if (tx.status != 'done') ...[
                      const SizedBox(height: 4),
                      Pill(tx.status == 'pending' ? 'معلقة' : 'ملغاة',
                          color: AppColors.accentOf(context)),
                    ],
                  ],
                ),
              ),
              const SizedBox(width: 8),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(
                    hidden ? '••••' : Fmt.money(tx.amount),
                    style: TextStyle(
                        fontWeight: FontWeight.w800,
                        fontSize: 15.5,
                        color: color),
                  ),
                  const SizedBox(height: 2),
                  Text(tx.currency,
                      style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                          color: AppColors.text3Of(context))),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _menu(BuildContext context, WidgetRef ref) async {
    final action = await showModalBottomSheet<String>(
      context: context,
      builder: (_) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const SizedBox(height: 8),
            ListTile(
              leading: const Icon(Icons.edit_outlined),
              title: const Text('تعديل العملية'),
              onTap: () => Navigator.pop(context, 'edit'),
            ),
            ListTile(
              leading: const Icon(Icons.copy_all_outlined),
              title: const Text('تكرار العملية'),
              onTap: () => Navigator.pop(context, 'copy'),
            ),
            ListTile(
              leading: Icon(Icons.send, color: AppColors.primaryOf(context)),
              title: const Text('إرسال واتساب'),
              subtitle: const Text('يفتح محادثة العميل بالصورة والنص'),
              onTap: () => Navigator.pop(context, 'send'),
            ),
            ListTile(
              leading: const Icon(Icons.image_outlined),
              title: const Text('صورة الإيصال'),
              subtitle: const Text('معاينة وإعادة التوليد'),
              onTap: () => Navigator.pop(context, 'image'),
            ),
            ListTile(
              leading: Icon(Icons.delete_outline,
                  color: AppColors.dangerOf(context)),
              title: Text('حذف العملية',
                  style: TextStyle(color: AppColors.dangerOf(context))),
              onTap: () => Navigator.pop(context, 'delete'),
            ),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
    if (action == null || !context.mounted) return;

    switch (action) {
      case 'edit':
        await openTxForm(context, ref, existing: tx);
      case 'copy':
        await openTxForm(context, ref, existing: tx, isCopy: true);
      case 'send':
        // إعادة الإرسال تسلك المسار نفسه تمامًا كعملية جديدة.
        await TxShare.sendNow(context, ref, tx: tx);
      case 'image':
        await showReceiptPreview(context, ref, tx: tx);
      case 'delete':
        final ok = await confirmDialog(
          context,
          title: 'حذف عملية',
          message:
              'سيُحذف السجل ويُحدَّث رصيد الحساب تلقائيًا. هل تريد المتابعة؟',
          danger: true,
        );
        if (ok == true) {
          await ref.read(repoProvider).deleteTx(tx.id!);
          bump(ref);
          if (context.mounted) {
            showSnack(context, 'تم حذف العملية وتحديث الرصيد');
          }
        }
    }
  }
}
