import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/format.dart';
import '../core/models.dart';
import '../core/theme.dart';
import '../data/providers.dart';
import 'calculator.dart';
import 'widgets.dart';

/// شاشة بيانات الأصناف والفئات فقط.
///
/// تبدأ الفئات/الأقسام هنا أولًا. يمكن إنشاء عدد غير محدود من الفئات،
/// ثم إضافة الأصناف داخل كل فئة. لا تُسجّل هذه الشاشة شراءً أو بيعًا أو
/// مرتجعًا أو تسوية أو أي حركة مخزنية؛ فهي مخصّصة للبيانات الأساسية فقط.
class InventoryScreen extends ConsumerWidget {
  const InventoryScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final categories = ref.watch(itemCategoriesProvider);
    final items = ref.watch(itemsProvider);
    final q = ref.watch(itemQueryProvider);

    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(14, 12, 14, 6),
          child: TextField(
            decoration: InputDecoration(
              hintText: 'ابحث باسم الصنف أو الرمز أو الفئة',
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
        Padding(
          padding: const EdgeInsets.fromLTRB(14, 4, 14, 8),
          child: Row(
            children: [
              Container(
                width: 38,
                height: 38,
                decoration: BoxDecoration(
                  color: AppColors.primarySoftOf(context),
                  borderRadius: BorderRadius.circular(11),
                ),
                child: Icon(Icons.category_outlined,
                    color: AppColors.primaryOf(context)),
              ),
              const SizedBox(width: 10),
              const Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('الفئات والأصناف',
                        style: TextStyle(fontWeight: FontWeight.w800)),
                    SizedBox(height: 2),
                    Text('أضف فئة أولًا ثم سجّل الأصناف داخلها',
                        style: TextStyle(fontSize: 11.5)),
                  ],
                ),
              ),
              OutlinedButton.icon(
                onPressed: () => openItemCategoryForm(context, ref),
                icon: const Icon(Icons.add, size: 18),
                label: const Text('إضافة فئة'),
              ),
            ],
          ),
        ),
        Expanded(
          child: categories.when(
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (e, _) => EmptyState(
              icon: Icons.error_outline,
              title: 'تعذّر تحميل الفئات',
              message: '$e',
            ),
            data: (categoryList) => items.when(
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (e, _) => EmptyState(
                icon: Icons.error_outline,
                title: 'تعذّر تحميل الأصناف',
                message: '$e',
              ),
              data: (itemList) {
                if (categoryList.isEmpty) {
                  return EmptyState(
                    icon: Icons.create_new_folder_outlined,
                    title: 'ابدأ بإضافة فئة',
                    message:
                        'أنشئ أقسامًا غير محدودة، وبعدها أضف كل صنف داخل قسمه.',
                    action: FilledButton.icon(
                      onPressed: () => openItemCategoryForm(context, ref),
                      icon: const Icon(Icons.add),
                      label: const Text('إضافة أول فئة'),
                    ),
                  );
                }
                if (itemList.isEmpty && q.trim().isNotEmpty) {
                  return const EmptyState(
                    icon: Icons.search_off,
                    title: 'لا توجد نتائج',
                    message: 'جرّب كلمة بحث أخرى.',
                  );
                }
                return _InventorySections(
                  categories: categoryList,
                  items: itemList,
                  query: q,
                );
              },
            ),
          ),
        ),
      ],
    );
  }
}

/// أقسام الفئات، وتحت كل قسم أصنافه.
class _InventorySections extends ConsumerWidget {
  final List<ItemCategory> categories;
  final List<Item> items;
  final String query;

  const _InventorySections({
    required this.categories,
    required this.items,
    required this.query,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final grouped = <int, List<Item>>{
      for (final category in categories)
        if (category.id != null) category.id!: <Item>[],
    };
    final byName = <String, int>{
      for (final category in categories)
        if (category.id != null)
          category.name.trim().toLowerCase(): category.id!,
    };
    final uncategorized = <Item>[];

    for (final item in items) {
      var categoryId = item.categoryId;
      // توافق مع النسخ/النسخ الاحتياطية القديمة التي كانت تحفظ الاسم فقط.
      if (categoryId == null && item.category.trim().isNotEmpty) {
        categoryId = byName[item.category.trim().toLowerCase()];
      }
      final bucket = categoryId == null ? null : grouped[categoryId];
      if (bucket == null) {
        uncategorized.add(item);
      } else {
        bucket.add(item);
      }
    }

    final visibleCategories = query.trim().isEmpty
        ? categories
        : categories
            .where((category) =>
                category.id != null &&
                (grouped[category.id!]?.isNotEmpty ?? false))
            .toList();

    return ListView(
      padding: const EdgeInsets.fromLTRB(12, 0, 12, 96),
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(4, 0, 4, 8),
          child: Text(
            '${categories.length} فئة  ·  ${items.length} صنف',
            style: TextStyle(
              fontSize: 12.5,
              fontWeight: FontWeight.w700,
              color: AppColors.text2Of(context),
            ),
          ),
        ),
        ...visibleCategories.map((category) => _CategorySection(
              category: category,
              items: grouped[category.id!] ?? const [],
            )),
        if (uncategorized.isNotEmpty)
          _UncategorizedSection(items: uncategorized),
        if (visibleCategories.isEmpty && uncategorized.isEmpty)
          const EmptyState(
            icon: Icons.search_off,
            title: 'لا توجد نتائج',
            message: 'جرّب كلمة بحث أخرى.',
          ),
      ],
    );
  }
}

enum _CategoryAction { edit, delete }

class _CategorySection extends ConsumerWidget {
  final ItemCategory category;
  final List<Item> items;

  const _CategorySection({required this.category, required this.items});

  Future<void> _delete(BuildContext context, WidgetRef ref) async {
    final count = items.length;
    final ok = await confirmDialog(
      context,
      title: 'حذف الفئة',
      message: count == 0
          ? 'سيتم حذف الفئة «${category.name}». '
              'لا يمكن التراجع عن ذلك.'
          : 'سيتم حذف الفئة «${category.name}» وفك ربط $count صنفًا بها. '
              'الأصناف نفسها لن تُحذف.',
      confirmText: 'حذف الفئة',
      danger: true,
    );
    if (!ok || category.id == null) return;
    await ref.read(repoProvider).deleteItemCategory(category.id!);
    bump(ref);
    if (context.mounted) showSnack(context, 'حُذفت الفئة وبقيت الأصناف محفوظة');
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      clipBehavior: Clip.antiAlias,
      child: Column(
        children: [
          Container(
            padding: const EdgeInsets.fromLTRB(10, 10, 8, 10),
            color: AppColors.primarySoftOf(context).withValues(alpha: .52),
            child: Row(
              children: [
                Container(
                  width: 40,
                  height: 40,
                  decoration: BoxDecoration(
                    color: AppColors.primarySoftOf(context),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Icon(Icons.folder_outlined,
                      color: AppColors.primaryOf(context)),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(category.name,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                              fontSize: 15, fontWeight: FontWeight.w800)),
                      const SizedBox(height: 2),
                      Text('${items.length} صنف داخل هذه الفئة',
                          style: TextStyle(
                              fontSize: 11.5,
                              color: AppColors.text2Of(context))),
                    ],
                  ),
                ),
                IconButton(
                  tooltip: 'إضافة صنف داخل الفئة',
                  onPressed: category.id == null
                      ? null
                      : () =>
                          openItemForm(context, ref, categoryId: category.id),
                  icon: Icon(Icons.add_box_outlined,
                      color: AppColors.primaryOf(context)),
                ),
                PopupMenuButton<_CategoryAction>(
                  tooltip: 'خيارات الفئة',
                  onSelected: (action) {
                    switch (action) {
                      case _CategoryAction.edit:
                        openItemCategoryForm(context, ref, category: category);
                      case _CategoryAction.delete:
                        _delete(context, ref);
                    }
                  },
                  itemBuilder: (_) => const [
                    PopupMenuItem(
                      value: _CategoryAction.edit,
                      child: ListTile(
                        contentPadding: EdgeInsets.zero,
                        leading: Icon(Icons.edit_outlined),
                        title: Text('تعديل اسم الفئة'),
                      ),
                    ),
                    PopupMenuItem(
                      value: _CategoryAction.delete,
                      child: ListTile(
                        contentPadding: EdgeInsets.zero,
                        leading: Icon(Icons.delete_outline),
                        title: Text('حذف الفئة'),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
          if (items.isEmpty)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 18),
              child: Column(
                children: [
                  Icon(Icons.inventory_2_outlined,
                      size: 34, color: AppColors.text3Of(context)),
                  const SizedBox(height: 7),
                  Text('لا توجد أصناف داخل هذه الفئة بعد',
                      style: TextStyle(color: AppColors.text2Of(context))),
                  const SizedBox(height: 9),
                  FilledButton.tonalIcon(
                    onPressed: category.id == null
                        ? null
                        : () =>
                            openItemForm(context, ref, categoryId: category.id),
                    icon: const Icon(Icons.add, size: 18),
                    label: const Text('إضافة أول صنف'),
                  ),
                ],
              ),
            )
          else
            Padding(
              padding: const EdgeInsets.fromLTRB(10, 10, 10, 2),
              child: Column(
                children: [
                  ...items.map((item) => _ItemCard(item: item)),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

class _UncategorizedSection extends StatelessWidget {
  final List<Item> items;
  const _UncategorizedSection({required this.items});

  @override
  Widget build(BuildContext context) => Card(
        margin: const EdgeInsets.only(bottom: 10),
        child: Column(
          children: [
            ListTile(
              leading: Icon(Icons.folder_off_outlined,
                  color: AppColors.accentOf(context)),
              title: const Text('بدون فئة',
                  style: TextStyle(fontWeight: FontWeight.w800)),
              subtitle: Text('${items.length} صنف يحتاج إلى فئة'),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(10, 0, 10, 2),
              child: Column(
                children: items.map((item) => _ItemCard(item: item)).toList(),
              ),
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
    final warnText = item.out ? 'نفد' : (item.low ? 'قارب النفاد' : 'متوفر');

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
                            item.unit,
                          ].join(' · '),
                          style: TextStyle(
                              fontSize: 12, color: AppColors.text3Of(context)),
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

// ==================== نموذج الفئة ====================

Future<int?> openItemCategoryForm(
  BuildContext context,
  WidgetRef ref, {
  ItemCategory? category,
}) =>
    showModalBottomSheet<int>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (_) => Padding(
        padding:
            EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
        child: _ItemCategoryForm(category: category),
      ),
    ).then((id) {
      if (id != null) bump(ref);
      return id;
    });

class _ItemCategoryForm extends ConsumerStatefulWidget {
  final ItemCategory? category;
  const _ItemCategoryForm({this.category});

  @override
  ConsumerState<_ItemCategoryForm> createState() => _ItemCategoryFormState();
}

class _ItemCategoryFormState extends ConsumerState<_ItemCategoryForm> {
  late final TextEditingController _name;
  String? _error;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    _name = TextEditingController(text: widget.category?.name ?? '');
  }

  @override
  void dispose() {
    _name.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final name = _name.text.trim();
    if (name.isEmpty) {
      setState(() => _error = 'اسم الفئة مطلوب');
      return;
    }
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      final now = DateTime.now();
      final category = (widget.category ??
              ItemCategory(name: name, createdAt: now, updatedAt: now))
          .copyWith(name: name);
      final id = await ref.read(repoProvider).saveItemCategory(category);
      if (mounted) Navigator.pop(context, id);
    } catch (e) {
      if (mounted) {
        setState(() {
          _saving = false;
          _error = '$e'.replaceFirst('Bad state: ', '');
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Row(children: [
                Icon(Icons.folder_outlined,
                    color: AppColors.primaryOf(context)),
                const SizedBox(width: 8),
                Text(
                    widget.category == null ? 'إضافة فئة جديدة' : 'تعديل الفئة',
                    style: Theme.of(context).textTheme.titleMedium),
                const Spacer(),
                IconButton(
                    onPressed: _saving ? null : () => Navigator.pop(context),
                    icon: const Icon(Icons.close)),
              ]),
              const SizedBox(height: 8),
              TextField(
                controller: _name,
                autofocus: true,
                textInputAction: TextInputAction.done,
                decoration: InputDecoration(
                  labelText: 'اسم الفئة *',
                  hintText: 'مثل: المواد الغذائية أو الأجهزة',
                  prefixIcon: const Icon(Icons.category_outlined),
                  errorText: _error,
                ),
                onSubmitted: (_) => _saving ? null : _save(),
              ),
              const SizedBox(height: 14),
              SizedBox(
                width: double.infinity,
                child: FilledButton.icon(
                  onPressed: _saving ? null : _save,
                  icon: _saving
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.save_outlined),
                  label: Text(
                      widget.category == null ? 'حفظ الفئة' : 'حفظ التعديل'),
                ),
              ),
            ],
          ),
        ),
      );
}

// ==================== نموذج الصنف ====================

Future<void> openItemForm(
  BuildContext context,
  WidgetRef ref, {
  Item? item,
  int? categoryId,
}) =>
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (_) => Padding(
        padding:
            EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
        child: _ItemForm(item: item, presetCategoryId: categoryId),
      ),
    ).then((_) => bump(ref));

class _ItemForm extends ConsumerStatefulWidget {
  final Item? item;
  final int? presetCategoryId;
  const _ItemForm({this.item, this.presetCategoryId});

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
  late final TextEditingController _notes;
  int? _categoryId;
  String? _error;
  String? _categoryError;

  @override
  void initState() {
    super.initState();
    final i = widget.item;
    _categoryId = widget.presetCategoryId ?? i?.categoryId;
    _name = TextEditingController(text: i?.name ?? '');
    _sku = TextEditingController(text: i?.sku ?? '');
    _unit = TextEditingController(text: i?.unit ?? 'حبة');
    _buy = TextEditingController(text: i == null ? '' : _n(i.buyPrice));
    _sell = TextEditingController(text: i == null ? '' : _n(i.sellPrice));
    _qty = TextEditingController(text: i == null ? '' : _n(i.quantity));
    _min = TextEditingController(text: i == null ? '' : _n(i.minQuantity));
    _notes = TextEditingController(text: i?.notes ?? '');
    for (final c in [_buy, _sell]) {
      c.addListener(() => setState(() {}));
    }
  }

  static String _n(double v) =>
      v == 0 ? '' : (v == v.roundToDouble() ? v.toInt().toString() : '$v');

  @override
  void dispose() {
    for (final c in [_name, _sku, _unit, _buy, _sell, _qty, _min, _notes]) {
      c.dispose();
    }
    super.dispose();
  }

  double get _buyV => Fmt.parseAmount(_buy.text) ?? 0;
  double get _sellV => Fmt.parseAmount(_sell.text) ?? 0;

  Future<void> _addCategory() async {
    final id = await openItemCategoryForm(context, ref);
    if (mounted && id != null) setState(() => _categoryId = id);
  }

  Widget _categoryPicker(
      BuildContext context, AsyncValue<List<ItemCategory>> state) {
    return state.when(
      loading: () => const Padding(
        padding: EdgeInsets.symmetric(vertical: 8),
        child: LinearProgressIndicator(),
      ),
      error: (e, _) => InputDecorator(
        decoration: InputDecoration(
          labelText: 'الفئة *',
          errorText: 'تعذّر تحميل الفئات',
          prefixIcon: const Icon(Icons.category_outlined),
        ),
        child: Text('$e', maxLines: 2, overflow: TextOverflow.ellipsis),
      ),
      data: (categories) {
        final validId =
            categories.any((c) => c.id == _categoryId) ? _categoryId : null;
        if (categories.isEmpty) {
          return Column(
            children: [
              InputDecorator(
                decoration: InputDecoration(
                  labelText: 'الفئة *',
                  errorText: _categoryError,
                  prefixIcon: const Icon(Icons.category_outlined),
                ),
                child: const Text('أضف فئة أولًا قبل تسجيل الصنف'),
              ),
              const SizedBox(height: 7),
              Align(
                alignment: AlignmentDirectional.centerStart,
                child: OutlinedButton.icon(
                  onPressed: _addCategory,
                  icon: const Icon(Icons.add, size: 18),
                  label: const Text('إضافة فئة جديدة'),
                ),
              ),
            ],
          );
        }
        return Column(
          children: [
            DropdownButtonFormField<int>(
              initialValue: validId,
              isExpanded: true,
              decoration: InputDecoration(
                labelText: 'الفئة *',
                errorText: _categoryError,
                prefixIcon: const Icon(Icons.category_outlined),
              ),
              items: categories
                  .map((category) => DropdownMenuItem<int>(
                        value: category.id,
                        child: Text(category.name,
                            overflow: TextOverflow.ellipsis),
                      ))
                  .toList(),
              onChanged: (value) {
                setState(() {
                  _categoryId = value;
                  _categoryError = null;
                });
              },
            ),
            Align(
              alignment: AlignmentDirectional.centerStart,
              child: TextButton.icon(
                onPressed: _addCategory,
                icon: const Icon(Icons.add, size: 17),
                label: const Text('إضافة فئة جديدة'),
                style: TextButton.styleFrom(
                    padding: const EdgeInsets.symmetric(horizontal: 4)),
              ),
            ),
          ],
        );
      },
    );
  }

  Future<void> _save() async {
    final name = _name.text.trim();
    if (name.isEmpty) {
      setState(() => _error = 'اسم الصنف مطلوب');
      return;
    }
    if (_categoryId == null) {
      setState(() => _categoryError = 'اختر فئة أو أضف فئة جديدة أولًا');
      return;
    }

    final repo = ref.read(repoProvider);
    final categories = await repo.itemCategories();
    final category =
        categories.where((value) => value.id == _categoryId).firstOrNull;
    if (category == null) {
      setState(() => _categoryError = 'الفئة المختارة غير موجودة');
      return;
    }

    final now = DateTime.now();
    final base = widget.item;
    final it =
        (base ?? Item(name: name, createdAt: now, updatedAt: now)).copyWith(
      name: name,
      categoryId: category.id,
      sku: _sku.text.trim(),
      unit: _unit.text.trim().isEmpty ? 'حبة' : _unit.text.trim(),
      buyPrice: _buyV,
      sellPrice: _sellV,
      quantity: Fmt.parseAmount(_qty.text) ?? 0,
      minQuantity: Fmt.parseAmount(_min.text) ?? 0,
      category: category.name,
      notes: _notes.text.trim(),
    );
    await repo.saveItem(it);
    bump(ref);
    if (mounted) Navigator.pop(context);
  }

  @override
  Widget build(BuildContext context) {
    final categories = ref.watch(itemCategoriesProvider);
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
              _categoryPicker(context, categories),
              const SizedBox(height: 4),
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
