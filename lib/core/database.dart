import 'dart:async';

import 'package:path/path.dart' as p;
import 'package:sqflite/sqflite.dart';

/// قاعدة البيانات المحلية — تقابل مخازن IndexedDB في نسخة الويب،
/// لكن بجداول SQL حقيقية مع فهارس ومفاتيح أجنبية.
class AppDatabase {
  AppDatabase._();
  static final AppDatabase instance = AppDatabase._();

  static Database? _db;
  static const int _version = 2;

  static int get schemaVersion => _version;

  /// حقن قاعدة في الذاكرة للاختبارات.
  static void overrideForTest(Database db) => _db = db;

  Future<Database> get database async {
    if (_db != null) return _db!;
    final dir = await getDatabasesPath();
    _db = await openDatabase(
      p.join(dir, 'nexora.db'),
      version: _version,
      onConfigure: (db) async => db.execute('PRAGMA foreign_keys = ON'),
      onCreate: (db, v) async => createSchema(db),
      onUpgrade: (db, from, to) async => _migrate(db, from, to),
    );
    return _db!;
  }

  Future<void> close() async {
    final db = _db;
    _db = null;
    if (db != null && db.isOpen) await db.close();
  }

  /// إنشاء كل الجداول — مستقل ليُستخدم في الاختبارات أيضًا.
  static Future<void> createSchema(Database db) async {
    // ---------- الحسابات ----------
    await db.execute('''
      CREATE TABLE accounts (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        name            TEXT NOT NULL,
        kind            TEXT NOT NULL DEFAULT 'customer',
        opening_balance REAL NOT NULL DEFAULT 0,
        currency        TEXT NOT NULL DEFAULT 'YER',
        phone           TEXT DEFAULT '',
        whatsapp        TEXT DEFAULT '',
        address         TEXT DEFAULT '',
        notes           TEXT DEFAULT '',
        category        TEXT DEFAULT '',
        credit_limit    REAL,
        tags            TEXT DEFAULT '',
        archived        INTEGER NOT NULL DEFAULT 0,
        image           TEXT DEFAULT '',
        created_at      TEXT NOT NULL,
        updated_at      TEXT NOT NULL
      )''');
    await db.execute('CREATE INDEX idx_acc_kind ON accounts(kind)');
    await db.execute('CREATE INDEX idx_acc_arch ON accounts(archived)');

    // ---------- العمليات ----------
    // account_id يقبل NULL لأن التحويل يستخدم from_id/to_id بدلًا منه.
    await db.execute('''
      CREATE TABLE transactions (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        account_id   INTEGER,
        account_kind TEXT DEFAULT 'customer',
        type         TEXT NOT NULL,
        amount       REAL NOT NULL CHECK (amount > 0),
        currency     TEXT NOT NULL DEFAULT 'YER',
        sign         TEXT DEFAULT '',
        from_id      INTEGER,
        to_id        INTEGER,
        rate         REAL NOT NULL DEFAULT 1,
        description  TEXT DEFAULT '',
        reference    TEXT DEFAULT '',
        notes        TEXT DEFAULT '',
        category     TEXT DEFAULT '',
        attachment   TEXT DEFAULT '',
        image        TEXT DEFAULT '',
        status       TEXT NOT NULL DEFAULT 'done',
        date         TEXT NOT NULL,
        created_at   TEXT NOT NULL,
        updated_at   TEXT NOT NULL,
        FOREIGN KEY (account_id) REFERENCES accounts (id) ON DELETE CASCADE,
        FOREIGN KEY (from_id)    REFERENCES accounts (id) ON DELETE CASCADE,
        FOREIGN KEY (to_id)      REFERENCES accounts (id) ON DELETE CASCADE
      )''');
    await db.execute('CREATE INDEX idx_tx_acc ON transactions(account_id)');
    await db.execute('CREATE INDEX idx_tx_date ON transactions(date)');
    await db.execute('CREATE INDEX idx_tx_from ON transactions(from_id)');
    await db.execute('CREATE INDEX idx_tx_to ON transactions(to_id)');

    // ---------- السندات ----------
    await db.execute('''
      CREATE TABLE vouchers (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        number      TEXT NOT NULL,
        kind        TEXT NOT NULL,
        account_id  INTEGER,
        tx_id       INTEGER,
        amount      REAL NOT NULL DEFAULT 0,
        currency    TEXT NOT NULL DEFAULT 'YER',
        statement   TEXT DEFAULT '',
        notes       TEXT DEFAULT '',
        status      TEXT NOT NULL DEFAULT 'draft',
        date        TEXT NOT NULL,
        created_at  TEXT NOT NULL,
        updated_at  TEXT NOT NULL,
        FOREIGN KEY (account_id) REFERENCES accounts (id) ON DELETE SET NULL
      )''');
    await db.execute('CREATE INDEX idx_v_acc ON vouchers(account_id)');

    // ---------- العملات ----------
    await db.execute('''
      CREATE TABLE currencies (
        code    TEXT PRIMARY KEY,
        name    TEXT NOT NULL,
        symbol  TEXT NOT NULL,
        decimal INTEGER NOT NULL DEFAULT 0,
        rate    REAL NOT NULL DEFAULT 1
      )''');

    // ---------- التصنيفات ----------
    await db.execute('''
      CREATE TABLE categories (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        name       TEXT NOT NULL,
        scope      TEXT NOT NULL DEFAULT 'account',
        created_at TEXT NOT NULL
      )''');

    // ---------- المستخدمون والصلاحيات ----------
    await db.execute('''
      CREATE TABLE users (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        name        TEXT NOT NULL,
        role        TEXT NOT NULL DEFAULT 'manager',
        pin         TEXT DEFAULT '',
        password    TEXT DEFAULT '',
        permissions TEXT DEFAULT '',
        is_me       INTEGER NOT NULL DEFAULT 0,
        active      INTEGER NOT NULL DEFAULT 1,
        created_at  TEXT NOT NULL,
        updated_at  TEXT NOT NULL
      )''');

    // ---------- الدردشة ----------
    await db.execute('''
      CREATE TABLE conversations (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        title      TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )''');
    await db.execute('''
      CREATE TABLE messages (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        conversation_id INTEGER NOT NULL,
        sender          TEXT NOT NULL DEFAULT '',
        body            TEXT DEFAULT '',
        kind            TEXT NOT NULL DEFAULT 'text',
        payload         TEXT DEFAULT '',
        created_at      TEXT NOT NULL,
        FOREIGN KEY (conversation_id) REFERENCES conversations (id) ON DELETE CASCADE
      )''');
    await db.execute('CREATE INDEX idx_msg_conv ON messages(conversation_id)');

    // ---------- سجل النشاط ----------
    await db.execute('''
      CREATE TABLE activity (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        text       TEXT NOT NULL,
        ref_type   TEXT DEFAULT '',
        ref_id     TEXT DEFAULT '',
        user_name  TEXT DEFAULT '',
        created_at TEXT NOT NULL
      )''');
    await db.execute('CREATE INDEX idx_act_date ON activity(created_at)');

    // ---------- سلة المحذوفات ----------
    await db.execute('''
      CREATE TABLE trash (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        store      TEXT NOT NULL,
        payload    TEXT NOT NULL,
        label      TEXT DEFAULT '',
        created_at TEXT NOT NULL
      )''');

    // ---------- التنبيهات ----------
    await db.execute('''
      CREATE TABLE notifications (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        title      TEXT NOT NULL,
        body       TEXT DEFAULT '',
        kind       TEXT DEFAULT 'info',
        seen       INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      )''');

    // ---------- قوالب الرسائل ----------
    await db.execute('''
      CREATE TABLE templates (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        name       TEXT NOT NULL,
        body       TEXT NOT NULL,
        created_at TEXT NOT NULL
      )''');

    // ---------- الأصناف والمخزون ----------
    await db.execute(createItemsSql);
    await db.execute(createStockSql);
    await db.execute('CREATE INDEX idx_stock_item ON stock_moves(item_id)');

    // ---------- الإعدادات: مفتاح/قيمة كما في نسخة الويب ----------
    await db.execute('''
      CREATE TABLE settings (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )''');

    await _seed(db);
  }

  /// جدول الأصناف: سعر الشراء والبيع والكمية الحالية.
  static const createItemsSql = '''
      CREATE TABLE items (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        name          TEXT NOT NULL,
        sku           TEXT DEFAULT '',
        unit          TEXT DEFAULT 'حبة',
        buy_price     REAL NOT NULL DEFAULT 0,
        sell_price    REAL NOT NULL DEFAULT 0,
        quantity      REAL NOT NULL DEFAULT 0,
        min_quantity  REAL NOT NULL DEFAULT 0,
        currency      TEXT NOT NULL DEFAULT 'YER',
        category      TEXT DEFAULT '',
        notes         TEXT DEFAULT '',
        image         TEXT DEFAULT '',
        archived      INTEGER NOT NULL DEFAULT 0,
        created_at    TEXT NOT NULL,
        updated_at    TEXT NOT NULL
      )''';

  /// حركات المخزون: شراء يزيد الكمية، بيع ينقصها ويحقّق ربحًا.
  static const createStockSql = '''
      CREATE TABLE stock_moves (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        item_id     INTEGER NOT NULL,
        kind        TEXT NOT NULL,
        quantity    REAL NOT NULL DEFAULT 0,
        unit_price  REAL NOT NULL DEFAULT 0,
        account_id  INTEGER,
        notes       TEXT DEFAULT '',
        date        TEXT NOT NULL,
        created_at  TEXT NOT NULL,
        FOREIGN KEY (item_id) REFERENCES items (id) ON DELETE CASCADE
      )''';

  /// ترقية المخطط مع الحفاظ على كل البيانات القائمة.
  static Future<void> _migrate(Database db, int from, int to) async {
    if (from < 2) {
      await db.execute(createItemsSql);
      await db.execute(createStockSql);
      await db.execute('CREATE INDEX idx_stock_item ON stock_moves(item_id)');
      // صورة واحدة لكل عملية + كلمة مرور المستخدم
      await _addColumn(db, 'transactions', 'image', "TEXT DEFAULT ''");
      await _addColumn(db, 'users', 'password', "TEXT DEFAULT ''");
    }
  }

  /// إضافة عمود إن لم يكن موجودًا — آمنة للتكرار.
  static Future<void> _addColumn(
      Database db, String table, String column, String type) async {
    final cols = await db.rawQuery('PRAGMA table_info($table)');
    if (cols.any((c) => c['name'] == column)) return;
    await db.execute('ALTER TABLE $table ADD COLUMN $column $type');
  }

  /// البيانات الأولية: العملات الثلاث ومستخدم المدير.
  static Future<void> _seed(Database db) async {
    final now = DateTime.now().toIso8601String();
    for (final c in const [
      ['YER', 'الريال اليمني', 'ر.ي', 0],
      ['USD', 'الدولار الأمريكي', '\$', 2],
      ['SAR', 'الريال السعودي', 'ر.س', 2],
    ]) {
      await db.insert('currencies', {
        'code': c[0],
        'name': c[1],
        'symbol': c[2],
        'decimal': c[3],
        'rate': 1.0,
      });
    }
    await db.insert('users', {
      'name': 'المدير',
      'role': 'manager',
      'is_me': 1,
      'active': 1,
      'created_at': now,
      'updated_at': now,
    });
  }
}
