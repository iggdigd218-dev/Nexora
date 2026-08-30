import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/format.dart';
import '../core/models.dart';
import '../core/theme.dart';
import '../data/providers.dart';
import 'calculator.dart';
import 'widgets.dart';

/// شاشة بيانات الأصناف فقط.
///
/// تُستخدم لإدخال وتعديل بيانات الصنف وأسعاره وكميته وحذفه.
/// لا تُسجّل شراءً أو بيعًا أو أي حركة مخزنية؛ تبقى هذه الشاشة مرجع
/// البيانات الأساسية للأصناف فقط.
class InventoryScreen extends ConsumerWidget {
  const InventoryScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final items = ref.watch(itemsProvider);
    final q = ref.watch(itemQueryProvider);

    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(14, 12, 14, 6),
          child: TextField(
            decoration: InputDecoration(
              hintText: 'ابحث باسم الصنف أو الرمز أو التصنيف',
              prefixIcon: const Icon(Icons.search),
              isDense: true,
              suffixIcon: q.isEmpty
                  ? null
                  : IconButton(
                      icon: const Icon(Icons.clear),
                      onPressed: () =>
                          ref.read(itemQueryProvider.notifier).state = '',
                    ),
            ),
            onChanged: (v) => ref.read(itemQueryProvider.notifier).state = v,
          ),
        ),
        Expanded(
          child: items.when(
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (e, _) => EmptyState(
              icon: Icons.error_outline,
              title: 'تعذّر تحميل الأصناف',
              message: '$e',
            ),
            data: (list) => list.isEmpty
                ? EmptyState(
                    icon: Icons.inventory_2_outlined,
                    title: q.isEmpty ? 'لا توجد أصناف بعد' : 'لا نتائج',
                    message: q.isEmpty
                        ? 'أضف بيانات البضاعة وأسعارها من زر «صنف جديد»'
                        : 'جرّب كلمة بحث أخرى',
                    action: q.isEmpty
                        ? FilledButton.icon(
                            onPressed: () => openItemForm(context, ref),
                            icon: const Icon(Icons.add),
                            label: const Text('إضافة صنف'),
                          )
                        : null,
                  )
                : ListView(
                    padding: const EdgeInsets.fromLTRB(12, 8, 12, 96),
                    children: [
                      Padding(
                        padding: const EdgeInsets.fromLTRB(4, 0, 4, 8),
                        child: Text(
                          '${list.length} صنف',
                          style: TextStyle(
                            fontSize: 12.5,
                            fontWeight: FontWeight.w700,
                            color: AppColors.text2Of(context),
                          ),
                        ),
                      ),
                      ...list.map((item) => _ItemCard(item: item)),
                    ],
                  ),
          ),
        ),
      ],
    );
  }
}

class _ItemCard extends ConsumerWidget {
  final Item item;
  const _ItemCard({required this.item});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final warn = item.out
        ? AppColors.danger
        : (item.low ? AppColors.amber : AppColors.green);
    final warnText = item.out
        ? 'نفد'
        : (item.low ? 'قارب النفاد' : 'متوفر');

    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: () => openItemForm(context, ref, item: item),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Container(
                    width: 44,
                    height: 44,
                    decoration: BoxDecoration(
                      color: AppColors.primarySoftOf(context),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Icon(Icons.inventory_2_outlined,
                        color: AppColors.primaryOf(context)),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(item.name,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                                fontSize: 16, fontWeight: FontWeight.w800)),
                        const SizedBox(height: 2),
                        Text(
                          [
                            if (item.sku.isNotEmpty) item.sku,
                            if (item.category.isNotEmpty) item.category,
                            item.unit,
                          ].join(' · '),
                          style: TextStyle(
                              fontSize: 12,
                              color: AppColors.text3Of(context)),
                        ),
                      ],
                    ),
                  ),
                  Pill(warnText, color: warn),
                ],
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  _Cell(
                      label: 'سعر الشراء',
                      value: Fmt.money(item.buyPrice, 0),
                      color: AppColors.info),
                  _Cell(
                      label: 'سعر البيع',
                      value: Fmt.money(item.sellPrice, 0),
                      color: AppColors.teal),
                  _Cell(
                    label: 'الكمية',
                    value: Fmt.money(item.quantity, 0),
                    color: warn,
                    sub: item.minQuantity > 0
                        ? 'حد التنبيه ${Fmt.money(item.minQuantity, 0)}'
                        : null,
                  ),
                ],
              ),
              const SizedBox(height: 10),
              Row(
                mainAxisAlignment: MainAxisAlignment.end,
                children: [
                  TextButton.icon(
                    onPressed: () => openItemForm(context, ref, item: item),
                    icon: const Icon(Icons.edit_outlined, size: 18),
                    label: const Text('تعديل'),
                  ),
                  IconButton(
                    tooltip: 'حذف الصنف',
                    onPressed: () async {
                      final ok = await confirmDialog(
                        context,
                        title: 'حذف الصنف',
                        message:
                            'سيُنقل «${item.name}» إلى سلة المهملات ويمكن استرجاعه.',
                      );
                      if (!ok || item.id == null) return;
                      await ref.read(repoProvider).deleteItem(item.id!);
                      bump(ref);
                      if (context.mounted) {
                        showSnack(context, 'نُقل الصنف إلى سلة المهملات');
                      }
                    },
                    icon: Icon(Icons.delete_outline,
                        color: AppColors.dangerOf(context)),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Cell extends StatelessWidget {
  final String label;
  final String value;
  final Color color;
  final String? sub;
  const _Cell({
    required this.label,
    required this.value,
    required this.color,
    this.sub,
  });

  @override
  Widget build(BuildContext context) => Expanded(
        child: Column(
          children: [
            Text(label,
                textAlign: TextAlign.center,
                style: TextStyle(
                    fontSize: 11.5, color: AppColors.text3Of(context))),
            const SizedBox(height: 3),
            FittedBox(
              fit: BoxFit.scaleDown,
              child: Text(value,
                  style: TextStyle(
                      fontSize: 15.5,
                      fontWeight: FontWeight.w800,
                      color: color)),
            ),
            if (sub != null)
              Text(sub!,
                  textAlign: TextAlign.center,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(fontSize: 10.5, color: color)),
          ],
        ),
      );
}

// ==================== نموذج الصنف ====================

Future<void> openItemForm(BuildContext context, WidgetRef ref,
        {Item? item}) =>
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (_) => Padding(
        padding: EdgeInsets.only(
            bottom: MediaQuery.of(context).viewInsets.bottom),
        child: _ItemForm(item: item),
      ),
    ).then((_) => bump(ref));

class _ItemForm extends ConsumerStatefulWidget {
  final Item? item;
  const _ItemForm({this.item});

  @override
  ConsumerState<_ItemForm> createState() => _ItemFormState();
}

class _ItemFormState extends ConsumerState<_ItemForm> {
  late final TextEditingController _name;
  late final TextEditingController _sku;
  late final TextEditingController _unit;
  late final TextEditingController _buy;
  late final TextEditingController _sell;
  late final TextEditingController _qty;
  late final TextEditingController _min;
  late final TextEditingController _cat;
  late final TextEditingController _notes;
  String? _error;

  @override
  void initState() {
    super.initState();
    final i = widget.item;
    _name = TextEditingController(text: i?.name ?? '');
    _sku = TextEditingController(text: i?.sku ?? '');
    _unit = TextEditingController(text: i?.unit ?? 'حبة');
    _buy = TextEditingController(text: i == null ? '' : _n(i.buyPrice));
    _sell = TextEditingController(text: i == null ? '' : _n(i.sellPrice));
    _qty = TextEditingController(text: i == null ? '' : _n(i.quantity));
    _min = TextEditingController(text: i == null ? '' : _n(i.minQuantity));
    _cat = TextEditingController(text: i?.category ?? '');
    _notes = TextEditingController(text: i?.notes ?? '');
    for (final c in [_buy, _sell]) {
      c.addListener(() => setState(() {}));
    }
  }

  static String _n(double v) =>
      v == 0 ? '' : (v == v.roundToDouble() ? v.toInt().toString() : '$v');

  @override
  void dispose() {
    for (final c in [_name, _sku, _unit, _buy, _sell, _qty, _min, _cat, _notes]) {
      c.dispose();
    }
    super.dispose();
  }

  double get _buyV => Fmt.parseAmount(_buy.text) ?? 0;
  double get _sellV => Fmt.parseAmount(_sell.text) ?? 0;

  Future<void> _save() async {
    final name = _name.text.trim();
    if (name.isEmpty) {
      setState(() => _error = 'اسم الصنف مطلوب');
      return;
    }
    final now = DateTime.now();
    final base = widget.item;
    final it = (base ??
            Item(name: name, createdAt: now, updatedAt: now))
        .copyWith(
      name: name,
      sku: _sku.text.trim(),
      unit: _unit.text.trim().isEmpty ? 'حبة' : _unit.text.trim(),
      buyPrice: _buyV,
      sellPrice: _sellV,
      quantity: Fmt.parseAmount(_qty.text) ?? 0,
      minQuantity: Fmt.parseAmount(_min.text) ?? 0,
      category: _cat.text.trim(),
      notes: _notes.text.trim(),
    );
    await ref.read(repoProvider).saveItem(it);
    bump(ref);
    if (mounted) Navigator.pop(context);
  }

  @override
  Widget build(BuildContext context) {
    final profit = _sellV - _buyV;
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Row(children: [
                Icon(Icons.inventory_2_outlined,
                    color: AppColors.primaryOf(context)),
                const SizedBox(width: 8),
                Text(widget.item == null ? 'صنف جديد' : 'تعديل الصنف',
                    style: Theme.of(context).textTheme.titleMedium),
                const Spacer(),
                IconButton(
                    onPressed: () => Navigator.pop(context),
                    icon: const Icon(Icons.close)),
              ]),
              const SizedBox(height: 6),
              TextField(
                controller: _name,
                autofocus: widget.item == null,
                decoration: InputDecoration(
                  labelText: 'اسم الصنف *',
                  prefixIcon: const Icon(Icons.label_outline),
                  errorText: _error,
                ),
                onChanged: (_) {
                  if (_error != null) setState(() => _error = null);
                },
              ),
              const SizedBox(height: 10),
              Row(children: [
                Expanded(
                  child: TextField(
                    controller: _sku,
                    decoration: const InputDecoration(
                        labelText: 'الرمز', prefixIcon: Icon(Icons.qr_code)),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: TextField(
                    controller: _unit,
                    decoration: const InputDecoration(
                        labelText: 'الوحدة',
                        prefixIcon: Icon(Icons.straighten)),
                  ),
                ),
              ]),
              const SizedBox(height: 10),
              Row(children: [
                Expanded(
                  child: _AmountField(
                      controller: _buy,
                      label: 'سعر الشراء',
                      icon: Icons.shopping_cart_outlined),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: _AmountField(
                      controller: _sell,
                      label: 'سعر البيع',
                      icon: Icons.sell_outlined),
                ),
              ]),
              const SizedBox(height: 10),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: profit >= 0
                      ? AppColors.greenSoftOf(context)
                      : AppColors.dangerSoftOf(context),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(profit >= 0 ? Icons.trending_up : Icons.trending_down,
                        size: 18,
                        color: profit >= 0
                            ? AppColors.greenOf(context)
                            : AppColors.dangerOf(context)),
                    const SizedBox(width: 8),
                    Text(
                      'ربح الوحدة: ${Fmt.money(profit, 0)}'
                      '${_buyV > 0 ? '  (${(profit / _buyV * 100).toStringAsFixed(0)}٪)' : ''}',
                      style: TextStyle(
                        fontWeight: FontWeight.w800,
                        color: profit >= 0
                            ? AppColors.greenOf(context)
                            : AppColors.dangerOf(context),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 10),
              Row(children: [
                Expanded(
                  child: _AmountField(
                      controller: _qty,
                      label: 'الكمية الحالية',
                      icon: Icons.inventory_outlined),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: _AmountField(
                      controller: _min,
                      label: 'حد التنبيه',
                      icon: Icons.warning_amber_outlined),
                ),
              ]),
              const SizedBox(height: 10),
              TextField(
                controller: _cat,
                decoration: const InputDecoration(
                    labelText: 'التصنيف',
                    prefixIcon: Icon(Icons.category_outlined)),
              ),
              const SizedBox(height: 10),
              TextField(
                controller: _notes,
                maxLines: 2,
                decoration: const InputDecoration(
                    labelText: 'ملاحظات',
                    prefixIcon: Icon(Icons.notes_outlined)),
              ),
              const SizedBox(height: 16),
              SizedBox(
                width: double.infinity,
                child: FilledButton.icon(
                  onPressed: _save,
                  icon: const Icon(Icons.save_outlined),
                  label: const Text('حفظ الصنف'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// حقل مبلغ مع آلة حاسبة سريعة.
class _AmountField extends StatelessWidget {
  final TextEditingController controller;
  final String label;
  final IconData icon;
  const _AmountField({
    required this.controller,
    required this.label,
    required this.icon,
  });

  @override
  Widget build(BuildContext context) => TextField(
        controller: controller,
        keyboardType: const TextInputType.numberWithOptions(decimal: true),
        decoration: InputDecoration(
          labelText: label,
          prefixIcon: Icon(icon),
          suffixIcon: IconButton(
            tooltip: 'آلة حاسبة',
            icon: const Icon(Icons.calculate_outlined),
            onPressed: () async {
              final v = await openCalculator(context, initial: controller.text);
              if (v != null) {
                controller.text =
                    v == v.roundToDouble() ? '${v.toInt()}' : '$v';
              }
            },
          ),
        ),
      );
}
