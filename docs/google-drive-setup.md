# إعداد OAuth والنسخ السحابي في Nexora

أضيف تكامل Google إلى التطبيق باستخدام `google_sign_in: ^6.2.2` وعميل HTTP
لواجهة Drive REST المتوافقين مع SDK الحالي للمشروع، ويُطلب النطاق التالي فقط:

`https://www.googleapis.com/auth/drive.appdata`

تُخزّن Nexora البريد والاسم و`id` التعريفي للحساب في ذاكرة الشاشة/جلسة Google
فقط. لا يكتب التطبيق `access token` إلى SQLite أو الإعدادات أو ملف النسخة.
يُنشئ Google Sign-In ترويسات OAuth عند كل عملية Drive، ثم يُغلق عميل HTTP.

## إعداد Google Cloud

1. أنشئ مشروعًا في [Google Cloud Console](https://console.cloud.google.com/)
   أو اختر مشروع التطبيق.
2. فعّل **Google Drive API** من صفحة APIs & Services → Library.
3. أكمل شاشة **OAuth consent screen**. عند اختيار External أضف حساب Google
   الذي سيختبر التطبيق إلى Test users ما دام التطبيق في وضع الاختبار.
4. أنشئ OAuth Client من نوع **Android**:
   - Package name: `com.nexora.eradata`
   - SHA-1 وSHA-256 لشهادة debug التي يُختبر بها APK.
   - أضف أيضًا SHA-1 وSHA-256 لشهادة release الفعلية قبل توزيع النسخة.
5. لا تستخدم Web client أو Service Account بدل Android client. لا يحتاج هذا
   المسار إلى حفظ سر داخل التطبيق، ولا إلى صلاحية Drive الكاملة. لا يلزم
   `google-services.json` لهذا التكامل وحده؛ أضفه فقط إذا كان المشروع سيستخدم
   خدمة Google أخرى تعتمد عليه.

## استخراج بصمات Android

لشهادة debug المعتادة يمكن استخدام:

```bash
keytool -list -v \
  -alias androiddebugkey \
  -keystore "$HOME/.android/debug.keystore" \
  -storepass android \
  -keypass android
```

ولشهادة release استخدم ملف keystore الحقيقي، أو شغّل `signingReport` من مجلد
Android بعد توفر Flutter/Gradle:

```bash
cd android
./gradlew signingReport
```

يجب أن تطابق البصمة الشهادة التي وقّعت APK المثبت على الهاتف. اختلافها، أو
اختلاف `applicationId`، يؤدي غالبًا إلى `DEVELOPER_ERROR` عند تسجيل الدخول.

## اختبار داخل التطبيق

1. ابنِ APK بعد إضافة OAuth Android client.
2. افتح **النسخ الاحتياطي → النسخ السحابي عبر Google Drive**.
3. اختر **ربط حساب Google** ووافق على صلاحية بيانات التطبيق.
4. اختر **رفع / تحديث**. تُنشئ Nexora ملفًا واحدًا باسم
   `nexora-backup-latest.nexora` داخل `appDataFolder`، ثم تحدّثه في الرفع التالي
   بدل إنشاء ملفات مكررة.
5. على جهاز آخر ثبّت APK موقّعًا ببصمة مسجلة، اربط الحساب نفسه، ثم اختر
   **استعادة**.

ملفات `appDataFolder` مخفية عن واجهة Drive العادية؛ هذا مقصود حتى لا تُخلط
نسخة Nexora بملفات المستخدم. تظهر حالة الحساب ووقت/حجم آخر نسخة داخل الشاشة.
يمكن تسجيل الخروج أو فصل الحساب ثم إعادة ربط حساب آخر. عند تفعيل تضمين الصور
ترفض Nexora إنشاء نسخة ناقصة إذا كانت صورة المشار إليها مفقودة أو أكبر من 10 م.ب؛
عند إيقاف تضمين الصور تُفرغ مسارات الصور غير القابلة لإعادة الربط بدل ترك مسار
قديم معطّل.

## تشخيص الأخطاء

- **DEVELOPER_ERROR**: راجع package name والبصمة SHA-1/SHA-256 وOAuth consent
  screen، ثم أعد تثبيت APK بعد تغيير بيانات الاعتماد.
- **Access blocked / لم يُمنح النطاق**: أضف الحساب إلى Test users أثناء وضع
  الاختبار، وتأكد من تفعيل Google Drive API.
- **لا توجد نسخة**: الحساب المرتبط صحيح، لكن لم يُنفّذ رفع ناجح إلى
  `appDataFolder` بعد، أو أُعيد ربط حساب مختلف.
- لا تطلب صلاحية `drive` الكاملة لمجرد النسخ الاحتياطي؛ الكود يستخدم
  `drive.appdata` فقط.
