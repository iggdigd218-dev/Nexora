import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/accounting.dart';
import '../core/format.dart';
import '../core/models.dart';
import '../data/providers.dart';
import 'contact_picker.dart';
import 'widgets.dart';

/// فتح نموذج إضافة/تعديل حساب.
Future<bool> openAccountForm(BuildContext context, WidgetRef ref,
    {Account? existing}) async {
  final r = await Navigator.push<bool>(
    context,
    MaterialPageRoute(builder: (_) => AccountFormScreen(existing: existing)),
  );
  return r ?? false;
}

class AccountFormScreen extends ConsumerStatefulWidget {
  final Account? existing;
  const AccountFormScreen({super.key, this.existing});

  @override
  ConsumerState<AccountFormScreen> createState() => _State();
}

class _State extends ConsumerState<AccountFormScreen> {
  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _name;
  late final TextEditingController _opening;
  late final TextEditingController _phone;
  late final TextEditingController _whatsapp;
  late final TextEditingController _address;
  late final TextEditingController _notes;
  late final TextEditingController _category;
  late final TextEditingController _limit;
  late final TextEditingController _tags;

  late AccountKind _kind;
  late String _currency;

  /// طبيعة الرصيد الافتتاحي: debit = عليه (موجب)، credit = له (سالب).
  late String _nature;
  late bool _archived;
  bool _saving = false;

  bool get _isEdit => widget.existing != null;

  @override
  void initState() {
    super.initState();
    final a = widget.existing;
    _name = TextEditingController(text: a?.name ?? '');
    _opening = TextEditingController(
        text: a == null || a.openingBalance == 0
            ? ''
            : Fmt.money(a.openingBalance.abs(), 2));
    _phone = TextEditingController(text: a?.phone ?? '');
    _whatsapp = TextEditingController(text: a?.whatsapp ?? '');
    _address = TextEditingController(text: a?.address ?? '');
    _notes = TextEditingController(text: a?.notes ?? '');
    _category = TextEditingController(text: a?.category ?? '');
    _limit = TextEditingController(
        text: a?.creditLimit == null ? '' : Fmt.money(a!.creditLimit!, 2));
    _tags = TextEditingController(text: a?.tags.join('، ') ?? '');
    _kind = a?.kind ?? AccountKind.customer;
    _currency = a?.currency ?? 'YER';
    _nature = (a?.openingBalance ?? 0) < 0 ? 'credit' : 'debit';
    _archived = a?.archived ?? false;
  }

  @override
  void dispose() {
    for (final c in [
      _name,
      _opening,
      _phone,
      _whatsapp,
      _address,
      _notes,
      _category,
      _limit,
      _tags
    ]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _save() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() => _saving = true);
    try {
      final opening = Fmt.parseAmount(_opening.text) ?? 0;
      final limit = Fmt.parseAmount(_limit.text);
      final now = DateTime.now();

      final acc = Account(
        id: widget.existing?.id,
        name: _name.text.trim(),
        kind: _kind,
        // الطبيعة تحدّد الإشارة: «له» يعني مستحقًا منا فيكون سالبًا.
        openingBalance: opening * (_nature == 'credit' ? -1 : 1),
        currency: _currency,
        phone: Fmt.phoneDigits(_phone.text),
        whatsapp: Fmt.phoneDigits(_whatsapp.text),
        address: _address.text.trim(),
        notes: _notes.text.trim(),
        category: _category.text.trim(),
        creditLimit: limit,
        tags: _tags.text
            .split(RegExp('[,،]'))
            .map((e) => e.trim())
            .where((e) => e.isNotEmpty)
            .toList(),
        archived: _archived,
        createdAt: widget.existing?.createdAt ?? now,
        updatedAt: now,
      );

      await ref.read(repoProvider).saveAccount(acc);
      if (!mounted) return;
      bump(ref);
      Navigator.pop(context, true);
      showSnack(context, _isEdit ? 'تم تحديث الحساب' : 'تمت إضافة الحساب');
    } catch (e) {
      if (mounted) showSnack(context, 'تعذّر الحفظ: $e', error: true);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  /// يملأ الاسم والهاتف والواتساب من جهة اتصال مختارة.
  Future<void> _fromContacts() async {
    final c = await pickContact(context);
    if (c == null || !mounted) return;
    setState(() {
      _name.text = c.name;
      final digits = Fmt.phoneDigits(c.phone);
      if (_phone.text.trim().isEmpty) _phone.text = digits;
      if (_whatsapp.text.trim().isEmpty) _whatsapp.text = digits;
    });
  }

  @override
  Widget build(BuildContext context) {
    final curs = ref.watch(currenciesProvider).valueOrNull ?? kDefaultCurrencies;

    return Scaffold(
      appBar: AppBar(title: Text(_isEdit ? 'تعديل حساب' : 'حساب جديد')),
      body: Form(
        key: _formKey,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 100),
          children: [
            TextFormField(
              controller: _name,
              decoration: InputDecoration(
                labelText: 'اسم الحساب *',
                // البند ١١: اختيار الاسم والرقم من جهات اتصال الهاتف.
                suffixIcon: IconButton(
                  tooltip: 'اختيار من جهات الاتصال',
                  icon: const Icon(Icons.contacts_outlined),
                  onPressed: _fromContacts,
                ),
              ),
              textInputAction: TextInputAction.next,
              validator: (v) =>
                  (v ?? '').trim().isEmpty ? 'الاسم مطلوب' : null,
            ),
            const SizedBox(height: 13),
            const _Label('نوع الحساب'),
            const SizedBox(height: 7),
            Wrap(
              spacing: 7,
              children: AccountKind.values
                  .map((k) => ChoiceChip(
                        label: Text('${k.icon} ${k.label}'),
                        selected: _kind == k,
                        showCheckmark: false,
                        onSelected: (_) => setState(() => _kind = k),
                      ))
                  .toList(),
            ),
            const SizedBox(height: 15),
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  flex: 3,
                  child: TextFormField(
                    controller: _opening,
                    decoration:
                        const InputDecoration(labelText: 'الرصيد الافتتاحي'),
                    keyboardType:
                        const TextInputType.numberWithOptions(decimal: true),
                    validator: (v) {
                      if ((v ?? '').trim().isEmpty) return null;
                      return Fmt.parseAmount(v!) == null
                          ? 'مبلغ غير صالح'
                          : null;
                    },
                  ),
                ),
                const SizedBox(width: 9),
                Expanded(
                  flex: 2,
                  child: DropdownButtonFormField<String>(
                    initialValue: _nature,
                    decoration: const InputDecoration(labelText: 'الطبيعة'),
                    items: const [
                      DropdownMenuItem(
                          value: 'debit', child: Text('عليه (مدين)')),
                      DropdownMenuItem(
                          value: 'credit', child: Text('له (دائن)')),
                    ],
                    onChanged: (v) => setState(() => _nature = v ?? 'debit'),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 13),
            DropdownButtonFormField<String>(
              initialValue: curs.any((c) => c.code == _currency) ? _currency : null,
              decoration: const InputDecoration(labelText: 'العملة'),
              items: curs
                  .map((c) => DropdownMenuItem(
                      value: c.code, child: Text('${c.name} (${c.symbol})')))
                  .toList(),
              onChanged: (v) => setState(() => _currency = v ?? 'YER'),
            ),
            const SizedBox(height: 13),
            Row(
              children: [
                Expanded(
                  child: TextFormField(
                    controller: _phone,
                    decoration: const InputDecoration(labelText: 'الهاتف'),
                    keyboardType: TextInputType.phone,
                  ),
                ),
                const SizedBox(width: 9),
                Expanded(
                  child: TextFormField(
                    controller: _whatsapp,
                    decoration: const InputDecoration(labelText: 'واتساب'),
                    keyboardType: TextInputType.phone,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 13),
            TextFormField(
              controller: _address,
              decoration: const InputDecoration(labelText: 'العنوان'),
            ),
            const SizedBox(height: 13),
            Row(
              children: [
                Expanded(
                  child: TextFormField(
                    controller: _category,
                    decoration: const InputDecoration(labelText: 'التصنيف'),
                  ),
                ),
                const SizedBox(width: 9),
                Expanded(
                  child: TextFormField(
                    controller: _limit,
                    decoration:
                        const InputDecoration(labelText: 'حد ائتماني'),
                    keyboardType:
                        const TextInputType.numberWithOptions(decimal: true),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 13),
            TextFormField(
              controller: _tags,
              decoration: const InputDecoration(
                labelText: 'علامات',
                hintText: 'افصل بينها بفاصلة',
              ),
            ),
            const SizedBox(height: 13),
            TextFormField(
              controller: _notes,
              decoration: const InputDecoration(labelText: 'ملاحظات'),
              maxLines: 3,
            ),
            if (_isEdit) ...[
              const SizedBox(height: 8),
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                title: const Text('مؤرشف',
                    style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
                subtitle: const Text('يُخفى من القوائم دون حذف بياناته',
                    style: TextStyle(fontSize: 12)),
                value: _archived,
                onChanged: (v) => setState(() => _archived = v),
              ),
            ],
            const SizedBox(height: 20),
            FilledButton.icon(
              onPressed: _saving ? null : _save,
              icon: _saving
                  ? const SizedBox(
                      width: 16,
                      height: 16,
                      child: CircularProgressIndicator(
                          strokeWidth: 2, color: Colors.white))
                  : const Icon(Icons.check),
              label: Text(_isEdit ? 'حفظ التعديلات' : 'إضافة الحساب'),
            ),
          ],
        ),
      ),
    );
  }
}

class _Label extends StatelessWidget {
  final String text;
  const _Label(this.text);
  @override
  Widget build(BuildContext context) => Text(text,
      style: TextStyle(
          fontSize: 13, color: Theme.of(context).hintColor));
}
