import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/date_symbol_data_local.dart';

import 'core/theme.dart';
import 'data/repository.dart';
import 'data/providers.dart';
import 'ui/home_shell.dart';
import 'ui/lock_gate.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  // بدون تهيئة بيانات التواريخ تنهار كل تنسيقات intl عند الإقلاع.
  await initializeDateFormatting('ar');
  await initializeDateFormatting('en');
  // نقرأ الإعدادات المحفوظة قبل الإقلاع حتى تظهر السمة الصحيحة فورًا.
  var themeMode = ThemeMode.system;
  var hideBalances = false;
  try {
    final st = await Repo().settings();
    themeMode = switch (st['theme']) {
      'light' => ThemeMode.light,
      'dark' => ThemeMode.dark,
      _ => ThemeMode.system,
    };
    hideBalances = st['hideBalances'] == '1';
  } catch (_) {
    // قاعدة جديدة أو تعذّر الفتح: نُكمل بالقيم الافتراضية.
  }

  runApp(ProviderScope(
    overrides: [
      themeModeProvider.overrideWith((ref) => themeMode),
      hideBalancesProvider.overrideWith((ref) => hideBalances),
    ],
    child: const NexoraApp(),
  ));
}

class NexoraApp extends ConsumerWidget {
  const NexoraApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return MaterialApp(
      title: 'إدارة البيانات',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light(),
      darkTheme: AppTheme.dark(),
      themeMode: ref.watch(themeModeProvider),
      locale: const Locale('ar'),
      supportedLocales: const [Locale('ar'), Locale('en')],
      localizationsDelegates: const [
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      // التطبيق عربي بالكامل: نفرض RTL على كل الشجرة.
      builder: (context, child) => Directionality(
        textDirection: TextDirection.rtl,
        child: child ?? const SizedBox.shrink(),
      ),
      home: const LockGate(child: HomeShell()),
    );
  }
}
