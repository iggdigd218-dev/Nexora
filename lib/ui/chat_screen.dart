import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../core/format.dart';
import '../core/models.dart';
import '../core/theme.dart';
import '../data/providers.dart';
import 'widgets.dart';

/// الدردشة — محادثة لكل حساب، مع إرسال كشف الحساب ومشاركة عبر واتساب.
/// نقل شاشة `chat.js`.
class ChatScreen extends ConsumerWidget {
  const ChatScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final accounts = ref.watch(accountsProvider);

    return accounts.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, _) => EmptyState(
        icon: Icons.error_outline,
        title: 'تعذّر تحميل المحادثات',
        message: '$e',
      ),
      data: (list) {
        if (list.isEmpty) {
          return const EmptyState(
            icon: Icons.forum_outlined,
            title: 'لا توجد محادثات',
            message: 'أضف حسابًا لتبدأ محادثة معه.',
          );
        }
        return ListView.separated(
          padding: const EdgeInsets.fromLTRB(14, 12, 14, 96),
          itemCount: list.length,
          separatorBuilder: (_, __) => const SizedBox(height: 8),
          itemBuilder: (context, i) {
            final a = list[i].account;
            return Card(
              child: ListTile(
                leading: CircleAvatar(
                  backgroundColor: AppColors.primarySoftOf(context),
                  child: Text(a.kind.icon),
                ),
                title: Text(a.name,
                    style: const TextStyle(fontWeight: FontWeight.w700)),
                subtitle: Text(
                  a.contactNumber.isEmpty
                      ? a.kind.label
                      : '${a.kind.label} · ${a.contactNumber}',
                  style: const TextStyle(fontSize: 12),
                ),
                trailing: const Icon(Icons.chevron_left),
                onTap: () => Navigator.push(
                  context,
                  MaterialPageRoute(
                      builder: (_) => ChatThreadScreen(account: a)),
                ),
              ),
            );
          },
        );
      },
    );
  }
}

class ChatThreadScreen extends ConsumerStatefulWidget {
  final Account account;
  const ChatThreadScreen({super.key, required this.account});

  @override
  ConsumerState<ChatThreadScreen> createState() => _ChatThreadScreenState();
}

class _ChatThreadScreenState extends ConsumerState<ChatThreadScreen> {
  final _input = TextEditingController();
  final _scroll = ScrollController();
  int? _convId;

  @override
  void initState() {
    super.initState();
    _open();
  }

  Future<void> _open() async {
    final id =
        await ref.read(repoProvider).conversationFor(widget.account);
    if (mounted) setState(() => _convId = id);
  }

  @override
  void dispose() {
    _input.dispose();
    _scroll.dispose();
    super.dispose();
  }

  Future<void> _send(String body, {String kind = 'text'}) async {
    if (body.trim().isEmpty || _convId == null) return;
    await ref.read(repoProvider).sendMessage(ChatMessage(
          conversationId: _convId!,
          sender: 'me',
          body: body.trim(),
          kind: kind,
          createdAt: DateTime.now(),
        ));
    _input.clear();
    bump(ref);
    await Future<void>.delayed(const Duration(milliseconds: 120));
    if (_scroll.hasClients) {
      _scroll.animateTo(
        _scroll.position.maxScrollExtent,
        duration: const Duration(milliseconds: 220),
        curve: Curves.easeOut,
      );
    }
  }

  /// يبني نص كشف الحساب ويرسله في المحادثة.
  Future<void> _sendStatement() async {
    final repo = ref.read(repoProvider);
    final bal = await repo.balanceOf(widget.account);
    final txs = await repo.transactions(accountId: widget.account.id);
    final label = bal > 0 ? 'عليه' : (bal < 0 ? 'له' : 'متساوٍ');
    final b = StringBuffer()
      ..writeln('📊 كشف حساب: ${widget.account.name}')
      ..writeln('الرصيد الحالي: ${Fmt.money(bal.abs())} ($label)')
      ..writeln('عدد العمليات: ${txs.length}')
      ..writeln('التاريخ: ${Fmt.date(DateTime.now())}');
    await _send(b.toString(), kind: 'statement');
  }

  Future<void> _shareWhatsApp() async {
    final number = Fmt.waNumber(widget.account.contactNumber);
    if (number.isEmpty) {
      showSnack(context, 'لا يوجد رقم واتساب لهذا الحساب', error: true);
      return;
    }
    final repo = ref.read(repoProvider);
    final bal = await repo.balanceOf(widget.account);
    final label = bal > 0 ? 'عليه' : (bal < 0 ? 'له' : 'متساوٍ');
    final text = 'مرحبًا ${widget.account.name}\n'
        'الرصيد الحالي: ${Fmt.money(bal.abs())} ($label)';
    final uri = Uri.parse(
        'https://wa.me/$number?text=${Uri.encodeComponent(text)}');
    await launchUrl(uri, mode: LaunchMode.externalApplication);
  }

  @override
  Widget build(BuildContext context) {
    final a = widget.account;

    return Scaffold(
      appBar: AppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(a.name, style: const TextStyle(fontSize: 16)),
            Text(a.kind.label,
                style: TextStyle(
                    fontSize: 11, color: AppColors.text3Of(context))),
          ],
        ),
        actions: [
          IconButton(
            tooltip: 'إرسال كشف الحساب',
            onPressed: _sendStatement,
            icon: const Icon(Icons.description_outlined),
          ),
          IconButton(
            tooltip: 'مشاركة عبر واتساب',
            onPressed: _shareWhatsApp,
            icon: const Icon(Icons.share_outlined),
          ),
        ],
      ),
      body: _convId == null
          ? const Center(child: CircularProgressIndicator())
          : Column(
              children: [
                Expanded(
                  child: ref.watch(messagesProvider(_convId!)).when(
                        loading: () =>
                            const Center(child: CircularProgressIndicator()),
                        error: (e, _) => Center(child: Text('$e')),
                        data: (msgs) {
                          if (msgs.isEmpty) {
                            return const EmptyState(
                              icon: Icons.chat_bubble_outline,
                              title: 'ابدأ المحادثة',
                              message:
                                  'اكتب رسالة أو أرسل كشف الحساب مباشرة.',
                            );
                          }
                          return ListView.builder(
                            controller: _scroll,
                            padding: const EdgeInsets.all(14),
                            itemCount: msgs.length,
                            itemBuilder: (context, i) =>
                                _Bubble(message: msgs[i]),
                          );
                        },
                      ),
                ),
                SafeArea(
                  child: Container(
                    padding: const EdgeInsets.fromLTRB(10, 8, 10, 8),
                    color: AppColors.surfaceOf(context),
                    child: Row(
                      children: [
                        Expanded(
                          child: TextField(
                            controller: _input,
                            decoration: const InputDecoration(
                              hintText: 'اكتب رسالة...',
                              isDense: true,
                            ),
                            onSubmitted: _send,
                          ),
                        ),
                        const SizedBox(width: 8),
                        IconButton.filled(
                          onPressed: () => _send(_input.text),
                          icon: const Icon(Icons.send, size: 20),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
    );
  }
}

class _Bubble extends StatelessWidget {
  final ChatMessage message;
  const _Bubble({required this.message});

  @override
  Widget build(BuildContext context) {
    final mine = message.isMine;
    final isStatement = message.kind == 'statement';

    return Align(
      alignment: mine ? Alignment.centerLeft : Alignment.centerRight,
      child: Container(
        margin: const EdgeInsets.only(bottom: 10),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        constraints: BoxConstraints(
            maxWidth: MediaQuery.of(context).size.width * .76),
        decoration: BoxDecoration(
          color: isStatement
              ? AppColors.infoSoftOf(context)
              : (mine
                  ? AppColors.primarySoftOf(context)
                  : AppColors.surface2Of(context)),
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: AppColors.borderOf(context)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (isStatement)
              Padding(
                padding: const EdgeInsets.only(bottom: 4),
                child: Pill('كشف حساب', color: AppColors.infoOf(context)),
              ),
            Text(message.body,
                style: const TextStyle(fontSize: 13.5, height: 1.5)),
            const SizedBox(height: 4),
            Text(
              Fmt.dateTime(message.createdAt),
              style:
                  TextStyle(fontSize: 10, color: AppColors.text3Of(context)),
            ),
          ],
        ),
      ),
    );
  }
}
