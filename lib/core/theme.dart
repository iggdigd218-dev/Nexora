import 'package:flutter/material.dart';

/// ألوان نكسورا — منقولة حرفيًا من متغيّرات CSS في `css/style.css`
/// الخاصة بهذا التطبيق وحده. لا علاقة لها بأي تطبيق آخر.
class AppColors {
  // ===== الوضع الفاتح =====
  static const bg = Color(0xFFF4F6FB); // --bg
  static const bg2 = Color(0xFFEEF1F7); // --bg2
  static const surface = Color(0xFFFFFFFF); // --surface
  static const surface2 = Color(0xFFF7F9FC); // --surface2
  static const text = Color(0xFF12223A); // --text
  static const text2 = Color(0xFF5B6B83); // --text2
  static const text3 = Color(0xFF8A97AB); // --text3
  static const border = Color(0xFFE2E8F2); // --border

  static const primary = Color(0xFF0F766E); // --primary
  static const primary2 = Color(0xFF0D9488); // --primary2
  static const primarySoft = Color(0xFFE6F6F3); // --primary-soft
  static const accent = Color(0xFFF59E0B); // --accent
  static const accentSoft = Color(0xFFFDF3E3); // --accent-soft
  static const danger = Color(0xFFE11D48); // --danger
  static const dangerSoft = Color(0xFFFDE8EE); // --danger-soft
  static const green = Color(0xFF16A34A); // --green
  static const greenSoft = Color(0xFFE7F7EE); // --green-soft
  static const info = Color(0xFF2563EB); // --info
  static const infoSoft = Color(0xFFE8EFFC); // --info-soft
  static const violet = Color(0xFF7C3AED); // --violet
  static const violetSoft = Color(0xFFF0E9FD); // --violet-soft

  // ===== الوضع الداكن =====
  static const dBg = Color(0xFF0C1119);
  static const dBg2 = Color(0xFF101826);
  static const dSurface = Color(0xFF151D2C);
  static const dSurface2 = Color(0xFF1A2334);
  static const dText = Color(0xFFE8EEF7);
  static const dText2 = Color(0xFFA8B4C8);
  static const dText3 = Color(0xFF6B7890);
  static const dBorder = Color(0xFF263349);

  static const dPrimary = Color(0xFF2DD4BF);
  static const dPrimary2 = Color(0xFF5EEAD4);
  static const dPrimarySoft = Color(0xFF0F3A36);
  static const dAccent = Color(0xFFFBBF24);
  static const dAccentSoft = Color(0xFF3A2F14);
  static const dDanger = Color(0xFFFB7185);
  static const dDangerSoft = Color(0xFF3A1622);
  static const dGreen = Color(0xFF4ADE80);
  static const dGreenSoft = Color(0xFF123023);
  static const dInfo = Color(0xFF60A5FA);
  static const dInfoSoft = Color(0xFF16283F);
  static const dViolet = Color(0xFFA78BFA);
  static const dVioletSoft = Color(0xFF2A1F45);

  /// اللون حسب الوضع الحالي — يُستخدم في الواجهات بدل الثوابت المباشرة.
  static Color of(BuildContext c, Color light, Color dark) =>
      Theme.of(c).brightness == Brightness.dark ? dark : light;

  static Color bgOf(BuildContext c) => of(c, bg, dBg);
  static Color bg2Of(BuildContext c) => of(c, bg2, dBg2);
  static Color surfaceOf(BuildContext c) => of(c, surface, dSurface);
  static Color surface2Of(BuildContext c) => of(c, surface2, dSurface2);
  static Color textOf(BuildContext c) => of(c, text, dText);
  static Color text2Of(BuildContext c) => of(c, text2, dText2);
  static Color text3Of(BuildContext c) => of(c, text3, dText3);
  static Color borderOf(BuildContext c) => of(c, border, dBorder);
  static Color primaryOf(BuildContext c) => of(c, primary, dPrimary);
  static Color accentOf(BuildContext c) => of(c, accent, dAccent);
  static Color dangerOf(BuildContext c) => of(c, danger, dDanger);
  static Color greenOf(BuildContext c) => of(c, green, dGreen);
  static Color infoOf(BuildContext c) => of(c, info, dInfo);
  static Color violetOf(BuildContext c) => of(c, violet, dViolet);

  static Color primarySoftOf(BuildContext c) =>
      of(c, primarySoft, dPrimarySoft);
  static Color accentSoftOf(BuildContext c) => of(c, accentSoft, dAccentSoft);
  static Color dangerSoftOf(BuildContext c) => of(c, dangerSoft, dDangerSoft);
  static Color greenSoftOf(BuildContext c) => of(c, greenSoft, dGreenSoft);
  static Color infoSoftOf(BuildContext c) => of(c, infoSoft, dInfoSoft);
  static Color violetSoftOf(BuildContext c) => of(c, violetSoft, dVioletSoft);

  // أسماء متوافقة مع الشيفرة القائمة
  static const teal = primary;
  static const tealLight = primary2;
  static const red = danger;
  static const amber = accent;
}

/// ظلال نكسورا — مطابقة لـ --shadow و --shadow-lg.
class AppShadows {
  static List<BoxShadow> soft(bool dark) => [
        BoxShadow(
          color: dark
              ? Colors.black.withValues(alpha: .35)
              : const Color(0xFF0F1E32).withValues(alpha: .08),
          blurRadius: 18,
          offset: const Offset(0, 4),
        ),
      ];

  static List<BoxShadow> large(bool dark) => [
        BoxShadow(
          color: dark
              ? Colors.black.withValues(alpha: .5)
              : const Color(0xFF0F1E32).withValues(alpha: .16),
          blurRadius: 40,
          offset: const Offset(0, 14),
        ),
      ];
}

class AppTheme {
  static ThemeData light() => _build(false);
  static ThemeData dark() => _build(true);

  static ThemeData _build(bool dark) {
    final primary = dark ? AppColors.dPrimary : AppColors.primary;
    final bg = dark ? AppColors.dBg : AppColors.bg;
    final surface = dark ? AppColors.dSurface : AppColors.surface;
    final border = dark ? AppColors.dBorder : AppColors.border;
    final text = dark ? AppColors.dText : AppColors.text;
    final text2 = dark ? AppColors.dText2 : AppColors.text2;
    final danger = dark ? AppColors.dDanger : AppColors.danger;

    final scheme = ColorScheme.fromSeed(
      seedColor: AppColors.primary,
      brightness: dark ? Brightness.dark : Brightness.light,
    ).copyWith(
      primary: primary,
      surface: surface,
      error: danger,
      outline: border,
    );

    return ThemeData(
      useMaterial3: true,
      brightness: dark ? Brightness.dark : Brightness.light,
      colorScheme: scheme,
      scaffoldBackgroundColor: bg,
      canvasColor: bg,
      fontFamily: 'Tajawal',
      appBarTheme: AppBarTheme(
        backgroundColor: surface,
        surfaceTintColor: Colors.transparent,
        foregroundColor: text,
        elevation: 0,
        scrolledUnderElevation: .5,
        centerTitle: false,
        titleTextStyle: TextStyle(
          fontFamily: 'Tajawal',
          fontSize: 19,
          fontWeight: FontWeight.w700,
          color: text,
        ),
      ),
      textTheme: TextTheme(
        titleLarge: TextStyle(
            fontWeight: FontWeight.w700, color: text, fontSize: 18),
        titleMedium: TextStyle(
            fontWeight: FontWeight.w700, color: text, fontSize: 15.5),
        bodyMedium: TextStyle(color: text, fontSize: 14.5),
        bodySmall: TextStyle(color: text2, fontSize: 12.5),
        labelLarge:
            const TextStyle(fontWeight: FontWeight.w700, fontSize: 14.5),
      ),
      cardTheme: CardThemeData(
        color: surface,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
          side: BorderSide(color: border),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: dark ? AppColors.dSurface2 : AppColors.surface2,
        contentPadding:
            const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(color: border),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(color: border),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(color: primary, width: 1.6),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(color: danger),
        ),
        labelStyle: TextStyle(color: text2),
        hintStyle: TextStyle(
            color: dark ? AppColors.dText3 : AppColors.text3, fontSize: 14),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: primary,
          foregroundColor: dark ? const Color(0xFF06231F) : Colors.white,
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
          shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(12)),
          textStyle: const TextStyle(
              fontFamily: 'Tajawal',
              fontWeight: FontWeight.w700,
              fontSize: 15),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: primary,
          side: BorderSide(color: border),
          padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 13),
          shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(12)),
          textStyle: const TextStyle(
              fontFamily: 'Tajawal', fontWeight: FontWeight.w700),
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          foregroundColor: primary,
          textStyle: const TextStyle(
              fontFamily: 'Tajawal', fontWeight: FontWeight.w700),
        ),
      ),
      floatingActionButtonTheme: FloatingActionButtonThemeData(
        backgroundColor: primary,
        foregroundColor: dark ? const Color(0xFF06231F) : Colors.white,
        elevation: 2,
      ),
      chipTheme: ChipThemeData(
        backgroundColor: dark ? AppColors.dSurface2 : AppColors.surface2,
        selectedColor: dark ? AppColors.dPrimarySoft : AppColors.primarySoft,
        side: BorderSide(color: border),
        labelStyle: TextStyle(
            fontFamily: 'Tajawal',
            fontSize: 13,
            fontWeight: FontWeight.w600,
            color: text),
        shape:
            RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
      ),
      dividerTheme: DividerThemeData(color: border, thickness: 1, space: 1),
      navigationBarTheme: NavigationBarThemeData(
        backgroundColor: surface,
        surfaceTintColor: Colors.transparent,
        indicatorColor: dark ? AppColors.dPrimarySoft : AppColors.primarySoft,
        height: 66,
        elevation: 8,
        labelBehavior: NavigationDestinationLabelBehavior.alwaysShow,
        labelTextStyle: WidgetStatePropertyAll(TextStyle(
          fontFamily: 'Tajawal',
          fontSize: 11.5,
          fontWeight: FontWeight.w700,
          color: text2,
        )),
        iconTheme: WidgetStateProperty.resolveWith((s) => IconThemeData(
              color: s.contains(WidgetState.selected) ? primary : text2,
              size: 23,
            )),
      ),
      dialogTheme: DialogThemeData(
        backgroundColor: surface,
        surfaceTintColor: Colors.transparent,
        shape:
            RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
      ),
      bottomSheetTheme: BottomSheetThemeData(
        backgroundColor: surface,
        surfaceTintColor: Colors.transparent,
        shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
        ),
      ),
      snackBarTheme: SnackBarThemeData(
        behavior: SnackBarBehavior.floating,
        shape:
            RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
      listTileTheme: ListTileThemeData(
        iconColor: text2,
        textColor: text,
        shape:
            RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
    );
  }
}
