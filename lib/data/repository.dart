import 'dart:convert';
import 'dart:io';

import 'package:path_provider/path_provider.dart';
import 'package:sqflite/sqflite.dart';

import '../core/accounting.dart';
import '../core/database.dart';
import '../core/models.dart';

/// مستودع البيانات — كل قراءة وكتابة تمرّ من هنا.
class Repo {
  Future<Database> get _db async => AppDatabase.instance.database;

  // ==================== الحسابات ====================

  Future<List<Account>> accounts({bool includeArchived = false}) async {
    final db = await _db;
    final rows = await db.query(
      'accounts',
      where: includeArchived ? null : 'archived = 0',
      orderBy: 'name COLLATE NOCASE ASC',
    );
    return rows.map(Account.fromMap).toList();
  }

  Future<Account?> account(int id) async {
    final db = await _db;
    final r = await db.query('accounts', where: 'id = ?', whereArgs: [id]);
    return r.isEmpty ? null : Account.fromMap(r.first);
  }

  Future<int> saveAccount(Account a) async {
    final db = await _db;
    if (a.id == null) {
      final id = await db.insert('accounts', a.toMap());
      await logActivity('إضافة حساب: ${a.name}', 'account', '$id');
      return id;
    }
    await db.update('accounts', a.toMap(), where: 'id = ?', whereArgs: [a.id]);
    await logActivity('تعديل حساب: ${a.name}', 'account', '${a.id}');
    return a.id!;
  }

  /// الأرشفة بدل الحذف — كما في نسخة الويب.
  Future<void> archiveAccount(int id, bool archived) async {
    final db = await _db;
    await db.update('accounts', {'archived': archived ? 1 : 0},
        where: 'id = ?', whereArgs: [id]);
    await logActivity(
        archived ? 'أرشفة حساب' : 'استعادة حساب', 'account', '$id');
  }

  /// حذف نهائي مع نسخة في سلة المحذوفات للاستعادة.
  Future<void> deleteAccount(int id) async {
    final db = await _db;
    final a = await account(id);
    if (a != null) {
      await db.insert('trash', {
        'store': 'accounts',
        'payload': jsonEncode(a.toMap()),
        'label': 'حساب: ${a.name}',
        'created_at': DateTime.now().toIso8601String(),
      });
    }
    await db.delete('accounts', where: 'id = ?', whereArgs: [id]);
    await logActivity('حذف حساب: ${a?.name ?? id}', 'account', '$id');
  }

  // ==================== العمليات ====================

  Future<List<Tx>> transactions({
    int? accountId,
    DateTime? from,
    DateTime? to,
    OpType? type,
  }) async {
    final db = await _db;
    final where = <String>[];
    final args = <Object?>[];
    if (accountId != null) {
      // التحويل يمسّ الحساب عبر from_id/to_id أيضًا.
      where.add('(account_id = ? OR from_id = ? OR to_id = ?)');
      args.addAll([accountId, accountId, accountId]);
    }
    if (from != null) {
      where.add('date >= ?');
      args.add(from.toIso8601String());
    }
    if (to != null) {
      where.add('date <= ?');
      args.add(to.toIso8601String());
    }
    if (type != null) {
      where.add('type = ?');
      args.add(type.code);
    }
    final rows = await db.query(
      'transactions',
      where: where.isEmpty ? null : where.join(' AND '),
      whereArgs: args.isEmpty ? null : args,
      orderBy: 'date DESC, id DESC',
    );
    return rows.map(Tx.fromMap).toList();
  }

  Future<int> saveTx(Tx t) async {
    final db = await _db;
    if (t.id == null) {
      final id = await db.insert('transactions', t.toMap());
      await logActivity('${t.type.label}: ${t.amount}', 'tx', '$id');
      return id;
    }
    await db
        .update('transactions', t.toMap(), where: 'id = ?', whereArgs: [t.id]);
    await logActivity('تعديل عملية', 'tx', '${t.id}');
    return t.id!;
  }

  Future<void> deleteTx(int id) async {
    final db = await _db;
    final r =
        await db.query('transactions', where: 'id = ?', whereArgs: [id]);
    if (r.isNotEmpty) {
      await db.insert('trash', {
        'store': 'transactions',
        'payload': jsonEncode(r.first),
        'label': 'عملية بمبلغ ${r.first['amount']} ${r.first['currency']}',
        'created_at': DateTime.now().toIso8601String(),
      });
    }
    await db.delete('transactions', where: 'id = ?', whereArgs: [id]);
    await logActivity('حذف عملية', 'tx', '$id');
  }

  /// كشف العمليات المكررة — تحذير لا منع، كما في نسخة الويب.
  Future<List<Tx>> findDuplicates(Tx t) async {
    final all = await transactions(accountId: t.accountId);
    return all.where((x) {
      if (x.id == t.id) return false;
      if (x.type != t.type || x.amount != t.amount) return false;
      if (x.currency != t.currency) return false;
      if (x.date.difference(t.date).inDays.abs() > 0) return false;
      return x.createdAt
              .difference(t.createdAt)
              .inMilliseconds
              .abs() <
          120000;
    }).toList();
  }

  // ==================== الأرصدة ====================

  /// رصيد حساب واحد = الافتتاحي + أثر كل العمليات.
  ///
  /// يُحسب دائمًا من السجل ولا يُخزَّن أبدًا، فلا يمكن أن يتعارض.
  Future<double> balanceOf(Account a) async {
    if (a.id == null) return a.openingBalance;
    final txs = await transactions(accountId: a.id);
    var bal = a.openingBalance;
    for (final t in txs) {
      final e = t.effectOn(a.id!);
      if (e != null) bal += e;
    }
    return bal;
  }

  /// أرصدة كل الحسابات دفعة واحدة — استعلام واحد بدل استعلام لكل حساب.
  Future<Map<int, double>> allBalances(List<Account> accounts) async {
    final db = await _db;
    final rows = await db.query('transactions');
    final txs = rows.map(Tx.fromMap).toList();
    final out = <int, double>{};
    for (final a in accounts) {
      if (a.id == null) continue;
      var bal = a.openingBalance;
      for (final t in txs) {
        final e = t.effectOn(a.id!);
        if (e != null) bal += e;
      }
      out[a.id!] = bal;
    }
    return out;
  }

  // ==================== العملات ====================

  Future<List<CurrencyDef>> currencies() async {
    final db = await _db;
    final rows = await db.query('currencies');
    if (rows.isEmpty) return kDefaultCurrencies;
    return rows.map(CurrencyDef.fromMap).toList();
  }

  Future<void> saveCurrency(CurrencyDef c, {double rate = 1}) async {
    final db = await _db;
    await db.insert(
      'currencies',
      {...c.toMap(), 'rate': rate},
      conflictAlgorithm: ConflictAlgorithm.replace,
    );
  }

  Future<void> deleteCurrency(String code) async {
    final db = await _db;
    await db.delete('currencies', where: 'code = ?', whereArgs: [code]);
  }

  // ==================== الإعدادات ====================

  Future<Map<String, String>> settings() async {
    final db = await _db;
    final rows = await db.query('settings');
    return {
      for (final r in rows) r['key'] as String: r['value'] as String,
    };
  }

  Future<void> setSetting(String key, String value) async {
    final db = await _db;
    await db.insert('settings', {'key': key, 'value': value},
        conflictAlgorithm: ConflictAlgorithm.replace);
  }

  // ==================== سجل النشاط ====================

  Future<void> logActivity(String text, String refType, String refId) async {
    final db = await _db;
    await db.insert('activity', {
      'text': text,
      'ref_type': refType,
      'ref_id': refId,
      'user_name': 'المدير',
      'created_at': DateTime.now().toIso8601String(),
    });
  }

  Future<List<Map<String, Object?>>> recentActivity({int limit = 50}) async {
    final db = await _db;
    return db.query('activity', orderBy: 'id DESC', limit: limit);
  }


  // ==================== السندات ====================

  Future<List<Voucher>> vouchers({
    VoucherKind? kind,
    String? status,
  }) async {
    final db = await _db;
    final where = <String>[];
    final args = <Object?>[];
    if (kind != null) {
      where.add('kind = ?');
      args.add(kind.code);
    }
    if (status != null && status.isNotEmpty) {
      where.add('status = ?');
      args.add(status);
    }
    final rows = await db.query(
      'vouchers',
      where: where.isEmpty ? null : where.join(' AND '),
      whereArgs: args.isEmpty ? null : args,
      orderBy: 'id DESC',
    );
    return rows.map(Voucher.fromMap).toList();
  }

  Future<Voucher?> voucher(int id) async {
    final db = await _db;
    final r = await db.query('vouchers', where: 'id = ?', whereArgs: [id]);
    return r.isEmpty ? null : Voucher.fromMap(r.first);
  }

  /// الترقيم التلقائي — نقل حرفي لـ `nextSequence`:
  /// البادئة + عدّاد مكوّن من ٤ خانات، والعدّادات محفوظة في الإعدادات.
  Future<String> nextVoucherNumber(VoucherKind kind) async {
    final st = await settings();
    final prefix = st['prefix_${kind.code}']?.trim().isNotEmpty == true
        ? st['prefix_${kind.code}']!
        : kind.prefix;
    final counter = (int.tryParse(st['counter_${kind.code}'] ?? '0') ?? 0) + 1;
    await setSetting('counter_${kind.code}', '$counter');
    return '$prefix${counter.toString().padLeft(4, '0')}';
  }

  Future<int> saveVoucher(Voucher v) async {
    final db = await _db;
    if (v.id == null) {
      final id = await db.insert('vouchers', v.toMap());
      await logActivity('${v.kind.label} ${v.number}', 'voucher', '$id');
      return id;
    }
    await db.update('vouchers', v.toMap(), where: 'id = ?', whereArgs: [v.id]);
    await logActivity('تعديل ${v.kind.label} ${v.number}', 'voucher', '${v.id}');
    return v.id!;
  }

  Future<void> deleteVoucher(int id) async {
    final db = await _db;
    final r = await db.query('vouchers', where: 'id = ?', whereArgs: [id]);
    if (r.isNotEmpty) {
      await db.insert('trash', {
        'store': 'vouchers',
        'payload': jsonEncode(r.first),
        'label': 'سند ${r.first['number']}',
        'created_at': DateTime.now().toIso8601String(),
      });
    }
    await db.delete('vouchers', where: 'id = ?', whereArgs: [id]);
    await logActivity('حذف سند', 'voucher', '$id');
  }

  // ==================== المستخدمون ====================

  Future<List<AppUser>> users() async {
    final db = await _db;
    final rows = await db.query('users', orderBy: 'id ASC');
    return rows.map(AppUser.fromMap).toList();
  }

  Future<AppUser?> currentUser() async {
    final all = await users();
    if (all.isEmpty) return null;
    return all.firstWhere(
      (u) => u.isMe,
      orElse: () => all.firstWhere(
        (u) => u.role == UserRole.admin,
        orElse: () => all.first,
      ),
    );
  }

  Future<int> saveUser(AppUser u) async {
    final db = await _db;
    if (u.id == null) {
      final id = await db.insert('users', u.toMap());
      await logActivity('إضافة مستخدم: ${u.name}', 'user', '$id');
      return id;
    }
    await db.update('users', u.toMap(), where: 'id = ?', whereArgs: [u.id]);
    await logActivity('تعديل مستخدم: ${u.name}', 'user', '${u.id}');
    return u.id!;
  }

  Future<void> deleteUser(int id) async {
    final db = await _db;
    await db.delete('users', where: 'id = ?', whereArgs: [id]);
    await logActivity('حذف مستخدم', 'user', '$id');
  }

  /// يجعل مستخدمًا واحدًا هو المستخدم الحالي.
  Future<void> setCurrentUser(int id) async {
    final db = await _db;
    await db.update('users', {'is_me': 0});
    await db.update('users', {'is_me': 1}, where: 'id = ?', whereArgs: [id]);
  }

  // ==================== الدردشة ====================

  /// محادثة لكل حساب، تُنشأ عند أول رسالة.
  Future<int> conversationFor(Account a) async {
    final db = await _db;
    final r = await db
        .query('conversations', where: 'title = ?', whereArgs: [a.name]);
    if (r.isNotEmpty) return r.first['id'] as int;
    final now = DateTime.now().toIso8601String();
    return db.insert('conversations', {
      'title': a.name,
      'created_at': now,
      'updated_at': now,
    });
  }

  Future<List<Map<String, Object?>>> conversations() async {
    final db = await _db;
    return db.query('conversations', orderBy: 'updated_at DESC');
  }

  Future<List<ChatMessage>> messages(int conversationId) async {
    final db = await _db;
    final rows = await db.query('messages',
        where: 'conversation_id = ?',
        whereArgs: [conversationId],
        orderBy: 'id ASC');
    return rows.map(ChatMessage.fromMap).toList();
  }

  Future<int> sendMessage(ChatMessage m) async {
    final db = await _db;
    final id = await db.insert('messages', m.toMap());
    await db.update(
      'conversations',
      {'updated_at': DateTime.now().toIso8601String()},
      where: 'id = ?',
      whereArgs: [m.conversationId],
    );
    return id;
  }

  Future<void> deleteMessage(int id) async {
    final db = await _db;
    await db.delete('messages', where: 'id = ?', whereArgs: [id]);
  }

  // ==================== التصنيفات ====================

  Future<List<String>> categories() async {
    final db = await _db;
    final rows = await db.query('categories', orderBy: 'name ASC');
    return rows.map((r) => r['name'] as String).toList();
  }

  Future<void> addCategory(String name) async {
    final db = await _db;
    await db.insert('categories', {
      'name': name,
      'scope': 'account',
      'created_at': DateTime.now().toIso8601String(),
    });
  }

  Future<void> deleteCategory(String name) async {
    final db = await _db;
    await db.delete('categories', where: 'name = ?', whereArgs: [name]);
  }

  // ==================== سلة المهملات ====================

  Future<List<Map<String, Object?>>> trash() async {
    final db = await _db;
    return db.query('trash', orderBy: 'id DESC');
  }

  /// يعيد سجلًا محذوفًا إلى جدوله الأصلي.
  Future<void> restoreFromTrash(int trashId) async {
    final db = await _db;
    final r = await db.query('trash', where: 'id = ?', whereArgs: [trashId]);
    if (r.isEmpty) return;
    final store = r.first['store'] as String;
    final payload =
        jsonDecode(r.first['payload'] as String) as Map<String, Object?>;
    await db.insert(store, payload,
        conflictAlgorithm: ConflictAlgorithm.replace);
    await db.delete('trash', where: 'id = ?', whereArgs: [trashId]);
    await logActivity('استرجاع من سلة المهملات', store, '$trashId');
  }

  /// حذف عنصر واحد من السلة نهائيًا.
  Future<void> deleteFromTrash(int trashId) async {
    final db = await _db;
    await db.delete('trash', where: 'id = ?', whereArgs: [trashId]);
  }

  Future<void> emptyTrash() async {
    final db = await _db;
    await db.delete('trash');
    await logActivity('تفريغ سلة المهملات', 'trash', '');
  }

  Future<void> clearActivity() async {
    final db = await _db;
    await db.delete('activity');
  }

  // ==================== النسخ الاحتياطي ====================

  static const backupTables = [
    'accounts',
    'transactions',
    'vouchers',
    'currencies',
    'categories',
    'users',
    'conversations',
    'messages',
    'activity',
    'settings',
    'items',
    'stock_moves',
  ];

  /// كل بيانات التطبيق في خريطة واحدة قابلة للتحويل إلى JSON.
  ///
  /// [withImages] يضمّن صور العمليات والحسابات والأصناف مرمّزة base64 داخل
  /// الملف، فلا تضيع عند النقل إلى هاتف آخر.
  Future<Map<String, Object?>> exportAll({bool withImages = true}) async {
    final db = await _db;
    final data = <String, Object?>{};
    for (final t in backupTables) {
      try {
        data[t] = await db.query(t);
      } catch (_) {
        data[t] = const [];
      }
    }

    final images = <String, String>{};
    if (withImages) {
      for (final entry in [
        (data['transactions'], 'image'),
        (data['transactions'], 'attachment'),
        (data['accounts'], 'image'),
        (data['items'], 'image'),
      ]) {
        final rows = entry.$1;
        if (rows is! List) continue;
        for (final row in rows) {
          if (row is! Map) continue;
          final path = (row[entry.$2] ?? '') as String? ?? '';
          if (path.isEmpty || images.containsKey(path)) continue;
          try {
            final f = File(path);
            if (!f.existsSync()) continue;
            if (f.lengthSync() > 3 * 1024 * 1024) continue; // نتجاهل الضخم
            images[path] = base64Encode(await f.readAsBytes());
          } catch (_) {
            // صورة مفقودة: نتخطاها بلا إفشال النسخة كلها
          }
        }
      }
    }

    return {
      'app': 'nexora',
      'format': 2,
      'db_version': AppDatabase.schemaVersion,
      'created_at': DateTime.now().toIso8601String(),
      'data': data,
      'images': images,
    };
  }

  /// يستبدل كل البيانات بمحتوى نسخة احتياطية.
  ///
  /// يقبل نسخ نكسورا (format 1 و 2) وكذلك نسخًا من تطبيقات حسابات أخرى
  /// عبر [_normalize]، فيستورد ما يفهمه ويتجاهل الباقي بدل الرفض الكامل.
  Future<int> importAll(Map<String, Object?> backup) async {
    final db = await _db;
    final data = _normalize(backup);
    if (data.isEmpty) throw const FormatException('ملف غير صالح أو فارغ');

    // نستعيد الصور المضمّنة أولًا ونبني خريطة المسار القديم ← الجديد.
    final remap = await _restoreImages(backup);

    var imported = 0;
    await db.transaction((txn) async {
      for (final t in [
        'messages',
        'conversations',
        'activity',
        'stock_moves',
        'items',
        'vouchers',
        'transactions',
        'accounts',
        'categories',
        'users',
        'currencies',
        'settings',
      ]) {
        try {
          await txn.delete(t);
        } catch (_) {
          // جدول غير موجود في هذه النسخة
        }
      }

      for (final entry in data.entries) {
        final table = entry.key;
        final rows = entry.value;
        final cols = await _columnsOf(txn, table);
        if (cols.isEmpty) continue; // جدول لا نعرفه
        for (final row in rows) {
          // نُبقي الأعمدة المعروفة فقط حتى تُقبل ملفات التطبيقات الأخرى.
          final clean = <String, Object?>{};
          row.forEach((k, v) {
            if (!cols.contains(k)) return;
            clean[k] = (v is String && remap.containsKey(v)) ? remap[v] : v;
          });
          if (clean.isEmpty) continue;
          try {
            await txn.insert(table, clean,
                conflictAlgorithm: ConflictAlgorithm.replace);
            imported++;
          } catch (_) {
            // صف تالف: نتخطاه ونكمل
          }
        }
      }
    });
    await logActivity('استيراد نسخة احتياطية ($imported سجلًا)', 'backup', '');
    return imported;
  }

  /// أسماء أعمدة جدول، أو مجموعة فارغة إن لم يكن موجودًا.
  Future<Set<String>> _columnsOf(DatabaseExecutor db, String table) async {
    try {
      final info = await db.rawQuery('PRAGMA table_info($table)');
      return info.map((c) => c['name'] as String).toSet();
    } catch (_) {
      return <String>{};
    }
  }

  /// يكتب الصور المضمّنة إلى القرص ويعيد خريطة المسار القديم ← الجديد.
  Future<Map<String, String>> _restoreImages(Map<String, Object?> backup) async {
    final raw = backup['images'];
    if (raw is! Map || raw.isEmpty) return const {};
    final out = <String, String>{};
    try {
      final dir = await getApplicationDocumentsDirectory();
      final folder = Directory('${dir.path}/images')
        ..createSync(recursive: true);
      var i = 0;
      for (final e in raw.entries) {
        final b64 = e.value;
        if (b64 is! String || b64.isEmpty) continue;
        try {
          final name = 'restored-${DateTime.now().millisecondsSinceEpoch}-${i++}.png';
          final f = File('${folder.path}/$name');
          await f.writeAsBytes(base64Decode(b64), flush: true);
          out['${e.key}'] = f.path;
        } catch (_) {
          // صورة تالفة: نتجاهلها
        }
      }
    } catch (_) {
      return const {};
    }
    return out;
  }

  /// يحوّل أي ملف نسخ احتياطي إلى `{جدول: [صفوف]}`.
  ///
  /// يدعم ثلاث صيغ شائعة: `{data:{...}}` (نكسورا)، الخريطة المسطّحة
  /// `{accounts:[...], transactions:[...]}` وأسماء جداول مرادفة يستعملها
  /// غيرنا مثل `customers` أو `entries`.
  Map<String, List<Map<String, Object?>>> _normalize(Map<String, Object?> b) {
    Map? src;
    final d = b['data'];
    if (d is Map) {
      src = d;
    } else if (b.values.any((v) => v is List)) {
      src = b;
    }
    if (src == null) return {};

    const alias = <String, String>{
      'accounts': 'accounts',
      'customers': 'accounts',
      'contacts': 'accounts',
      'parties': 'accounts',
      'transactions': 'transactions',
      'entries': 'transactions',
      'operations': 'transactions',
      'records': 'transactions',
      'vouchers': 'vouchers',
      'receipts': 'vouchers',
      'currencies': 'currencies',
      'categories': 'categories',
      'users': 'users',
      'conversations': 'conversations',
      'messages': 'messages',
      'activity': 'activity',
      'settings': 'settings',
      'items': 'items',
      'products': 'items',
      'inventory': 'items',
      'stock_moves': 'stock_moves',
    };

    final out = <String, List<Map<String, Object?>>>{};
    src.forEach((k, v) {
      final table = alias[('$k').toLowerCase()];
      if (table == null || v is! List) return;
      final rows = <Map<String, Object?>>[];
      for (final r in v) {
        if (r is Map) rows.add(r.map((a, b) => MapEntry('$a', b)));
      }
      if (rows.isEmpty) return;
      out.putIfAbsent(table, () => []).addAll(rows);
    });
    return out;
  }

  // ==================== الأصناف والمخزون ====================

  Future<List<Item>> items({bool includeArchived = false, String q = ''}) async {
    final db = await _db;
    final where = <String>[];
    final args = <Object?>[];
    if (!includeArchived) where.add('archived = 0');
    if (q.trim().isNotEmpty) {
      where.add('(name LIKE ? OR sku LIKE ? OR category LIKE ?)');
      final like = '%${q.trim()}%';
      args.addAll([like, like, like]);
    }
    final rows = await db.query('items',
        where: where.isEmpty ? null : where.join(' AND '),
        whereArgs: args.isEmpty ? null : args,
        orderBy: 'name COLLATE NOCASE');
    return rows.map(Item.fromMap).toList();
  }

  Future<Item?> item(int id) async {
    final db = await _db;
    final r = await db.query('items', where: 'id = ?', whereArgs: [id]);
    return r.isEmpty ? null : Item.fromMap(r.first);
  }

  Future<int> saveItem(Item it) async {
    final db = await _db;
    if (it.id == null) {
      final id = await db.insert('items', it.toMap());
      await logActivity('إضافة صنف: ${it.name}', 'item', '$id');
      return id;
    }
    await db.update('items', it.toMap(), where: 'id = ?', whereArgs: [it.id]);
    await logActivity('تعديل صنف: ${it.name}', 'item', '${it.id}');
    return it.id!;
  }

  /// حذف صنف إلى سلة المهملات مع حركاته.
  Future<void> deleteItem(int id) async {
    final db = await _db;
    final r = await db.query('items', where: 'id = ?', whereArgs: [id]);
    if (r.isNotEmpty) {
      await db.insert('trash', {
        'store': 'items',
        'payload': jsonEncode(r.first),
        'label': 'صنف: ${r.first['name']}',
        'created_at': DateTime.now().toIso8601String(),
      });
    }
    await db.delete('items', where: 'id = ?', whereArgs: [id]);
    await logActivity('حذف صنف', 'item', '$id');
  }

  Future<List<StockMove>> stockMoves({int? itemId, int limit = 200}) async {
    final db = await _db;
    final rows = await db.query('stock_moves',
        where: itemId == null ? null : 'item_id = ?',
        whereArgs: itemId == null ? null : [itemId],
        orderBy: 'date DESC, id DESC',
        limit: limit);
    return rows.map(StockMove.fromMap).toList();
  }

  /// يسجّل حركة مخزنية ويحدّث كمية الصنف تلقائيًا.
  Future<int> addStockMove(StockMove m) async {
    final db = await _db;
    final id = await db.insert('stock_moves', m.toMap());
    final it = await item(m.itemId);
    if (it != null) {
      // التسوية تضبط الكمية على القيمة المدخلة، وغيرها يزيد أو ينقص.
      final delta = m.kind == StockKind.adjust
          ? m.quantity - it.quantity
          : m.kind.qtySign * m.quantity;
      await db.update(
        'items',
        {
          'quantity': it.quantity + delta,
          'updated_at': DateTime.now().toIso8601String(),
        },
        where: 'id = ?',
        whereArgs: [m.itemId],
      );
      await logActivity(
          '${m.kind.label}: ${it.name} × ${m.quantity}', 'stock', '$id');
    }
    return id;
  }

  Future<void> deleteStockMove(int id) async {
    final db = await _db;
    final r = await db.query('stock_moves', where: 'id = ?', whereArgs: [id]);
    if (r.isEmpty) return;
    final m = StockMove.fromMap(r.first);
    final it = await item(m.itemId);
    await db.delete('stock_moves', where: 'id = ?', whereArgs: [id]);
    if (it != null && m.kind != StockKind.adjust) {
      await db.update(
        'items',
        {'quantity': it.quantity - m.kind.qtySign * m.quantity},
        where: 'id = ?',
        whereArgs: [m.itemId],
      );
    }
  }

  /// ملخّص المخزون: التكلفة والقيمة والربح المحقق والمتوقع.
  Future<Map<String, double>> inventorySummary() async {
    final all = await items();
    var cost = 0.0, value = 0.0, expected = 0.0, low = 0.0;
    for (final i in all) {
      cost += i.stockCost;
      value += i.stockValue;
      expected += i.expectedProfit;
      if (i.low || i.out) low++;
    }
    // الربح المحقق فعليًا من حركات البيع مقابل سعر الشراء الحالي.
    final db = await _db;
    final rows = await db.rawQuery(
      "SELECT s.quantity AS q, s.unit_price AS p, i.buy_price AS b "
      "FROM stock_moves s JOIN items i ON i.id = s.item_id "
      "WHERE s.kind = 'sale'",
    );
    var realised = 0.0, sales = 0.0;
    for (final r in rows) {
      final q = ((r['q'] ?? 0) as num).toDouble();
      final p = ((r['p'] ?? 0) as num).toDouble();
      final b = ((r['b'] ?? 0) as num).toDouble();
      realised += (p - b) * q;
      sales += p * q;
    }
    return {
      'items': all.length.toDouble(),
      'cost': cost,
      'value': value,
      'expected': expected,
      'realised': realised,
      'sales': sales,
      'low': low,
    };
  }

  // ==================== الإحصاءات ====================

  Future<Map<String, int>> counts() async {
    final db = await _db;
    Future<int> c(String t, [String? where]) async =>
        Sqflite.firstIntValue(await db
            .rawQuery('SELECT COUNT(*) FROM $t${where == null ? '' : ' WHERE $where'}')) ??
        0;
    return {
      'accounts': await c('accounts', 'archived = 0'),
      'transactions': await c('transactions'),
      'vouchers': await c('vouchers'),
      'items': await c('items', 'archived = 0'),
      'trash': await c('trash'),
    };
  }
}
