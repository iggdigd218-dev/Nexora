import 'package:intl/intl.dart';

import 'accounting.dart';

/// تنسيق الأرقام والتواريخ.
class Fmt {
  static final _int = NumberFormat('#,##0', 'en');
  static final _two = NumberFormat('#,##0.00', 'en');
  static final _date = DateFormat('yyyy/MM/dd', 'en');
  static final _dateTime = DateFormat('yyyy/MM/dd  hh:mm a', 'en');
  static final _month = DateFormat('MMMM yyyy', 'ar');
  static final _day = DateFormat('EEEE d MMMM', 'ar');

  /// مبلغ بعدد المنازل العشرية المناسب للعملة.
  static String money(double v, [int decimals = 0]) =>
      decimals > 0 ? _two.format(v) : _int.format(v);

  static String moneyFor(double v, CurrencyDef c) => money(v, c.decimal);

  /// مبلغ مع رمز العملة.
  static String withSymbol(double v, CurrencyDef c) =>
      '${money(v, c.decimal)} ${c.symbol}';

  static String date(DateTime d) => _date.format(d);
  static String dateTime(DateTime d) => _dateTime.format(d);
  static String month(DateTime d) => _month.format(d);
  static String day(DateTime d) => _day.format(d);

  /// تحويل الأرقام العربية إلى إنجليزية ثم التحليل.
  ///
  /// يعيد null للمدخل غير الصالح بدل أن يرمي، فالحقول تعتمد عليه.
  static double? parseAmount(String s) {
    if (s.trim().isEmpty) return null;
    const ar = '٠١٢٣٤٥٦٧٨٩';
    const fa = '۰۱۲۳۴۵۶۷۸۹';
    final b = StringBuffer();
    for (final ch in s.trim().split('')) {
      final ai = ar.indexOf(ch);
      final fi = fa.indexOf(ch);
      if (ai >= 0) {
        b.write(ai);
      } else if (fi >= 0) {
        b.write(fi);
      } else if (ch == '٫' || ch == ',') {
        // الفاصلة العشرية العربية أو فاصل الآلاف
        b.write(ch == '٫' ? '.' : '');
      } else {
        b.write(ch);
      }
    }
    final v = double.tryParse(b.toString());
    if (v == null || v.isNaN || v.isInfinite) return null;
    return v;
  }

  /// أرقام الهاتف: تُترك الأرقام فقط مع علامة + البادئة.

  /// وقت نسبي بالعربية — نقل حرفي لـ `relTime` في نسخة الويب.
  static String relative(DateTime d) {
    final diff = DateTime.now().difference(d);
    final s = diff.inSeconds;
    if (s < 60) return 'الآن';
    if (s < 3600) return 'قبل ${diff.inMinutes} دقيقة';
    if (s < 86400) return 'قبل ${diff.inHours} ساعة';
    if (s < 2592000) return 'قبل ${diff.inDays} يوم';
    return date(d);
  }

  static String phoneDigits(String s) {
    final d = s.replaceAll(RegExp(r'[^\d+]'), '');
    return d.startsWith('+') ? '+${d.substring(1).replaceAll('+', '')}' : d;
  }

  /// رقم دولي لواتساب: يمني بلا صفر بادئ ← 967…
  static String waNumber(String s) {
    var d = s.replaceAll(RegExp(r'\D'), '');
    if (d.startsWith('00')) d = d.substring(2);
    if (d.startsWith('967')) return d;
    if (d.startsWith('0')) d = d.substring(1);
    if (d.length == 9) return '967$d';
    return d;
  }
}
