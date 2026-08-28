import 'package:flutter/material.dart';
import 'package:math_expressions/math_expressions.dart';

import '../core/format.dart';
import '../core/theme.dart';

/// آلة حاسبة سريعة — تعيد الإجمالي عند الضغط على «موافق».
///
/// تُفتح من الأيقونة المجاورة لمربع المبلغ، ويُنقل الناتج إليه مباشرة.
Future<double?> openCalculator(
  BuildContext context, {
  String initial = '',
}) =>
    showModalBottomSheet<double>(
      context: context,
      isScrollControlled: true,
      builder: (_) => _Calculator(initial: initial),
    );

class _Calculator extends StatefulWidget {
  final String initial;
  const _Calculator({required this.initial});

  @override
  State<_Calculator> createState() => _CalculatorState();
}

class _CalculatorState extends State<_Calculator> {
  String _expr = '';
  String _preview = '';

  @override
  void initState() {
    super.initState();
    // نبدأ بالمبلغ المكتوب مسبقًا إن كان رقمًا صالحًا.
    final n = Fmt.parseAmount(widget.initial);
    if (n != null && n != 0) _expr = _trim(n);
    _recalc();
  }

  static String _trim(double v) =>
      v == v.roundToDouble() ? v.toInt().toString() : v.toString();

  void _tap(String k) {
    setState(() {
      switch (k) {
        case 'C':
          _expr = '';
        case '⌫':
          if (_expr.isNotEmpty) {
            _expr = _expr.substring(0, _expr.length - 1);
          }
        case '=':
          final v = _eval(_expr);
          if (v != null) _expr = _trim(v);
        default:
          _expr += k;
      }
      _recalc();
    });
  }

  void _recalc() {
    final v = _eval(_expr);
    _preview = v == null ? '' : Fmt.money(v, v == v.roundToDouble() ? 0 : 2);
  }

  /// يقيّم التعبير؛ يعيد null إن كان ناقصًا أو غير صالح.
  double? _eval(String raw) {
    if (raw.trim().isEmpty) return null;
    try {
      final clean = raw
          .replaceAll('×', '*')
          .replaceAll('÷', '/')
          .replaceAll('−', '-')
          .replaceAll(',', '');
      final exp = Parser().parse(clean);
      final v = exp.evaluate(EvaluationType.REAL, ContextModel());
      if (v is! double || v.isNaN || v.isInfinite) return null;
      return v;
    } catch (_) {
      return null;
    }
  }

  @override
  Widget build(BuildContext context) {
    const keys = [
      ['C', '⌫', '%', '÷'],
      ['7', '8', '9', '×'],
      ['4', '5', '6', '−'],
      ['1', '2', '3', '+'],
      ['00', '0', '.', '='],
    ];

    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Row(
              children: [
                Icon(Icons.calculate_outlined,
                    color: AppColors.primaryOf(context)),
                const SizedBox(width: 8),
                Text('آلة حاسبة سريعة',
                    style: Theme.of(context).textTheme.titleMedium),
                const Spacer(),
                IconButton(
                  onPressed: () => Navigator.pop(context),
                  icon: const Icon(Icons.close),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(18),
              decoration: BoxDecoration(
                color: AppColors.surface2Of(context),
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: AppColors.borderOf(context)),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Directionality(
                    textDirection: TextDirection.ltr,
                    child: Text(
                      _expr.isEmpty ? '0' : _expr,
                      style: const TextStyle(
                          fontSize: 30, fontWeight: FontWeight.w800),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  if (_preview.isNotEmpty) ...[
                    const SizedBox(height: 6),
                    Text('= $_preview',
                        style: TextStyle(
                            fontSize: 17,
                            fontWeight: FontWeight.w700,
                            color: AppColors.primaryOf(context))),
                  ],
                ],
              ),
            ),
            const SizedBox(height: 12),
            for (final row in keys)
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Row(
                  children: row.map((k) {
                    final isOp = '÷×−+='.contains(k);
                    final isClear = k == 'C' || k == '⌫';
                    return Expanded(
                      child: Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 4),
                        child: SizedBox(
                          height: 56,
                          child: Material(
                            color: isOp
                                ? AppColors.primarySoftOf(context)
                                : (isClear
                                    ? AppColors.dangerSoftOf(context)
                                    : AppColors.surface2Of(context)),
                            borderRadius: BorderRadius.circular(14),
                            child: InkWell(
                              borderRadius: BorderRadius.circular(14),
                              onTap: () => _tap(k),
                              child: Center(
                                child: Text(
                                  k,
                                  style: TextStyle(
                                    fontSize: 21,
                                    fontWeight: FontWeight.w800,
                                    color: isOp
                                        ? AppColors.primaryOf(context)
                                        : (isClear
                                            ? AppColors.dangerOf(context)
                                            : AppColors.textOf(context)),
                                  ),
                                ),
                              ),
                            ),
                          ),
                        ),
                      ),
                    );
                  }).toList(),
                ),
              ),
            const SizedBox(height: 4),
            SizedBox(
              width: double.infinity,
              child: FilledButton.icon(
                onPressed: () {
                  final v = _eval(_expr);
                  if (v == null) {
                    Navigator.pop(context);
                    return;
                  }
                  Navigator.pop(context, v);
                },
                icon: const Icon(Icons.check),
                label: const Text('موافق — نقل المبلغ'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
