import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:printing/printing.dart';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:flutter/services.dart';

import '../core/accounting.dart';
import '../core/format.dart';
import '../core/theme.dart';
import '../data/providers.dart';
import 'widgets.dart';

/// أنواع التقارير — نقل حرفي لـ `REPORT_TABS` في نسخة الويب.
enum ReportTab {
  summary('📋 ملخص إجمالي المبالغ'),
  detail('🧾 تفصيل العمليات'),
  categories('🗂️ التصنيفات'),
  period('🗓️ يومي/أسبوعي/شهري/سنوي'),
  account('👤 حسب عميل/مورد'),
  currency('💱 حسب العملة'),
  pl('📈 إيرادات ومصروفات'),
  topDebt('💸 أكثر الحسابات مديونية'),
  topActive('⚡ أكثر الحسابات نشاطًا'),
  overdue('⏰ تجاوز حد الائتمان');

  const ReportTab(this.label);
  final String label;
}

enum PeriodUnit {
  day('يومي'),
  week('أسبوعي'),
  month('شهري'),
  year('سنوي');

  const PeriodUnit(this.label);
  final String label;
}

final reportTabProvider =
    StateProvider<ReportTab>((ref) => ReportTab.summary);
final periodUnitProvider =
    StateProvider<PeriodUnit>((ref) => PeriodUnit.month);

/// جدول التقرير الناتج: عناوين وصفوف نصية جاهزة للعرض والتصدير.
class ReportTable {
  final List<String> headers;
  final List<List<String>> rows;
  final List<(String, String)> summary;

  const ReportTable({
    required this.headers,
    required this.rows,
    this.summary = const [],
  });
}

class ReportsScreen extends ConsumerWidget {
  const ReportsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tab = ref.watch(reportTabProvider);
    final data = ref.watch(reportDataProvider);

    return Column(
      children: [
        const _ScopeBar(),
        SizedBox(
          height: 42,
          child: ListView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 12),
            children: ReportTab.values
                .map((t) => Padding(
                      padding: const EdgeInsetsDirectional.only(end: 8),
                      child: ChoiceChip(
                        selected: tab == t,
                        onSelected: (_) =>
                            ref.read(reportTabProvider.notifier).state = t,
                        label: Text(t.label),
                      ),
                    ))
                .toList(),
          ),
        ),
        const SizedBox(height: 6),
        Expanded(
          child: data.when(
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (e, _) => EmptyState(
              icon: Icons.error_outline,
              title: 'تعذّر بناء التقرير',
              message: '$e',
            ),
            data: (d) {
              final currencies =
                  ref.watch(currenciesProvider).valueOrNull ?? kDefaultCurrencies;
              final unit = ref.watch(periodUnitProvider);
              final table = buildReport(tab, d, currencies, unit);
              return _ReportView(tab: tab, table: table);
            },
          ),
        ),
      ],
    );
  }
}

class _ScopeBar extends ConsumerWidget {
  const _ScopeBar();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final s = ref.watch(reportScopeProvider);
    final accounts = ref.watch(allAccountsProvider).valueOrNull ?? [];
    final currencies = ref.watch(currenciesProvider).valueOrNull ?? [];
    void set(ReportScope v) =>
        ref.read(reportScopeProvider.notifier).state = v;

    return Container(
      color: AppColors.surfaceOf(context),
      padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
      child: SizedBox(
        height: 34,
        child: ListView(
          scrollDirection: Axis.horizontal,
          children: [
            _pill(
              context,
              '${Fmt.date(s.from)} → ${Fmt.date(s.to)}',
              Icons.date_range,
              () async {
                final r = await showDateRangePicker(
                  context: context,
                  firstDate: DateTime(2015),
                  lastDate: DateTime(2100),
                  locale: const Locale('ar'),
                  initialDateRange: DateTimeRange(start: s.from, end: s.to),
                );
                if (r != null) {
                  set(s.copyWith(
                    from: DateTime(r.start.year, r.start.month, r.start.day),
                    to: DateTime(
                        r.end.year, r.end.month, r.end.day, 23, 59, 59),
                  ));
                }
              },
            ),
            _quick(context, 'هذا الشهر', () {
              final n = DateTime.now();
              set(s.copyWith(
                  from: DateTime(n.year, n.month, 1),
                  to: DateTime(n.year, n.month, n.day, 23, 59, 59)));
            }),
            _quick(context, 'آخر ٣٠ يومًا', () {
              final n = DateTime.now();
              set(s.copyWith(
                  from: n.subtract(const Duration(days: 30)),
                  to: DateTime(n.year, n.month, n.day, 23, 59, 59)));
            }),
            _quick(context, 'هذه السنة', () {
              final n = DateTime.now();
              set(s.copyWith(
                  from: DateTime(n.year, 1, 1),
                  to: DateTime(n.year, 12, 31, 23, 59, 59)));
            }),
            _pill(
              context,
              s.currency ?? 'كل العملات',
              Icons.currency_exchange,
              () async {
                final v = await showModalBottomSheet<String>(
                  context: context,
                  builder: (_) => SafeArea(
                    child: Column(mainAxisSize: MainAxisSize.min, children: [
                      ListTile(
                        title: const Text('كل العملات'),
                        onTap: () => Navigator.pop(context, ''),
                      ),
                      for (final c in currencies)
                        ListTile(
                          title: Text('${c.symbol}  ${c.name}'),
                          onTap: () => Navigator.pop(context, c.code),
                        ),
                    ]),
                  ),
                );
                if (v == null) return;
                set(v.isEmpty
                    ? s.copyWith(clearCurrency: true)
                    : s.copyWith(currency: v));
              },
            ),
            _pill(
              context,
              s.accountId == null
                  ? 'كل الحسابات'
                  : (accounts
                          .where((a) => a.id == s.accountId)
                          .firstOrNull
                          ?.name ??
                      'حساب'),
              Icons.person_outline,
              () async {
                final v = await showModalBottomSheet<int>(
                  context: context,
                  builder: (_) => SafeArea(
                    child: ListView(shrinkWrap: true, children: [
                      ListTile(
                        title: const Text('كل الحسابات'),
                        onTap: () => Navigator.pop(context, -1),
                      ),
                      for (final a in accounts)
                        ListTile(
                          title: Text('${a.kind.icon}  ${a.name}'),
                          onTap: () => Navigator.pop(context, a.id),
                        ),
                    ]),
                  ),
                );
                if (v == null) return;
                set(v == -1
                    ? s.copyWith(clearAccount: true)
                    : s.copyWith(accountId: v));
              },
            ),
          ],
        ),
      ),
    );
  }

  Widget _pill(BuildContext c, String label, IconData icon, VoidCallback t) =>
      Padding(
        padding: const EdgeInsetsDirectional.only(end: 8),
        child: ActionChip(
          avatar: Icon(icon, size: 15),
          label: Text(label),
          onPressed: t,
        ),
      );

  Widget _quick(BuildContext c, String label, VoidCallback t) => Padding(
        padding: const EdgeInsetsDirectional.only(end: 8),
        child: ActionChip(label: Text(label), onPressed: t),
      );
}

/// يبني جدول التقرير المطلوب — منطق منقول من دوال `r*` في نسخة الويب.
ReportTable buildReport(
  ReportTab tab,
  ReportData d,
  List<CurrencyDef> currencies,
  PeriodUnit unit,
) {
  String sym(String code) => currencies
      .firstWhere((c) => c.code == code,
          orElse: () => CurrencyDef(code, code, code, 0))
      .symbol;
  String cname(String code) => currencies
      .firstWhere((c) => c.code == code,
          orElse: () => CurrencyDef(code, code, code, 0))
      .name;

  switch (tab) {
    case ReportTab.summary:
      final per = <String, List<double>>{}; // [مستحق لنا, علينا, الصافي]
      for (final a in d.accounts) {
        final bal = d.balances[a.id!] ?? 0;
        final e = per.putIfAbsent(a.currency, () => [0, 0, 0]);
        if (bal > 0) {
          e[0] += bal;
        } else {
          e[1] += bal.abs();
        }
        e[2] += bal;
      }
      var tRec = 0.0, tPay = 0.0, tNet = 0.0;
      final rows = per.entries.map((e) {
        tRec += e.value[0];
        tPay += e.value[1];
        tNet += e.value[2];
        return [
          '${cname(e.key)} (${sym(e.key)})',
          Fmt.money(e.value[0]),
          Fmt.money(e.value[1]),
          Fmt.money(e.value[2]),
        ];
      }).toList();
      return ReportTable(
        headers: const ['العملة', 'مستحق لنا', 'مستحق علينا', 'الصافي'],
        rows: rows,
        summary: [
          ('إجمالي المستحق لنا', Fmt.money(tRec)),
          ('إجمالي المستحق علينا', Fmt.money(tPay)),
          ('صافي الرصيد', Fmt.money(tNet)),
          ('عدد العمليات', '${d.txs.length}'),
        ],
      );

    case ReportTab.detail:
      final byId = {for (final a in d.accounts) a.id!: a};
      final sorted = [...d.txs]..sort((a, b) => a.date.compareTo(b.date));
      return ReportTable(
        headers: const [
          'التاريخ',
          'النوع',
          'الحساب',
          'البيان',
          'المبلغ',
          'العملة',
          'المرجع'
        ],
        rows: sorted
            .map((t) => [
                  Fmt.date(t.date),
                  t.type.label,
                  t.type == OpType.transfer
                      ? 'تحويل'
                      : (byId[t.accountId]?.name ?? '—'),
                  t.description,
                  Fmt.money(t.amount),
                  sym(t.currency),
                  t.reference,
                ])
            .toList(),
      );

    case ReportTab.categories:
      final cat = <String, List<double>>{}; // [عدد, رصيد]
      for (final a in d.accounts) {
        final key = a.category.trim().isEmpty ? 'بدون تصنيف' : a.category;
        final e = cat.putIfAbsent(key, () => [0, 0]);
        e[0] += 1;
        e[1] += d.balances[a.id!] ?? 0;
      }
      return ReportTable(
        headers: const ['التصنيف', 'عدد الحسابات', 'إجمالي الرصيد'],
        rows: cat.entries
            .map((e) => [
                  e.key,
                  '${e.value[0].toInt()}',
                  Fmt.money(e.value[1]),
                ])
            .toList(),
      );

    case ReportTab.period:
      final buckets = <String, List<double>>{};
      for (final t in d.txs) {
        final key = switch (unit) {
          PeriodUnit.day => Fmt.date(t.date),
          PeriodUnit.week => Fmt.date(
              t.date.subtract(Duration(days: t.date.weekday % 7))),
          PeriodUnit.month =>
            '${t.date.year}/${t.date.month.toString().padLeft(2, '0')}',
          PeriodUnit.year => '${t.date.year}',
        };
        final e = buckets.putIfAbsent(key, () => [0, 0]);
        final g = opGroup(t.type);
        if (g == 'inflow') e[0] += t.amount;
        if (g == 'outflow') e[1] += t.amount;
      }
      final keys = buckets.keys.toList()..sort();
      return ReportTable(
        headers: const [
          'الفترة',
          'الإيرادات/القبض',
          'المصروفات/الصرف',
          'الصافي'
        ],
        rows: keys
            .map((k) => [
                  k,
                  Fmt.money(buckets[k]![0]),
                  Fmt.money(buckets[k]![1]),
                  Fmt.money(buckets[k]![0] - buckets[k]![1]),
                ])
            .toList(),
      );

    case ReportTab.account:
      return ReportTable(
        headers: const ['الحساب', 'النوع', 'عدد العمليات', 'الرصيد', 'العملة'],
        rows: d.accounts
            .map((a) => [
                  '${a.kind.icon} ${a.name}',
                  a.kind.label,
                  '${d.txCount[a.id!] ?? 0}',
                  Fmt.money(d.balances[a.id!] ?? 0),
                  sym(a.currency),
                ])
            .toList(),
      );

    case ReportTab.currency:
      final per = <String, List<double>>{}; // [قبض, صرف, عدد]
      for (final t in d.txs) {
        final e = per.putIfAbsent(t.currency, () => [0, 0, 0]);
        final g = opGroup(t.type);
        if (g == 'inflow') e[0] += t.amount;
        if (g == 'outflow') e[1] += t.amount;
        e[2] += 1;
      }
      return ReportTable(
        headers: const [
          'العملة',
          'العمليات',
          'قبض/إيراد',
          'صرف/مصروف',
          'الصافي'
        ],
        rows: per.entries
            .map((e) => [
                  '${cname(e.key)} (${sym(e.key)})',
                  '${e.value[2].toInt()}',
                  Fmt.money(e.value[0]),
                  Fmt.money(e.value[1]),
                  Fmt.money(e.value[0] - e.value[1]),
                ])
            .toList(),
      );

    case ReportTab.pl:
      var revenue = 0.0, expense = 0.0, receivable = 0.0, payable = 0.0;
      for (final t in d.txs) {
        switch (t.type) {
          case OpType.revenue || OpType.inflow:
            revenue += t.amount;
          case OpType.expense || OpType.outflow:
            expense += t.amount;
          case OpType.debit:
            receivable += t.amount;
          case OpType.credit:
            payable += t.amount;
          default:
            break;
        }
      }
      final profit = revenue - expense;
      return ReportTable(
        headers: const ['البند', 'المبلغ'],
        rows: [
          ['إجمالي الإيرادات', Fmt.money(revenue)],
          ['إجمالي المصروفات', Fmt.money(expense)],
          ['صافي الأرباح / الخسائر', Fmt.money(profit)],
        ],
        summary: [
          ('الإيرادات', Fmt.money(revenue)),
          ('المصروفات', Fmt.money(expense)),
          ('صافي الربح/الخسارة', Fmt.money(profit)),
          ('ذمم مستحقة لنا', Fmt.money(receivable)),
          ('ذمم مستحقة علينا', Fmt.money(payable)),
        ],
      );

    case ReportTab.topDebt:
      final list = d.accounts
          .map((a) => (a, d.balances[a.id!] ?? 0))
          .where((x) => x.$2 > 0)
          .toList()
        ..sort((x, y) => y.$2.compareTo(x.$2));
      return ReportTable(
        headers: const ['#', 'الحساب', 'المبلغ المستحق لنا', 'العملة'],
        rows: list
            .take(20)
            .toList()
            .asMap()
            .entries
            .map((e) => [
                  '${e.key + 1}',
                  '${e.value.$1.kind.icon} ${e.value.$1.name}',
                  Fmt.money(e.value.$2),
                  sym(e.value.$1.currency),
                ])
            .toList(),
      );

    case ReportTab.topActive:
      final list = d.accounts
          .map((a) => (a, d.txCount[a.id!] ?? 0))
          .where((x) => x.$2 > 0)
          .toList()
        ..sort((x, y) => y.$2.compareTo(x.$2));
      return ReportTable(
        headers: const ['#', 'الحساب', 'عدد العمليات', 'الرصيد'],
        rows: list
            .take(20)
            .toList()
            .asMap()
            .entries
            .map((e) => [
                  '${e.key + 1}',
                  '${e.value.$1.kind.icon} ${e.value.$1.name}',
                  '${e.value.$2}',
                  Fmt.money(d.balances[e.value.$1.id!] ?? 0),
                ])
            .toList(),
      );

    case ReportTab.overdue:
      final rows = <List<String>>[];
      for (final a in d.accounts) {
        if (a.archived) continue;
        final limit = a.creditLimit;
        final bal = d.balances[a.id!] ?? 0;
        if (limit != null && limit > 0 && bal.abs() > limit) {
          rows.add([
            '${a.kind.icon} ${a.name}',
            Fmt.money(bal),
            Fmt.money(limit),
            Fmt.money(bal.abs() - limit),
            sym(a.currency),
          ]);
        }
      }
      return ReportTable(
        headers: const [
          'الحساب',
          'الرصيد',
          'حد الائتمان',
          'التجاوز',
          'العملة'
        ],
        rows: rows,
      );
  }
}

class _ReportView extends ConsumerWidget {
  final ReportTab tab;
  final ReportTable table;
  const _ReportView({required this.tab, required this.table});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Column(
      children: [
        if (tab == ReportTab.period)
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 14),
            child: Row(
              children: PeriodUnit.values
                  .map((u) => Padding(
                        padding: const EdgeInsetsDirectional.only(end: 8),
                        child: ChoiceChip(
                          selected: ref.watch(periodUnitProvider) == u,
                          onSelected: (_) => ref
                              .read(periodUnitProvider.notifier)
                              .state = u,
                          label: Text(u.label),
                        ),
                      ))
                  .toList(),
            ),
          ),
        Expanded(
          child: ListView(
            padding: const EdgeInsets.fromLTRB(14, 10, 14, 96),
            children: [
              if (table.summary.isNotEmpty) ...[
                GridView.count(
                  crossAxisCount: 2,
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  childAspectRatio: 2.1,
                  mainAxisSpacing: 10,
                  crossAxisSpacing: 10,
                  children: table.summary
                      .map((e) => StatCard(
                            title: e.$1,
                            value: e.$2,
                            icon: Icons.analytics_outlined,
                            color: AppColors.primaryOf(context),
                          ))
                      .toList(),
                ),
                const SizedBox(height: 14),
              ],
              if (table.rows.isEmpty)
                const EmptyState(
                  icon: Icons.bar_chart_outlined,
                  title: 'لا بيانات في هذه الفترة',
                  message: 'وسّع الفترة أو غيّر المرشّحات.',
                )
              else
                Card(
                  child: SingleChildScrollView(
                    scrollDirection: Axis.horizontal,
                    child: DataTable(
                      headingRowHeight: 42,
                      dataRowMinHeight: 38,
                      dataRowMaxHeight: 48,
                      columns: table.headers
                          .map((h) => DataColumn(
                                label: Text(h,
                                    style: const TextStyle(
                                        fontWeight: FontWeight.w800,
                                        fontSize: 12.5)),
                              ))
                          .toList(),
                      rows: table.rows
                          .map((r) => DataRow(
                                cells: r
                                    .map((c) => DataCell(Text(
                                          c.isEmpty ? '—' : c,
                                          style:
                                              const TextStyle(fontSize: 12.5),
                                        )))
                                    .toList(),
                              ))
                          .toList(),
                    ),
                  ),
                ),
              const SizedBox(height: 14),
              Row(
                children: [
                  Expanded(
                    child: FilledButton.icon(
                      onPressed: table.rows.isEmpty
                          ? null
                          : () => _exportPdf(context, tab, table),
                      icon: const Icon(Icons.picture_as_pdf_outlined),
                      label: const Text('تصدير PDF'),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: table.rows.isEmpty
                          ? null
                          : () => _copyCsv(context, table),
                      icon: const Icon(Icons.table_view_outlined),
                      label: const Text('نسخ CSV'),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ],
    );
  }

  Future<void> _copyCsv(BuildContext context, ReportTable t) async {
    final b = StringBuffer()..writeln(t.headers.join(','));
    for (final r in t.rows) {
      b.writeln(r.map((c) => '"${c.replaceAll('"', '""')}"').join(','));
    }
    await Clipboard.setData(ClipboardData(text: b.toString()));
    if (context.mounted) showSnack(context, 'تم نسخ التقرير بصيغة CSV ✅');
  }

  Future<void> _exportPdf(
      BuildContext context, ReportTab tab, ReportTable t) async {
    final regular = pw.Font.ttf(
        await rootBundle.load('assets/fonts/Tajawal-Regular.ttf'));
    final bold =
        pw.Font.ttf(await rootBundle.load('assets/fonts/Tajawal-Bold.ttf'));

    final doc = pw.Document();
    doc.addPage(
      pw.MultiPage(
        pageFormat: PdfPageFormat.a4,
        textDirection: pw.TextDirection.rtl,
        theme: pw.ThemeData.withFont(base: regular, bold: bold),
        margin: const pw.EdgeInsets.all(28),
        build: (ctx) => [
          pw.Text(tab.label,
              style: pw.TextStyle(fontSize: 18, font: bold)),
          pw.SizedBox(height: 4),
          pw.Text('تاريخ الإصدار: ${Fmt.dateTime(DateTime.now())}',
              style: const pw.TextStyle(
                  fontSize: 9, color: PdfColor.fromInt(0xFF5B6B83))),
          pw.SizedBox(height: 12),
          if (t.summary.isNotEmpty) ...[
            pw.Wrap(
              spacing: 8,
              runSpacing: 8,
              children: t.summary
                  .map((e) => pw.Container(
                        width: 120,
                        padding: const pw.EdgeInsets.all(8),
                        decoration: pw.BoxDecoration(
                          color: const PdfColor.fromInt(0xFFE6F6F3),
                          borderRadius: pw.BorderRadius.circular(6),
                        ),
                        child: pw.Column(
                          crossAxisAlignment: pw.CrossAxisAlignment.start,
                          children: [
                            pw.Text(e.$1,
                                style: const pw.TextStyle(fontSize: 8)),
                            pw.SizedBox(height: 2),
                            pw.Text(e.$2,
                                style: pw.TextStyle(fontSize: 12, font: bold)),
                          ],
                        ),
                      ))
                  .toList(),
            ),
            pw.SizedBox(height: 14),
          ],
          pw.TableHelper.fromTextArray(
            headers: t.headers,
            data: t.rows,
            headerStyle: pw.TextStyle(font: bold, fontSize: 10),
            cellStyle: const pw.TextStyle(fontSize: 9),
            headerDecoration: const pw.BoxDecoration(
                color: PdfColor.fromInt(0xFFE6F6F3)),
            cellAlignment: pw.Alignment.centerRight,
            border: pw.TableBorder.all(
                color: const PdfColor.fromInt(0xFFE2E8F2), width: .5),
          ),
        ],
      ),
    );

    await Printing.layoutPdf(
      onLayout: (_) => doc.save(),
      name: 'report-${tab.name}.pdf',
    );
  }
}
