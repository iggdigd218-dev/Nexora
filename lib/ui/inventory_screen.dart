import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/format.dart';
import '../core/models.dart';
import '../core/theme.dart';
import '../data/providers.dart';
import 'calculator.dart';
import 'widgets.dart';

/// المخزون — الأصناف بسعر الشراء والبيع والربح والكمية المتبقية.
class InventoryScreen extends ConsumerWidget {
  const InventoryScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final items = ref.watch(itemsProvider);
    final summary = ref.watch(inventorySummaryProvider).valueOrNull ?? const {};
    final q = ref.watch(itemQueryProvider);

    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(14, 12, 14, 6),
          child: TextField(
            decoration: InputDecoration(
              hintText: 'ابحث باسم الصنف أو الرمز',
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
        // شريط الملخّص
        SizedBox(
          height: 104,
          child: ListView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 10),
            children: [
              _Mini(
                title: 'الأصناف',
                value: '${(summary['items'] ?? 0).toInt()}',
                icon: Icons.inventory_2_outlined,
                color: AppColors.teal,
              ),
              _Mini(
                title: 'تكلفة المخزون',
                value: Fmt.money(summary['cost'] ?? 0, 0),
                icon: Icons.shopping_cart_outlined,
                color: AppColors.info,
              ),
              _Mini(
                title: 'الربح المتوقع',
                value: Fmt.money(summary['expected'] ?? 0, 0),
                icon: Icons.trending_up,
                color: AppColors.green,
              ),
              _Mini(
                title: 'الربح المحقق',
                value: Fmt.money(summary['realised'] ?? 0, 0),
                icon: Icons.savings_outlined,
                color: AppColors.violet,
              ),
              _Mini(
                title: 'نواقص',
                value: '${(summary['low'] ?? 0).toInt()}',
                icon: Icons.warning_amber_outlined,
                color: AppColors.danger,
              ),
            ],
          ),
        ),
        const SizedBox(height: 4),
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
                        ? 'أضف صنفًا بسعر شراء وسعر بيع لتتبّع الربح والكمية'
                        : 'جرّب كلمة بحث أخرى',
                  )
                : ListView.builder(
                    padding: const EdgeInsets.fromLTRB(12, 4, 12, 96),
                    itemCount: list.length,
                    itemBuilder: (_, i) => _ItemCard(item: list[i]),
                  ),
          ),
        ),
      ],
    );
  }
}

class _Mini extends StatelessWidget {
  final String title;
  final String value;
  final IconData icon;
  final Color color;
  const _Mini({
    required this.title,
    required this.value,
    required this.icon,
    required this.color,
  });

  @override
  Widget build(BuildContext context) => Container(
        width: 150,
        margin: const EdgeInsets.symmetric(horizontal: 4, vertical: 6),
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: AppColors.surfaceOf(context),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: AppColors.borderOf(context)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Row(children: [
              Icon(icon, size: 17, color: color),
              const SizedBox(width: 6),
              Expanded(
                child: Text(title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                        fontSize: 12.5,
                        fontWeight: FontWeight.w600,
                        color: AppColors.text2Of(context))),
              ),
            ]),
            const SizedBox(height: 8),
            FittedBox(
              fit: BoxFit.scaleDown,
              alignment: Alignment.centerRight,
              child: Text(value,
                  style: TextStyle(
                      fontSize: 20, fontWeight: FontWeight.w800, color: color)),
            ),
          ],
        ),
      );
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
                      label: 'شراء',
                      value: Fmt.money(item.buyPrice, 0),
                      color: AppColors.info),
                  _Cell(
                      label: 'بيع',
                      value: Fmt.money(item.sellPrice, 0),
                      color: AppColors.teal),
                  _Cell(
                    label: 'الربح/وحدة',
                    value: Fmt.money(item.unitProfit, 0),
                    color: item.unitProfit >= 0
                        ? AppColors.green
                        : AppColors.danger,
                    sub: item.buyPrice > 0
                        ? '${item.marginPercent.toStringAsFixed(0)}٪'
                        : null,
                  ),
                  _Cell(
                    label: 'المتبقي',
                    value: Fmt.money(item.quantity, 0),
                    color: warn,
                  ),
                ],
              ),
              const SizedBox(height: 10),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: () =>
                          openStockMove(context, ref, item, StockKind.purchase),
                      icon: const Icon(Icons.add_shopping_cart, size: 18),
                      label: const Text('شراء'),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: FilledButton.icon(
                      onPressed: () =>
                          openStockMove(context, ref, item, StockKind.sale),
                      icon: const Icon(Icons.sell_outlined, size: 18),
                      label: const Text('بيع'),
                    ),
                  ),
                  IconButton(
                    tooltip: 'سجل الحركات',
                    onPressed: () => _showMoves(context, ref),
                    icon: const Icon(Icons.history),
                  ),
                  IconButton(
                    tooltip: 'حذف',
                    onPressed: () async {
                      final ok = await confirmDialog(context,
                          title: 'حذف الصنف',
                          message:
                              'سيُنقل «${item.name}» إلى سلة المهملات ويمكن استرجاعه.');
                      if (!ok) return;
                      await ref.read(repoProvider).deleteItem(item.id!);
                      bump(ref);
                      if (context.mounted) {
                        showSnack(context, 'نُقل إلى سلة المهملات');
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

  void _showMoves(BuildContext context, WidgetRef ref) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      builder: (_) => Consumer(
        builder: (ctx, r, __) {
          final moves = r.watch(stockMovesProvider(item.id!));
          return DraggableScrollableSheet(
            initialChildSize: .7,
            expand: false,
            builder: (_, controller) => Column(
              children: [
                Padding(
                  padding: const EdgeInsets.all(14),
                  child: Row(children: [
                    Icon(Icons.history, color: AppColors.primaryOf(ctx)),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text('حركات ${item.name}',
                          style: Theme.of(ctx).textTheme.titleMedium),
                    ),
                    IconButton(
                        onPressed: () => Navigator.pop(ctx),
                        icon: const Icon(Icons.close)),
                  ]),
                ),
                Expanded(
                  child: moves.when(
                    loading: () =>
                        const Center(child: CircularProgressIndicator()),
                    error: (e, _) => Center(child: Text('$e')),
                    data: (list) => list.isEmpty
                        ? const EmptyState(
                            icon: Icons.swap_vert,
                            title: 'لا حركات على هذا الصنف',
                          )
                        : ListView.separated(
                            controller: controller,
                            itemCount: list.length,
                            separatorBuilder: (_, __) =>
                                const Divider(height: 1),
                            itemBuilder: (_, i) {
                              final m = list[i];
                              final inc = m.kind.qtySign > 0;
                              return ListTile(
                                leading: CircleAvatar(
                                  backgroundColor: inc
                                      ? AppColors.greenSoftOf(ctx)
                                      : AppColors.dangerSoftOf(ctx),
                                  child: Icon(
                                    inc
                                        ? Icons.arrow_downward
                                        : Icons.arrow_upward,
                                    color: inc
                                        ? AppColors.greenOf(ctx)
                                        : AppColors.dangerOf(ctx),
                                  ),
                                ),
                                title: Text(
                                    '${m.kind.label} · ${Fmt.money(m.quantity, 0)} ${item.unit}'),
                                subtitle: Text(
                                    '${Fmt.date(m.date)}  ·  الإجمالي ${Fmt.money(m.total, 0)}'),
                                trailing: m.kind == StockKind.sale
                                    ? Text(
                                        Fmt.money(
                                            m.profitAgainst(item.buyPrice), 0),
                                        style: TextStyle(
                                            fontWeight: FontWeight.w800,
                                            color: AppColors.greenOf(ctx)),
                                      )
                                    : null,
                              );
                            },
                          ),
                  ),
                ),
              ],
            ),
          );
        },
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

/// حقل مبلغ مع أيقونة آلة حاسبة تنقل الناتج إليه.
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

// ==================== حركة مخزنية ====================

Future<void> openStockMove(
        BuildContext context, WidgetRef ref, Item item, StockKind kind) =>
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (_) => Padding(
        padding:
            EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
        child: _MoveForm(item: item, kind: kind),
      ),
    ).then((_) => bump(ref));

class _MoveForm extends ConsumerStatefulWidget {
  final Item item;
  final StockKind kind;
  const _MoveForm({required this.item, required this.kind});

  @override
  ConsumerState<_MoveForm> createState() => _MoveFormState();
}

class _MoveFormState extends ConsumerState<_MoveForm> {
  late final TextEditingController _qty;
  late final TextEditingController _price;
  final _notes = TextEditingController();
  late StockKind _kind;
  DateTime _date = DateTime.now();

  @override
  void initState() {
    super.initState();
    _kind = widget.kind;
    _qty = TextEditingController(text: '1');
    _price = TextEditingController(text: _default());
    for (final c in [_qty, _price]) {
      c.addListener(() => setState(() {}));
    }
  }

  String _default() {
    final v = _kind == StockKind.sale
        ? widget.item.sellPrice
        : widget.item.buyPrice;
    return v == 0 ? '' : (v == v.roundToDouble() ? '${v.toInt()}' : '$v');
  }

  @override
  void dispose() {
    _qty.dispose();
    _price.dispose();
    _notes.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final q = Fmt.parseAmount(_qty.text) ?? 0;
    if (q <= 0) {
      showSnack(context, 'أدخل كمية صحيحة');
      return;
    }
    final now = DateTime.now();
    await ref.read(repoProvider).addStockMove(StockMove(
          itemId: widget.item.id!,
          kind: _kind,
          quantity: q,
          unitPrice: Fmt.parseAmount(_price.text) ?? 0,
          notes: _notes.text.trim(),
          date: _date,
          createdAt: now,
        ));
    bump(ref);
    if (mounted) Navigator.pop(context);
  }

  @override
  Widget build(BuildContext context) {
    final q = Fmt.parseAmount(_qty.text) ?? 0;
    final p = Fmt.parseAmount(_price.text) ?? 0;
    final total = q * p;
    final profit = _kind == StockKind.sale
        ? (p - widget.item.buyPrice) * q
        : 0.0;
    final after = _kind == StockKind.adjust
        ? q
        : widget.item.quantity + _kind.qtySign * q;

    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Row(children: [
                Icon(Icons.swap_vert, color: AppColors.primaryOf(context)),
                const SizedBox(width: 8),
                Expanded(
                  child: Text('حركة على «${widget.item.name}»',
                      style: Theme.of(context).textTheme.titleMedium),
                ),
                IconButton(
                    onPressed: () => Navigator.pop(context),
                    icon: const Icon(Icons.close)),
              ]),
              const SizedBox(height: 8),
              SegmentedButton<StockKind>(
                segments: const [
                  ButtonSegment(value: StockKind.purchase, label: Text('شراء')),
                  ButtonSegment(value: StockKind.sale, label: Text('بيع')),
                  ButtonSegment(value: StockKind.ret, label: Text('مرتجع')),
                  ButtonSegment(value: StockKind.adjust, label: Text('تسوية')),
                ],
                selected: {_kind},
                showSelectedIcon: false,
                onSelectionChanged: (s) => setState(() {
                  _kind = s.first;
                  _price.text = _default();
                }),
              ),
              const SizedBox(height: 12),
              Row(children: [
                Expanded(
                  child: _AmountField(
                      controller: _qty,
                      label: _kind == StockKind.adjust
                          ? 'الكمية الصحيحة'
                          : 'الكمية',
                      icon: Icons.numbers),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: _AmountField(
                      controller: _price,
                      label: 'سعر الوحدة',
                      icon: Icons.payments_outlined),
                ),
              ]),
              const SizedBox(height: 10),
              ListTile(
                contentPadding: EdgeInsets.zero,
                leading: const Icon(Icons.event_outlined),
                title: const Text('التاريخ'),
                subtitle: Text(Fmt.date(_date)),
                trailing: const Icon(Icons.edit_calendar_outlined),
                onTap: () async {
                  final d = await showDatePicker(
                    context: context,
                    initialDate: _date,
                    firstDate: DateTime(2000),
                    lastDate: DateTime(2100),
                  );
                  if (d != null) setState(() => _date = d);
                },
              ),
              TextField(
                controller: _notes,
                decoration: const InputDecoration(
                    labelText: 'ملاحظات',
                    prefixIcon: Icon(Icons.notes_outlined)),
              ),
              const SizedBox(height: 12),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: AppColors.surface2Of(context),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Column(children: [
                  _row(context, 'الإجمالي', Fmt.money(total, 0)),
                  if (_kind == StockKind.sale)
                    _row(context, 'الربح المحقق', Fmt.money(profit, 0),
                        color: profit >= 0
                            ? AppColors.greenOf(context)
                            : AppColors.dangerOf(context)),
                  _row(context, 'الكمية بعد الحركة', Fmt.money(after, 0),
                      color: after < 0 ? AppColors.dangerOf(context) : null),
                ]),
              ),
              if (after < 0)
                Padding(
                  padding: const EdgeInsets.only(top: 8),
                  child: Text('تنبيه: الكمية ستصبح بالسالب',
                      style: TextStyle(
                          fontSize: 12, color: AppColors.dangerOf(context))),
                ),
              const SizedBox(height: 14),
              SizedBox(
                width: double.infinity,
                child: FilledButton.icon(
                  onPressed: _save,
                  icon: const Icon(Icons.check),
                  label: Text('تسجيل ${_kind.label}'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _row(BuildContext c, String k, String v, {Color? color}) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 3),
        child: Row(
          children: [
            Text(k,
                style:
                    TextStyle(fontSize: 13, color: AppColors.text2Of(c))),
            const Spacer(),
            Text(v,
                style: TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w800,
                    color: color ?? AppColors.textOf(c))),
          ],
        ),
      );
}
