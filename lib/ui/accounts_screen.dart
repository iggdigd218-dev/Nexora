import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/accounting.dart';
import '../core/models.dart';
import '../core/theme.dart';
import '../data/providers.dart';
import 'account_detail.dart';
import 'account_form.dart';
import 'widgets.dart';

/// شاشة الحسابات: بحث وفلترة وقائمة بالأرصدة.
class AccountsScreen extends ConsumerWidget {
  const AccountsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final list = ref.watch(accountsProvider);
    final filter = ref.watch(accountFilterProvider);
    final curs = ref.watch(currenciesProvider).valueOrNull ?? kDefaultCurrencies;
    final hidden = ref.watch(hideBalancesProvider);

    return Column(
      children: [
        _FilterBar(filter: filter, currencies: curs),
        Expanded(
          child: list.when(
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (e, _) => EmptyState(
              icon: Icons.error_outline,
              title: 'تعذّر تحميل الحسابات',
              message: '$e',
            ),
            data: (items) {
              if (items.isEmpty) {
                return EmptyState(
                  icon: Icons.people_outline,
                  title: filter.query.isEmpty && filter.kind == null
                      ? 'لا توجد حسابات بعد'
                      : 'لا نتائج مطابقة',
                  message: filter.query.isEmpty && filter.kind == null
                      ? 'أضف أول حساب لعميل أو مورد'
                      : 'جرّب تغيير كلمة البحث أو الفلاتر',
                  action: filter.query.isEmpty
                      ? FilledButton.icon(
                          onPressed: () => openAccountForm(context, ref),
                          icon: const Icon(Icons.add),
                          label: const Text('إضافة حساب'),
                        )
                      : null,
                );
              }
              return RefreshIndicator(
                onRefresh: () async => bump(ref),
                child: ListView.separated(
                  padding: const EdgeInsets.fromLTRB(14, 6, 14, 90),
                  itemCount: items.length,
                  separatorBuilder: (_, __) => const SizedBox(height: 9),
                  itemBuilder: (_, i) => _AccountCard(
                    item: items[i],
                    currencies: curs,
                    hidden: hidden,
                  ),
                ),
              );
            },
          ),
        ),
      ],
    );
  }
}

class _FilterBar extends ConsumerWidget {
  final AccountFilter filter;
  final List<CurrencyDef> currencies;
  const _FilterBar({required this.filter, required this.currencies});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final n = ref.read(accountFilterProvider.notifier);
    return Padding(
      padding: const EdgeInsets.fromLTRB(14, 10, 14, 6),
      child: Column(
        children: [
          TextField(
            decoration: InputDecoration(
              hintText: 'بحث بالاسم أو الهاتف أو الملاحظات…',
              prefixIcon: const Icon(Icons.search, size: 20),
              suffixIcon: filter.query.isEmpty
                  ? null
                  : IconButton(
                      icon: const Icon(Icons.close, size: 18),
                      onPressed: () =>
                          n.state = filter.copyWith(query: ''),
                    ),
              isDense: true,
            ),
            controller: TextEditingController(text: filter.query)
              ..selection =
                  TextSelection.collapsed(offset: filter.query.length),
            onChanged: (v) => n.state = filter.copyWith(query: v),
          ),
          const SizedBox(height: 9),
          SizedBox(
            height: 34,
            child: ListView(
              scrollDirection: Axis.horizontal,
              children: [
                _chip(
                  context,
                  'الكل',
                  filter.kind == null && !filter.showArchived,
                  () => n.state = filter.copyWith(
                      clearKind: true, showArchived: false),
                ),
                for (final k in AccountKind.values)
                  _chip(
                    context,
                    '${k.icon} ${k.label}',
                    filter.kind == k && !filter.showArchived,
                    () => n.state =
                        filter.copyWith(kind: k, showArchived: false),
                  ),
                _chip(
                  context,
                  'المؤرشفة',
                  filter.showArchived,
                  () => n.state = filter.copyWith(
                      showArchived: !filter.showArchived, clearKind: true),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _chip(
          BuildContext c, String label, bool active, VoidCallback onTap) =>
      Padding(
        padding: const EdgeInsets.only(left: 7),
        child: ChoiceChip(
          label: Text(label),
          selected: active,
          onSelected: (_) => onTap(),
          showCheckmark: false,
          selectedColor: AppColors.teal.withOpacity(0.16),
          labelStyle: TextStyle(
            fontSize: 12.5,
            fontWeight: active ? FontWeight.w700 : FontWeight.w500,
            color: active ? AppColors.teal : null,
          ),
          backgroundColor: Theme.of(c).cardColor,
          side: BorderSide(
              color: active
                  ? AppColors.teal.withOpacity(0.4)
                  : Theme.of(c).dividerColor),
        ),
      );
}

class _AccountCard extends ConsumerWidget {
  final AccountWithBalance item;
  final List<CurrencyDef> currencies;
  final bool hidden;

  const _AccountCard({
    required this.item,
    required this.currencies,
    required this.hidden,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final a = item.account;
    final c = currencies.firstWhere((x) => x.code == a.currency,
        orElse: () => kDefaultCurrencies.first);
    final kindColor = switch (a.kind) {
      AccountKind.customer => AppColors.info,
      AccountKind.supplier => AppColors.violet,
      AccountKind.general => AppColors.teal,
    };

    return Card(
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: () => Navigator.push(
          context,
          MaterialPageRoute(
              builder: (_) => AccountDetailScreen(accountId: a.id!)),
        ),
        child: Opacity(
          opacity: a.archived ? 0.6 : 1,
          child: Padding(
            padding: const EdgeInsets.all(13),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Container(
                      width: 40,
                      height: 40,
                      alignment: Alignment.center,
                      decoration: BoxDecoration(
                        color: kindColor.withOpacity(0.12),
                        borderRadius: BorderRadius.circular(11),
                      ),
                      child:
                          Text(a.kind.icon, style: const TextStyle(fontSize: 18)),
                    ),
                    const SizedBox(width: 11),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Flexible(
                                child: Text(
                                  a.name,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: const TextStyle(
                                      fontSize: 15,
                                      fontWeight: FontWeight.w800),
                                ),
                              ),
                              if (a.archived) ...[
                                const SizedBox(width: 6),
                                const Pill('مؤرشف', color: Colors.grey),
                              ],
                              if (item.overLimit) ...[
                                const SizedBox(width: 6),
                                const Pill('تجاوز الحد',
                                    color: AppColors.amber),
                              ],
                            ],
                          ),
                          const SizedBox(height: 3),
                          Text(
                            [
                              a.kind.label,
                              if (a.phone.isNotEmpty) a.phone,
                              c.name,
                            ].join(' · '),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                                fontSize: 11.5,
                                color: Theme.of(context).hintColor),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 11),
                Row(
                  children: [
                    Text('الرصيد',
                        style: TextStyle(
                            fontSize: 12,
                            color: Theme.of(context).hintColor)),
                    const Spacer(),
                    BalanceText(
                      value: item.balance,
                      currency: c,
                      hidden: hidden,
                      size: 16,
                    ),
                  ],
                ),
                if (a.tags.isNotEmpty) ...[
                  const SizedBox(height: 9),
                  Wrap(
                    spacing: 5,
                    runSpacing: 5,
                    children: a.tags
                        .map((t) => Pill(t, color: AppColors.violet))
                        .toList(),
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}
