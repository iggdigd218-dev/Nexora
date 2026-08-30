import 'dart:convert';
import 'dart:io';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';

import '../core/format.dart';
import '../core/theme.dart';
import '../data/google_drive_service.dart';
import '../data/providers.dart';
import 'widgets.dart';

/// النسخ الاحتياطي والاستعادة وسلة المهملات — نقل شاشة `backup.js`.
class BackupScreen extends ConsumerStatefulWidget {
  const BackupScreen({super.key});

  @override
  ConsumerState<BackupScreen> createState() => _BackupScreenState();
}

class _BackupScreenState extends ConsumerState<BackupScreen> {
  bool _busy = false;
  bool _cloudLoading = true;
  String? _cloudError;
  GoogleAccountInfo? _googleAccount;
  GoogleDriveBackupInfo? _cloudBackup;

  /// تضمين صور العمليات داخل ملف النسخة (البند ١٣).
  bool _withImages = true;

  final GoogleDriveService _drive = GoogleDriveService.instance;

  @override
  void initState() {
    super.initState();
    _loadCloudState();
  }

  Future<void> _loadCloudState() async {
    GoogleAccountInfo? account;
    GoogleDriveBackupInfo? backup;
    String? cloudError;
    try {
      account = await _drive.restoreSession();
      if (account != null) {
        try {
          backup = await _drive.latestBackup();
        } catch (e) {
          cloudError = '$e';
        }
      }
    } catch (e) {
      cloudError = '$e';
    }
    if (!mounted) return;
    setState(() {
      _googleAccount = account;
      _cloudBackup = backup;
      _cloudError = cloudError;
      _cloudLoading = false;
    });
  }

  Future<File> _createBackupFile() async {
    final data = await ref
        .read(repoProvider)
        .exportAll(withImages: _withImages);
    final json = const JsonEncoder.withIndent('  ').convert(data);
    final dir = await getTemporaryDirectory();
    final stamp = DateTime.now()
        .toIso8601String()
        .substring(0, 19)
        .replaceAll(':', '-');
    final file = File('${dir.path}/nexora-backup-$stamp.nexora');
    await file.writeAsString(json, flush: true);
    return file;
  }

  Future<void> _backup() async {
    setState(() => _busy = true);
    try {
      final file = await _createBackupFile();
      await Share.shareXFiles([
        XFile(file.path),
      ], subject: 'نسخة احتياطية — إدارة البيانات');
      if (mounted) {
        final raw = await file.readAsString();
        final map = jsonDecode(raw) as Map;
        final n = (map['images'] as Map?)?.length ?? 0;
        showSnack(
          context,
          n > 0
              ? 'تم إنشاء النسخة ✅ (تتضمّن $n صورة)'
              : 'تم إنشاء النسخة الاحتياطية ✅',
        );
      }
    } catch (e) {
      if (mounted) showSnack(context, 'تعذّر إنشاء النسخة: $e', error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<int> _importJson(String raw) async {
    final cleaned = raw.startsWith('\uFEFF') ? raw.substring(1) : raw;
    final decoded = jsonDecode(cleaned);
    if (decoded is! Map) throw const FormatException('ملف غير صالح');
    final map = Map<String, Object?>.from(decoded);
    final count = await ref.read(repoProvider).importAll(map);
    bump(ref);
    return count;
  }

  Future<String> _readPickedFile(PlatformFile picked) async {
    // بعض مزوّدي Android يعيدون bytes أو readStream فقط بدل path محلي.
    final bytes = picked.bytes;
    if (bytes != null) return utf8.decode(bytes);
    final stream = picked.readStream;
    if (stream != null) {
      final all = <int>[];
      await for (final chunk in stream) {
        all.addAll(chunk);
      }
      return utf8.decode(all);
    }
    final path = picked.path;
    if (path == null) {
      throw const FormatException(
        'لم يعُد مزوّد الملفات محتوى قابلًا للقراءة.',
      );
    }
    return File(path).readAsString();
  }

  Future<void> _restore() async {
    final ok = await confirmDialog(
      context,
      title: '⚠️ استعادة نسخة احتياطية',
      message:
          'سيتم استبدال كل البيانات الحالية بمحتوى الملف. لا يمكن التراجع.\n\n'
          'يقبل التطبيق ملفات نكسورا (‎.nexora‎) وملفات JSON من مدير الملفات '
          'ومزوّدي التخزين السحابي. الاستعادة ذرّية: إذا كان أي صف أو مرجع '
          'غير صالح فستظهر رسالة خطأ ولن تُطبّق استعادة جزئية.\n\nهل تريد المتابعة؟',
      confirmText: 'استعادة',
      danger: true,
    );
    if (!ok) return;

    setState(() => _busy = true);
    try {
      // withData مهم لأن بعض مزوّدي Android يعيدون content URI بلا path محلي.
      final res = await FilePicker.platform.pickFiles(
        type: FileType.any,
        withData: true,
      );
      if (res == null) return;
      final raw = await _readPickedFile(res.files.single);
      final n = await _importJson(raw);
      if (mounted) showSnack(context, 'تمت الاستعادة ✅ ($n سجلًا)');
    } catch (e) {
      if (mounted) showSnack(context, 'تعذّرت الاستعادة: $e', error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<GoogleAccountInfo?> _ensureGoogleAccount() async {
    var account = _googleAccount ?? await _drive.restoreSession();
    account ??= await _drive.signIn();
    if (account != null) {
      GoogleDriveBackupInfo? backup;
      String? cloudError;
      try {
        backup = await _drive.latestBackup();
      } catch (e) {
        // نجاح الربط لا يعتمد على وجود نسخة سابقة، لكن نعرض فشل فحصها.
        cloudError = '$e';
      }
      if (mounted) {
        setState(() {
          _googleAccount = account;
          _cloudBackup = backup;
          _cloudError = cloudError;
        });
      }
    }
    return account;
  }

  Future<void> _connectGoogle() async {
    setState(() => _busy = true);
    try {
      final account = await _ensureGoogleAccount();
      if (mounted) {
        showSnack(
          context,
          account == null
              ? 'أُلغي ربط حساب Google.'
              : 'تم ربط ${account.email} ✅',
        );
      }
    } catch (e) {
      if (mounted) showSnack(context, 'تعذّر ربط Google: $e', error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _uploadToGoogle() async {
    setState(() => _busy = true);
    try {
      final account = await _ensureGoogleAccount();
      if (account == null) return;
      final file = await _createBackupFile();
      final backup = await _drive.uploadLatest(file);
      if (mounted) {
        setState(() {
          _cloudBackup = backup;
          _cloudError = null;
        });
        showSnack(context, 'تم تحديث نسخة Google Drive ✅');
      }
    } catch (e) {
      if (mounted) showSnack(context, 'تعذّر رفع النسخة: $e', error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _restoreFromGoogle() async {
    final ok = await confirmDialog(
      context,
      title: '⚠️ استعادة من Google Drive',
      message:
          'سيتم تنزيل آخر نسخة من الحساب المرتبط واستبدال بيانات هذا الجهاز. '
          'العملية ذرّية ولن تُطبّق إذا كان الملف غير صالح.\n\nهل تريد المتابعة؟',
      confirmText: 'تنزيل واستعادة',
      danger: true,
    );
    if (!ok) return;

    setState(() => _busy = true);
    try {
      final account = await _ensureGoogleAccount();
      if (account == null) return;
      final dir = await getTemporaryDirectory();
      final file = File(
        '${dir.path}/nexora-drive-${DateTime.now().millisecondsSinceEpoch}.nexora',
      );
      await _drive.downloadLatestTo(file);
      final n = await _importJson(await file.readAsString());
      if (mounted)
        showSnack(context, 'تم تنزيل النسخة واستعادتها ✅ ($n سجلًا)');
    } catch (e) {
      if (mounted)
        showSnack(context, 'تعذّرت الاستعادة من Google: $e', error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _signOutGoogle() async {
    setState(() => _busy = true);
    try {
      await _drive.signOut();
      if (mounted) {
        setState(() {
          _googleAccount = null;
          _cloudBackup = null;
          _cloudError = null;
        });
        showSnack(context, 'تم تسجيل الخروج من Google.');
      }
    } catch (e) {
      if (mounted) showSnack(context, 'تعذّر تسجيل الخروج: $e', error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _relinkGoogle() async {
    final ok = await confirmDialog(
      context,
      title: 'إعادة ربط حساب Google',
      message: 'سيُفصل الحساب الحالي وتختار حساب Google آخر.',
      confirmText: 'إعادة الربط',
      danger: true,
    );
    if (!ok) return;

    setState(() => _busy = true);
    try {
      await _drive.disconnect();
      if (mounted) {
        setState(() {
          _googleAccount = null;
          _cloudBackup = null;
          _cloudError = null;
        });
      }
      final account = await _drive.signIn();
      if (account != null && mounted) {
        final backup = await _drive.latestBackup();
        setState(() {
          _googleAccount = account;
          _cloudBackup = backup;
        });
        showSnack(context, 'تمت إعادة ربط ${account.email} ✅');
      }
    } catch (e) {
      if (mounted) showSnack(context, 'تعذّرت إعادة الربط: $e', error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final counts = ref.watch(countsProvider).valueOrNull ?? {};
    final trash = ref.watch(trashProvider);

    return ListView(
      padding: const EdgeInsets.fromLTRB(14, 14, 14, 96),
      children: [
        const SectionTitle('حالة البيانات'),
        GridView.count(
          crossAxisCount: 2,
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          childAspectRatio: 2.1,
          mainAxisSpacing: 10,
          crossAxisSpacing: 10,
          children: [
            StatCard(
              title: 'الحسابات',
              value: '${counts['accounts'] ?? 0}',
              icon: Icons.people_alt_outlined,
              color: AppColors.primaryOf(context),
            ),
            StatCard(
              title: 'العمليات',
              value: '${counts['transactions'] ?? 0}',
              icon: Icons.receipt_long_outlined,
              color: AppColors.infoOf(context),
            ),
            StatCard(
              title: 'السندات',
              value: '${counts['vouchers'] ?? 0}',
              icon: Icons.receipt_outlined,
              color: AppColors.violetOf(context),
            ),
            StatCard(
              title: 'سلة المهملات',
              value: '${counts['trash'] ?? 0}',
              icon: Icons.delete_outline,
              color: AppColors.accentOf(context),
            ),
          ],
        ),
        const SizedBox(height: 20),
        const SectionTitle('النسخ الاحتياطي'),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'تُحفظ النسخة كملف واحد يحتوي كل الحسابات والعمليات والسندات '
                  'والأصناف والإعدادات، ويمكنك حفظه في هاتفك أو إرساله لنفسك.',
                  style: TextStyle(
                      fontSize: 12.5,
                      height: 1.6,
                      color: AppColors.text2Of(context)),
                ),
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  dense: true,
                  secondary: const Icon(Icons.image_outlined),
                  title: const Text('تضمين صور العمليات',
                      style: TextStyle(
                          fontSize: 13.5, fontWeight: FontWeight.w700)),
                  subtitle: const Text(
                      'يجعل الملف أكبر لكنه ينقل الإيصالات والشعار معه إلى أي هاتف',
                      style: TextStyle(fontSize: 11.5)),
                  value: _withImages,
                  onChanged: (v) => setState(() => _withImages = v),
                ),
                const SizedBox(height: 8),
                Row(
                  children: [
                    Expanded(
                      child: FilledButton.icon(
                        onPressed: _busy ? null : _backup,
                        icon: const Icon(Icons.backup_outlined),
                        label: const Text('إنشاء نسخة'),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed: _busy ? null : _restore,
                        icon: const Icon(Icons.restore_outlined),
                        label: const Text('استعادة'),
                      ),
                    ),
                  ],
                ),
                if (_busy) ...[
                  const SizedBox(height: 12),
                  const LinearProgressIndicator(),
                ],
              ],
            ),
          ),
        ),
        const SizedBox(height: 20),
        const SectionTitle('النسخ السحابي عبر Google Drive'),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'تُحفظ نسخة واحدة خاصة بالتطبيق داخل appDataFolder، ولا يطلب '
                  'التطبيق صلاحية قراءة ملفات Drive العادية. لا يتم حفظ access token '
                  'داخل Nexora؛ تُحفظ هوية الحساب فقط ويُطلب OAuth عند الحاجة.',
                  style: TextStyle(
                    fontSize: 12.5,
                    height: 1.6,
                    color: AppColors.text2Of(context),
                  ),
                ),
                const SizedBox(height: 10),
                if (_cloudLoading)
                  const ListTile(
                    contentPadding: EdgeInsets.zero,
                    leading: SizedBox(
                      width: 24,
                      height: 24,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    ),
                    title: Text('جارٍ التحقق من حساب Google…'),
                  )
                else if (_googleAccount == null) ...[
                  const ListTile(
                    contentPadding: EdgeInsets.zero,
                    leading: Icon(Icons.account_circle_outlined),
                    title: Text('لا يوجد حساب Google مرتبط'),
                    subtitle: Text(
                      'اربط حسابًا لاستخدام الرفع والاستعادة على جهاز آخر.',
                    ),
                  ),
                  SizedBox(
                    width: double.infinity,
                    child: FilledButton.icon(
                      onPressed: _busy ? null : _connectGoogle,
                      icon: const Icon(Icons.login),
                      label: const Text('ربط حساب Google'),
                    ),
                  ),
                ] else ...[
                  ListTile(
                    contentPadding: EdgeInsets.zero,
                    leading: CircleAvatar(
                      child: Text(
                        (_googleAccount!.email.isEmpty
                                ? 'G'
                                : _googleAccount!.email[0])
                            .toUpperCase(),
                      ),
                    ),
                    title: Text(
                      _googleAccount!.displayName?.trim().isNotEmpty == true
                          ? _googleAccount!.displayName!
                          : 'حساب Google مرتبط',
                      style: const TextStyle(fontWeight: FontWeight.w700),
                    ),
                    subtitle: Text(_googleAccount!.email),
                    trailing: IconButton(
                      tooltip: 'تسجيل الخروج',
                      onPressed: _busy ? null : _signOutGoogle,
                      icon: const Icon(Icons.logout),
                    ),
                  ),
                  ListTile(
                    contentPadding: EdgeInsets.zero,
                    dense: true,
                    leading: Icon(
                      Icons.cloud_done_outlined,
                      color: AppColors.primaryOf(context),
                    ),
                    title: Text(
                      _cloudBackup == null
                          ? 'لا توجد نسخة على Google Drive'
                          : 'آخر نسخة: ${Fmt.dateTime(_cloudBackup!.modifiedTime ?? DateTime.now())}',
                      style: const TextStyle(fontSize: 12.5),
                    ),
                    subtitle: _cloudBackup?.sizeLabel.isNotEmpty == true
                        ? Text(_cloudBackup!.sizeLabel)
                        : const Text('ستُنشأ النسخة عند أول رفع.'),
                  ),
                  Row(
                    children: [
                      Expanded(
                        child: FilledButton.icon(
                          onPressed: _busy ? null : _uploadToGoogle,
                          icon: const Icon(Icons.cloud_upload_outlined),
                          label: const Text('رفع / تحديث'),
                        ),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: OutlinedButton.icon(
                          onPressed: _busy ? null : _restoreFromGoogle,
                          icon: const Icon(Icons.cloud_download_outlined),
                          label: const Text('استعادة'),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 4),
                  Align(
                    alignment: AlignmentDirectional.centerStart,
                    child: TextButton.icon(
                      onPressed: _busy ? null : _relinkGoogle,
                      icon: const Icon(Icons.switch_account_outlined),
                      label: const Text('إعادة ربط حساب آخر'),
                    ),
                  ),
                ],
                if (_cloudError != null) ...[
                  const SizedBox(height: 6),
                  Text(
                    _cloudError!,
                    style: TextStyle(
                      color: AppColors.dangerOf(context),
                      fontSize: 11.5,
                    ),
                  ),
                ],
                if (_busy) ...[
                  const SizedBox(height: 10),
                  const LinearProgressIndicator(),
                ],
              ],
            ),
          ),
        ),
        const SizedBox(height: 20),
        const SectionTitle('استخدام البيانات على أكثر من هاتف'),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(children: [
                  Icon(Icons.phonelink, color: AppColors.primaryOf(context)),
                  const SizedBox(width: 8),
                  const Expanded(
                    child: Text('نقل الحساب بين الأجهزة',
                        style: TextStyle(
                            fontWeight: FontWeight.w800, fontSize: 14.5)),
                  ),
                ]),
                const SizedBox(height: 10),
                Text(
                  'التطبيق يعمل بلا إنترنت وكل البيانات محفوظة داخل جهازك، '
                  'ولا يوجد خادم يزامن الأجهزة لحظيًا. للعمل على هاتف ثانٍ:\n\n'
                  '١) أنشئ نسخة احتياطية هنا مع تضمين الصور.\n'
                  '٢) أرسل الملف إلى الهاتف الآخر (واتساب أو درايف أو كابل).\n'
                  '٣) في الهاتف الآخر: النسخ الاحتياطي ← استعادة، واختر الملف.\n\n'
                  'ملاحظة مهمة: الاستعادة تستبدل بيانات الجهاز الثاني بالكامل، '
                  'لذا استخدم جهازًا واحدًا للإدخال في الوقت نفسه وانقل النسخة '
                  'بعد انتهاء العمل، وإلا ضاعت إدخالات الجهاز الآخر. '
                  'المزامنة اللحظية بين جهازين تحتاج خادمًا واشتراكًا، وهي غير '
                  'مفعّلة في هذا الإصدار.',
                  style: TextStyle(
                      fontSize: 12.5,
                      height: 1.75,
                      color: AppColors.text2Of(context)),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 20),
        SectionTitle(
          'سلة المهملات',
          actionLabel: 'تفريغ',
          onAction: () async {
            final ok = await confirmDialog(
              context,
              title: 'تفريغ سلة المهملات',
              message: 'سيُحذف كل ما بداخلها نهائيًا.',
              danger: true,
            );
            if (ok) {
              await ref.read(repoProvider).emptyTrash();
              bump(ref);
            }
          },
        ),
        trash.when(
          loading: () => const Padding(
            padding: EdgeInsets.all(20),
            child: Center(child: CircularProgressIndicator()),
          ),
          error: (e, _) => Text('$e'),
          data: (items) {
            if (items.isEmpty) {
              return const EmptyState(
                icon: Icons.delete_outline,
                title: 'السلة فارغة',
                message: 'كل ما تحذفه يُحفظ هنا مؤقتًا ويمكن استرجاعه.',
              );
            }
            return Column(
              children: items.map((t) {
                final created = DateTime.tryParse(
                    (t['created_at'] ?? '') as String? ?? '');
                return Card(
                  margin: const EdgeInsets.only(bottom: 8),
                  child: ListTile(
                    leading: Icon(Icons.restore_from_trash_outlined,
                        color: AppColors.accentOf(context)),
                    title: Text('${t['label'] ?? t['store']}',
                        style: const TextStyle(
                            fontWeight: FontWeight.w700, fontSize: 14)),
                    subtitle: Text(
                      created == null ? '' : Fmt.dateTime(created),
                      style: const TextStyle(fontSize: 11.5),
                    ),
                    trailing: TextButton(
                      onPressed: () async {
                        await ref
                            .read(repoProvider)
                            .restoreFromTrash(t['id'] as int);
                        bump(ref);
                        if (context.mounted) {
                          showSnack(context, 'تم الاسترجاع ✅');
                        }
                      },
                      child: const Text('استرجاع'),
                    ),
                  ),
                );
              }).toList(),
            );
          },
        ),
      ],
    );
  }
}

/// سجل النشاط — نقل شاشة `activity.js`.
class ActivityScreen extends ConsumerWidget {
  const ActivityScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final acts = ref.watch(activityProvider);

    return acts.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, _) => EmptyState(
        icon: Icons.error_outline,
        title: 'تعذّر تحميل السجل',
        message: '$e',
      ),
      data: (items) {
        if (items.isEmpty) {
          return const EmptyState(
            icon: Icons.history,
            title: 'لا نشاط بعد',
            message: 'كل إضافة أو تعديل أو حذف سيظهر هنا.',
          );
        }
        return ListView(
          padding: const EdgeInsets.fromLTRB(14, 12, 14, 96),
          children: [
            SectionTitle(
              'آخر التغييرات',
              actionLabel: 'مسح السجل',
              onAction: () async {
                final ok = await confirmDialog(
                  context,
                  title: 'مسح سجل النشاط',
                  message: 'سيُمسح السجل بالكامل.',
                  danger: true,
                );
                if (ok) {
                  await ref.read(repoProvider).clearActivity();
                  bump(ref);
                }
              },
            ),
            for (final a in items)
              Card(
                margin: const EdgeInsets.only(bottom: 8),
                child: Padding(
                  padding: const EdgeInsets.all(12),
                  child: Row(
                    children: [
                      Container(
                        width: 8,
                        height: 8,
                        decoration: BoxDecoration(
                          color: AppColors.primaryOf(context),
                          shape: BoxShape.circle,
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Text('${a['text']}',
                            style: const TextStyle(
                                fontSize: 13.5, fontWeight: FontWeight.w600)),
                      ),
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.end,
                        children: [
                          Text('${a['user_name'] ?? ''}',
                              style: TextStyle(
                                  fontSize: 11,
                                  color: AppColors.text3Of(context))),
                          Text(
                            Fmt.relative(
                                DateTime.tryParse(
                                        (a['created_at'] ?? '') as String) ??
                                    DateTime.now()),
                            style: TextStyle(
                                fontSize: 10.5,
                                color: AppColors.text3Of(context)),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
          ],
        );
      },
    );
  }
}
