import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:image_picker/image_picker.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/accounting.dart';
import '../core/format.dart';
import '../core/models.dart';
import '../core/receipt_image.dart';
import '../core/theme.dart';
import '../data/providers.dart';
import 'calculator.dart';
import 'tx_share.dart';
import 'widgets.dart';

/// يفتح نموذج العملية المالية (إضافة / تعديل / تكرار).
Future<bool?> openTxForm(
  BuildContext context,
  WidgetRef ref, {
  Tx? existing,
  int? presetAccountId,
  bool isCopy = false,
}) =>
    showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (_) => TxForm(
        existing: existing,
        presetAccountId: presetAccountId,
        isCopy: isCopy,
      ),
    );

class TxForm extends ConsumerStatefulWidget {
  final Tx? existing;
  final int? presetAccountId;
  final bool isCopy;
  const TxForm({super.key, this.existing, this.presetAccountId, this.isCopy = false});

  @override
  ConsumerState<TxForm> createState() => _TxFormState();
}

class _TxFormState extends ConsumerState<TxForm> {
  final _formKey = GlobalKey<FormState>();
  final _amount = TextEditingController();
  final _rate = TextEditingController(text: '1');
  final _desc = TextEditingController();
  final _ref = TextEditingController();
  final _notes = TextEditingController();

  OpType _type = OpType.inflow;
  int? _accountId;
  int? _toId;
  String _currency = 'YER';
  String _sign = '+';
  String _status = 'done';
  DateTime _date = DateTime.now();

  List<Account> _accounts = [];
  List<CurrencyDef> _currencies = [];
  List<Item> _inventoryItems = [];
  List<InvoiceLine> _invoiceLines = [];
  bool _loading = true;
  bool _saving = false;

  /// توليد صورة الإيصال وإرسالها للعميل فور الحفظ (البنود ٣ و ٤ و ١٢ و ١٤).
  bool _autoSend = true;
  String _image = '';

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final repo = ref.read(repoProvider);
    final accs = await repo.accounts(includeArchived: true);
    final curs = await repo.currencies();
    final stockItems = await repo.items(includeArchived: true);
    final t = widget.existing;
    final invoiceLines = t?.id == null
        ? const <InvoiceLine>[]
        : await repo.transactionItems(t!.id!);

    if (t != null) {
      _type = t.type;
      _accountId = t.type == OpType.transfer ? t.fromId : t.accountId;
      _toId = t.toId;
      _currency = t.currency;
      _sign = t.sign.isEmpty ? '+' : t.sign;
      _status = t.status;
      _image = t.image;
      _date = t.date;
      _amount.text = Fmt.money(t.amount, 2).replaceAll(',', '');
      _rate.text = '${t.rate}';
      _desc.text = t.description;
      _ref.text = widget.isCopy && t.reference.isNotEmpty
          ? '${t.reference} (نسخة)'
          : t.reference;
      _notes.text = t.notes;
    } else {
      _accountId = widget.presetAccountId ??
          (accs.isNotEmpty ? accs.first.id : null);
    }

    final acc = accs.where((a) => a.id == _accountId).firstOrNull;
    if (t == null && acc != null) _currency = acc.currency;

    if (mounted) {
      setState(() {
        _accounts = accs;
        _currencies = curs;
        _inventoryItems = stockItems;
        _invoiceLines = invoiceLines;
        _loading = false;
      });
    }
  }

  @override
  void dispose() {
    _amount.dispose();
    _rate.dispose();
    _desc.dispose();
    _ref.dispose();
    _notes.dispose();
    super.dispose();
  }

  Account? get _account =>
      _accounts.where((a) => a.id == _accountId).firstOrNull;

  bool get _isTransfer => _type == OpType.transfer;

  /// البيع الآجل يظهر كعملية مدين؛ تفاصيل الأصناف تبقى اختيارية حتى لا
  /// تتعطل العمليات القديمة التي سُجلت بمبلغ ووصف فقط.
  bool get _hasInvoiceDetails => _type == OpType.debit;

  double get _invoiceTotal =>
      _invoiceLines.fold<double>(0, (sum, line) => sum + line.total);

  /// نص الأثر المتوقّع — نفس تلميح نسخة الويب.
  String get _effectHint {
    if (_isTransfer) {
      return 'يُخصم المبلغ من الحساب الأول ويُضاف للثاني بعد تطبيق سعر الصرف.';
    }
    if (_type == OpType.settle) {
      return _sign == '+'
          ? 'تسوية بالزيادة: يرتفع الرصيد (+).'
          : 'تسوية بالنقصان: ينخفض الرصيد (−).';
    }
    final acc = _account;
    if (acc == null) return '';
    final eff = opEffect(_type, acc.kind);
    final dir = eff > 0
        ? 'زيادة الرصيد (+) — يصبح أكثر «عليه»'
        : 'نقصان الرصيد (−) — يميل نحو «له»';
    return 'الأثر على «${acc.name}»: $dir';
  }

  Future<void> _save() async {
    if (!_formKey.currentState!.validate()) return;
    if (_accountId == null) {
      showSnack(context, 'اختر الحساب', error: true);
      return;
    }
    if (_isTransfer && (_toId == null || _toId == _accountId)) {
      showSnack(context, 'اختر حساب الوجهة (مختلفًا عن المصدر)', error: true);
      return;
    }

    final amount = Fmt.parseAmount(_amount.text);
    if (amount == null || amount <= 0) {
      showSnack(context, 'أدخل مبلغًا صحيحًا أكبر من صفر', error: true);
      return;
    }

    setState(() => _saving = true);
    final repo = ref.read(repoProvider);
    final now = DateTime.now();
    final old = widget.existing;
    final keepId = (old != null && !widget.isCopy) ? old.id : null;

    final tx = Tx(
      id: keepId,
      accountId: _isTransfer ? null : _accountId,
      accountKind: _account?.kind ?? AccountKind.general,
      type: _type,
      amount: amount,
      currency: _currency,
      sign: _type == OpType.settle ? _sign : '',
      fromId: _isTransfer ? _accountId : null,
      toId: _isTransfer ? _toId : null,
      rate: Fmt.parseAmount(_rate.text) ?? 1,
      description: _desc.text.trim(),
      reference: _ref.text.trim(),
      notes: _notes.text.trim(),
      image: _image,
      status: _status,
      date: _date,
      createdAt: (keepId != null ? old!.createdAt : now),
      updatedAt: now,
    );

    // كشف التكرار: تحذير لا منع، وفقط للعمليات الجديدة.
    if (keepId == null) {
      final dups = await repo.findDuplicates(tx);
      if (dups.isNotEmpty && mounted) {
        final ok = await confirmDialog(
          context,
          title: '⚠️ عملية مكررة محتملة',
          message:
              'توجد ${dups.length} عملية مماثلة بنفس المبلغ والنوع اليوم.\nهل تريد المتابعة؟',
          confirmText: 'متابعة',
        );
        if (ok != true) {
          setState(() => _saving = false);
          return;
        }
      }
    }

    final savedId = await repo.saveTx(
      tx,
      items: _hasInvoiceDetails ? _invoiceLines : const [],
    );
    final saved = tx.copyWith(id: savedId);
    if (!mounted) return;

    // نُنشئ صورة الإيصال ونرسلها قبل إغلاق النموذج حتى لا نستخدم
    // WidgetRef أو BuildContext بعد إزالة نافذة العملية من الشجرة.
    // هذا مهم خصوصًا للبيع الآجل أو الجزئي الذي يُرسل إشعاره تلقائيًا.
    if (!_isTransfer && _accountId != null) {
      final acc = _account;
      if (_autoSend) {
        try {
          await TxShare.sendNow(context, ref,
              tx: saved, account: acc, silentIfNoPhone: false);
        } catch (e) {
          if (mounted) {
            showSnack(context, 'تم حفظ العملية لكن تعذّر إرسال السند: $e',
                error: true);
          }
        }
      } else {
        try {
          await TxShare.generate(repo: repo, tx: saved, account: acc);
          bump(ref);
        } catch (e) {
          // فشل توليد الصورة لا يبطل العملية المحفوظة، لكنه لا يُخفى.
          if (mounted) {
            showSnack(context, 'تم حفظ العملية لكن تعذّر توليد صورة السند: $e',
                error: true);
          }
        }
      }
    }

    if (!mounted) return;
    bump(ref);
    Navigator.pop(context, true);
    showSnack(context,
        keepId != null ? 'تم تعديل العملية ✅' : 'تمت إضافة العملية وتحديث الرصيد ✅');
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const SizedBox(
        height: 260,
        child: Center(child: CircularProgressIndicator()),
      );
    }

    if (_accounts.isEmpty) {
      return Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const EmptyState(
              icon: Icons.person_off_outlined,
              title: 'لا توجد حسابات',
              message: 'أضف حسابًا أولًا قبل تسجيل أي عملية مالية.',
            ),
            const SizedBox(height: 12),
            FilledButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('حسنًا'),
            ),
          ],
        ),
      );
    }

    final title = widget.isCopy
        ? '🔁 تكرار عملية'
        : (widget.existing != null ? '✏️ تعديل عملية' : '＋ عملية مالية جديدة');

    return DraggableScrollableSheet(
      initialChildSize: .92,
      minChildSize: .5,
      maxChildSize: .96,
      expand: false,
      builder: (context, scroll) => Column(
        children: [
          const SizedBox(height: 8),
          Container(
            width: 42,
            height: 4,
            decoration: BoxDecoration(
              color: AppColors.borderOf(context),
              borderRadius: BorderRadius.circular(4),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(18, 14, 18, 6),
            child: Row(
              children: [
                Expanded(
                  child: Text(title,
                      style: Theme.of(context).textTheme.titleLarge),
                ),
                IconButton(
                  onPressed: () => Navigator.pop(context),
                  icon: const Icon(Icons.close),
                ),
              ],
            ),
          ),
          const Divider(height: 1),
          Expanded(
            child: Form(
              key: _formKey,
              child: ListView(
                controller: scroll,
                padding: const EdgeInsets.fromLTRB(18, 16, 18, 24),
                children: [
                  _typeGrid(),
                  const SizedBox(height: 18),
                  _accountPickers(),
                  const SizedBox(height: 14),
                  _amountRow(),
                  if (_hasInvoiceDetails) ...[
                    const SizedBox(height: 14),
                    _invoiceItemsSection(),
                  ],
                  if (_type == OpType.settle) ...[
                    const SizedBox(height: 14),
                    _signPicker(),
                  ],
                  const SizedBox(height: 12),
                  _hintBox(),
                  const SizedBox(height: 16),
                  _datePicker(),
                  const SizedBox(height: 14),
                  TextFormField(
                    controller: _desc,
                    decoration: const InputDecoration(
                      labelText: 'البيان / الوصف',
                      prefixIcon: Icon(Icons.notes_outlined),
                    ),
                    maxLines: 2,
                    textInputAction: TextInputAction.next,
                  ),
                  const SizedBox(height: 14),
                  TextFormField(
                    controller: _ref,
                    decoration: const InputDecoration(
                      labelText: 'رقم مرجعي',
                      prefixIcon: Icon(Icons.tag),
                    ),
                  ),
                  const SizedBox(height: 14),
                  TextFormField(
                    controller: _notes,
                    decoration: const InputDecoration(
                      labelText: 'ملاحظات',
                      prefixIcon: Icon(Icons.sticky_note_2_outlined),
                    ),
                    maxLines: 2,
                  ),
                  const SizedBox(height: 14),
                  _statusPicker(),
                  const SizedBox(height: 16),
                  _imageAndSend(),
                  const SizedBox(height: 24),
                  Row(
                    children: [
                      Expanded(
                        child: OutlinedButton(
                          onPressed:
                              _saving ? null : () => Navigator.pop(context),
                          child: const Text('إلغاء'),
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        flex: 2,
                        child: FilledButton.icon(
                          onPressed: _saving ? null : _save,
                          icon: _saving
                              ? const SizedBox(
                                  width: 18,
                                  height: 18,
                                  child: CircularProgressIndicator(
                                      strokeWidth: 2, color: Colors.white),
                                )
                              : const Icon(Icons.save_outlined),
                          label: Text(_saving ? 'جارٍ الحفظ...' : 'حفظ العملية'),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  /// صورة العملية + خيار الإرسال التلقائي عبر واتساب.
  Widget _imageAndSend() {
    if (_isTransfer) return const SizedBox.shrink();
    final acc = _account;
    final phone = acc == null
        ? ''
        : (acc.whatsapp.trim().isNotEmpty ? acc.whatsapp.trim() : acc.phone.trim());
    final hasImage = _image.isNotEmpty && File(_image).existsSync();

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.surface2Of(context),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.borderOf(context)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(children: [
            Icon(Icons.image_outlined,
                size: 18, color: AppColors.primaryOf(context)),
            const SizedBox(width: 8),
            Text('صورة الإيصال',
                style: TextStyle(
                    fontWeight: FontWeight.w800,
                    fontSize: 13.5,
                    color: AppColors.textOf(context))),
          ]),
          const SizedBox(height: 6),
          Text(
            hasImage
                ? 'صورة محفوظة لهذه العملية — يمكنك استبدالها أو حذفها.'
                : 'تُولَّد صورة الإيصال تلقائيًا عند الحفظ، ويمكنك رفع صورة بديلة.',
            style: TextStyle(fontSize: 12, color: AppColors.text2Of(context)),
          ),
          if (hasImage) ...[
            const SizedBox(height: 10),
            ClipRRect(
              borderRadius: BorderRadius.circular(12),
              child: Image.file(File(_image),
                  height: 150, width: double.infinity, fit: BoxFit.cover),
            ),
          ],
          const SizedBox(height: 10),
          Row(children: [
            Expanded(
              child: OutlinedButton.icon(
                onPressed: _pickImage,
                icon: const Icon(Icons.photo_library_outlined, size: 18),
                label: Text(hasImage ? 'استبدال' : 'رفع صورة'),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: OutlinedButton.icon(
                onPressed: _captureImage,
                icon: const Icon(Icons.photo_camera_outlined, size: 18),
                label: const Text('كاميرا'),
              ),
            ),
            if (hasImage)
              IconButton(
                tooltip: 'حذف الصورة',
                onPressed: () => setState(() => _image = ''),
                icon: Icon(Icons.delete_outline,
                    color: AppColors.dangerOf(context)),
              ),
          ]),
          const Divider(height: 22),
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            dense: true,
            secondary: Icon(Icons.send,
                color: phone.isEmpty
                    ? AppColors.text3Of(context)
                    : AppColors.primaryOf(context)),
            title: const Text('إرسال واتساب تلقائيًا بعد الحفظ',
                style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w700)),
            subtitle: Text(
              phone.isEmpty
                  ? 'لا يوجد رقم لهذا الحساب — أضِف رقمًا لتفعيل الإرسال'
                  : 'تُفتح محادثة $phone مباشرة ومعها الصورة والنص',
              style: const TextStyle(fontSize: 11.5),
            ),
            value: _autoSend && phone.isNotEmpty,
            onChanged: phone.isEmpty
                ? null
                : (v) => setState(() => _autoSend = v),
          ),
        ],
      ),
    );
  }

  Future<void> _pickImage() async {
    final x = await ImagePicker()
        .pickImage(source: ImageSource.gallery, imageQuality: 82);
    if (x == null) return;
    final saved = await saveImageBytes(await x.readAsBytes(), prefix: 'tx');
    if (mounted) setState(() => _image = saved);
  }

  Future<void> _captureImage() async {
    try {
      final x = await ImagePicker()
          .pickImage(source: ImageSource.camera, imageQuality: 82);
      if (x == null) return;
      final saved = await saveImageBytes(await x.readAsBytes(), prefix: 'tx');
      if (mounted) setState(() => _image = saved);
    } catch (e) {
      if (mounted) showSnack(context, 'تعذّر فتح الكاميرا', error: true);
    }
  }

  CurrencyDef get _selectedCurrency => _currencies.firstWhere(
        (c) => c.code == _currency,
        orElse: () => kDefaultCurrencies.first,
      );

  String _number(double value) => value == value.roundToDouble()
      ? Fmt.money(value)
      : Fmt.money(value, 2);

  Widget _invoiceItemsSection() {
    final c = _selectedCurrency;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.surface2Of(context),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.borderOf(context)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.shopping_cart_outlined,
                  size: 19, color: AppColors.primaryOf(context)),
              const SizedBox(width: 8),
              const Expanded(
                child: Text('تفاصيل المشتريات',
                    style:
                        TextStyle(fontSize: 14, fontWeight: FontWeight.w800)),
              ),
              TextButton.icon(
                onPressed: _inventoryItems.isEmpty ? null : _addInvoiceLine,
                icon: const Icon(Icons.add, size: 18),
                label: const Text('إضافة صنف'),
              ),
            ],
          ),
          Text(
            'اختياري: اختر الأصناف ليظهر كل صنف وكميته وسعره في الإشعار والسند والصورة.',
            style: TextStyle(fontSize: 11.5, color: AppColors.text2Of(context)),
          ),
          if (_inventoryItems.isEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 12),
              child: Text(
                'لا توجد أصناف مسجلة. أضف بيانات الأصناف من «المخزون والأصناف» أولًا.',
                style: TextStyle(
                    fontSize: 12, color: AppColors.text3Of(context)),
              ),
            )
          else if (_invoiceLines.isEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 12),
              child: Text(
                'لم تتم إضافة أصناف بعد.',
                style: TextStyle(
                    fontSize: 12, color: AppColors.text3Of(context)),
              ),
            )
          else ...[
            const SizedBox(height: 10),
            for (var i = 0; i < _invoiceLines.length; i++) ...[
              if (i > 0) const Divider(height: 18),
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          _invoiceLines[i].name,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                              fontSize: 13.5, fontWeight: FontWeight.w800),
                        ),
                        const SizedBox(height: 3),
                        Text(
                          '${_number(_invoiceLines[i].quantity)} ${_invoiceLines[i].unit} × ${Fmt.money(_invoiceLines[i].unitPrice, c.decimal)} ${c.symbol}',
                          style: TextStyle(
                              fontSize: 11.5,
                              color: AppColors.text2Of(context)),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 8),
                  Text(
                    '${Fmt.money(_invoiceLines[i].total, c.decimal)} ${c.symbol}',
                    style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w800,
                        color: AppColors.primaryOf(context)),
                  ),
                  IconButton(
                    tooltip: 'تعديل الصنف',
                    visualDensity: VisualDensity.compact,
                    onPressed: () => _editInvoiceLine(i),
                    icon: const Icon(Icons.edit_outlined, size: 18),
                  ),
                  IconButton(
                    tooltip: 'حذف الصنف',
                    visualDensity: VisualDensity.compact,
                    onPressed: () => setState(() => _invoiceLines.removeAt(i)),
                    icon: Icon(Icons.delete_outline,
                        size: 18, color: AppColors.dangerOf(context)),
                  ),
                ],
              ),
            ],
            const Divider(height: 20),
            Row(
              children: [
                const Expanded(
                  child: Text('إجمالي المشتريات',
                      style: TextStyle(fontWeight: FontWeight.w800)),
                ),
                Text(
                  '${Fmt.money(_invoiceTotal, c.decimal)} ${c.symbol}',
                  style: TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w800,
                      color: AppColors.primaryOf(context)),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }

  Future<void> _addInvoiceLine() => _editInvoiceLine();

  Future<void> _editInvoiceLine([int? index]) async {
    if (_inventoryItems.isEmpty) return;
    final old = index == null ? null : _invoiceLines[index];
    var itemId = old?.itemId;
    if (!_inventoryItems.any((item) => item.id == itemId)) {
      itemId = _inventoryItems.first.id;
    }
    final item = _inventoryItems.firstWhere((item) => item.id == itemId);
    final quantity = TextEditingController(
        text: old == null ? '1' : _number(old.quantity));
    final price = TextEditingController(
        text: old == null ? _number(item.sellPrice) : _number(old.unitPrice));
    final formKey = GlobalKey<FormState>();

    final line = await showDialog<InvoiceLine>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (dialogContext, setDialogState) {
          final selected = _inventoryItems.firstWhere(
            (value) => value.id == itemId,
            orElse: () => _inventoryItems.first,
          );
          return AlertDialog(
            title: Text(old == null ? 'إضافة صنف للفاتورة' : 'تعديل الصنف'),
            content: Form(
              key: formKey,
              child: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    DropdownButtonFormField<int>(
                      value: itemId,
                      isExpanded: true,
                      decoration: const InputDecoration(
                        labelText: 'الصنف',
                        prefixIcon: Icon(Icons.inventory_2_outlined),
                      ),
                      items: _inventoryItems
                          .map((value) => DropdownMenuItem<int>(
                                value: value.id,
                                child: Text(value.name,
                                    overflow: TextOverflow.ellipsis),
                              ))
                          .toList(),
                      onChanged: (value) {
                        if (value == null) return;
                        setDialogState(() {
                          itemId = value;
                          price.text = _number(_inventoryItems
                              .firstWhere((item) => item.id == value)
                              .sellPrice);
                        });
                      },
                      validator: (value) => value == null ? 'اختر الصنف' : null,
                    ),
                    const SizedBox(height: 12),
                    TextFormField(
                      controller: quantity,
                      keyboardType: const TextInputType.numberWithOptions(
                          decimal: true),
                      decoration: const InputDecoration(
                        labelText: 'الكمية',
                        prefixIcon: Icon(Icons.numbers),
                      ),
                      onChanged: (_) => setDialogState(() {}),
                      validator: (value) {
                        final number = Fmt.parseAmount(value ?? '');
                        return number == null || number <= 0
                            ? 'أدخل كمية صحيحة'
                            : null;
                      },
                    ),
                    const SizedBox(height: 12),
                    TextFormField(
                      controller: price,
                      keyboardType: const TextInputType.numberWithOptions(
                          decimal: true),
                      decoration: const InputDecoration(
                        labelText: 'سعر الوحدة',
                        prefixIcon: Icon(Icons.payments_outlined),
                      ),
                      onChanged: (_) => setDialogState(() {}),
                      validator: (value) {
                        final number = Fmt.parseAmount(value ?? '');
                        return number == null || number < 0
                            ? 'أدخل سعرًا صحيحًا'
                            : null;
                      },
                    ),
                    const SizedBox(height: 8),
                    Text(
                      'الإجمالي: ${Fmt.money((Fmt.parseAmount(quantity.text) ?? 0) * (Fmt.parseAmount(price.text) ?? 0), _selectedCurrency.decimal)} ${_selectedCurrency.symbol}',
                      style: TextStyle(
                          fontWeight: FontWeight.w800,
                          color: AppColors.primaryOf(context)),
                    ),
                  ],
                ),
              ),
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(dialogContext),
                child: const Text('إلغاء'),
              ),
              FilledButton(
                onPressed: () {
                  if (!formKey.currentState!.validate()) return;
                  final q = Fmt.parseAmount(quantity.text)!;
                  final p = Fmt.parseAmount(price.text)!;
                  Navigator.pop(
                    dialogContext,
                    InvoiceLine(
                      itemId: itemId,
                      name: selected.name,
                      unit: selected.unit,
                      quantity: q,
                      unitPrice: p,
                    ),
                  );
                },
                child: const Text('حفظ الصنف'),
              ),
            ],
          );
        },
      ),
    );
    quantity.dispose();
    price.dispose();
    if (line == null || !mounted) return;
    setState(() {
      if (index == null) {
        _invoiceLines.add(line);
      } else {
        _invoiceLines[index] = line;
      }
    });
  }

  Widget _typeGrid() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SectionTitle('نوع العملية'),
        const SizedBox(height: 8),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: OpType.values.map((t) {
            final sel = t == _type;
            return ChoiceChip(
              selected: sel,
              onSelected: (_) => setState(() => _type = t),
              avatar: Text(t.icon, style: const TextStyle(fontSize: 14)),
              label: Text(t.label),
              labelStyle: TextStyle(
                fontWeight: FontWeight.w700,
                fontSize: 12.5,
                color: sel
                    ? AppColors.primaryOf(context)
                    : AppColors.text2Of(context),
              ),
            );
          }).toList(),
        ),
      ],
    );
  }

  Widget _accountPickers() {
    return Column(
      children: [
        DropdownButtonFormField<int>(
          initialValue: _accountId,
          isExpanded: true,
          decoration: InputDecoration(
            labelText: _isTransfer ? 'من حساب' : 'الحساب',
            prefixIcon: const Icon(Icons.account_balance_wallet_outlined),
          ),
          items: _accounts
              .map((a) => DropdownMenuItem(
                    value: a.id,
                    child: Text('${a.kind.icon}  ${a.name}',
                        overflow: TextOverflow.ellipsis),
                  ))
              .toList(),
          onChanged: (v) {
            setState(() {
              _accountId = v;
              final acc = _account;
              if (acc != null && widget.existing == null) {
                _currency = acc.currency;
              }
            });
          },
          validator: (v) => v == null ? 'اختر الحساب' : null,
        ),
        if (_isTransfer) ...[
          const SizedBox(height: 14),
          DropdownButtonFormField<int>(
            initialValue: _toId,
            isExpanded: true,
            decoration: const InputDecoration(
              labelText: 'إلى حساب',
              prefixIcon: Icon(Icons.arrow_forward),
            ),
            items: _accounts
                .where((a) => a.id != _accountId)
                .map((a) => DropdownMenuItem(
                      value: a.id,
                      child: Text('${a.kind.icon}  ${a.name}',
                          overflow: TextOverflow.ellipsis),
                    ))
                .toList(),
            onChanged: (v) => setState(() => _toId = v),
            validator: (v) => v == null ? 'اختر حساب الوجهة' : null,
          ),
        ],
      ],
    );
  }

  Widget _amountRow() {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
          flex: 3,
          child: TextFormField(
            controller: _amount,
            keyboardType:
                const TextInputType.numberWithOptions(decimal: true),
            inputFormatters: [
              FilteringTextInputFormatter.allow(RegExp(r'[0-9٠-٩.,٫]')),
            ],
            decoration: InputDecoration(
              labelText: 'المبلغ *',
              hintText: '0.00',
              prefixIcon: const Icon(Icons.payments_outlined),
              suffixIcon: IconButton(
                tooltip: 'آلة حاسبة',
                icon: const Icon(Icons.calculate_outlined),
                onPressed: () async {
                  final v =
                      await openCalculator(context, initial: _amount.text);
                  if (v == null) return;
                  setState(() {
                    _amount.text =
                        v == v.roundToDouble() ? '${v.toInt()}' : '$v';
                  });
                },
              ),
            ),
            validator: (v) {
              final n = Fmt.parseAmount(v ?? '');
              if (n == null || n <= 0) return 'مبلغ غير صالح';
              return null;
            },
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          flex: 2,
          child: DropdownButtonFormField<String>(
            initialValue: _currencies.any((c) => c.code == _currency)
                ? _currency
                : (_currencies.isNotEmpty ? _currencies.first.code : null),
            isExpanded: true,
            decoration: const InputDecoration(labelText: 'العملة'),
            items: _currencies
                .map((c) => DropdownMenuItem(
                      value: c.code,
                      child: Text('${c.symbol}  ${c.code}',
                          overflow: TextOverflow.ellipsis),
                    ))
                .toList(),
            onChanged: (v) => setState(() => _currency = v ?? _currency),
          ),
        ),
        if (_isTransfer) ...[
          const SizedBox(width: 10),
          Expanded(
            flex: 2,
            child: TextFormField(
              controller: _rate,
              keyboardType:
                  const TextInputType.numberWithOptions(decimal: true),
              decoration: const InputDecoration(labelText: 'سعر الصرف'),
            ),
          ),
        ],
      ],
    );
  }

  Widget _signPicker() {
    return RadioGroup<String>(
      groupValue: _sign,
      onChanged: (v) {
        if (v != null) setState(() => _sign = v);
      },
      child: Row(
        children: [
          Expanded(
            child: RadioListTile<String>(
              value: '+',
              title: const Text('بالزيادة (+)',
                  style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700)),
              contentPadding: EdgeInsets.zero,
              dense: true,
            ),
          ),
          Expanded(
            child: RadioListTile<String>(
              value: '-',
              title: const Text('بالنقصان (−)',
                  style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700)),
              contentPadding: EdgeInsets.zero,
              dense: true,
            ),
          ),
        ],
      ),
    );
  }

  Widget _hintBox() {
    final hint = _effectHint;
    if (hint.isEmpty) return const SizedBox.shrink();
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppColors.infoSoftOf(context),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        children: [
          Icon(Icons.info_outline, size: 18, color: AppColors.infoOf(context)),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              hint,
              style: TextStyle(
                fontSize: 12.5,
                fontWeight: FontWeight.w600,
                color: AppColors.infoOf(context),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _datePicker() {
    return InkWell(
      borderRadius: BorderRadius.circular(12),
      onTap: () async {
        final d = await showDatePicker(
          context: context,
          initialDate: _date,
          firstDate: DateTime(2015),
          lastDate: DateTime(2100),
          locale: const Locale('ar'),
        );
        if (d != null) setState(() => _date = d);
      },
      child: InputDecorator(
        decoration: const InputDecoration(
          labelText: 'التاريخ',
          prefixIcon: Icon(Icons.event_outlined),
        ),
        child: Text(Fmt.date(_date),
            style: const TextStyle(fontWeight: FontWeight.w700)),
      ),
    );
  }

  Widget _statusPicker() {
    const opts = {
      'done': 'مكتملة',
      'pending': 'معلقة',
      'cancelled': 'ملغاة',
    };
    return DropdownButtonFormField<String>(
      initialValue: _status,
      decoration: const InputDecoration(
        labelText: 'حالة العملية',
        prefixIcon: Icon(Icons.flag_outlined),
      ),
      items: opts.entries
          .map((e) => DropdownMenuItem(value: e.key, child: Text(e.value)))
          .toList(),
      onChanged: (v) => setState(() => _status = v ?? 'done'),
    );
  }
}
