import 'dart:io';
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:path_provider/path_provider.dart';

import 'accounting.dart';
import 'format.dart';
import 'models.dart';
import 'theme.dart';
import 'words.dart';

/// بيانات الإيصال المرسوم كصورة.
class ReceiptData {
  final String title;
  final String number;
  final String accountName;
  final String accountPhone;
  final double amount;
  final CurrencyDef currency;
  final String statement;
  final DateTime date;
  final double? balanceAfter;
  final String orgName;
  final String orgPhone;
  final String footer;

  const ReceiptData({
    required this.title,
    this.number = '',
    required this.accountName,
    this.accountPhone = '',
    required this.amount,
    required this.currency,
    this.statement = '',
    required this.date,
    this.balanceAfter,
    this.orgName = '',
    this.orgPhone = '',
    this.footer = '',
  });

  factory ReceiptData.fromTx({
    required Tx tx,
    required Account? account,
    required CurrencyDef currency,
    double? balanceAfter,
    required Map<String, String> settings,
  }) =>
      ReceiptData(
        title: tx.type.label,
        number: tx.reference,
        accountName: account?.name ?? '—',
        accountPhone: account?.phone ?? '',
        amount: tx.amount,
        currency: currency,
        statement: tx.description,
        date: tx.date,
        balanceAfter: balanceAfter,
        orgName: settings['businessName'] ?? '',
        orgPhone: settings['phone'] ?? '',
        footer: settings['voucherFooter'] ?? '',
      );
}

/// يرسم الإيصال كصورة PNG ويحفظه في مجلد مؤقت، ثم يعيد مساره.
///
/// نرسم عبر `PictureRecorder` مباشرة بدل التقاط عنصر من الشجرة، فالصورة
/// تُولَّد حتى لو لم تُعرض أي واجهة — وهذا شرط الإرسال التلقائي.
Future<String> buildReceiptImage(ReceiptData d) async {
  const w = 1000.0;
  const pad = 48.0;

  // نقيس أولًا لنعرف الارتفاع المطلوب.
  final body = _lines(d);
  final height = 470.0 + body.length * 52.0 + (d.footer.isEmpty ? 0 : 60);

  final recorder = ui.PictureRecorder();
  final canvas = Canvas(recorder, Rect.fromLTWH(0, 0, w, height));

  final bg = Paint()..color = const Color(0xFFF4F6FB);
  canvas.drawRect(Rect.fromLTWH(0, 0, w, height), bg);

  // البطاقة البيضاء
  final card = RRect.fromRectAndRadius(
    Rect.fromLTWH(pad / 2, pad / 2, w - pad, height - pad),
    const Radius.circular(28),
  );
  canvas.drawRRect(card, Paint()..color = Colors.white);
  canvas.drawRRect(
    card,
    Paint()
      ..color = const Color(0xFFE2E8F2)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2,
  );

  // الشريط العلوي
  final header = RRect.fromRectAndCorners(
    Rect.fromLTWH(pad / 2, pad / 2, w - pad, 130),
    topLeft: const Radius.circular(28),
    topRight: const Radius.circular(28),
  );
  canvas.drawRRect(header, Paint()..color = AppColors.primary);

  var y = pad / 2 + 30.0;
  _text(canvas, d.orgName.isEmpty ? 'إدارة البيانات' : d.orgName,
      w / 2, y, 34, Colors.white, bold: true, center: true);
  y += 46;
  _text(canvas, d.title, w / 2, y, 26, Colors.white70,
      bold: true, center: true);

  y = pad / 2 + 170;

  // صندوق المبلغ
  final amountBox = RRect.fromRectAndRadius(
    Rect.fromLTWH(pad, y, w - pad * 2, 150),
    const Radius.circular(20),
  );
  canvas.drawRRect(amountBox, Paint()..color = const Color(0xFFE6F6F3));
  _text(
    canvas,
    '${Fmt.money(d.amount, d.currency.decimal)} ${d.currency.symbol}',
    w / 2,
    y + 30,
    52,
    AppColors.primary,
    bold: true,
    center: true,
  );
  _text(
    canvas,
    'فقط ${numberToWords(d.amount)} ${d.currency.name} لا غير',
    w / 2,
    y + 100,
    20,
    const Color(0xFF5B6B83),
    center: true,
    maxWidth: w - pad * 3,
  );

  y += 190;

  // الأسطر
  for (final l in body) {
    _text(canvas, l.$1, w - pad - 12, y, 22, const Color(0xFF8A97AB),
        alignEnd: true);
    _text(canvas, l.$2, pad + 12, y, 24, const Color(0xFF12223A),
        bold: true, alignStart: true, maxWidth: w * .55);
    y += 52;
  }

  if (d.footer.isNotEmpty) {
    y += 8;
    _text(canvas, d.footer, w / 2, y, 19, const Color(0xFF8A97AB),
        center: true, maxWidth: w - pad * 2);
  }

  final picture = recorder.endRecording();
  final img = await picture.toImage(w.toInt(), height.toInt());
  final bytes = await img.toByteData(format: ui.ImageByteFormat.png);
  final data = bytes!.buffer.asUint8List();

  final dir = await getTemporaryDirectory();
  final shared = Directory('${dir.path}/receipts')..createSync(recursive: true);
  final stamp = DateTime.now().millisecondsSinceEpoch;
  final file = File('${shared.path}/receipt-$stamp.png');
  await file.writeAsBytes(data, flush: true);
  return file.path;
}

/// أسطر الإيصال: (العنوان، القيمة).
List<(String, String)> _lines(ReceiptData d) {
  final out = <(String, String)>[
    ('الحساب', d.accountName),
    ('التاريخ', Fmt.date(d.date)),
  ];
  if (d.number.isNotEmpty) out.add(('رقم السند', d.number));
  if (d.accountPhone.isNotEmpty) out.add(('الهاتف', d.accountPhone));
  if (d.statement.isNotEmpty) out.add(('البيان', d.statement));
  if (d.balanceAfter != null) {
    final b = d.balanceAfter!;
    final label = b > 0 ? 'عليه' : (b < 0 ? 'له' : 'متساوٍ');
    out.add(('الرصيد بعد العملية',
        '${Fmt.money(b.abs(), d.currency.decimal)} ($label)'));
  }
  if (d.orgPhone.isNotEmpty) out.add(('للتواصل', d.orgPhone));
  return out;
}

void _text(
  Canvas canvas,
  String text,
  double x,
  double y,
  double size,
  Color color, {
  bool bold = false,
  bool center = false,
  bool alignEnd = false,
  bool alignStart = false,
  double? maxWidth,
}) {
  final tp = TextPainter(
    text: TextSpan(
      text: text,
      style: TextStyle(
        color: color,
        fontSize: size,
        fontWeight: bold ? FontWeight.w800 : FontWeight.w500,
        fontFamily: 'Tajawal',
        height: 1.35,
      ),
    ),
    textDirection: TextDirection.rtl,
    textAlign: center ? TextAlign.center : TextAlign.right,
    maxLines: 3,
    ellipsis: '…',
  )..layout(maxWidth: maxWidth ?? 800);

  final dx = center
      ? x - tp.width / 2
      : (alignEnd ? x - tp.width : (alignStart ? x : x - tp.width / 2));
  tp.paint(canvas, Offset(dx, y));
}

/// يحوّل بايتات صورة إلى ملف مؤقت (لصور العمليات المختارة من المعرض).
Future<String> saveImageBytes(Uint8List bytes, {String prefix = 'img'}) async {
  final dir = await getApplicationDocumentsDirectory();
  final folder = Directory('${dir.path}/images')..createSync(recursive: true);
  final f = File(
      '${folder.path}/$prefix-${DateTime.now().millisecondsSinceEpoch}.png');
  await f.writeAsBytes(bytes, flush: true);
  return f.path;
}
