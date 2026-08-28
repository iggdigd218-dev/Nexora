import 'dart:convert';

import 'package:crypto/crypto.dart';
import 'package:flutter/services.dart';
import 'package:local_auth/local_auth.dart';

/// البصمة وقفل التطبيق وكلمات مرور المستخدمين.
class Security {
  static final _auth = LocalAuthentication();

  /// هل يدعم الجهاز البصمة/الوجه وهل هناك بصمة مسجّلة؟
  static Future<bool> biometricsAvailable() async {
    try {
      final supported = await _auth.isDeviceSupported();
      if (!supported) return false;
      final can = await _auth.canCheckBiometrics;
      if (!can) return false;
      final types = await _auth.getAvailableBiometrics();
      return types.isNotEmpty;
    } on PlatformException {
      return false;
    } on MissingPluginException {
      return false;
    }
  }

  /// أسماء وسائل التحقق المتاحة، للعرض في الإعدادات.
  static Future<String> availableLabel() async {
    try {
      final types = await _auth.getAvailableBiometrics();
      if (types.isEmpty) return 'غير متاحة على هذا الجهاز';
      final names = <String>[];
      if (types.contains(BiometricType.fingerprint)) names.add('البصمة');
      if (types.contains(BiometricType.face)) names.add('الوجه');
      if (types.contains(BiometricType.iris)) names.add('القزحية');
      if (names.isEmpty) names.add('تحقق بيومتري');
      return names.join(' · ');
    } catch (_) {
      return 'غير متاحة';
    }
  }

  /// يطلب المصادقة. يعيد true عند النجاح فقط.
  static Future<bool> authenticate({
    String reason = 'أكّد هويتك لفتح التطبيق',
  }) async {
    try {
      return await _auth.authenticate(
        localizedReason: reason,
        options: const AuthenticationOptions(
          biometricOnly: false, // نسمح بنمط القفل كبديل
          stickyAuth: true,
          useErrorDialogs: true,
        ),
      );
    } on PlatformException {
      return false;
    } on MissingPluginException {
      return false;
    }
  }

  /// تجزئة كلمة المرور — لا نخزّن النص الصريح إطلاقًا.
  static String hash(String password) {
    if (password.isEmpty) return '';
    final salted = utf8.encode('nexora::$password');
    return sha256.convert(salted).toString();
  }

  static bool verify(String password, String stored) {
    if (stored.isEmpty) return true; // لا كلمة مرور مضبوطة
    return hash(password) == stored;
  }
}
