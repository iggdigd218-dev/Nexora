import 'dart:io';
import 'dart:typed_data';

import 'package:flutter/services.dart';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;

import '../core/accounting.dart';
import '../core/format.dart';
import '../core/models.dart';
import '../core/words.dart';

/// بيانات المؤسسة المطبوعة على السند — تأتي من الإعدادات.
class OrgInfo {
  final String name;
  final String nameEn;
  final String address;
  final String phone;
  final String email;
  final String managerName;
  final String logoPath;
  final String footer;

  const OrgInfo({
    this.name = 'مؤسسة',
    this.nameEn = '',
    this.address = '',
    this.phone = '',
    this.email = '',
    this.managerName = '',
    this.logoPath = '',
    this.footer = 'هذا السند آلي ولا يحتاج إلى ختم أو توقيع.',
  });

  factory OrgInfo.fromSettings(Map<String, String> s) => OrgInfo(
        name: s['businessName']?.trim().isNotEmpty == true
            ? s['businessName']!
            : 'مؤسسة',
        nameEn: s['businessNameEn'] ?? '',
        address: s['address'] ?? '',
        phone: [s['phone'], s['whatsapp']]
            .where((e) => e != null && e.trim().isNotEmpty)
            .join(' — '),
        email: s['email'] ?? '',
        managerName: s['managerName'] ?? '',
        logoPath: s['logo'] ?? '',
        footer: s['voucherFooter']?.trim().isNotEmpty == true
            ? s['voucherFooter']!
            : 'هذا السند آلي ولا يحتاج إلى ختم أو توقيع.',
      );
}

pw.Widget _tableCell(String value, pw.Font? font) => pw.Padding(
      padding: const pw.EdgeInsets.all(6),
      child: pw.Text(
        value,
        textAlign: pw.TextAlign.center,
        style: pw.TextStyle(fontSize: 9, font: font),
      ),
    );

String _quantity(double value) =>
    value == value.roundToDouble() ? Fmt.money(value) : Fmt.money(value, 2);

/// يبني ملف PDF بمقاس A4 للسند — نفس تخطيط `voucherHTML` في نسخة الويب.
Future<Uint8List> buildVoucherPdf({
  required Voucher v,
  required Account? account,
  required CurrencyDef currency,
  required OrgInfo org,
  List<InvoiceLine> items = const [],
}) async {
  final regular = pw.Font.ttf(
      await rootBundle.load('assets/fonts/Tajawal-Regular.ttf'));
  final bold =
      pw.Font.ttf(await rootBundle.load('assets/fonts/Tajawal-Bold.ttf'));

  pw.MemoryImage? logo;
  if (org.logoPath.trim().isNotEmpty) {
    try {
      final file = File(org.logoPath);
      if (await file.exists()) {
        logo = pw.MemoryImage(await file.readAsBytes());
      }
    } catch (_) {
      // شعار غير صالح لا يمنع إنشاء السند.
    }
  }

  final doc = pw.Document();
  const teal = PdfColor.fromInt(0xFF0F766E);
  const border = PdfColor.fromInt(0xFFE2E8F2);
  const soft = PdfColor.fromInt(0xFFE6F6F3);
  const muted = PdfColor.fromInt(0xFF5B6B83);

  final words = '${numberToWords(v.amount)} ${currency.name}';

  pw.Widget line(String k, String val) => pw.Padding(
        padding: const pw.EdgeInsets.symmetric(vertical: 5),
        child: pw.Row(
          children: [
            pw.SizedBox(
              width: 110,
              child: pw.Text(k,
                  style: const pw.TextStyle(fontSize: 10, color: muted)),
            ),
            pw.Expanded(
              child: pw.Text(val,
                  style: pw.TextStyle(fontSize: 11, font: bold)),
            ),
          ],
        ),
      );

  pw.Widget infoCell(String k, String val) => pw.Expanded(
        child: pw.Container(
          padding: const pw.EdgeInsets.all(8),
          decoration: pw.BoxDecoration(
            border: pw.Border.all(color: border),
            borderRadius: pw.BorderRadius.circular(6),
          ),
          child: pw.Column(
            crossAxisAlignment: pw.CrossAxisAlignment.center,
            children: [
              pw.Text(k,
                  style: const pw.TextStyle(fontSize: 8.5, color: muted)),
              pw.SizedBox(height: 3),
              pw.Text(val,
                  style: pw.TextStyle(fontSize: 11, font: bold)),
            ],
          ),
        ),
      );

  pw.Widget sig(String label) => pw.Expanded(
        child: pw.Column(
          children: [
            pw.Container(
              height: 1,
              margin: const pw.EdgeInsets.only(bottom: 6),
              color: border,
            ),
            pw.Text(label,
                style: const pw.TextStyle(fontSize: 9, color: muted)),
          ],
        ),
      );

  doc.addPage(
    pw.Page(
      pageFormat: PdfPageFormat.a4,
      textDirection: pw.TextDirection.rtl,
      theme: pw.ThemeData.withFont(base: regular, bold: bold),
      margin: const pw.EdgeInsets.all(32),
      build: (ctx) => pw.Column(
        crossAxisAlignment: pw.CrossAxisAlignment.stretch,
        children: [
          // ترويسة المؤسسة
          pw.Row(
            crossAxisAlignment: pw.CrossAxisAlignment.start,
            children: [
              pw.Expanded(
                child: pw.Column(
                  crossAxisAlignment: pw.CrossAxisAlignment.start,
                  children: [
                    pw.Text(org.name,
                        style: pw.TextStyle(
                            fontSize: 20, font: bold, color: teal)),
                    if (org.nameEn.isNotEmpty)
                      pw.Text(org.nameEn,
                          style: pw.TextStyle(fontSize: 10, font: bold)),
                    if (org.address.isNotEmpty)
                      pw.Text(org.address,
                          style:
                              const pw.TextStyle(fontSize: 9, color: muted)),
                    if (org.phone.isNotEmpty)
                      pw.Text(org.phone,
                          style:
                              const pw.TextStyle(fontSize: 9, color: muted)),
                    if (org.email.isNotEmpty)
                      pw.Text(org.email,
                          style:
                              const pw.TextStyle(fontSize: 9, color: muted)),
                  ],
                ),
              ),
              if (logo != null) ...[
                pw.Container(
                  width: 62,
                  height: 62,
                  padding: const pw.EdgeInsets.all(6),
                  decoration: pw.BoxDecoration(
                    color: PdfColors.white,
                    border: pw.Border.all(color: border),
                    borderRadius: pw.BorderRadius.circular(10),
                  ),
                  alignment: pw.Alignment.center,
                  child: pw.Image(logo!, fit: pw.BoxFit.contain),
                ),
                pw.SizedBox(width: 8),
              ],
              pw.Container(
                width: 62,
                height: 62,
                decoration: pw.BoxDecoration(
                  color: soft,
                  borderRadius: pw.BorderRadius.circular(10),
                ),
                alignment: pw.Alignment.center,
                child: pw.Text(v.kind.label.split(' ').last,
                    style: pw.TextStyle(font: bold, fontSize: 12, color: teal)),
              ),
            ],
          ),
          pw.SizedBox(height: 14),
          pw.Container(height: 2, color: teal),
          pw.SizedBox(height: 14),

          // شريط المعلومات
          pw.Row(children: [
            infoCell('التاريخ', Fmt.date(v.date)),
            pw.SizedBox(width: 8),
            infoCell('رقم السند', v.number),
            pw.SizedBox(width: 8),
            infoCell('نوع السند', v.kind.label),
          ]),
          pw.SizedBox(height: 16),

          // تفاصيل الحساب
          pw.Container(
            padding: const pw.EdgeInsets.all(12),
            decoration: pw.BoxDecoration(
              border: pw.Border.all(color: border),
              borderRadius: pw.BorderRadius.circular(8),
            ),
            child: pw.Column(children: [
              line('اسم الحساب', account?.name ?? '—'),
              if (account != null && account.phone.isNotEmpty)
                line('رقم الهاتف', account.phone),
              line('رقم الحساب', account?.id?.toString() ?? '—'),
              if (v.statement.isNotEmpty) line('بيان العملية', v.statement),
              line('العملة', '${currency.name} (${currency.symbol})'),
            ]),
          ),
          if (items.isNotEmpty) ...[
            pw.Text('تفاصيل المشتريات',
                style: pw.TextStyle(fontSize: 13, font: bold, color: teal)),
            pw.SizedBox(height: 8),
            pw.Table(
              border: pw.TableBorder.all(color: border, width: .6),
              columnWidths: const {
                0: pw.FlexColumnWidth(3.2),
                1: pw.FlexColumnWidth(1.2),
                2: pw.FlexColumnWidth(1.7),
                3: pw.FlexColumnWidth(1.7),
              },
              children: [
                pw.TableRow(
                  decoration: pw.BoxDecoration(color: soft),
                  children: [
                    _tableCell('الصنف', bold),
                    _tableCell('الكمية', bold),
                    _tableCell('سعر الوحدة', bold),
                    _tableCell('الإجمالي', bold),
                  ],
                ),
                for (final line in items)
                  pw.TableRow(children: [
                    _tableCell(line.name, null),
                    _tableCell('${_quantity(line.quantity)} ${line.unit}', null),
                    _tableCell(
                        '${Fmt.money(line.unitPrice, currency.decimal)} ${currency.symbol}',
                        null),
                    _tableCell(
                        '${Fmt.money(line.total, currency.decimal)} ${currency.symbol}',
                        bold),
                  ]),
              ],
            ),
            pw.SizedBox(height: 8),
            pw.Align(
              alignment: pw.AlignmentDirectional.centerEnd,
              child: pw.Text(
                'إجمالي المشتريات: ${Fmt.money(items.fold<double>(0, (sum, line) => sum + line.total), currency.decimal)} ${currency.symbol}',
                style: pw.TextStyle(fontSize: 11, font: bold, color: teal),
              ),
            ),
            pw.SizedBox(height: 16),
          ],

          // صندوق المبلغ
          pw.Container(
            width: double.infinity,
            padding: const pw.EdgeInsets.symmetric(vertical: 16),
            decoration: pw.BoxDecoration(
              color: soft,
              borderRadius: pw.BorderRadius.circular(10),
            ),
            child: pw.Column(children: [
              pw.Text(
                '${Fmt.money(v.amount, currency.decimal)} ${currency.symbol}',
                style: pw.TextStyle(fontSize: 26, font: bold, color: teal),
              ),
              pw.SizedBox(height: 6),
              pw.Text('فقط: $words لا غير',
                  style: pw.TextStyle(fontSize: 11, font: bold)),
            ]),
          ),

          if (v.notes.isNotEmpty) ...[
            pw.SizedBox(height: 12),
            pw.Container(
              width: double.infinity,
              padding: const pw.EdgeInsets.all(10),
              decoration: pw.BoxDecoration(
                border: pw.Border.all(color: border),
                borderRadius: pw.BorderRadius.circular(8),
              ),
              child: pw.Text('ملاحظات: ${v.notes}',
                  style: const pw.TextStyle(fontSize: 10)),
            ),
          ],

          pw.Spacer(),

          // التواقيع
          pw.Row(children: [
            sig('اسم المستلم'),
            pw.SizedBox(width: 18),
            sig('توقيع المستلم'),
            pw.SizedBox(width: 18),
            sig('توقيع المسؤول: ${org.managerName}'),
          ]),
          pw.SizedBox(height: 16),
          pw.Container(
            width: double.infinity,
            padding: const pw.EdgeInsets.all(8),
            decoration: pw.BoxDecoration(
              color: const PdfColor.fromInt(0xFFF7F9FC),
              borderRadius: pw.BorderRadius.circular(6),
            ),
            child: pw.Text(org.footer,
                textAlign: pw.TextAlign.center,
                style: const pw.TextStyle(fontSize: 9, color: muted)),
          ),
          pw.SizedBox(height: 8),
          pw.Row(
            mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
            children: [
              pw.Text('تاريخ الإصدار: ${Fmt.dateTime(v.createdAt)}',
                  style: const pw.TextStyle(fontSize: 8, color: muted)),
              pw.Text('الحالة: ${v.statusLabel}',
                  style: const pw.TextStyle(fontSize: 8, color: muted)),
            ],
          ),
        ],
      ),
    ),
  );

  return doc.save();
}

/// نص السند لإرساله عبر واتساب — نقل حرفي لـ `voucherText`.
String voucherText({
  required Voucher v,
  required Account? account,
  required CurrencyDef currency,
  required String orgName,
  List<InvoiceLine> items = const [],
}) {
  final b = StringBuffer()
    ..writeln('📄 ${v.kind.label} رقم ${v.number}')
    ..writeln('التاريخ: ${Fmt.date(v.date)}')
    ..writeln('الحساب: ${account?.name ?? '—'}')
    ..writeln(
        'المبلغ: ${Fmt.money(v.amount, currency.decimal)} ${currency.symbol}')
    ..writeln('البيان: ${v.statement.isEmpty ? '—' : v.statement}');
  if (items.isNotEmpty) {
    b.writeln('تفاصيل المشتريات:');
    for (var i = 0; i < items.length; i++) {
      final line = items[i];
      b.writeln(
        '${i + 1}. ${line.name} — ${_quantity(line.quantity)} ${line.unit} × '
        '${Fmt.money(line.unitPrice, currency.decimal)} ${currency.symbol} = '
        '${Fmt.money(line.total, currency.decimal)} ${currency.symbol}',
      );
    }
    final total = items.fold<double>(0, (sum, line) => sum + line.total);
    b.writeln(
        'إجمالي المشتريات: ${Fmt.money(total, currency.decimal)} ${currency.symbol}');
  }
  if (orgName.isNotEmpty) b.writeln(orgName);
  return b.toString();
}
