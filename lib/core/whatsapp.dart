import 'package:flutter/services.dart';
import 'package:url_launcher/url_launcher.dart';

import 'format.dart';

/// نتيجة محاولة الإرسال.
enum WaResult { ok, noWhatsApp, badPhone, error }

/// مرسل واتساب — يفتح محادثة الرقم مباشرة بلا نافذة مشاركة.
///
/// الجانب الأصلي (MainActivity.kt) يجرّب سلسلة نوايا: مكوّن ContactPicker
/// أولًا لأنه يسلّم الصورة والنص إلى المحادثة مباشرة، ثم الحزمة مع jid،
/// ثم بلا jid، وأخيرًا رابط wa.me نصًا فقط.
class WhatsApp {
  static const _ch = MethodChannel('nexora/whatsapp');

  /// حزم واتساب المثبّتة فعليًا (العادي والأعمال).
  static Future<List<String>> installed() async {
    try {
      final r = await _ch.invokeMethod<List<Object?>>('installed');
      return (r ?? []).whereType<String>().toList();
    } on PlatformException {
      return const [];
    } on MissingPluginException {
      return const [];
    }
  }

  /// يفتح المحادثة ويُرفق الصورة والنص. [imagePath] اختياري.
  static Future<WaResult> send({
    required String phone,
    required String text,
    String? imagePath,
    String? package,
  }) async {
    final digits = Fmt.waNumber(phone);
    if (digits.length < 8) return WaResult.badPhone;

    try {
      final r = await _ch.invokeMethod<String>('send', {
        'phone': digits,
        'text': text,
        'path': imagePath,
        'package': package,
      });
      return switch (r) {
        'ok' => WaResult.ok,
        'no_whatsapp' => WaResult.noWhatsApp,
        'bad_phone' => WaResult.badPhone,
        _ => WaResult.error,
      };
    } on MissingPluginException {
      // على غير أندرويد: نكتفي برابط wa.me.
      return _fallback(digits, text);
    } on PlatformException {
      return _fallback(digits, text);
    }
  }

  static Future<WaResult> _fallback(String digits, String text) async {
    final uri =
        Uri.parse('https://wa.me/$digits?text=${Uri.encodeComponent(text)}');
    final ok = await launchUrl(uri, mode: LaunchMode.externalApplication);
    return ok ? WaResult.ok : WaResult.error;
  }

  static String messageFor(WaResult r) => switch (r) {
        WaResult.ok => 'تم فتح واتساب ✅',
        WaResult.noWhatsApp => 'واتساب غير مثبّت على الجهاز',
        WaResult.badPhone => 'رقم الهاتف غير صالح',
        WaResult.error => 'تعذّر فتح المحادثة',
      };
}
