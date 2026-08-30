import 'dart:convert';
import 'dart:io';

import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';
import 'package:sqflite/sqflite.dart';

import '../core/accounting.dart';
import '../core/database.dart';
import '../core/models.dart';

/// خطأ استعادة واضح؛ لا تُعاد رسالة نجاح عند حدوثه.
class BackupImportException implements Exception {
  final String message;

  const BackupImportException(this.message);

  @override
  String toString() => message;
}

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

  /// يحفظ العملية وسطور الفاتورة معًا. تمرير [items] (حتى لو كانت فارغة)
  /// يستبدل السطور القديمة، أما null فيُبقيها كما هي عند تحديث الصورة.
  Future<int> saveTx(Tx t, {List<InvoiceLine>? items}) async {
    final db = await _db;
    late final int id;
    await db.transaction((txn) async {
      if (t.id == null) {
        id = await txn.insert('transactions', t.toMap());
      } else {
        id = t.id!;
        await txn.update('transactions', t.toMap(),
            where: 'id = ?', whereArgs: [id]);
      }

      if (items != null) {
        await txn.delete('transaction_items',
            where: 'tx_id = ?', whereArgs: [id]);
        for (final line in items) {
          await txn.insert('transaction_items', line.toMap(transactionId: id));
        }
      }
    });

    await logActivity(
      t.id == null ? '${t.type.label}: ${t.amount}' : 'تعديل عملية',
      'tx',
      '$id',
    );
    return id;
  }

  /// تفاصيل الأصناف المرتبطة بعملية مالية.
  Future<List<InvoiceLine>> transactionItems(int txId) async {
    final db = await _db;
    final rows = await db.query(
      'transaction_items',
      where: 'tx_id = ?',
      whereArgs: [txId],
      orderBy: 'id ASC',
    );
    return rows.map(InvoiceLine.fromMap).toList();
  }

  Future<void> deleteTx(int id) async {
    final db = await _db;
    await db.transaction((txn) async {
      final rows =
          await txn.query('transactions', where: 'id = ?', whereArgs: [id]);
      if (rows.isNotEmpty) {
        final lines = await txn.query(
          'transaction_items',
          where: 'tx_id = ?',
          whereArgs: [id],
          orderBy: 'id ASC',
        );
        await txn.insert('trash', {
          'store': 'transactions',
          'payload': jsonEncode({
            'transaction': rows.first,
            'items': lines,
          }),
          'label':
              'عملية بمبلغ ${rows.first['amount']} ${rows.first['currency']}',
          'created_at': DateTime.now().toIso8601String(),
        });
      }
      // الحذف الصريح يحافظ على السلوك نفسه حتى في قواعد الاختبار أو
      // القواعد القديمة التي لم تُفعّل مفاتيح SQLite الأجنبية.
      await txn.delete('transaction_items', where: 'tx_id = ?', whereArgs: [id]);
      await txn.delete('transactions', where: 'id = ?', whereArgs: [id]);
    });
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
        jsonDecode(r.first['payload'] as String) as Map<String, dynamic>;
    if (store == 'transactions' && payload['transaction'] is Map) {
      final tx = Map<String, Object?>.from(payload['transaction'] as Map);
      final rawItems = payload['items'];
      await db.transaction((txn) async {
        await txn.insert('transactions', tx,
            conflictAlgorithm: ConflictAlgorithm.replace);
        if (rawItems is List) {
          for (final raw in rawItems) {
            if (raw is! Map) continue;
            final item = Map<String, Object?>.from(raw);
            await txn.insert('transaction_items', item,
                conflictAlgorithm: ConflictAlgorithm.replace);
          }
        }
      });
    } else {
      await db.insert(store, Map<String, Object?>.from(payload),
          conflictAlgorithm: ConflictAlgorithm.replace);
    }
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

  /// الجداول الدائمة التي تدخل في النسخة.
  ///
  /// نُبقي `trash` و`notifications` خارج النسخة عمدًا: الأولى سجل محلي
  /// للعناصر المحذوفة والثانية تنبيهات مشتقة/مؤقتة، ويُفرغان عند الاستعادة
  /// حتى لا تظهر إحالات قديمة بعد استبدال قاعدة البيانات. أما `activity` و
  /// `templates` فهما بيانات مفيدة للمستخدم ولذلك تُحفظ.
  static const backupTables = [
    'accounts',
    'transactions',
    'transaction_items',
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
    'templates',
  ];

  /// ترتيب الإدخال مستقل عن ترتيب مفاتيح JSON، ويحافظ على المفاتيح الأجنبية.
  static const _importOrder = [
    'currencies',
    'categories',
    'users',
    'accounts',
    'transactions',
    'items',
    'transaction_items',
    'vouchers',
    'conversations',
    'messages',
    'stock_moves',
    'templates',
    'settings',
    'activity',
  ];

  /// الجداول التي تعتمد على معرف SQLite ثابت عند نقل نسخة نكسورا.
  static const _stableIdTables = [
    'accounts',
    'transactions',
    'transaction_items',
    'vouchers',
    'categories',
    'users',
    'conversations',
    'messages',
    'activity',
    'items',
    'stock_moves',
    'templates',
  ];

  /// أسماء أعمدة شائعة بصيغة camelCase في ملفات JSON.
  static const _columnAliases = <String, String>{
    'accountId': 'account_id',
    'accountKind': 'account_kind',
    'transactionId': 'tx_id',
    'transaction_id': 'tx_id',
    'openingBalance': 'opening_balance',
    'fromId': 'from_id',
    'toId': 'to_id',
    'buyPrice': 'buy_price',
    'sellPrice': 'sell_price',
    'minQuantity': 'min_quantity',
    'conversationId': 'conversation_id',
    'createdAt': 'created_at',
    'updatedAt': 'updated_at',
    'userName': 'user_name',
    'refType': 'ref_type',
    'refId': 'ref_id',
    'isMe': 'is_me',
    'itemId': 'item_id',
    'unitPrice': 'unit_price',
    'txId': 'tx_id',
  };

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
      } catch (e) {
        throw StateError('تعذّر تصدير جدول $t؛ لم تُنشأ نسخة ناقصة: $e');
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
            if (!f.existsSync()) {
              throw StateError('الصورة المشار إليها غير موجودة: $path');
            }
            if (f.lengthSync() > 10 * 1024 * 1024) {
              throw StateError('حجم الصورة أكبر من 10 م.ب: $path');
            }
            images[path] = base64Encode(await f.readAsBytes());
          } catch (e) {
            throw StateError(
              'تعذّر تضمين الصورة $path؛ لم تُنشأ نسخة ناقصة: $e',
            );
          }
        }
      }

      // شعار المؤسسة محفوظ في settings.value، لذلك نضمّنه صراحةً في
      // ملف النسخة حتى يظهر على السندات بعد النقل إلى جهاز آخر.
      final settingsRows = data['settings'];
      if (settingsRows is List) {
        for (final row in settingsRows) {
          if (row is! Map || row['key'] != 'logo') continue;
          final path = (row['value'] ?? '') as String? ?? '';
          if (path.isEmpty || images.containsKey(path)) continue;
          try {
            final f = File(path);
            if (!f.existsSync()) {
              throw StateError('شعار المؤسسة المشار إليه غير موجود: $path');
            }
            if (f.lengthSync() > 10 * 1024 * 1024) {
              throw StateError('حجم شعار المؤسسة أكبر من 10 م.ب: $path');
            }
            images[path] = base64Encode(await f.readAsBytes());
          } catch (e) {
            throw StateError(
              'تعذّر تضمين شعار المؤسسة $path؛ لم تُنشأ نسخة ناقصة: $e',
            );
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

  /// يستبدل كل البيانات بمحتوى نسخة احتياطية ذرّيًا.
  ///
  /// اختلاف ترتيب الجداول لا يؤثر؛ أما الصف غير الصالح أو المرجع المفقود
  /// فيفشل العملية كلها ويعيد SQLite الحالة السابقة بدل استعادة جزئية صامتة.
  Future<int> importAll(Map<String, Object?> backup) async {
    final db = await _db;
    final data = _normalize(backup);
    if (data.isEmpty) {
      throw const BackupImportException(
        'ملف غير صالح أو لا يحتوي جداول مفهومة.',
      );
    }

    // تفعيل المفاتيح الأجنبية أيضًا في قواعد الاختبار/القواعد المحقونة.
    await db.execute('PRAGMA foreign_keys = ON');
    final createdFiles = <File>[];

    try {
      // الصور خارج SQLite، لذلك نسجل الملفات الجديدة ونحذفها إذا فشلت المعاملة.
      final remap = await _restoreImages(backup, createdFiles);
      final isNexora = backup['app'] == 'nexora';

      return await db.transaction((txn) async {
        for (final table in [
          'messages',
          'conversations',
          'activity',
          'stock_moves',
          'transaction_items',
          'items',
          'vouchers',
          'transactions',
          'accounts',
          'categories',
          'users',
          'currencies',
          'settings',
          'templates',
          'trash',
          'notifications',
        ]) {
          await txn.delete(table);
        }

        var imported = 0;
        for (final table in _importOrder) {
          final rows = data[table];
          if (rows == null) continue;
          final cols = await _columnsOf(txn, table);
          if (cols.isEmpty) {
            throw BackupImportException(
              'جدول غير مدعوم أثناء الاستعادة: $table',
            );
          }

          for (var index = 0; index < rows.length; index++) {
            final row = rows[index];
            final clean = <String, Object?>{};
            for (final entry in row.entries) {
              final column = _columnAliases[entry.key] ?? entry.key;
              if (!cols.contains(column)) continue;
              if (clean.containsKey(column)) {
                throw BackupImportException(
                  'الصف ${index + 1} في $table يحتوي العمود $column مرتين.',
                );
              }
              clean[column] = _valueForDatabase(
                table,
                column,
                entry.value,
                remap,
              );
            }
            // مسار شعار المؤسسة يحتاج إعادة ربط مثل صور الحسابات والأصناف.
            // إذا لم تُضمّن الصورة في النسخة نُفرغ المسار القديم بدل ترك رابطًا
            // معطّلًا على الجهاز الجديد.
            if (table == 'settings' && clean['key'] == 'logo') {
              final oldPath = clean['value'];
              clean['value'] = oldPath is String ? (remap[oldPath] ?? '') : '';
            }
            if (clean.isEmpty) {
              throw BackupImportException(
                'الصف ${index + 1} في $table لا يحتوي أعمدة مفهومة.',
              );
            }
            if (isNexora &&
                _stableIdTables.contains(table) &&
                (clean['id'] == null || !clean.containsKey('id'))) {
              throw BackupImportException(
                'الصف ${index + 1} في $table يفتقد المعرّف الثابت.',
              );
            }
            if (isNexora &&
                table == 'settings' &&
                (clean['key'] == null || !clean.containsKey('key'))) {
              throw BackupImportException(
                'الصف ${index + 1} في settings يفتقد المفتاح.',
              );
            }

            try {
              await txn.insert(
                table,
                clean,
                conflictAlgorithm: ConflictAlgorithm.abort,
              );
            } catch (e) {
              throw BackupImportException(
                'تعذّر استيراد الصف ${index + 1} من $table؛ أُلغيت الاستعادة بالكامل: $e',
              );
            }
            imported++;
          }
        }

        await _validateOptionalReferences(txn);
        await txn.insert('activity', {
          'text': 'استيراد نسخة احتياطية ($imported سجلًا)',
          'ref_type': 'backup',
          'ref_id': '',
          'user_name': 'المدير',
          'created_at': DateTime.now().toIso8601String(),
        });
        return imported;
      });
    } catch (e) {
      await _deleteFiles(createdFiles);
      if (e is BackupImportException) rethrow;
      throw BackupImportException(
        'فشلت الاستعادة بالكامل ولم تُطبّق أي تغييرات: $e',
      );
    }
  }

  /// يحوّل القيم إلى أنواع تقبلها sqflite، ويعيد ربط الصور.
  Object? _valueForDatabase(
    String table,
    String column,
    Object? value,
    Map<String, String> remap,
  ) {
    if (_isImageColumn(table, column) && value is String && value.isNotEmpty) {
      // النسخة بلا صورة مضمّنة لا تترك مسار الهاتف القديم معطّلًا.
      return remap[value] ?? '';
    }
    if (value is bool) return value ? 1 : 0;
    if (value == null || value is String || value is num) return value;
    if (value is List<int>) return value;
    throw BackupImportException(
      'قيمة غير مدعومة في $table.$column؛ أُلغيت الاستعادة.',
    );
  }

  bool _isImageColumn(String table, String column) =>
      (table == 'transactions' &&
          (column == 'image' || column == 'attachment')) ||
      ((table == 'accounts' || table == 'items') && column == 'image');

  /// يتحقق من العلاقات التي لم يفرضها المخطط صراحةً.
  Future<void> _validateOptionalReferences(DatabaseExecutor db) async {
    final checks = <({String table, String column, String parent})>[
      (table: 'stock_moves', column: 'account_id', parent: 'accounts'),
      (table: 'vouchers', column: 'tx_id', parent: 'transactions'),
      (table: 'transaction_items', column: 'item_id', parent: 'items'),
    ];
    for (final check in checks) {
      final rows = await db.rawQuery('''
        SELECT COUNT(*) AS count
        FROM ${check.table} child
        WHERE child.${check.column} IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM ${check.parent} parent
            WHERE parent.id = child.${check.column}
          )
      ''');
      final count = (rows.first['count'] as num?)?.toInt() ?? 0;
      if (count > 0) {
        throw BackupImportException(
          'وجدت $count إحالة غير صالحة في ${check.table}.${check.column}.',
        );
      }
    }
  }

  /// أسماء أعمدة جدول، أو مجموعة فارغة إن لم يكن موجودًا.
  Future<Set<String>> _columnsOf(DatabaseExecutor db, String table) async {
    final info = await db.rawQuery('PRAGMA table_info($table)');
    return info.map((c) => c['name'] as String).toSet();
  }

  /// يكتب الصور المضمّنة إلى القرص ويعيد خريطة المسار القديم ← الجديد.
  Future<Map<String, String>> _restoreImages(
    Map<String, Object?> backup,
    List<File> createdFiles,
  ) async {
    final raw = backup['images'];
    if (raw == null) return const {};
    if (raw is! Map) {
      throw const BackupImportException('حقل images في النسخة غير صالح.');
    }
    if (raw.isEmpty) return const {};

    final out = <String, String>{};
    final dir = await getApplicationDocumentsDirectory();
    final folder = Directory('${dir.path}/images');
    await folder.create(recursive: true);
    var i = 0;

    for (final entry in raw.entries) {
      final oldPath = '${entry.key}';
      final b64 = entry.value;
      if (oldPath.isEmpty || b64 is! String || b64.isEmpty) {
        throw const BackupImportException('توجد صورة مضمّنة ناقصة أو فارغة.');
      }
      if (out.containsKey(oldPath)) {
        throw BackupImportException('مسار صورة مكرر في النسخة: $oldPath');
      }

      late final List<int> bytes;
      try {
        bytes = base64Decode(b64);
      } catch (e) {
        throw BackupImportException(
          'ترميز الصورة غير صالح للمسار $oldPath: $e',
        );
      }
      if (bytes.isEmpty || bytes.length > 10 * 1024 * 1024) {
        throw BackupImportException('حجم الصورة غير صالح للمسار: $oldPath');
      }
      final extension = _imageExtension(oldPath);
      final name =
          'restored-${DateTime.now().millisecondsSinceEpoch}-${i++}$extension';
      final file = File('${folder.path}/$name');
      createdFiles.add(file);
      try {
        await file.writeAsBytes(bytes, flush: true);
      } catch (e) {
        throw BackupImportException('تعذّر حفظ الصورة $oldPath: $e');
      }
      out[oldPath] = file.path;
    }
    return out;
  }

  String _imageExtension(String path) {
    final extension = p.extension(path).toLowerCase();
    return const {
          '.png',
          '.jpg',
          '.jpeg',
          '.webp',
          '.gif',
          '.heic',
          '.pdf',
          '.mp4',
          '.mov',
          '.doc',
          '.docx',
          '.xls',
          '.xlsx',
        }.contains(extension)
        ? extension
        : '.png';
  }

  Future<void> _deleteFiles(Iterable<File> files) async {
    for (final file in files) {
      try {
        if (await file.exists()) await file.delete();
      } catch (_) {
        // لا نغيّر رسالة فشل المعاملة بسبب ملف مؤقت يتعذر حذفه.
      }
    }
  }

  /// يحوّل أي ملف نسخ احتياطي إلى `{جدول: [صفوف]}`.
  ///
  /// يدعم `{data:{...}}` (نكسورا)، والخريطة المسطّحة، وأسماء مرادفة مثل
  /// `customers` و`entries`. القوائم الفارغة تبقى موجودة حتى تُقبل نسخة
  /// صحيحة لا تحتوي سجلات بعد.
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
      'transaction_items': 'transaction_items',
      'transactionitems': 'transaction_items',
      'tx_items': 'transaction_items',
      'txitems': 'transaction_items',
      'invoice_items': 'transaction_items',
      'invoiceitems': 'transaction_items',
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
      'stockmoves': 'stock_moves',
      'templates': 'templates',
    };

    final out = <String, List<Map<String, Object?>>>{};
    src.forEach((k, v) {
      final table = alias['$k'.toLowerCase()];
      if (table == null) return;
      if (v is! List) {
        throw BackupImportException('جدول $table ليس قائمة صفوف صالحة.');
      }
      final rows = <Map<String, Object?>>[];
      for (final r in v) {
        if (r is! Map) {
          throw BackupImportException(
            'يحتوي جدول $table على عنصر ليس صفًا صالحًا.',
          );
        }
        rows.add(r.map((a, b) => MapEntry('$a', b)));
      }
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
    // تبقى سطور الفواتير التاريخية باسم الصنف حتى بعد حذفه من المخزون.
    await db.update('transaction_items', {'item_id': null},
        where: 'item_id = ?', whereArgs: [id]);
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
