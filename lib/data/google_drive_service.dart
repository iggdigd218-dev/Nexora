import 'dart:convert';
import 'dart:io' as io;

import 'package:google_sign_in/google_sign_in.dart';
import 'package:http/http.dart' as http;

/// معلومات تعريفية للحساب المرتبط فقط.
///
/// لا نحتفظ هنا بـ access token ولا نكتبه إلى قاعدة البيانات أو الإعدادات.
class GoogleAccountInfo {
  final String id;
  final String email;
  final String? displayName;
  final String? photoUrl;

  const GoogleAccountInfo({
    required this.id,
    required this.email,
    this.displayName,
    this.photoUrl,
  });
}

/// بيانات آخر نسخة محفوظة في مجلد بيانات التطبيق في Drive.
class GoogleDriveBackupInfo {
  final String name;
  final DateTime? modifiedTime;
  final int? sizeBytes;

  const GoogleDriveBackupInfo({
    required this.name,
    this.modifiedTime,
    this.sizeBytes,
  });

  String get sizeLabel {
    final size = sizeBytes;
    if (size == null || size <= 0) return '';
    if (size < 1024) return '$size بايت';
    if (size < 1024 * 1024) {
      return '${(size / 1024).toStringAsFixed(1)} ك.ب';
    }
    return '${(size / (1024 * 1024)).toStringAsFixed(1)} م.ب';
  }
}

class GoogleDriveException implements Exception {
  final String message;

  const GoogleDriveException(this.message);

  @override
  String toString() => message;
}

class GoogleDriveBackupNotFoundException extends GoogleDriveException {
  const GoogleDriveBackupNotFoundException()
    : super('لا توجد نسخة احتياطية لنكسورا في حساب Google المرتبط.');
}

class _DriveFile {
  final String id;
  final String name;
  final DateTime? modifiedTime;
  final int? sizeBytes;

  const _DriveFile({
    required this.id,
    required this.name,
    this.modifiedTime,
    this.sizeBytes,
  });

  GoogleDriveBackupInfo toPublicInfo() => GoogleDriveBackupInfo(
    name: name,
    modifiedTime: modifiedTime,
    sizeBytes: sizeBytes,
  );
}

/// عميل Google Sign-In وDrive.
///
/// يستخدم نطاق `drive.appdata` فقط، لذلك لا يطلب الوصول إلى ملفات المستخدم
/// العادية في Drive. تُستعمل واجهة Drive REST مباشرة عبر عميل HTTP مؤقت؛ كل
/// ترويسة OAuth تُجلب عند الطلب ولا يُخزَّن access token محليًا.
class GoogleDriveService {
  GoogleDriveService._();

  static final GoogleDriveService instance = GoogleDriveService._();

  static const String backupFileName = 'nexora-backup-latest.nexora';
  static const String _driveHost = 'www.googleapis.com';
  static const String _driveBasePath = '/drive/v3';
  static const String _uploadBasePath = '/upload/drive/v3';
  static const String _mimeType = 'application/json';
  static const String _driveScope =
      'https://www.googleapis.com/auth/drive.appdata';
  static const String _fileFields = 'id,name,modifiedTime,size';

  final GoogleSignIn _signIn = GoogleSignIn(scopes: [_driveScope]);

  /// يستعيد جلسة Google السابقة بصمت إن كانت موجودة.
  Future<GoogleAccountInfo?> restoreSession() async {
    try {
      final account =
          _signIn.currentUser ??
          await _signIn.signInSilently(suppressErrors: true);
      return account == null ? null : _toAccountInfo(account);
    } catch (e) {
      throw GoogleDriveException('تعذّر التحقق من حساب Google: $e');
    }
  }

  /// يفتح OAuth للمستخدم عند الحاجة، ثم يعيد بيانات الحساب التعريفية فقط.
  Future<GoogleAccountInfo?> signIn() async {
    try {
      final account = _signIn.currentUser ?? await _signIn.signIn();
      return account == null ? null : _toAccountInfo(account);
    } catch (e) {
      throw GoogleDriveException('تعذّر ربط حساب Google: $e');
    }
  }

  /// تسجيل خروج محلي من جلسة Google. لا توجد بيانات اعتماد محفوظة في Nexora.
  Future<void> signOut() async {
    try {
      await _signIn.signOut();
    } catch (e) {
      throw GoogleDriveException('تعذّر تسجيل الخروج من Google: $e');
    }
  }

  /// فصل الحساب وإلغاء المنح السابقة حتى يمكن ربط حساب آخر بوضوح.
  Future<void> disconnect() async {
    try {
      await _signIn.disconnect();
    } catch (e) {
      throw GoogleDriveException('تعذّر فصل حساب Google: $e');
    }
  }

  Future<GoogleDriveBackupInfo?> latestBackup() async {
    return _withDrive((client, headers) async {
      final file = await _findBackup(client, headers);
      return file?.toPublicInfo();
    });
  }

  /// يرفع نسخة واحدة أو يحدّث النسخة الموجودة بالاسم نفسه.
  Future<GoogleDriveBackupInfo> uploadLatest(io.File localFile) async {
    if (!await localFile.exists()) {
      throw const GoogleDriveException('ملف النسخة المحلي غير موجود.');
    }

    final bytes = await localFile.readAsBytes();
    return _withDrive((client, headers) async {
      var existing = await _findBackup(client, headers);
      String? newlyCreatedId;
      try {
        if (existing == null) {
          final created = await _createMetadata(client, headers);
          newlyCreatedId = created.id;
          existing = created;
        }
        final updated = await _uploadContent(client, headers, existing, bytes);
        return updated.toPublicInfo();
      } catch (_) {
        // لا نترك ملفًا فارغًا إذا فشل رفع محتواه بعد إنشاء metadata.
        if (newlyCreatedId != null) {
          try {
            await client.delete(
              _fileUri('/files/$newlyCreatedId'),
              headers: headers,
            );
          } catch (_) {
            // سيظهر الخطأ الأصلي للمستخدم، ويمكن تحديث الملف في المحاولة التالية.
          }
        }
        rethrow;
      }
    });
  }

  /// ينزّل النسخة الوحيدة إلى ملف مؤقت يحدده المستدعي.
  Future<GoogleDriveBackupInfo> downloadLatestTo(io.File target) async {
    return _withDrive((client, headers) async {
      final file = await _findBackup(client, headers);
      if (file == null) throw const GoogleDriveBackupNotFoundException();

      final response = await client.get(
        _fileUri('/files/${Uri.encodeComponent(file.id)}', {'alt': 'media'}),
        headers: headers,
      );
      _ensureSuccess(response, 'تنزيل النسخة');
      final parent = target.parent;
      if (!await parent.exists()) await parent.create(recursive: true);
      await target.writeAsBytes(response.bodyBytes, flush: true);
      return file.toPublicInfo();
    });
  }

  Future<_DriveFile?> _findBackup(
    http.Client client,
    Map<String, String> headers,
  ) async {
    final response = await client.get(
      _fileUri('/files', {
        'spaces': 'appDataFolder',
        'q': "name = '$backupFileName' and trashed = false",
        'orderBy': 'modifiedTime desc',
        'pageSize': '10',
        'fields': 'files($_fileFields)',
      }),
      headers: headers,
    );
    _ensureSuccess(response, 'البحث عن نسخة Google Drive');

    final decoded = jsonDecode(response.body);
    if (decoded is! Map) {
      throw const GoogleDriveException('استجابة Google Drive غير صالحة.');
    }
    final list = decoded['files'];
    if (list is! List || list.isEmpty) return null;
    final first = list.first;
    if (first is! Map || first['id'] is! String) {
      throw const GoogleDriveException('بيانات ملف النسخة غير مكتملة.');
    }
    return _driveFileFromJson(first);
  }

  Future<_DriveFile> _createMetadata(
    http.Client client,
    Map<String, String> headers,
  ) async {
    final response = await client.post(
      _fileUri('/files', {'fields': _fileFields}),
      headers: {...headers, 'Content-Type': 'application/json; charset=utf-8'},
      body: jsonEncode({
        'name': backupFileName,
        'mimeType': _mimeType,
        'parents': ['appDataFolder'],
      }),
    );
    _ensureSuccess(response, 'إنشاء ملف النسخة');
    return _parseFileResponse(response, 'إنشاء ملف النسخة');
  }

  Future<_DriveFile> _uploadContent(
    http.Client client,
    Map<String, String> headers,
    _DriveFile file,
    List<int> bytes,
  ) async {
    final response = await client.patch(
      _fileUri('/files/${Uri.encodeComponent(file.id)}', {
        'uploadType': 'media',
        'fields': _fileFields,
      }, true),
      headers: {...headers, 'Content-Type': _mimeType},
      body: bytes,
    );
    _ensureSuccess(response, 'رفع محتوى النسخة');
    return _parseFileResponse(response, 'رفع محتوى النسخة');
  }

  _DriveFile _parseFileResponse(http.Response response, String operation) {
    final decoded = jsonDecode(response.body);
    if (decoded is! Map || decoded['id'] is! String) {
      throw GoogleDriveException(
        'استجابة Google Drive غير صالحة بعد $operation.',
      );
    }
    return _driveFileFromJson(decoded);
  }

  _DriveFile _driveFileFromJson(Map<dynamic, dynamic> json) {
    final id = json['id'];
    if (id is! String || id.isEmpty) {
      throw const GoogleDriveException('معرّف ملف Google Drive مفقود.');
    }
    final modified = json['modifiedTime'];
    return _DriveFile(
      id: id,
      name: json['name'] is String ? json['name'] as String : backupFileName,
      modifiedTime: modified is String
          ? DateTime.tryParse(modified)?.toLocal()
          : null,
      sizeBytes: int.tryParse('${json['size'] ?? ''}'),
    );
  }

  Future<T> _withDrive<T>(
    Future<T> Function(http.Client client, Map<String, String> headers)
    operation,
  ) async {
    GoogleSignInAccount? account = _signIn.currentUser;
    account ??= await _signIn.signInSilently(suppressErrors: true);
    final signedIn = account;
    if (signedIn == null) {
      throw const GoogleDriveException(
        'اربط حساب Google أولًا لاستخدام النسخ السحابي.',
      );
    }

    final headers = await signedIn.authHeaders;
    final client = http.Client();
    try {
      return await operation(client, headers);
    } on GoogleDriveException {
      rethrow;
    } catch (e) {
      throw GoogleDriveException('تعذّرت عملية Google Drive: $e');
    } finally {
      client.close();
    }
  }

  Uri _fileUri(String path, [Map<String, String>? query, bool upload = false]) {
    final base = upload ? _uploadBasePath : _driveBasePath;
    return Uri.https(_driveHost, '$base$path', query);
  }

  void _ensureSuccess(http.Response response, String operation) {
    if (response.statusCode >= 200 && response.statusCode < 300) return;
    var detail = response.body.trim();
    if (detail.length > 300) detail = '${detail.substring(0, 300)}…';
    throw GoogleDriveException(
      '$operation فشل (HTTP ${response.statusCode})${detail.isEmpty ? '' : ': $detail'}',
    );
  }

  GoogleAccountInfo _toAccountInfo(GoogleSignInAccount account) =>
      GoogleAccountInfo(
        id: account.id,
        email: account.email,
        displayName: account.displayName,
        photoUrl: account.photoUrl,
      );
}
