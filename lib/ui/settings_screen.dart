import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';

import '../core/models.dart';
import '../core/receipt_image.dart';
import '../core/security.dart';
import '../core/theme.dart';
import '../data/providers.dart';
import 'widgets.dart';

/// الإعدادات — نقل مفاتيح `settings.js` كاملة، مع حفظ صريح بزر واحد.
class SettingsScreen extends ConsumerStatefulWidget {
  const SettingsScreen({super.key});

  @override
  ConsumerState<SettingsScreen> createState() => _SettingsScreenState();
}

/// مفاتيح المؤسسة القابلة للتحرير النصي، بالترتيب المعروض.
const _orgFields = <(String, String, IconData, TextInputType?, int)>[
  ('businessName', 'اسم المؤسسة', Icons.business_outlined, null, 1),
  ('businessNameEn', 'الاسم بالإنجليزية', Icons.translate, null, 1),
  ('address', 'العنوان', Icons.location_on_outlined, null, 2),
  ('phone', 'الهاتف', Icons.phone_outlined, TextInputType.phone, 1),
  ('whatsapp', 'واتساب', Icons.chat_outlined, TextInputType.phone, 1),
  ('email', 'البريد الإلكتروني', Icons.email_outlined,
      TextInputType.emailAddress, 1),
  ('managerName', 'اسم المسؤول (يظهر على السندات)', Icons.badge_outlined, null,
      1),
  ('voucherFooter', 'تذييل السند', Icons.notes_outlined, null, 2),
];

class _SettingsScreenState extends ConsumerState<SettingsScreen> {
  final _ctrls = <String, TextEditingController>{};
  bool _dirty = false;
  bool _saving = false;
  bool _loaded = false;
  bool _bioSupported = false;
  String _bioLabel = '…';
  String _logoPath = '';
  bool _logoBusy = false;

  @override
  void initState() {
    super.initState();
    _checkBiometrics();
  }

  Future<void> _checkBiometrics() async {
    final ok = await Security.biometricsAvailable();
    final label = await Security.availableLabel();
    if (mounted) setState(() { _bioSupported = ok; _bioLabel = label; });
  }

  /// نملأ الحقول مرة واحدة فقط حتى لا يُمحى ما يكتبه المستخدم عند التحديث.
  void _hydrate(Map<String, String> st) {
    if (_loaded) return;
    _logoPath = st['logo'] ?? '';
    for (final f in _orgFields) {
      _ctrls[f.$1] = TextEditingController(text: st[f.$1] ?? '');
    }
    for (final k in VoucherKind.values) {
      _ctrls['prefix_${k.code}'] =
          TextEditingController(text: st['prefix_${k.code}'] ?? k.prefix);
    }
    _ctrls['labelOweUs'] =
        TextEditingController(text: st['labelOweUs'] ?? 'عليه');
    _ctrls['labelOweThem'] =
        TextEditingController(text: st['labelOweThem'] ?? 'له');
    for (final c in _ctrls.values) {
      c.addListener(() {
        if (!_dirty && mounted) setState(() => _dirty = true);
      });
    }
    _loaded = true;
  }

  @override
  void dispose() {
    for (final c in _ctrls.values) {
      c.dispose();
    }
    super.dispose();
  }

  bool get _hasLogo =>
      _logoPath.trim().isNotEmpty && File(_logoPath).existsSync();

  Future<void> _pickLogo() async {
    setState(() => _logoBusy = true);
    try {
      final picked = await ImagePicker().pickImage(
        source: ImageSource.gallery,
        imageQuality: 88,
      );
      if (picked == null) return;
      final old = _logoPath;
      final path = await saveImageBytes(
        await picked.readAsBytes(),
        prefix: 'logo',
      );
      await ref.read(repoProvider).setSetting('logo', path);
      if (old.isNotEmpty && old != path) {
        try {
          final oldFile = File(old);
          if (await oldFile.exists()) await oldFile.delete();
        } catch (_) {
          // لا نفشل حفظ الشعار الجديد بسبب ملف قديم غير قابل للحذف.
        }
      }
      if (mounted) {
        setState(() => _logoPath = path);
        bump(ref);
        showSnack(context, 'تم حفظ شعار المؤسسة ✅');
      }
    } catch (e) {
      if (mounted) showSnack(context, 'تعذّر حفظ الشعار: $e', error: true);
    } finally {
      if (mounted) setState(() => _logoBusy = false);
    }
  }

  Future<void> _removeLogo() async {
    if (_logoBusy) return;
    setState(() => _logoBusy = true);
    final old = _logoPath;
    try {
      await ref.read(repoProvider).setSetting('logo', '');
      if (old.isNotEmpty) {
        try {
          final oldFile = File(old);
          if (await oldFile.exists()) await oldFile.delete();
        } catch (_) {
          // لا نفشل حذف الإعداد بسبب ملف قديم غير قابل للحذف.
        }
      }
      if (!mounted) return;
      setState(() => _logoPath = '');
      bump(ref);
      showSnack(context, 'تم حذف شعار المؤسسة');
    } catch (e) {
      if (mounted) showSnack(context, 'تعذّر حذف الشعار: $e', error: true);
    } finally {
      if (mounted) setState(() => _logoBusy = false);
    }
  }

  Future<void> _saveAll() async {
    setState(() => _saving = true);
    try {
      final repo = ref.read(repoProvider);
      for (final e in _ctrls.entries) {
        await repo.setSetting(e.key, e.value.text.trim());
      }
      await repo.logActivity('حفظ الإعدادات', 'settings', '');
      bump(ref);
      if (!mounted) return;
      setState(() {
        _saving = false;
        _dirty = false;
      });
      showSnack(context, 'تم حفظ الإعدادات ✅');
    } catch (e) {
      if (mounted) {
        setState(() => _saving = false);
        showSnack(context, 'تعذّر حفظ الإعدادات: $e', error: true);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final settings = ref.watch(settingsProvider);
    final currencies = ref.watch(currenciesProvider).valueOrNull ?? [];
    final mode = ref.watch(themeModeProvider);

    return settings.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, _) => EmptyState(
        icon: Icons.error_outline,
        title: 'تعذّر تحميل الإعدادات',
        message: '$e',
      ),
      data: (st) {
        _hydrate(st);
        return Stack(
          children: [
            ListView(
              padding: const EdgeInsets.fromLTRB(14, 14, 14, 120),
              children: [
                const SectionTitle('إعدادات التطبيق والنظام'),
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(14),
                    child: Row(
                      children: [
                        Container(
                          padding: const EdgeInsets.all(10),
                          decoration: BoxDecoration(
                            color: AppColors.primarySoftOf(context),
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: Icon(
                            Icons.tune_outlined,
                            color: AppColors.primaryOf(context),
                          ),
                        ),
                        const SizedBox(width: 12),
                        const Expanded(
                          child: Text(
                            'جميع إعدادات Nexora في صفحة واحدة: بيانات المؤسسة، المحاسبة، المظهر، الأمان وترقيم السندات.',
                            style: TextStyle(
                              fontSize: 13,
                              height: 1.6,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 18),
                const SectionTitle('بيانات المؤسسة'),
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(14),
                    child: Column(children: [
                      for (final f in _orgFields)
                        _Field(
                          controller: _ctrls[f.$1]!,
                          label: f.$2,
                          icon: f.$3,
                          keyboard: f.$4,
                          maxLines: f.$5,
                        ),
                      const Divider(height: 24),
                      Align(
                        alignment: AlignmentDirectional.centerStart,
                        child: Text(
                          'شعار المؤسسة في السندات',
                          style: Theme.of(context).textTheme.titleSmall,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        'أضف شعارك ليظهر تلقائيًا في صورة الإيصال وملف PDF.',
                        style: TextStyle(
                          fontSize: 12,
                          color: AppColors.text2Of(context),
                        ),
                      ),
                      if (_hasLogo) ...[
                        const SizedBox(height: 10),
                        Align(
                          alignment: AlignmentDirectional.centerStart,
                          child: ClipRRect(
                            borderRadius: BorderRadius.circular(12),
                            child: Image.file(
                              File(_logoPath),
                              width: 96,
                              height: 96,
                              fit: BoxFit.contain,
                              errorBuilder: (_, __, ___) => Container(
                                width: 96,
                                height: 96,
                                color: AppColors.surface2Of(context),
                                alignment: Alignment.center,
                                child: Icon(Icons.broken_image_outlined,
                                    color: AppColors.text3Of(context)),
                              ),
                            ),
                          ),
                        ),
                      ],
                      const SizedBox(height: 10),
                      Row(
                        children: [
                          Expanded(
                            child: OutlinedButton.icon(
                              onPressed: _logoBusy ? null : _pickLogo,
                              icon: _logoBusy
                                  ? const SizedBox(
                                      width: 16,
                                      height: 16,
                                      child: CircularProgressIndicator(
                                          strokeWidth: 2),
                                    )
                                  : const Icon(Icons.image_outlined),
                              label: Text(_hasLogo ? 'استبدال الشعار' : 'اختيار صورة'),
                            ),
                          ),
                          if (_hasLogo) ...[
                            const SizedBox(width: 8),
                            IconButton(
                              tooltip: 'حذف الشعار',
                              onPressed: _logoBusy ? null : _removeLogo,
                              icon: Icon(
                                Icons.delete_outline,
                                color: AppColors.dangerOf(context),
                              ),
                            ),
                          ],
                        ],
                      ),
                      const SizedBox(height: 12),
                      SizedBox(
                        width: double.infinity,
                        child: FilledButton.icon(
                          onPressed: _saving ? null : _saveAll,
                          icon: _saving
                              ? const SizedBox(
                                  width: 16,
                                  height: 16,
                                  child: CircularProgressIndicator(
                                      strokeWidth: 2, color: Colors.white))
                              : const Icon(Icons.save_outlined),
                          label: Text(_saving ? 'جارٍ الحفظ…' : 'حفظ البيانات'),
                        ),
                      ),
                    ]),
                  ),
                ),
                const SizedBox(height: 18),
                const SectionTitle('المظهر'),
                Card(
                  child: Column(children: [
                    ListTile(
                      leading: const Icon(Icons.brightness_6_outlined),
                      title: const Text('السمة'),
                      subtitle: Text(switch (mode) {
                        ThemeMode.light => 'فاتح',
                        ThemeMode.dark => 'داكن',
                        ThemeMode.system => 'حسب النظام',
                      }),
                      trailing: SegmentedButton<ThemeMode>(
                        segments: const [
                          ButtonSegment(
                              value: ThemeMode.light,
                              icon: Icon(Icons.light_mode_outlined)),
                          ButtonSegment(
                              value: ThemeMode.system,
                              icon: Icon(Icons.brightness_auto_outlined)),
                          ButtonSegment(
                              value: ThemeMode.dark,
                              icon: Icon(Icons.dark_mode_outlined)),
                        ],
                        selected: {mode},
                        showSelectedIcon: false,
                        onSelectionChanged: (s) async {
                          final v = s.first;
                          ref.read(themeModeProvider.notifier).state = v;
                          await ref
                              .read(repoProvider)
                              .setSetting('theme', v.name);
                        },
                      ),
                    ),
                    const Divider(height: 1),
                    SwitchListTile(
                      secondary: const Icon(Icons.visibility_off_outlined),
                      title: const Text('إخفاء الأرصدة افتراضيًا'),
                      subtitle: const Text('تظهر الأرصدة كنقاط حتى تكشفها'),
                      value: ref.watch(hideBalancesProvider),
                      onChanged: (v) async {
                        ref.read(hideBalancesProvider.notifier).state = v;
                        await ref
                            .read(repoProvider)
                            .setSetting('hideBalances', v ? '1' : '0');
                      },
                    ),
                    const Divider(height: 1),
                    SwitchListTile(
                      secondary: const Icon(Icons.format_size),
                      title: const Text('خط أكبر في لوحة التحكم'),
                      subtitle: const Text('تكبير الأرقام والعناوين'),
                      value: (st['bigText'] ?? '1') == '1',
                      onChanged: (v) async {
                        await ref
                            .read(repoProvider)
                            .setSetting('bigText', v ? '1' : '0');
                        bump(ref);
                      },
                    ),
                  ]),
                ),
                const SizedBox(height: 18),
                const SectionTitle('المحاسبة'),
                Card(
                  child: Column(children: [
                    ListTile(
                      leading: const Icon(Icons.currency_exchange),
                      title: const Text('العملة الافتراضية'),
                      subtitle: Text(st['defaultCurrency'] ?? 'YER'),
                      trailing: const Icon(Icons.chevron_left),
                      onTap: () async {
                        final v = await showModalBottomSheet<String>(
                          context: context,
                          builder: (_) => SafeArea(
                            child: ListView(shrinkWrap: true, children: [
                              for (final c in currencies)
                                ListTile(
                                  title: Text('${c.symbol}  ${c.name}'),
                                  onTap: () => Navigator.pop(context, c.code),
                                ),
                            ]),
                          ),
                        );
                        if (v != null) {
                          await ref
                              .read(repoProvider)
                              .setSetting('defaultCurrency', v);
                          bump(ref);
                        }
                      },
                    ),
                    const Divider(height: 1),
                    Padding(
                      padding: const EdgeInsets.fromLTRB(14, 6, 14, 10),
                      child: Column(children: [
                        _Field(
                          controller: _ctrls['labelOweUs']!,
                          label: 'تسمية الرصيد الموجب',
                          icon: Icons.trending_up,
                          hint: 'الافتراضي: عليه (مستحق لنا)',
                        ),
                        _Field(
                          controller: _ctrls['labelOweThem']!,
                          label: 'تسمية الرصيد السالب',
                          icon: Icons.trending_down,
                          hint: 'الافتراضي: له (مستحق منا)',
                        ),
                      ]),
                    ),
                  ]),
                ),
                const SizedBox(height: 18),
                const SectionTitle('ترقيم السندات'),
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(14),
                    child: Column(children: [
                      for (final k in VoucherKind.values)
                        _Field(
                          controller: _ctrls['prefix_${k.code}']!,
                          label: 'بادئة ${k.label}',
                          icon: Icons.tag,
                          hint:
                              'العدّاد الحالي: ${st['counter_${k.code}'] ?? '0'}',
                        ),
                    ]),
                  ),
                ),
                const SizedBox(height: 18),
                const SectionTitle('الأمان'),
                Card(
                  child: Column(children: [
                    SwitchListTile(
                      secondary: const Icon(Icons.fingerprint),
                      title: const Text('فتح التطبيق بالبصمة'),
                      subtitle: Text(_bioSupported
                          ? 'الوسائل المتاحة: $_bioLabel'
                          : 'غير متاحة — فعّل بصمة في إعدادات الجهاز'),
                      value: _bioSupported && (st['biometric'] ?? '0') == '1',
                      onChanged: !_bioSupported
                          ? null
                          : (v) async {
                              if (v) {
                                // نتحقق فورًا حتى لا يُقفل المستخدم خارج تطبيقه.
                                final ok = await Security.authenticate(
                                    reason: 'أكّد بصمتك لتفعيل القفل');
                                if (!ok) {
                                  if (context.mounted) {
                                    showSnack(context, 'لم يتم التحقق');
                                  }
                                  return;
                                }
                              }
                              await ref
                                  .read(repoProvider)
                                  .setSetting('biometric', v ? '1' : '0');
                              bump(ref);
                            },
                    ),
                    const Divider(height: 1),
                    SwitchListTile(
                      secondary: const Icon(Icons.lock_clock_outlined),
                      title: const Text('القفل عند العودة للتطبيق'),
                      subtitle: const Text('يُطلب التحقق بعد كل تصغير'),
                      value: (st['autoLock'] ?? '0') == '1',
                      onChanged: (st['biometric'] ?? '0') != '1'
                          ? null
                          : (v) async {
                              await ref
                                  .read(repoProvider)
                                  .setSetting('autoLock', v ? '1' : '0');
                              bump(ref);
                            },
                    ),
                    const Divider(height: 1),
                    SwitchListTile(
                      secondary: const Icon(Icons.lock_outline),
                      title: const Text('كلمة مرور لتبديل المستخدم'),
                      subtitle: const Text(
                          'تُضبط لكل مستخدم من شاشة المستخدمين والصلاحيات'),
                      value: (st['userPassword'] ?? '0') == '1',
                      onChanged: (v) async {
                        await ref
                            .read(repoProvider)
                            .setSetting('userPassword', v ? '1' : '0');
                        bump(ref);
                      },
                    ),
                  ]),
                ),
                const SizedBox(height: 18),
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(children: [
                      Text('إدارة البيانات',
                          style: Theme.of(context).textTheme.titleMedium),
                      const SizedBox(height: 4),
                      Text('الإصدار 3.1.0 — تطبيق أصلي بالكامل',
                          style: TextStyle(
                              fontSize: 12, color: AppColors.text3Of(context))),
                      const SizedBox(height: 8),
                      Text(
                        'موجب (+) = مستحق لنا «عليه»  ·  سالب (−) = مستحق منا «له»',
                        textAlign: TextAlign.center,
                        style: TextStyle(
                            fontSize: 11.5,
                            height: 1.6,
                            color: AppColors.text3Of(context)),
                      ),
                    ]),
                  ),
                ),
              ],
            ),
            // شريط حفظ عائم يظهر فور أي تعديل غير محفوظ.
            if (_dirty)
              Positioned(
                left: 12,
                right: 12,
                bottom: 12,
                child: Material(
                  elevation: 6,
                  borderRadius: BorderRadius.circular(16),
                  color: AppColors.primaryOf(context),
                  child: InkWell(
                    borderRadius: BorderRadius.circular(16),
                    onTap: _saving ? null : _saveAll,
                    child: Padding(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 16, vertical: 14),
                      child: Row(
                        children: [
                          const Icon(Icons.save_outlined, color: Colors.white),
                          const SizedBox(width: 10),
                          const Expanded(
                            child: Text('لديك تعديلات غير محفوظة',
                                style: TextStyle(
                                    color: Colors.white,
                                    fontWeight: FontWeight.w700)),
                          ),
                          Text(_saving ? 'جارٍ الحفظ…' : 'حفظ الآن',
                              style: const TextStyle(
                                  color: Colors.white,
                                  fontWeight: FontWeight.w800)),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
          ],
        );
      },
    );
  }
}

/// حقل نصي بسيط مربوط بمتحكّم يملكه الأب.
class _Field extends StatelessWidget {
  final TextEditingController controller;
  final String label;
  final IconData icon;
  final String? hint;
  final int maxLines;
  final TextInputType? keyboard;

  const _Field({
    required this.controller,
    required this.label,
    required this.icon,
    this.hint,
    this.maxLines = 1,
    this.keyboard,
  });

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 7),
        child: TextField(
          controller: controller,
          maxLines: maxLines,
          keyboardType: keyboard,
          decoration: InputDecoration(
            labelText: label,
            helperText: hint,
            prefixIcon: Icon(icon),
            isDense: true,
          ),
        ),
      );
}
