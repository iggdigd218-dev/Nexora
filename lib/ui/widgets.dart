import 'package:flutter/material.dart';

import '../core/accounting.dart';
import '../core/format.dart';
import '../core/theme.dart';

/// شارة ملوّنة صغيرة.
class Pill extends StatelessWidget {
  final String text;
  final Color color;
  final IconData? icon;
  const Pill(this.text, {super.key, this.color = AppColors.teal, this.icon});

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
        decoration: BoxDecoration(
          color: color.withOpacity(0.12),
          borderRadius: BorderRadius.circular(8),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (icon != null) ...[
              Icon(icon, size: 13, color: color),
              const SizedBox(width: 4),
            ],
            Text(text,
                style: TextStyle(
                    fontSize: 11.5, fontWeight: FontWeight.w700, color: color)),
          ],
        ),
      );
}

/// عرض مبلغ الرصيد مع طبيعته (له/عليه) واللون المناسب.
///
/// الاتفاقية: موجب = «عليه» (مستحق لنا)، سالب = «له» (مستحق منا).
class BalanceText extends StatelessWidget {
  final double value;
  final CurrencyDef currency;
  final bool hidden;
  final double size;
  final bool showNature;

  const BalanceText({
    super.key,
    required this.value,
    required this.currency,
    this.hidden = false,
    this.size = 16,
    this.showNature = true,
  });

  @override
  Widget build(BuildContext context) {
    final zero = value.abs() < 0.005;
    final color = zero
        ? Theme.of(context).hintColor
        : (value > 0 ? AppColors.green : AppColors.red);
    final nature = zero ? 'متساوٍ' : (value > 0 ? 'عليه' : 'له');

    if (hidden) {
      return Text('••••••',
          style: TextStyle(
              fontSize: size, fontWeight: FontWeight.w800, color: color));
    }
    return Row(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.baseline,
      textBaseline: TextBaseline.alphabetic,
      children: [
        Text(
          Fmt.money(value.abs(), currency.decimal),
          style: TextStyle(
              fontSize: size, fontWeight: FontWeight.w800, color: color),
        ),
        const SizedBox(width: 4),
        Text(currency.symbol,
            style: TextStyle(
                fontSize: size * 0.68,
                fontWeight: FontWeight.w600,
                color: color)),
        if (showNature && !zero) ...[
          const SizedBox(width: 6),
          Pill(nature, color: color),
        ],
      ],
    );
  }
}

/// بطاقة إحصائية في لوحة التحكم.
class StatCard extends StatelessWidget {
  final String title;
  final String value;
  final String? sub;
  final IconData icon;
  final Color color;
  final VoidCallback? onTap;

  const StatCard({
    super.key,
    required this.title,
    required this.value,
    this.sub,
    required this.icon,
    this.color = AppColors.teal,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) => Card(
        child: InkWell(
          borderRadius: BorderRadius.circular(16),
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.all(8),
                      decoration: BoxDecoration(
                        color: color.withOpacity(0.12),
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: Icon(icon, size: 21, color: color),
                    ),
                    const SizedBox(width: 9),
                    Expanded(
                      child: Text(title,
                          style: TextStyle(
                              fontSize: 14.5,
                              fontWeight: FontWeight.w700,
                              color: Theme.of(context).hintColor)),
                    ),
                  ],
                ),
                const SizedBox(height: 11),
                FittedBox(
                  fit: BoxFit.scaleDown,
                  alignment: Alignment.centerRight,
                  child: Text(value,
                      style: TextStyle(
                          fontSize: 26,
                          fontWeight: FontWeight.w800,
                          color: color)),
                ),
                if (sub != null) ...[
                  const SizedBox(height: 3),
                  Text(sub!,
                      style: TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                          color: Theme.of(context).hintColor)),
                ],
              ],
            ),
          ),
        ),
      );
}

/// حالة فارغة.
class EmptyState extends StatelessWidget {
  final IconData icon;
  final String title;
  final String? message;
  final Widget? action;

  const EmptyState({
    super.key,
    required this.icon,
    required this.title,
    this.message,
    this.action,
  });

  @override
  Widget build(BuildContext context) => Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(icon, size: 54, color: Theme.of(context).disabledColor),
              const SizedBox(height: 14),
              Text(title,
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                      fontSize: 15.5, fontWeight: FontWeight.w700)),
              if (message != null) ...[
                const SizedBox(height: 6),
                Text(message!,
                    textAlign: TextAlign.center,
                    style: TextStyle(
                        fontSize: 13, color: Theme.of(context).hintColor)),
              ],
              if (action != null) ...[
                const SizedBox(height: 18),
                action!,
              ],
            ],
          ),
        ),
      );
}

/// عنوان قسم مع إجراء اختياري.
class SectionTitle extends StatelessWidget {
  final String title;
  final String? actionLabel;
  final VoidCallback? onAction;

  const SectionTitle(this.title,
      {super.key, this.actionLabel, this.onAction});

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.fromLTRB(4, 6, 4, 10),
        child: Row(
          children: [
            Text(title,
                style: const TextStyle(
                    fontSize: 15, fontWeight: FontWeight.w800)),
            const Spacer(),
            if (actionLabel != null)
              TextButton(
                onPressed: onAction,
                style: TextButton.styleFrom(
                    padding: const EdgeInsets.symmetric(horizontal: 8),
                    minimumSize: Size.zero,
                    tapTargetSize: MaterialTapTargetSize.shrinkWrap),
                child: Text(actionLabel!,
                    style: const TextStyle(fontSize: 12.5)),
              ),
          ],
        ),
      );
}

Future<bool> confirmDialog(
  BuildContext context, {
  required String title,
  required String message,
  String confirmText = 'تأكيد',
  bool danger = false,
}) async {
  final r = await showDialog<bool>(
    context: context,
    builder: (c) => AlertDialog(
      title: Text(title),
      content: Text(message, style: const TextStyle(height: 1.6)),
      actions: [
        TextButton(
            onPressed: () => Navigator.pop(c, false),
            child: const Text('إلغاء')),
        FilledButton(
          onPressed: () => Navigator.pop(c, true),
          style: danger
              ? FilledButton.styleFrom(backgroundColor: AppColors.red)
              : null,
          child: Text(confirmText),
        ),
      ],
    ),
  );
  return r ?? false;
}

void showSnack(BuildContext context, String message, {bool error = false}) {
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(
      content: Text(message),
      backgroundColor: error ? AppColors.red : null,
      duration: const Duration(seconds: 3),
    ));
}
