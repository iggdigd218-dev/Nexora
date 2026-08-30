import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:printing/printing.dart';
import 'package:url_launcher/url_launcher.dart';

import '../core/accounting.dart';
import '../core/format.dart';
import '../core/models.dart';
import '../core/theme.dart';
import '../data/providers.dart';
import 'voucher_doc.dart';
import 'widgets.dart';

class VouchersScreen extends ConsumerWidget {
  const VouchersScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final list = ref.watch(vouchersProvider);
    final accounts = ref.watch(allAccountsProvider).valueOrNull ?? [];
    final byId = {for (final a in accounts) a.id!: a};

    return Column(
      children: [
        const _VoucherFilterBar(),
        Expanded(
          child: list.when(
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (e, _) => EmptyState(
              icon: Icons.error_outline,
              title: 'تعذّر تحميل السندات',
              message: '$e',
            ),
            data: (items) {
              if (items.isEmpty) {
                return const EmptyState(
                  icon: Icons.receipt_outlined,
                  title: 'لا توجد سندات',
                  message:
                      'أنشئ سند قبض أو صرف أو قيد — بترقيم تلقائي وطباعة A4.',
                );
              }
              return ListView.separated(
                padding: const EdgeInsets.fromLTRB(14, 10, 14, 96),
                itemCount: items.length,
                separatorBuilder: (_, __) => const SizedBox(height: 10),
                itemBuilder: (context, i) => _VoucherCard(
                  voucher: items[i],
                  account: byId[items[i].accountId],
                ),
              );
            },
          ),
        ),
      ],
    );
  }
}

class _VoucherFilterBar extends ConsumerStatefulWidget {
  const _VoucherFilterBar();

  @override
  ConsumerState<_VoucherFilterBar> createState() => _VoucherFilterBarState();
}

class _VoucherFilterBarState extends ConsumerState<_VoucherFilterBar> {
  late final TextEditingController _q;

  @override
  void initState() {
    super.initState();
    _q = TextEditingController(text: ref.read(voucherFilterProvider).query);
  }

  @override
  void dispose() {
    _q.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final f = ref.watch(voucherFilterProvider);
    void set(VoucherFilter v) =>
        ref.read(voucherFilterProvider.notifier).state = v;

    return Container(
      color: AppColors.surfaceOf(context),
      padding: const EdgeInsets.fromLTRB(14, 10, 14, 10),
      child: Column(
        children: [
          TextField(
            controller: _q,
            decoration: const InputDecoration(
              hintText: 'ابحث برقم السند أو الحساب أو البيان...',
              prefixIcon: Icon(Icons.search),
              isDense: true,
            ),
            onChanged: (v) => set(f.copyWith(query: v)),
          ),
          const SizedBox(height: 10),
          SizedBox(
            height: 34,
            child: ListView(
              scrollDirection: Axis.horizontal,
              children: [
                _chip('كل الأنواع', f.kind == null,
                    () => set(f.copyWith(clearKind: true))),
                for (final k in VoucherKind.values)
                  _chip('${k.icon} ${k.label}', f.kind == k,
                      () => set(f.copyWith(kind: k))),
                const SizedBox(width: 6),
                _chip('الكل', f.status == null,
                    () => set(f.copyWith(clearStatus: true))),
                _chip('معتمد', f.status == 'approved',
                    () => set(f.copyWith(status: 'approved'))),
                _chip('مسودة', f.status == 'draft',
                    () => set(f.copyWith(status: 'draft'))),
                _chip('ملغى', f.status == 'cancelled',
                    () => set(f.copyWith(status: 'cancelled'))),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _chip(String label, bool active, VoidCallback onTap) => Padding(
        padding: const EdgeInsetsDirectional.only(end: 8),
        child: ChoiceChip(
          selected: active,
          onSelected: (_) => onTap(),
          label: Text(label),
        ),
      );
}

class _VoucherCard extends ConsumerWidget {
  final Voucher voucher;
  final Account? account;
  const _VoucherCard({required this.voucher, required this.account});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final statusColor = switch (voucher.status) {
      'approved' => AppColors.greenOf(context),
      'cancelled' => AppColors.dangerOf(context),
      _ => AppColors.accentOf(context),
    };

    return Card(
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: () => openVoucherPreview(context, ref, voucher),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Row(
            children: [
              Container(
                width: 46,
                height: 46,
                decoration: BoxDecoration(
                  color: AppColors.primarySoftOf(context),
                  borderRadius: BorderRadius.circular(12),
                ),
                alignment: Alignment.center,
                child:
                    Text(voucher.kind.icon, style: const TextStyle(fontSize: 20)),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Text(voucher.number,
                            style: const TextStyle(
                                fontWeight: FontWeight.w800, fontSize: 15)),
                        const SizedBox(width: 8),
                        Pill(voucher.statusLabel, color: statusColor),
                      ],
                    ),
                    const SizedBox(height: 4),
                    Text(
                      '${voucher.kind.label} · ${account?.name ?? '—'}',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                          fontSize: 12.5, color: AppColors.text2Of(context)),
                    ),
                    if (voucher.statement.isNotEmpty) ...[
                      const SizedBox(height: 2),
                      Text(voucher.statement,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                              fontSize: 11.5,
                              color: AppColors.text3Of(context))),
                    ],
                  ],
                ),
              ),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(Fmt.money(voucher.amount),
                      style: TextStyle(
                          fontWeight: FontWeight.w800,
                          fontSize: 15,
                          color: AppColors.primaryOf(context))),
                  Text(Fmt.date(voucher.date),
                      style: TextStyle(
                          fontSize: 10.5, color: AppColors.text3Of(context))),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// معاينة السند مع الاعتماد والطباعة والواتساب — نفس أزرار `previewVoucher`.
Future<void> openVoucherPreview(
  BuildContext context,
  WidgetRef ref,
  Voucher v,
) async {
  final repo = ref.read(repoProvider);
  final account = v.accountId == null ? null : await repo.account(v.accountId!);
  final items = v.txId == null
      ? const <InvoiceLine>[]
      : await repo.transactionItems(v.txId!);
  final currencies = await repo.currencies();
  final currency = currencies.firstWhere(
    (c) => c.code == v.currency,
    orElse: () => kDefaultCurrencies.first,
  );
  final settings = await repo.settings();
  final org = OrgInfo.fromSettings(settings);
  if (!context.mounted) return;

  await showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    builder: (_) => DraggableScrollableSheet(
      initialChildSize: .9,
      expand: false,
      builder: (context, scroll) => Column(
        children: [
          const SizedBox(height: 10),
          Text('معاينة السند ${v.number}',
              style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 8),
          const Divider(height: 1),
          Expanded(
            child: PdfPreview(
              build: (_) => buildVoucherPdf(
                v: v,
                account: account,
                currency: currency,
                org: org,
                items: items,
              ),
              allowSharing: true,
              allowPrinting: true,
              canChangePageFormat: false,
              canChangeOrientation: false,
              canDebug: false,
              pdfFileName: 'voucher-${v.number}.pdf',
            ),
          ),
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Row(
                children: [
                  if (v.status != 'approved')
                    Expanded(
                      child: FilledButton.icon(
                        onPressed: () async {
                          await repo.saveVoucher(
                              v.copyWith(status: 'approved'));
                          bump(ref);
                          if (context.mounted) {
                            Navigator.pop(context);
                            showSnack(context, 'تم اعتماد السند ✅');
                          }
                        },
                        icon: const Icon(Icons.verified_outlined),
                        label: const Text('اعتماد'),
                      ),
                    ),
                  if (v.status != 'approved') const SizedBox(width: 10),
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: () async {
                        final number = Fmt.waNumber(
                            account?.contactNumber ?? '');
                        if (number.isEmpty) {
                          showSnack(context, 'لا يوجد رقم واتساب للحساب',
                              error: true);
                          return;
                        }
                        final text = voucherText(
                          v: v,
                          account: account,
                          currency: currency,
                          orgName: org.name,
                          items: items,
                        );
                        final uri = Uri.parse(
                            'https://wa.me/$number?text=${Uri.encodeComponent(text)}');
                        await launchUrl(uri,
                            mode: LaunchMode.externalApplication);
                      },
                      icon: const Icon(Icons.chat_outlined),
                      label: const Text('واتساب'),
                    ),
                  ),
                  const SizedBox(width: 10),
                  IconButton.filledTonal(
                    tooltip: 'حذف',
                    onPressed: () async {
                      final ok = await confirmDialog(
                        context,
                        title: 'حذف السند',
                        message: 'سيُنقل السند ${v.number} إلى سلة المهملات.',
                        danger: true,
                      );
                      if (ok && v.id != null) {
                        await repo.deleteVoucher(v.id!);
                        bump(ref);
                        if (context.mounted) Navigator.pop(context);
                      }
                    },
                    icon: Icon(Icons.delete_outline,
                        color: AppColors.dangerOf(context)),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    ),
  );
}

/// نموذج إنشاء سند جديد.
Future<void> openVoucherForm(BuildContext context, WidgetRef ref) =>
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (_) => const _VoucherForm(),
    );

class _VoucherForm extends ConsumerStatefulWidget {
  const _VoucherForm();

  @override
  ConsumerState<_VoucherForm> createState() => _VoucherFormState();
}

class _VoucherFormState extends ConsumerState<_VoucherForm> {
  final _formKey = GlobalKey<FormState>();
  final _amount = TextEditingController();
  final _statement = TextEditingController();
  final _notes = TextEditingController();

  VoucherKind _kind = VoucherKind.receipt;
  int? _accountId;
  String _currency = 'YER';
  DateTime _date = DateTime.now();
  List<Account> _accounts = [];
  List<CurrencyDef> _currencies = [];
  bool _loading = true;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final repo = ref.read(repoProvider);
    final accs = await repo.accounts(includeArchived: true);
    final curs = await repo.currencies();
    final st = await repo.settings();
    if (!mounted) return;
    setState(() {
      _accounts = accs;
      _currencies = curs;
      _accountId = accs.isNotEmpty ? accs.first.id : null;
      _currency = st['defaultCurrency'] ?? 'YER';
      _loading = false;
    });
  }

  @override
  void dispose() {
    _amount.dispose();
    _statement.dispose();
    _notes.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (!_formKey.currentState!.validate()) return;
    final amount = Fmt.parseAmount(_amount.text);
    if (amount == null || amount <= 0) {
      showSnack(context, 'أدخل مبلغًا صحيحًا', error: true);
      return;
    }
    setState(() => _saving = true);

    final repo = ref.read(repoProvider);
    final number = await repo.nextVoucherNumber(_kind);
    final now = DateTime.now();
    final v = Voucher(
      number: number,
      kind: _kind,
      accountId: _accountId,
      amount: amount,
      currency: _currency,
      statement: _statement.text.trim(),
      notes: _notes.text.trim(),
      status: 'draft',
      date: _date,
      createdAt: now,
      updatedAt: now,
    );
    final id = await repo.saveVoucher(v);
    bump(ref);
    if (!mounted) return;
    Navigator.pop(context);
    showSnack(context, 'تم إنشاء السند $number ✅');
    await openVoucherPreview(context, ref, v.copyWith(id: id));
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const SizedBox(
          height: 240, child: Center(child: CircularProgressIndicator()));
    }
    if (_accounts.isEmpty) {
      return const Padding(
        padding: EdgeInsets.all(24),
        child: EmptyState(
          icon: Icons.person_off_outlined,
          title: 'لا توجد حسابات',
          message: 'أضف حسابًا أولًا قبل إنشاء سند.',
        ),
      );
    }

    return DraggableScrollableSheet(
      initialChildSize: .9,
      expand: false,
      builder: (context, scroll) => Column(
        children: [
          const SizedBox(height: 12),
          Text('🧾 سند جديد',
              style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: 10),
          const Divider(height: 1),
          Expanded(
            child: Form(
              key: _formKey,
              child: ListView(
                controller: scroll,
                padding: const EdgeInsets.fromLTRB(18, 16, 18, 24),
                children: [
                  const SectionTitle('نوع السند'),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: VoucherKind.values
                        .map((k) => ChoiceChip(
                              selected: _kind == k,
                              onSelected: (_) => setState(() => _kind = k),
                              avatar: Text(k.icon),
                              label: Text(k.label),
                            ))
                        .toList(),
                  ),
                  const SizedBox(height: 16),
                  DropdownButtonFormField<int>(
                    initialValue: _accountId,
                    isExpanded: true,
                    decoration: const InputDecoration(
                      labelText: 'الحساب',
                      prefixIcon: Icon(Icons.person_outline),
                    ),
                    items: _accounts
                        .map((a) => DropdownMenuItem(
                            value: a.id,
                            child: Text('${a.kind.icon}  ${a.name}',
                                overflow: TextOverflow.ellipsis)))
                        .toList(),
                    onChanged: (v) => setState(() => _accountId = v),
                    validator: (v) => v == null ? 'اختر الحساب' : null,
                  ),
                  const SizedBox(height: 14),
                  Row(children: [
                    Expanded(
                      flex: 3,
                      child: TextFormField(
                        controller: _amount,
                        keyboardType: const TextInputType.numberWithOptions(
                            decimal: true),
                        decoration: const InputDecoration(
                          labelText: 'المبلغ *',
                          prefixIcon: Icon(Icons.payments_outlined),
                        ),
                        validator: (v) {
                          final n = Fmt.parseAmount(v ?? '');
                          return (n == null || n <= 0) ? 'مبلغ غير صالح' : null;
                        },
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      flex: 2,
                      child: DropdownButtonFormField<String>(
                        initialValue: _currencies.any((c) => c.code == _currency)
                            ? _currency
                            : _currencies.first.code,
                        isExpanded: true,
                        decoration: const InputDecoration(labelText: 'العملة'),
                        items: _currencies
                            .map((c) => DropdownMenuItem(
                                value: c.code,
                                child: Text(c.symbol,
                                    overflow: TextOverflow.ellipsis)))
                            .toList(),
                        onChanged: (v) =>
                            setState(() => _currency = v ?? _currency),
                      ),
                    ),
                  ]),
                  const SizedBox(height: 14),
                  InkWell(
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
                          style:
                              const TextStyle(fontWeight: FontWeight.w700)),
                    ),
                  ),
                  const SizedBox(height: 14),
                  TextFormField(
                    controller: _statement,
                    maxLines: 2,
                    decoration: const InputDecoration(
                      labelText: 'بيان السند / وصف العملية',
                      prefixIcon: Icon(Icons.notes_outlined),
                    ),
                  ),
                  const SizedBox(height: 14),
                  TextFormField(
                    controller: _notes,
                    maxLines: 2,
                    decoration: const InputDecoration(
                      labelText: 'ملاحظات إضافية',
                      prefixIcon: Icon(Icons.sticky_note_2_outlined),
                    ),
                  ),
                  const SizedBox(height: 24),
                  FilledButton.icon(
                    onPressed: _saving ? null : _save,
                    icon: const Icon(Icons.visibility_outlined),
                    label: Text(_saving ? 'جارٍ الحفظ...' : 'معاينة وحفظ'),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
