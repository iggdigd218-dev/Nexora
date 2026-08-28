import 'package:flutter/material.dart';
import 'package:flutter_contacts/flutter_contacts.dart';

import '../core/theme.dart';
import 'widgets.dart';

/// جهة اتصال مبسّطة يعيدها المنتقي.
class PickedContact {
  final String name;
  final String phone;
  const PickedContact(this.name, this.phone);
}

/// يفتح قائمة جهات الاتصال مع بحث، ويعيد الاسم والرقم.
///
/// يطلب الإذن أولًا؛ إن رُفض يعرض رسالة واضحة بدل الانهيار.
Future<PickedContact?> pickContact(BuildContext context) async {
  final granted = await FlutterContacts.requestPermission(readonly: true);
  if (!context.mounted) return null;
  if (!granted) {
    showSnack(context, 'لم يُمنح إذن الوصول إلى جهات الاتصال');
    return null;
  }
  return showModalBottomSheet<PickedContact>(
    context: context,
    isScrollControlled: true,
    builder: (_) => const _ContactSheet(),
  );
}

class _ContactSheet extends StatefulWidget {
  const _ContactSheet();

  @override
  State<_ContactSheet> createState() => _ContactSheetState();
}

class _ContactSheetState extends State<_ContactSheet> {
  List<PickedContact> _all = const [];
  String _q = '';
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final raw = await FlutterContacts.getContacts(withProperties: true);
      final out = <PickedContact>[];
      for (final c in raw) {
        if (c.phones.isEmpty) continue;
        final name = c.displayName.trim();
        out.add(PickedContact(
          name.isEmpty ? c.phones.first.number : name,
          c.phones.first.number.trim(),
        ));
      }
      out.sort((a, b) => a.name.compareTo(b.name));
      if (mounted) setState(() { _all = out; _loading = false; });
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final q = _q.trim();
    final list = q.isEmpty
        ? _all
        : _all
            .where((c) => c.name.contains(q) || c.phone.contains(q))
            .toList();

    return DraggableScrollableSheet(
      initialChildSize: .85,
      minChildSize: .5,
      maxChildSize: .95,
      expand: false,
      builder: (_, controller) => Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 14, 8, 6),
            child: Row(
              children: [
                Icon(Icons.contacts_outlined,
                    color: AppColors.primaryOf(context)),
                const SizedBox(width: 8),
                Text('اختيار من جهات الاتصال',
                    style: Theme.of(context).textTheme.titleMedium),
                const Spacer(),
                IconButton(
                  onPressed: () => Navigator.pop(context),
                  icon: const Icon(Icons.close),
                ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: TextField(
              autofocus: false,
              decoration: const InputDecoration(
                hintText: 'ابحث بالاسم أو الرقم',
                prefixIcon: Icon(Icons.search),
              ),
              onChanged: (v) => setState(() => _q = v),
            ),
          ),
          const SizedBox(height: 8),
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator())
                : list.isEmpty
                    ? const EmptyState(
                        icon: Icons.person_off_outlined,
                        title: 'لا توجد جهات اتصال',
                        message: 'تأكد من وجود أسماء بأرقام هواتف في جهازك',
                      )
                    : ListView.builder(
                        controller: controller,
                        itemCount: list.length,
                        itemBuilder: (_, i) {
                          final c = list[i];
                          return ListTile(
                            leading: CircleAvatar(
                              backgroundColor:
                                  AppColors.primarySoftOf(context),
                              child: Text(
                                c.name.characters.first,
                                style: TextStyle(
                                    color: AppColors.primaryOf(context),
                                    fontWeight: FontWeight.w800),
                              ),
                            ),
                            title: Text(c.name),
                            subtitle: Directionality(
                              textDirection: TextDirection.ltr,
                              child: Align(
                                alignment: Alignment.centerRight,
                                child: Text(c.phone),
                              ),
                            ),
                            onTap: () => Navigator.pop(context, c),
                          );
                        },
                      ),
          ),
        ],
      ),
    );
  }
}
