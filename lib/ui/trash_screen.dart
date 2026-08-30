import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/format.dart';
import '../core/theme.dart';
import '../data/providers.dart';
import 'widgets.dart';

/// سلة المهملات — استرجاع أو حذف نهائي لكل ما حُذف (البند ١٦).
class TrashScreen extends ConsumerWidget {
  const TrashScreen({super.key});

  static const _labels = <String, (String, IconData, Color)>{
    'accounts': ('الحسابات', Icons.people_alt_outlined, AppColors.teal),
    'transactions':
        ('العمليات', Icons.receipt_long_outlined, AppColors.info),
    'vouchers': ('السندات', Icons.receipt_outlined, AppColors.violet),
    'items': ('الأصناف', Icons.inventory_2_outlined, AppColors.accent),
  };

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final trash = ref.watch(trashProvider);

    return trash.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, _) => EmptyState(
        icon: Icons.error_outline,
        title: 'تعذّر فتح السلة',
        message: '$e',
      ),
      data: (items) {
        if (items.isEmpty) {
          return const EmptyState(
            icon: Icons.delete_outline,
            title: 'السلة فارغة',
            message: 'كل ما تحذفه من الحسابات والعمليات والسندات والأصناف '
                'يُحفظ هنا ويمكن استرجاعه.',
          );
        }
        return Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(14, 12, 14, 6),
              child: Row(children: [
                Icon(Icons.delete_sweep_outlined,
                    color: AppColors.dangerOf(context)),
                const SizedBox(width: 8),
                Expanded(
                  child: Text('${items.length} عنصر في السلة',
                      style: const TextStyle(fontWeight: FontWeight.w700)),
                ),
                TextButton.icon(
                  onPressed: () async {
                    final ok = await confirmDialog(
                      context,
                      title: 'تفريغ سلة المهملات',
                      message:
                          'سيُحذف ${items.length} عنصرًا نهائيًا ولا يمكن التراجع.',
                      danger: true,
                    );
                    if (!ok) return;
                    await ref.read(repoProvider).emptyTrash();
                    bump(ref);
                    if (context.mounted) showSnack(context, 'أُفرغت السلة');
                  },
                  icon: Icon(Icons.delete_forever,
                      color: AppColors.dangerOf(context)),
                  label: Text('تفريغ',
                      style: TextStyle(color: AppColors.dangerOf(context))),
                ),
              ]),
            ),
            Expanded(
              child: ListView.builder(
                padding: const EdgeInsets.fromLTRB(12, 4, 12, 90),
                itemCount: items.length,
                itemBuilder: (_, i) {
                  final t = items[i];
                  final store = (t['store'] ?? '') as String;
                  final meta = _labels[store] ??
                      ('سجل', Icons.description_outlined, AppColors.teal);
                  final created = DateTime.tryParse(
                      (t['created_at'] ?? '') as String? ?? '');
                  final label = (t['label'] ?? '') as String;

                  return Card(
                    margin: const EdgeInsets.only(bottom: 8),
                    child: ListTile(
                      leading: CircleAvatar(
                        backgroundColor: meta.$3.withValues(alpha: .12),
                        child: Icon(meta.$2, color: meta.$3),
                      ),
                      title: Text(
                        label.isEmpty ? meta.$1 : label,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                            fontWeight: FontWeight.w700, fontSize: 14),
                      ),
                      subtitle: Text(
                        [
                          meta.$1,
                          if (created != null) Fmt.relative(created),
                        ].join('  ·  '),
                        style: const TextStyle(fontSize: 11.5),
                      ),
                      trailing: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          IconButton(
                            tooltip: 'استرجاع',
                            icon: Icon(Icons.restore,
                                color: AppColors.greenOf(context)),
                            onPressed: () async {
                              await ref
                                  .read(repoProvider)
                                  .restoreFromTrash(t['id'] as int);
                              bump(ref);
                              if (context.mounted) {
                                showSnack(context, 'تم الاسترجاع ✅');
                              }
                            },
                          ),
                          IconButton(
                            tooltip: 'حذف نهائي',
                            icon: Icon(Icons.delete_forever_outlined,
                                color: AppColors.dangerOf(context)),
                            onPressed: () async {
                              final ok = await confirmDialog(
                                context,
                                title: 'حذف نهائي',
                                message: 'لا يمكن التراجع عن هذه الخطوة.',
                                danger: true,
                              );
                              if (!ok) return;
                              await ref
                                  .read(repoProvider)
                                  .deleteFromTrash(t['id'] as int);
                              bump(ref);
                            },
                          ),
                        ],
                      ),
                    ),
                  );
                },
              ),
            ),
          ],
        );
      },
    );
  }
}
