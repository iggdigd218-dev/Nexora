import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:share_plus/share_plus.dart';

import '../core/accounting.dart';
import '../core/format.dart';
import '../core/models.dart';
import '../core/receipt_image.dart';
import '../core/theme.dart';
import '../core/whatsapp.dart';
import '../data/providers.dart';
import '../data/repository.dart';
import 'widgets.dart';

String _quantity(double value) =>
    value == value.roundToDouble() ? Fmt.money(value) : Fmt.money(value, 2);

/// توليد صورة إيصال العملية وإرسالها عبر واتساب.
///
/// المسار كاملًا بلا نافذة مشاركة: تُولَّد الصورة، تُحفظ في العملية، ثم
/// تُفتح محادثة العميل مباشرة ومعها الصورة والنص.
class TxShare {
  /// يولّد الصورة ويحفظ مسارها في العملية، ويعيد المسار.
  static Future<String> generate({
    required Repo repo,
    required Tx tx,
    required Account? account,
  }) async {
    final settings = await repo.settings();
    final currencies = await repo.currencies();
    final items = tx.id == null
        ? const <InvoiceLine>[]
        : await repo.transactionItems(tx.id!);
    final cur = currencies.firstWhere(
      (c) => c.code == tx.currency,
      orElse: () => kDefaultCurrencies.first,
    );
    double? after;
    if (account != null) {
      try {
        after = await repo.balanceOf(account);
      } catch (_) {
        after = null;
      }
    }

    final path = await buildReceiptImage(ReceiptData.fromTx(
      tx: tx,
      account: account,
      currency: cur,
      balanceAfter: after,
      settings: settings,
      items: items,
    ));

    if (tx.id != null) {
      await repo.saveTx(tx.copyWith(image: path));
    }
    return path;
  }

  /// نص الرسالة المرافقة للصورة.
  static Future<String> caption({
    required Repo repo,
    required Tx tx,
    required Account? account,
  }) async {
    final st = await repo.settings();
    final org = (st['businessName'] ?? '').trim();
    final currencies = await repo.currencies();
    final cur = currencies.firstWhere(
      (c) => c.code == tx.currency,
      orElse: () => kDefaultCurrencies.first,
    );
    final items = tx.id == null
        ? const <InvoiceLine>[]
        : await repo.transactionItems(tx.id!);
    final lines = <String>[
      if (org.isNotEmpty) '*$org*',
      tx.type == OpType.debit && items.isNotEmpty
          ? '🧾 فاتورة مبيع آجل'
          : '${tx.type.icon} ${tx.type.label}',
      'الحساب: ${account?.name ?? '—'}',
      'المبلغ المسجل: ${Fmt.money(tx.amount, cur.decimal)} ${cur.symbol}',
      'التاريخ: ${Fmt.date(tx.date)}',
      if (tx.description.trim().isNotEmpty) 'البيان: ${tx.description.trim()}',
      if (tx.reference.trim().isNotEmpty) 'المرجع: ${tx.reference.trim()}',
    ];
    if (items.isNotEmpty) {
      lines.add('تفاصيل المشتريات:');
      for (var i = 0; i < items.length; i++) {
        final line = items[i];
        lines.add(
          '${i + 1}. ${line.name} — ${_quantity(line.quantity)} ${line.unit} × '
          '${Fmt.money(line.unitPrice, cur.decimal)} ${cur.symbol} = '
          '${Fmt.money(line.total, cur.decimal)} ${cur.symbol}',
        );
      }
      final total = items.fold<double>(0, (sum, line) => sum + line.total);
      lines.add(
          'إجمالي المشتريات: ${Fmt.money(total, cur.decimal)} ${cur.symbol}');
    }
    final footer = (st['voucherFooter'] ?? '').trim();
    if (footer.isNotEmpty) lines.add(footer);
    return lines.join('\n');
  }

  /// المسار الكامل: توليد + حفظ + فتح واتساب على رقم العميل.
  ///
  /// يعمل نفسه للعملية الجديدة ولإعادة الإرسال لعملية قديمة.
  static Future<void> sendNow(
    BuildContext context,
    WidgetRef ref, {
    required Tx tx,
    Account? account,
    bool silentIfNoPhone = false,
  }) async {
    final repo = ref.read(repoProvider);
    final acc = account ??
        (tx.accountId == null ? null : await repo.account(tx.accountId!));

    final phone = _phoneOf(acc);
    if (phone.isEmpty) {
      if (!silentIfNoPhone && context.mounted) {
        showSnack(context, 'لا يوجد رقم واتساب لهذا الحساب', error: true);
      }
      return;
    }

    if (context.mounted) {
      showSnack(context, 'جارٍ تجهيز الإيصال وفتح واتساب…');
    }

    late final List<InvoiceLine> itemLines;
    late final Map<String, String> currentSettings;
    try {
      itemLines = tx.id == null
          ? const <InvoiceLine>[]
          : await repo.transactionItems(tx.id!);
      currentSettings = await repo.settings();
    } catch (e) {
      if (context.mounted) {
        showSnack(context, 'تعذّر تحميل بيانات السند: $e', error: true);
      }
      return;
    }
    final hasLogo = (currentSettings['logo'] ?? '').trim().isNotEmpty;
    final needsFreshReceipt =
        tx.type == OpType.debit || itemLines.isNotEmpty || hasLogo;

    String path;
    try {
      // نعيد توليد إيصال المبلغ له دائمًا، وكذلك أي إيصال يحتوي أصنافًا أو
      // شعارًا مفعّلًا، حتى لا نعيد إرسال صورة قديمة بعد تعديل العملية.
      if (needsFreshReceipt) {
        path = await generate(repo: repo, tx: tx, account: acc);
      } else if (tx.image.isNotEmpty && File(tx.image).existsSync()) {
        path = tx.image;
      } else {
        path = await generate(repo: repo, tx: tx, account: acc);
      }
    } catch (_) {
      // لا نرسل نصًا مجردًا في عملية البيع؛ فالسند المصوّر جزء من الإشعار.
      if (context.mounted) {
        showSnack(context, 'تعذّر تجهيز صورة السند، لم يتم إرسال إشعار نصي فقط.',
            error: true);
      }
      return;
    }

    if (path.isEmpty || !File(path).existsSync()) {
      if (context.mounted) {
        showSnack(context, 'تعذّر العثور على صورة السند، لم يتم إرسال النص وحده.',
            error: true);
      }
      return;
    }

    late final String text;
    late final WaResult res;
    try {
      text = await caption(repo: repo, tx: tx, account: acc);
      res = await WhatsApp.send(
        phone: phone,
        text: text,
        imagePath: path,
      );
    } catch (e) {
      if (context.mounted) {
        showSnack(context, 'تعذّر إرسال السند بالصورة والنص: $e',
            error: true);
      }
      return;
    }

    bump(ref);
    if (res == WaResult.imageFailed || res == WaResult.error) {
      // احتياط: افتح نافذة المشاركة القياسية مع الصورة والنص معًا إذا
      // رفض إصدار واتساب المثبّت الإرسال المباشر إلى رقم محدد.
      final shared = await _shareImageWithText(path, text);
      if (context.mounted) {
        showSnack(
          context,
          shared
              ? 'تم فتح مشاركة السند بالصورة والنص.'
              : WhatsApp.messageFor(res),
          error: !shared,
        );
      }
    } else if (context.mounted && res != WaResult.ok) {
      showSnack(context, WhatsApp.messageFor(res), error: true);
    }
  }

  /// مشاركة احتياطية تحفظ الصورة والنص معًا عبر نافذة مشاركة أندرويد.
  /// تُستخدم فقط إذا رفض إصدار واتساب الإرسال المباشر.
  static Future<bool> _shareImageWithText(String path, String text) async {
    try {
      await Share.shareXFiles(
        [XFile(path)],
        text: text,
        subject: 'سند العملية — إدارة البيانات',
      );
      return true;
    } catch (_) {
      return false;
    }
  }

  static String _phoneOf(Account? a) {
    if (a == null) return '';
    final w = a.whatsapp.trim();
    return w.isNotEmpty ? w : a.phone.trim();
  }
}

/// معاينة صورة الإيصال مع أزرار الإرسال وإعادة التوليد.
Future<void> showReceiptPreview(
  BuildContext context,
  WidgetRef ref, {
  required Tx tx,
  Account? account,
}) async {
  final repo = ref.read(repoProvider);
  final acc = account ??
      (tx.accountId == null ? null : await repo.account(tx.accountId!));
  var path = tx.image;
  final itemLines = tx.id == null
      ? const <InvoiceLine>[]
      : await repo.transactionItems(tx.id!);
  final currentSettings = await repo.settings();
  final hasLogo = (currentSettings['logo'] ?? '').trim().isNotEmpty;
  final needsFreshReceipt =
      tx.type == OpType.debit || itemLines.isNotEmpty || hasLogo;
  try {
    if (path.isEmpty || !File(path).existsSync() || needsFreshReceipt) {
      path = await TxShare.generate(repo: repo, tx: tx, account: acc);
    }
  } catch (e) {
    if (context.mounted) {
      showSnack(context, 'تعذّر تجهيز صورة الإيصال: $e', error: true);
    }
    return;
  }
  if (!context.mounted) return;

  await showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    builder: (_) => DraggableScrollableSheet(
      initialChildSize: .85,
      expand: false,
      builder: (ctx, controller) => Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 14, 8, 6),
            child: Row(children: [
              Icon(Icons.image_outlined, color: AppColors.primaryOf(ctx)),
              const SizedBox(width: 8),
              Text('إيصال العملية',
                  style: Theme.of(ctx).textTheme.titleMedium),
              const Spacer(),
              IconButton(
                  onPressed: () => Navigator.pop(ctx),
                  icon: const Icon(Icons.close)),
            ]),
          ),
          Expanded(
            child: SingleChildScrollView(
              controller: controller,
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: ClipRRect(
                borderRadius: BorderRadius.circular(16),
                child: Image.file(File(path)),
              ),
            ),
          ),
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.all(14),
              child: Row(children: [
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: () async {
                      Navigator.pop(ctx);
                      try {
                        await TxShare.generate(
                            repo: repo, tx: tx, account: acc);
                        bump(ref);
                        if (context.mounted) {
                          showSnack(context, 'أُعيد توليد الصورة');
                        }
                      } catch (e) {
                        if (context.mounted) {
                          showSnack(context, 'تعذّرت إعادة توليد الصورة: $e',
                              error: true);
                        }
                      }
                    },
                    icon: const Icon(Icons.refresh),
                    label: const Text('إعادة التوليد'),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: FilledButton.icon(
                    onPressed: () {
                      Navigator.pop(ctx);
                      TxShare.sendNow(context, ref,
                          tx: tx.copyWith(image: path), account: acc);
                    },
                    icon: const Icon(Icons.send),
                    label: const Text('إرسال واتساب'),
                  ),
                ),
              ]),
            ),
          ),
        ],
      ),
    ),
  );
}
