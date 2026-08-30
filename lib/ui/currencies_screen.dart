import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/accounting.dart';
import '../core/format.dart';
import '../core/theme.dart';
import '../data/providers.dart';
import 'widgets.dart';

/// العملات وأسعار الصرف والمحوّل — نقل شاشة `currencies.js`.
class CurrenciesScreen extends ConsumerWidget {
  const CurrenciesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final currencies = ref.watch(currenciesProvider);
    final settings = ref.watch(settingsProvider).valueOrNull ?? {};
    final defaultCode = settings['defaultCurrency'] ?? 'YER';

    return currencies.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, _) => EmptyState(
        icon: Icons.error_outline,
        title: 'تعذّر تحميل العملات',
        message: '$e',
      ),
      data: (list) => ListView(
        padding: const EdgeInsets.fromLTRB(14, 14, 14, 96),
        children: [
          const SectionTitle('العملات'),
          for (final c in list)
            Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: _CurrencyCard(
                currency: c,
                isDefault: c.code == defaultCode,
              ),
            ),
          const SizedBox(height: 10),
          OutlinedButton.icon(
            onPressed: () => _addCurrency(context, ref),
            icon: const Icon(Icons.add),
            label: const Text('إضافة عملة'),
          ),
          const SizedBox(height: 22),
          const SectionTitle('🔄 تحويل العملات'),
          _Converter(currencies: list, baseCode: defaultCode),
        ],
      ),
    );
  }

  Future<void> _addCurrency(BuildContext context, WidgetRef ref) async {
    final code = TextEditingController();
    final name = TextEditingController();
    final symbol = TextEditingController();
    final rate = TextEditingController(text: '1');

    final ok = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        title: const Text('إضافة عملة'),
        content: SingleChildScrollView(
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            TextField(
              controller: code,
              decoration: const InputDecoration(
                  labelText: 'الرمز الدولي (مثل EUR)'),
              textCapitalization: TextCapitalization.characters,
            ),
            const SizedBox(height: 10),
            TextField(
              controller: name,
              decoration: const InputDecoration(labelText: 'الاسم'),
            ),
            const SizedBox(height: 10),
            TextField(
              controller: symbol,
              decoration: const InputDecoration(labelText: 'العلامة'),
            ),
            const SizedBox(height: 10),
            TextField(
              controller: rate,
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              decoration:
                  const InputDecoration(labelText: 'سعر الصرف مقابل الأساس'),
            ),
          ]),
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(c, false),
              child: const Text('إلغاء')),
          FilledButton(
              onPressed: () => Navigator.pop(c, true),
              child: const Text('حفظ')),
        ],
      ),
    );

    if (ok != true) return;
    final cd = code.text.trim().toUpperCase();
    if (cd.isEmpty || name.text.trim().isEmpty) return;
    await ref.read(repoProvider).saveCurrency(
          CurrencyDef(cd, name.text.trim(),
              symbol.text.trim().isEmpty ? cd : symbol.text.trim(), 2),
          rate: Fmt.parseAmount(rate.text) ?? 1,
        );
    bump(ref);
    if (context.mounted) showSnack(context, 'تمت إضافة العملة ✅');
  }
}

class _CurrencyCard extends ConsumerStatefulWidget {
  final CurrencyDef currency;
  final bool isDefault;
  const _CurrencyCard({required this.currency, required this.isDefault});

  @override
  ConsumerState<_CurrencyCard> createState() => _CurrencyCardState();
}

class _CurrencyCardState extends ConsumerState<_CurrencyCard> {
  late final TextEditingController _rate;

  @override
  void initState() {
    super.initState();
    _rate = TextEditingController();
    _loadRate();
  }

  Future<void> _loadRate() async {
    final st = await ref.read(repoProvider).settings();
    final v = st['rate_${widget.currency.code}'];
    if (mounted && v != null) _rate.text = v;
  }

  @override
  void dispose() {
    _rate.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = widget.currency;
    final isBuiltIn = kDefaultCurrencies.any((d) => d.code == c.code);

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                  decoration: BoxDecoration(
                    color: AppColors.primarySoftOf(context),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text(c.symbol,
                      style: TextStyle(
                          fontWeight: FontWeight.w800,
                          color: AppColors.primaryOf(context))),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(c.name,
                          style: const TextStyle(
                              fontWeight: FontWeight.w700, fontSize: 14.5)),
                      Text(c.code,
                          style: TextStyle(
                              fontSize: 11.5,
                              color: AppColors.text3Of(context))),
                    ],
                  ),
                ),
                if (widget.isDefault)
                  Pill('✓ الافتراضية', color: AppColors.greenOf(context))
                else
                  TextButton(
                    onPressed: () async {
                      await ref
                          .read(repoProvider)
                          .setSetting('defaultCurrency', c.code);
                      bump(ref);
                      if (context.mounted) {
                        showSnack(context, 'تم تعيين ${c.name} افتراضية');
                      }
                    },
                    child: const Text('تعيين افتراضية'),
                  ),
              ],
            ),
            if (!widget.isDefault) ...[
              const SizedBox(height: 10),
              Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _rate,
                      keyboardType:
                          const TextInputType.numberWithOptions(decimal: true),
                      decoration: const InputDecoration(
                        labelText: 'سعر الصرف مقابل العملة الأساسية',
                        isDense: true,
                      ),
                      onSubmitted: (v) => _saveRate(v),
                    ),
                  ),
                  const SizedBox(width: 8),
                  IconButton.filledTonal(
                    onPressed: () => _saveRate(_rate.text),
                    icon: const Icon(Icons.check, size: 18),
                  ),
                  if (!isBuiltIn)
                    IconButton(
                      onPressed: () async {
                        final ok = await confirmDialog(
                          context,
                          title: 'حذف العملة',
                          message: 'سيتم حذف ${c.name} من القائمة.',
                          danger: true,
                        );
                        if (ok) {
                          await ref
                              .read(repoProvider)
                              .deleteCurrency(c.code);
                          bump(ref);
                        }
                      },
                      icon: Icon(Icons.delete_outline,
                          color: AppColors.dangerOf(context)),
                    ),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }

  Future<void> _saveRate(String v) async {
    final n = Fmt.parseAmount(v);
    if (n == null || n <= 0) {
      showSnack(context, 'سعر صرف غير صالح', error: true);
      return;
    }
    await ref
        .read(repoProvider)
        .setSetting('rate_${widget.currency.code}', '$n');
    bump(ref);
    if (mounted) showSnack(context, 'تم تحديث سعر الصرف ✅');
  }
}

/// محوّل العملات — يستخدم السعر مقابل العملة الأساسية.
class _Converter extends ConsumerStatefulWidget {
  final List<CurrencyDef> currencies;
  final String baseCode;
  const _Converter({required this.currencies, required this.baseCode});

  @override
  ConsumerState<_Converter> createState() => _ConverterState();
}

class _ConverterState extends ConsumerState<_Converter> {
  final _amount = TextEditingController(text: '100');
  String? _from;
  String? _to;
  Map<String, String> _settings = {};

  @override
  void initState() {
    super.initState();
    _from = widget.baseCode;
    _to = widget.currencies
        .firstWhere((c) => c.code != widget.baseCode,
            orElse: () => widget.currencies.first)
        .code;
    _loadSettings();
  }

  Future<void> _loadSettings() async {
    final st = await ref.read(repoProvider).settings();
    if (mounted) setState(() => _settings = st);
  }

  @override
  void dispose() {
    _amount.dispose();
    super.dispose();
  }

  double _rateOf(String code) {
    if (code == widget.baseCode) return 1;
    return double.tryParse(_settings['rate_$code'] ?? '') ?? 1;
  }

  double get _result {
    final amt = Fmt.parseAmount(_amount.text) ?? 0;
    // القيمة بالعملة الأساسية ثم إلى العملة المطلوبة.
    final inBase = amt * _rateOf(_from ?? widget.baseCode);
    final rTo = _rateOf(_to ?? widget.baseCode);
    return rTo == 0 ? 0 : inBase / rTo;
  }

  @override
  Widget build(BuildContext context) {
    final toDef = widget.currencies.firstWhere((c) => c.code == _to,
        orElse: () => widget.currencies.first);

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          children: [
            TextField(
              controller: _amount,
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              decoration: const InputDecoration(labelText: 'المبلغ'),
              onChanged: (_) => setState(() {}),
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: DropdownButtonFormField<String>(
                    initialValue: _from,
                    isExpanded: true,
                    decoration: const InputDecoration(labelText: 'من'),
                    items: widget.currencies
                        .map((c) => DropdownMenuItem(
                            value: c.code,
                            child:
                                Text(c.name, overflow: TextOverflow.ellipsis)))
                        .toList(),
                    onChanged: (v) => setState(() => _from = v),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: DropdownButtonFormField<String>(
                    initialValue: _to,
                    isExpanded: true,
                    decoration: const InputDecoration(labelText: 'إلى'),
                    items: widget.currencies
                        .map((c) => DropdownMenuItem(
                            value: c.code,
                            child:
                                Text(c.name, overflow: TextOverflow.ellipsis)))
                        .toList(),
                    onChanged: (v) => setState(() => _to = v),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 14),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: AppColors.primarySoftOf(context),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Text(
                '${Fmt.money(_result, toDef.decimal)} ${toDef.symbol}',
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontSize: 20,
                  fontWeight: FontWeight.w800,
                  color: AppColors.primaryOf(context),
                ),
              ),
            ),
            const SizedBox(height: 8),
            Text(
              'يُستخدم سعر الصرف المدخل مقابل العملة الأساسية للتحويل.',
              style:
                  TextStyle(fontSize: 11.5, color: AppColors.text3Of(context)),
            ),
          ],
        ),
      ),
    );
  }
}
