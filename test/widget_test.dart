import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:path/path.dart' as p;
import 'package:sqflite_common_ffi/sqflite_ffi.dart';

import 'package:nexora_app/core/accounting.dart';
import 'package:nexora_app/core/database.dart';
import 'package:nexora_app/core/format.dart';
import 'package:nexora_app/core/words.dart';
import 'package:nexora_app/core/models.dart';
import 'package:nexora_app/core/security.dart';
import 'package:nexora_app/data/repository.dart';

DateTime _d(int day) => DateTime(2026, 8, day);

Tx _tx({
  int? id,
  int? accountId,
  AccountKind kind = AccountKind.customer,
  required OpType type,
  required double amount,
  String sign = '',
  int? fromId,
  int? toId,
  double rate = 1,
}) =>
    Tx(
      id: id,
      accountId: accountId,
      accountKind: kind,
      type: type,
      amount: amount,
      sign: sign,
      fromId: fromId,
      toId: toId,
      rate: rate,
      date: _d(1),
      createdAt: _d(1),
      updatedAt: _d(1),
    );

Account _acc({int? id, double opening = 0, AccountKind? kind}) => Account(
      id: id,
      name: 'حساب',
      kind: kind ?? AccountKind.customer,
      openingBalance: opening,
      createdAt: _d(1),
      updatedAt: _d(1),
    );

void main() {
  sqfliteFfiInit();
  databaseFactory = databaseFactoryFfi;

  group('اتفاقية الأرصدة', () {
    test('موجب يعني مستحقًا لنا وسالب مستحقًا علينا', () {
      expect(balanceNature(500), 'positive');
      expect(balanceNature(-500), 'negative');
      expect(balanceNature(0), 'zero');
    });

    test('مبلغ له (مدين) يزيد الرصيد', () {
      expect(opEffect(OpType.debit, AccountKind.customer), 1);
    });

    test('مبلغ عليه (دائن) ينقص الرصيد', () {
      expect(opEffect(OpType.credit, AccountKind.customer), -1);
    });

    test('القبض من العميل سداد فينقص ذمته', () {
      expect(opEffect(OpType.inflow, AccountKind.customer), -1);
    });

    test('القبض في الحساب العام يزيد الأصل', () {
      expect(opEffect(OpType.inflow, AccountKind.general), 1);
    });

    test('الصرف للعميل يزيد ذمته وللحساب العام ينقص أصله', () {
      expect(opEffect(OpType.outflow, AccountKind.customer), 1);
      expect(opEffect(OpType.outflow, AccountKind.general), -1);
    });

    test('التحويل والتسوية يُعالجان خصيصًا فأثرهما المباشر صفر', () {
      expect(opEffect(OpType.transfer, AccountKind.general), 0);
      expect(opEffect(OpType.settle, AccountKind.general), 0);
    });
  });

  group('أثر العملية على حساب', () {
    test('العملية لا تمسّ حسابًا آخر', () {
      final t = _tx(accountId: 1, type: OpType.debit, amount: 100);
      expect(t.effectOn(2), isNull);
      expect(t.effectOn(1), 100);
    });

    test('التسوية تتبع العلامة التي اختارها المستخدم', () {
      final plus =
          _tx(accountId: 1, type: OpType.settle, amount: 80, sign: '+');
      final minus =
          _tx(accountId: 1, type: OpType.settle, amount: 80, sign: '-');
      expect(plus.effectOn(1), 80);
      expect(minus.effectOn(1), -80);
    });

    test('التحويل ينقص من المصدر ويزيد الوجهة', () {
      final t = _tx(type: OpType.transfer, amount: 300, fromId: 1, toId: 2);
      expect(t.effectOn(1), -300);
      expect(t.effectOn(2), 300);
      expect(t.effectOn(3), isNull);
    });

    test('التحويل بعملة مختلفة يطبّق سعر الصرف على الوجهة فقط', () {
      final t = _tx(
          type: OpType.transfer, amount: 100, fromId: 1, toId: 2, rate: 250);
      expect(t.effectOn(1), -100);
      expect(t.effectOn(2), 25000);
    });
  });

  group('حساب الرصيد من السجل', () {
    late Repo repo;
    late Directory tmp;
    late Database db;

    setUp(() async {
      // ملف مؤقت مستقل لكل اختبار: قاعدة :memory: تُعاد مشاركتها بين
      // الاختبارات في sqflite_ffi فتتصادم الجداول.
      tmp = await Directory.systemTemp.createTemp('nexora_test');
      db = await databaseFactory.openDatabase(p.join(tmp.path, 'test.db'));
      await AppDatabase.createSchema(db);
      AppDatabase.overrideForTest(db);
      repo = Repo();
    });

    tearDown(() async {
      await db.close();
      if (tmp.existsSync()) tmp.deleteSync(recursive: true);
    });

    test('الرصيد = الافتتاحي + أثر العمليات', () async {
      final id = await repo.saveAccount(_acc(opening: 1000));
      final a = (await repo.account(id))!;

      await repo.saveTx(_tx(accountId: id, type: OpType.debit, amount: 500));
      await repo.saveTx(_tx(accountId: id, type: OpType.credit, amount: 200));

      expect(await repo.balanceOf(a), 1300);
    });

    test('حذف عملية يعيد حساب الرصيد فورًا', () async {
      final id = await repo.saveAccount(_acc());
      final a = (await repo.account(id))!;
      final txId =
          await repo.saveTx(_tx(accountId: id, type: OpType.debit, amount: 700));
      expect(await repo.balanceOf(a), 700);

      await repo.deleteTx(txId);
      expect(await repo.balanceOf(a), 0);
    });

    test('التحويل ينعكس على طرفيه معًا', () async {
      final from = await repo.saveAccount(
          Account(name: 'من', createdAt: _d(1), updatedAt: _d(1)));
      final to = await repo.saveAccount(
          Account(name: 'إلى', createdAt: _d(1), updatedAt: _d(1)));

      await repo.saveTx(
          _tx(type: OpType.transfer, amount: 400, fromId: from, toId: to));

      expect(await repo.balanceOf((await repo.account(from))!), -400);
      expect(await repo.balanceOf((await repo.account(to))!), 400);
    });

    test('الأرصدة الجماعية تطابق الحساب الفردي', () async {
      final a1 = await repo.saveAccount(_acc(opening: 100));
      final a2 = await repo.saveAccount(
          Account(name: 'ثانٍ', openingBalance: -50, createdAt: _d(1), updatedAt: _d(1)));
      await repo.saveTx(_tx(accountId: a1, type: OpType.debit, amount: 25));

      final all = await repo.accounts();
      final map = await repo.allBalances(all);
      expect(map[a1], 125);
      expect(map[a2], -50);
    });

    test('الأرشفة تُخفي الحساب دون فقد بياناته', () async {
      final id = await repo.saveAccount(_acc());
      await repo.archiveAccount(id, true);
      expect((await repo.accounts()).length, 0);
      expect((await repo.accounts(includeArchived: true)).length, 1);
    });

    test('العملات الثلاث موجودة عند الإنشاء', () async {
      final c = await repo.currencies();
      expect(c.length, 3);
      expect(c.map((e) => e.code), containsAll(['YER', 'USD', 'SAR']));
    });
  });

  group('التنسيق', () {
    test('تحويل الأرقام العربية', () {
      expect(Fmt.parseAmount('١٢٣'), 123);
      expect(Fmt.parseAmount('1,500'), 1500);
      expect(Fmt.parseAmount('12.5'), 12.5);
    });

    test('رفض المدخل غير الصالح', () {
      expect(Fmt.parseAmount(''), isNull);
      expect(Fmt.parseAmount('نص'), isNull);
    });

    test('رقم واتساب يمني يُطبَّع إلى صيغة دولية', () {
      expect(Fmt.waNumber('0774190040'), '967774190040');
      expect(Fmt.waNumber('774190040'), '967774190040');
      expect(Fmt.waNumber('+967774190040'), '967774190040');
    });

    test('المبالغ تُنسَّق بعدد المنازل الصحيح', () {
      expect(Fmt.money(1500), '1,500');
      expect(Fmt.money(1500.5, 2), '1,500.50');
    });
  });

  group('مجموعات التقارير', () {
    test('تصنيف العمليات إلى تدفّق داخل وخارج', () {
      expect(opGroup(OpType.revenue), 'inflow');
      expect(opGroup(OpType.inflow), 'inflow');
      expect(opGroup(OpType.expense), 'outflow');
      expect(opGroup(OpType.outflow), 'outflow');
      expect(opGroup(OpType.debit), 'receivable');
      expect(opGroup(OpType.credit), 'payable');
    });
  });

  group('تصفية العمليات', () {
    late Repo repo;
    late Directory tmp;
    late Database db;

    setUp(() async {
      tmp = await Directory.systemTemp.createTemp('nexora_txf');
      db = await databaseFactory.openDatabase(p.join(tmp.path, 't.db'));
      await AppDatabase.createSchema(db);
      AppDatabase.overrideForTest(db);
      repo = Repo();
    });

    tearDown(() async {
      await db.close();
      if (tmp.existsSync()) tmp.deleteSync(recursive: true);
    });

    test('التصفية بالنوع تعيد ذلك النوع فقط', () async {
      final id = await repo.saveAccount(_acc());
      await repo.saveTx(_tx(accountId: id, type: OpType.revenue, amount: 10));
      await repo.saveTx(_tx(accountId: id, type: OpType.expense, amount: 20));

      final only = await repo.transactions(type: OpType.expense);
      expect(only.length, 1);
      expect(only.first.amount, 20);
    });

    test('التصفية بالحساب تشمل طرفي التحويل', () async {
      final a = await repo.saveAccount(_acc());
      final b = await repo.saveAccount(
          Account(name: 'ب', createdAt: _d(1), updatedAt: _d(1)));
      await repo.saveTx(
          _tx(type: OpType.transfer, amount: 50, fromId: a, toId: b));

      expect((await repo.transactions(accountId: a)).length, 1);
      expect((await repo.transactions(accountId: b)).length, 1);
    });

    test('التصفية بالفترة تستبعد ما خارجها', () async {
      final id = await repo.saveAccount(_acc());
      await repo.saveTx(Tx(
          accountId: id,
          type: OpType.debit,
          amount: 5,
          date: DateTime(2026, 1, 5),
          createdAt: _d(1),
          updatedAt: _d(1)));
      await repo.saveTx(Tx(
          accountId: id,
          type: OpType.debit,
          amount: 7,
          date: DateTime(2026, 6, 5),
          createdAt: _d(1),
          updatedAt: _d(1)));

      final q = await repo.transactions(
          from: DateTime(2026, 5, 1), to: DateTime(2026, 12, 31));
      expect(q.length, 1);
      expect(q.first.amount, 7);
    });

    test('كشف التكرار ينبّه على عملية مطابقة في نفس اليوم', () async {
      final id = await repo.saveAccount(_acc());
      final t = _tx(accountId: id, type: OpType.inflow, amount: 300);
      await repo.saveTx(t);
      expect((await repo.findDuplicates(t)).isNotEmpty, true);
    });

    test('حذف عملية ينقلها إلى سلة المهملات', () async {
      final id = await repo.saveAccount(_acc());
      final txId =
          await repo.saveTx(_tx(accountId: id, type: OpType.debit, amount: 9));
      await repo.deleteTx(txId);
      final trash = await db.query('trash');
      expect(trash.length, 1);
      expect(trash.first['store'], 'transactions');
    });
  });

  group('التفقيط بالعربية', () {
    test('أعداد أساسية', () {
      expect(numberToWords(0), 'صفر');
      expect(numberToWords(1), 'واحد');
      expect(numberToWords(11), 'أحد عشر');
      expect(numberToWords(100), 'مائة');
    });

    test('المئات والآلاف', () {
      expect(numberToWords(1000), 'ألف');
      expect(numberToWords(500), 'خمسمائة');
      expect(numberToWords(2000).contains('ألف'), true);
    });

    test('الكسور تُقرأ من المائة', () {
      expect(numberToWords(1.5).contains('من المائة'), true);
    });

    test('القيم السالبة تُقرأ بقيمتها المطلقة', () {
      expect(numberToWords(-100), numberToWords(100));
    });
  });

  group('السندات', () {
    late Repo repo;
    late Directory tmp;
    late Database db;

    setUp(() async {
      tmp = await Directory.systemTemp.createTemp('nexora_vou');
      db = await databaseFactory.openDatabase(p.join(tmp.path, 'v.db'));
      await AppDatabase.createSchema(db);
      AppDatabase.overrideForTest(db);
      repo = Repo();
    });

    tearDown(() async {
      await db.close();
      if (tmp.existsSync()) tmp.deleteSync(recursive: true);
    });

    test('الترقيم التلقائي يبدأ من ٠٠٠١ ويتسلسل', () async {
      expect(await repo.nextVoucherNumber(VoucherKind.receipt), 'ق0001');
      expect(await repo.nextVoucherNumber(VoucherKind.receipt), 'ق0002');
    });

    test('لكل نوع سند عدّاد وبادئة مستقلّان', () async {
      await repo.nextVoucherNumber(VoucherKind.receipt);
      expect(await repo.nextVoucherNumber(VoucherKind.payment), 'ص0001');
      expect(await repo.nextVoucherNumber(VoucherKind.transfer), 'تح0001');
    });

    test('حفظ السند واسترجاعه', () async {
      final accId = await repo.saveAccount(_acc());
      final now = _d(1);
      final id = await repo.saveVoucher(Voucher(
        number: 'ق0001',
        kind: VoucherKind.receipt,
        accountId: accId,
        amount: 5000,
        date: now,
        createdAt: now,
        updatedAt: now,
      ));
      final v = await repo.voucher(id);
      expect(v!.number, 'ق0001');
      expect(v.amount, 5000);
      expect(v.status, 'draft');
    });

    test('اعتماد السند يغيّر حالته', () async {
      final now = _d(1);
      final id = await repo.saveVoucher(Voucher(
        number: 'ق0001',
        kind: VoucherKind.receipt,
        amount: 100,
        date: now,
        createdAt: now,
        updatedAt: now,
      ));
      final v = (await repo.voucher(id))!;
      await repo.saveVoucher(v.copyWith(status: 'approved'));
      expect((await repo.voucher(id))!.statusLabel, 'معتمد');
    });
  });

  group('الصلاحيات', () {
    test('المدير يملك كل شيء', () {
      final perms = defaultPerms(UserRole.admin);
      expect(perms.values.every((v) => v), true);
    });

    test('المحاسب يعتمد السندات ولا يدير المستخدمين', () {
      final p = defaultPerms(UserRole.accountant);
      expect(p['approve_vouchers'], true);
      expect(p['manage_users'], false);
    });

    test('موظف الإدخال يضيف ولا يحذف', () {
      final p = defaultPerms(UserRole.dataentry);
      expect(p['add_tx'], true);
      expect(p['delete_tx'], false);
    });

    test('العارض يقرأ التقارير فقط', () {
      final p = defaultPerms(UserRole.viewer);
      expect(p['view_reports'], true);
      expect(p['add_tx'], false);
    });

    test('can() تتجاوز الصلاحيات للمدير', () {
      final u = AppUser(
        name: 'مدير',
        role: UserRole.admin,
        permissions: const {},
        createdAt: _d(1),
        updatedAt: _d(1),
      );
      expect(u.can('manage_users'), true);
    });
  });

  group('النسخ الاحتياطي', () {
    late Repo repo;
    late Directory tmp;
    late Database db;

    setUp(() async {
      tmp = await Directory.systemTemp.createTemp('nexora_bk');
      db = await databaseFactory.openDatabase(p.join(tmp.path, 'b.db'));
      await AppDatabase.createSchema(db);
      AppDatabase.overrideForTest(db);
      repo = Repo();
    });

    tearDown(() async {
      await db.close();
      if (tmp.existsSync()) tmp.deleteSync(recursive: true);
    });

    test('التصدير يشمل الحسابات والعمليات', () async {
      final id = await repo.saveAccount(_acc(opening: 250));
      await repo.saveTx(_tx(accountId: id, type: OpType.debit, amount: 75));

      final dump = await repo.exportAll();
      expect(dump['app'], 'nexora');
      final data = dump['data'] as Map<String, Object?>;
      expect((data['accounts'] as List).length, 1);
      expect((data['transactions'] as List).length, 1);
    });

    test('الاستيراد يستبدل البيانات بالكامل', () async {
      final a1 = await repo.saveAccount(_acc(opening: 100));
      await repo.saveTx(_tx(accountId: a1, type: OpType.debit, amount: 50));
      final dump = await repo.exportAll();

      // نغيّر الحالة ثم نستعيد
      await repo.saveAccount(Account(
          name: 'دخيل', createdAt: _d(2), updatedAt: _d(2)));
      expect((await repo.accounts()).length, 2);

      await repo.importAll(dump);
      final after = await repo.accounts();
      expect(after.length, 1);
      expect(await repo.balanceOf(after.first), 150);
    });

    test('ملف غير صالح يُرفض', () async {
      expect(() => repo.importAll({'app': 'nexora'}),
          throwsA(isA<FormatException>()));
    });

    test('الاسترجاع من سلة المهملات يعيد العملية', () async {
      final id = await repo.saveAccount(_acc());
      final txId =
          await repo.saveTx(_tx(accountId: id, type: OpType.debit, amount: 40));
      await repo.deleteTx(txId);
      expect((await repo.transactions()).length, 0);

      final t = await repo.trash();
      await repo.restoreFromTrash(t.first['id'] as int);
      expect((await repo.transactions()).length, 1);
    });
  });

  // ==================== المخزون والأصناف ====================
  group('المخزون', () {
    late Repo repo;
    late Directory tmp;
    late Database db;

    setUp(() async {
      tmp = await Directory.systemTemp.createTemp('nexora_inv');
      db = await databaseFactory.openDatabase(p.join(tmp.path, 'test.db'));
      await AppDatabase.createSchema(db);
      AppDatabase.overrideForTest(db);
      repo = Repo();
    });

    tearDown(() async {
      await db.close();
      if (tmp.existsSync()) tmp.deleteSync(recursive: true);
    });

    Item mk({double buy = 100, double sell = 150, double qty = 0}) => Item(
          name: 'أرز',
          buyPrice: buy,
          sellPrice: sell,
          quantity: qty,
          createdAt: _d(1),
          updatedAt: _d(1),
        );

    test('ربح الوحدة والهامش', () {
      final it = mk(buy: 80, sell: 100, qty: 10);
      expect(it.unitProfit, 20);
      expect(it.marginPercent, 25);
      expect(it.stockCost, 800);
      expect(it.stockValue, 1000);
      expect(it.expectedProfit, 200);
    });

    test('الشراء يزيد الكمية والبيع ينقصها', () async {
      final id = await repo.saveItem(mk(qty: 0));
      await repo.addStockMove(StockMove(
          itemId: id,
          kind: StockKind.purchase,
          quantity: 10,
          unitPrice: 100,
          date: _d(1),
          createdAt: _d(1)));
      expect((await repo.item(id))!.quantity, 10);

      await repo.addStockMove(StockMove(
          itemId: id,
          kind: StockKind.sale,
          quantity: 4,
          unitPrice: 150,
          date: _d(2),
          createdAt: _d(2)));
      expect((await repo.item(id))!.quantity, 6);
    });

    test('التسوية تضبط الكمية على القيمة المدخلة', () async {
      final id = await repo.saveItem(mk(qty: 10));
      await repo.addStockMove(StockMove(
          itemId: id,
          kind: StockKind.adjust,
          quantity: 7,
          date: _d(1),
          createdAt: _d(1)));
      expect((await repo.item(id))!.quantity, 7);
    });

    test('الربح المحقق يُحسب من حركات البيع فقط', () async {
      final id = await repo.saveItem(mk(buy: 100, sell: 150, qty: 20));
      await repo.addStockMove(StockMove(
          itemId: id,
          kind: StockKind.sale,
          quantity: 5,
          unitPrice: 150,
          date: _d(1),
          createdAt: _d(1)));
      await repo.addStockMove(StockMove(
          itemId: id,
          kind: StockKind.purchase,
          quantity: 5,
          unitPrice: 100,
          date: _d(2),
          createdAt: _d(2)));
      final sum = await repo.inventorySummary();
      expect(sum['realised'], 250); // (150-100) × 5
      expect(sum['sales'], 750);
    });

    test('حد التنبيه يرصد النواقص', () async {
      final it = Item(
          name: 'سكر',
          quantity: 2,
          minQuantity: 5,
          createdAt: _d(1),
          updatedAt: _d(1));
      expect(it.low, isTrue);
      expect(it.out, isFalse);
      expect(it.copyWith(quantity: 0).out, isTrue);
    });

    test('حذف الصنف ينقله إلى سلة المهملات ويمكن استرجاعه', () async {
      final id = await repo.saveItem(mk());
      await repo.deleteItem(id);
      expect((await repo.items()).length, 0);
      final t = await repo.trash();
      expect(t.length, 1);
      await repo.restoreFromTrash(t.first['id'] as int);
      expect((await repo.items()).length, 1);
    });
  });

  // ==================== كلمات المرور والنسخ المتسامحة ====================
  group('الأمان والنسخ', () {
    late Repo repo;
    late Directory tmp;
    late Database db;

    setUp(() async {
      tmp = await Directory.systemTemp.createTemp('nexora_sec');
      db = await databaseFactory.openDatabase(p.join(tmp.path, 'test.db'));
      await AppDatabase.createSchema(db);
      AppDatabase.overrideForTest(db);
      repo = Repo();
    });

    tearDown(() async {
      await db.close();
      if (tmp.existsSync()) tmp.deleteSync(recursive: true);
    });

    test('التجزئة ثابتة والتحقق يقبل الصحيح فقط', () {
      final h = Security.hash('1234');
      expect(h, Security.hash('1234'));
      expect(h, isNot(equals('1234')));
      expect(Security.verify('1234', h), isTrue);
      expect(Security.verify('9999', h), isFalse);
      // كلمة مرور فارغة تعني بلا حماية
      expect(Security.verify('', ''), isTrue);
    });

    test('المستخدم بكلمة مرور يُعدّ محميًا', () async {
      final u = AppUser(
          name: 'محاسب',
          password: Security.hash('sirr'),
          createdAt: _d(1),
          updatedAt: _d(1));
      expect(u.locked, isTrue);
      final id = await repo.saveUser(u);
      final back = (await repo.users()).firstWhere((x) => x.id == id);
      expect(back.locked, isTrue);
      expect(Security.verify('sirr', back.password), isTrue);
    });

    test('الاستيراد يتسامح مع أعمدة غريبة ومسميات أخرى', () async {
      // نسخة من تطبيق آخر: جدول باسم customers وعمود لا نعرفه
      final n = await repo.importAll({
        'customers': [
          {
            'name': 'زبون خارجي',
            'kind': 'customer',
            'opening_balance': 500,
            'currency': 'YER',
            'created_at': '2024-01-01T00:00:00.000',
            'updated_at': '2024-01-01T00:00:00.000',
            'loyalty_points': 42, // عمود مجهول يجب تجاهله
          }
        ],
      });
      expect(n, 1);
      final accs = await repo.accounts();
      expect(accs.length, 1);
      expect(accs.first.name, 'زبون خارجي');
      expect(await repo.balanceOf(accs.first), 500);
    });

    test('التصدير يشمل الأصناف والحركات', () async {
      final id = await repo.saveItem(Item(
          name: 'زيت', buyPrice: 10, sellPrice: 15,
          createdAt: _d(1), updatedAt: _d(1)));
      await repo.addStockMove(StockMove(
          itemId: id, kind: StockKind.purchase, quantity: 3,
          unitPrice: 10, date: _d(1), createdAt: _d(1)));
      final dump = await repo.exportAll(withImages: false);
      final data = dump['data'] as Map<String, Object?>;
      expect((data['items'] as List).length, 1);
      expect((data['stock_moves'] as List).length, 1);
    });
  });
}
