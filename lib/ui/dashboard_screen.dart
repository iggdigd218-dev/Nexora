import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/accounting.dart';
import '../core/format.dart';
import '../core/theme.dart';
import '../data/providers.dart';
import 'widgets.dart';

/// لوحة التحكم — الملخّص المالي وآخر العمليات والتنبيهات.
class DashboardScreen extends ConsumerWidget {
  final void Function(int tab)? onNavigate;
  const DashboardScreen({super.key, this.onNavigate});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final summary = ref.watch(summaryProvider);
    final currencies = ref.watch(currenciesProvider);
    final hidden = ref.watch(hideBalancesProvider);

    return RefreshIndicator(
      onRefresh: () async => bump(ref),
      child: ListView(
        padding: const EdgeInsets.fromLTRB(14, 8, 14, 90),
        children: [
          summary.when(
            loading: () => const Padding(
              padding: EdgeInsets.symmetric(vertical: 60),
              child: Center(child: CircularProgressIndicator()),
            ),
            error: (e, _) => EmptyState(
              icon: Icons.error_outline,
              title: 'تعذّر تحميل الملخّص',
              message: '$e',
            ),
            data: (s) {
              final curs = currencies.valueOrNull ?? kDefaultCurrencies;
              return Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const SectionTitle('الملخّص المالي'),
                  _CurrencyTotals(
                    title: 'مستحق لنا',
                    totals: s.owedToUs,
                    currencies: curs,
                    color: AppColors.green,
                    icon: Icons.trending_up,
                    hidden: hidden,
                  ),
                  const SizedBox(height: 10),
                  _CurrencyTotals(
                    title: 'مستحق علينا',
                    totals: s.owedByUs,
                    currencies: curs,
                    color: AppColors.red,
                    icon: Icons.trending_down,
                    hidden: hidden,
                  ),
                  const SizedBox(height: 10),
                  _CurrencyTotals(
                    title: 'صافي الرصيد',
                    totals: s.net,
                    currencies: curs,
                    color: AppColors.teal,
                    icon: Icons.account_balance_wallet_outlined,
                    hidden: hidden,
                    signed: true,
                  ),
                  const SizedBox(height: 16),
                  Row(
                    children: [
                      Expanded(
                        child: StatCard(
                          title: 'الحسابات',
                          value: '${s.accountsCount}',
                          icon: Icons.people_alt_outlined,
                          color: AppColors.info,
                          onTap: () => onNavigate?.call(1),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: StatCard(
                          title: 'العمليات',
                          value: '${s.txCount}',
                          icon: Icons.receipt_long_outlined,
                          color: AppColors.violet,
                          onTap: () => onNavigate?.call(2),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 10),
                  Row(
                    children: [
                      Expanded(
                        child: StatCard(
                          title: 'الإيرادات والقبض',
                          value: hidden ? '••••' : Fmt.money(s.inflow),
                          icon: Icons.south_west,
                          color: AppColors.green,
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: StatCard(
                          title: 'المصروفات والصرف',
                          value: hidden ? '••••' : Fmt.money(s.outflow),
                          icon: Icons.north_east,
                          color: AppColors.red,
                        ),
                      ),
                    ],
                  ),
                ],
              );
            },
          ),
          const SizedBox(height: 18),
          const _Alerts(),
          const SizedBox(height: 8),
          _Recent(onNavigate: onNavigate),
        ],
      ),
    );
  }
}

/// إجماليات مفصولة لكل عملة — لا تُخلط العملات أبدًا.
class _CurrencyTotals extends StatelessWidget {
  final String title;
  final Map<String, double> totals;
  final List<CurrencyDef> currencies;
  final Color color;
  final IconData icon;
  final bool hidden;
  final bool signed;

  const _CurrencyTotals({
    required this.title,
    required this.totals,
    required this.currencies,
    required this.color,
    required this.icon,
    required this.hidden,
    this.signed = false,
  });

  @override
  Widget build(BuildContext context) {
    final entries = totals.entries.where((e) => e.value.abs() > 0.005).toList();
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(7),
                  decoration: BoxDecoration(
                    color: color.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(9),
                  ),
                  child: Icon(icon, size: 17, color: color),
                ),
                const SizedBox(width: 9),
                Text(title,
                    style: const TextStyle(
                        fontSize: 16, fontWeight: FontWeight.w800)),
              ],
            ),
            const SizedBox(height: 10),
            if (entries.isEmpty)
              Text('لا يوجد',
                  style: TextStyle(
                      fontSize: 14.5, color: Theme.of(context).hintColor))
            else
              ...entries.map((e) {
                final c = currencies.firstWhere(
                  (x) => x.code == e.key,
                  orElse: () => CurrencyDef(e.key, e.key, e.key, 0),
                );
                return Padding(
                  padding: const EdgeInsets.only(bottom: 6),
                  child: Row(
                    children: [
                      Text(c.name,
                          style: const TextStyle(
                              fontSize: 16, fontWeight: FontWeight.w800)),
                      const Spacer(),
                      if (signed)
                        BalanceText(
                          value: e.value,
                          currency: c,
                          hidden: hidden,
                          size: 15,
                        )
                      else
                        Text(
                          hidden
                              ? '••••••'
                              : '${Fmt.money(e.value, c.decimal)} ${c.symbol}',
                          style: TextStyle(
                              fontSize: 18,
                              fontWeight: FontWeight.w800,
                              color: color),
                        ),
                    ],
                  ),
                );
              }),
          ],
        ),
      ),
    );
  }
}

class _Alerts extends ConsumerWidget {
  const _Alerts();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final alerts = ref.watch(alertsProvider).valueOrNull ?? [];
    if (alerts.isEmpty) return const SizedBox.shrink();
    final curs = ref.watch(currenciesProvider).valueOrNull ?? kDefaultCurrencies;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SectionTitle('تنبيهات'),
        Card(
          child: Column(
            children: alerts.map((a) {
              final c = curs.firstWhere((x) => x.code == a.account.currency,
                  orElse: () => kDefaultCurrencies.first);
              return ListTile(
                leading: const Icon(Icons.warning_amber_rounded,
                    color: AppColors.amber),
                title: Text(a.account.name,
                    style: const TextStyle(
                        fontSize: 16, fontWeight: FontWeight.w800)),
                subtitle: Text(
                  'تجاوز الحد الائتماني '
                  '(${Fmt.money(a.account.creditLimit ?? 0, c.decimal)} ${c.symbol})',
                  style: const TextStyle(fontSize: 13.5),
                ),
                trailing: Text('${Fmt.money(a.balance, c.decimal)} ${c.symbol}',
                    style: const TextStyle(
                        fontSize: 14.5,
                        fontWeight: FontWeight.w800,
                        color: AppColors.amber)),
              );
            }).toList(),
          ),
        ),
        const SizedBox(height: 10),
      ],
    );
  }
}

class _Recent extends ConsumerWidget {
  final void Function(int tab)? onNavigate;
  const _Recent({this.onNavigate});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final txs = ref.watch(recentTxProvider).valueOrNull ?? [];
    final accounts = ref.watch(allAccountsProvider).valueOrNull ?? [];
    final curs = ref.watch(currenciesProvider).valueOrNull ?? kDefaultCurrencies;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SectionTitle('آخر العمليات',
            actionLabel: txs.isEmpty ? null : 'عرض الكل',
            onAction: () => onNavigate?.call(2)),
        if (txs.isEmpty)
          Card(
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 26),
              child: EmptyState(
                icon: Icons.receipt_long_outlined,
                title: 'لا توجد عمليات بعد',
                message: 'ابدأ بتسجيل أول عملية مالية',
              ),
            ),
          )
        else
          Card(
            child: Column(
              children: [
                for (var i = 0; i < txs.length; i++) ...[
                  if (i > 0) const Divider(height: 1, indent: 56),
                  _TxRow(
                    tx: txs[i],
                    accounts: accounts,
                    currencies: curs,
                  ),
                ],
              ],
            ),
          ),
      ],
    );
  }
}

class _TxRow extends StatelessWidget {
  final dynamic tx;
  final List accounts;
  final List<CurrencyDef> currencies;
  const _TxRow(
      {required this.tx, required this.accounts, required this.currencies});

  @override
  Widget build(BuildContext context) {
    final c = currencies.firstWhere((x) => x.code == tx.currency,
        orElse: () => kDefaultCurrencies.first);
    final acc = accounts.where((a) => a.id == tx.accountId).toList();
    final name = acc.isEmpty
        ? (tx.type == OpType.transfer ? 'تحويل' : '—')
        : acc.first.name;
    final group = opGroup(tx.type);
    final color = group == 'inflow'
        ? AppColors.green
        : (group == 'outflow' ? AppColors.red : AppColors.teal);

    return ListTile(
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 2),
      leading: Container(
        width: 38,
        height: 38,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.12),
          borderRadius: BorderRadius.circular(10),
        ),
        child: Text(tx.type.icon, style: const TextStyle(fontSize: 20)),
      ),
      title: Text(name,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800)),
      subtitle: Text(
        '${tx.type.label} · ${Fmt.date(tx.date)}'
        '${tx.description.isEmpty ? '' : ' · ${tx.description}'}',
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: const TextStyle(fontSize: 13),
      ),
      trailing: Text(
        '${Fmt.money(tx.amount, c.decimal)} ${c.symbol}',
        style: TextStyle(
            fontSize: 16.5, fontWeight: FontWeight.w800, color: color),
      ),
    );
  }
}
