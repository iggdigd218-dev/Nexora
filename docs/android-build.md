# 📱 بناء تطبيق أندرويد (APK) لـ «إدارة البيانات»

مشروع أندرويد كامل موجود في مجلد `android/` (مبني بـ **Capacitor** / WebView). يمكنك الحصول على ملف **APK** بطريقتين:

---

## ⚡ الطريقة 1: GitHub Actions (تلقائي — موصى به)

ملف سير العمل جاهز في `docs/android-build.github-actions.yml`.

> **ملاحظة أمان في هذا المستودع:** حساب الروبوت الذي أنشأ المشروع لا يملك صلاحية `Workflows`، لذلك لا يمكنه حفظ الملف في `.github/workflows/`. لتشغيله:

1. **انقل** الملف إلى موقعه الصحيح:

   ```bash
   mv docs/android-build.github-actions.yml .github/workflows/android-build.yml
   ```

2. ارفعه على الفرع `main` أو `arena/01a043e4-nexora`:
   ```bash
   git add .github/workflows/android-build.yml
   git commit -m "enable android build workflow"
   git push origin main
   ```

3. افتح تبويب **Actions** في المستودع → ستجد سير العمل `Build Android APK` يعمل تلقائياً على كل دفع.

4. عند نجاح البناء:
   - يُرفع الـ **APK** الموقّع كمُرفَق (Artifact) باسم `e4-data-android-apk`.
   - يُنشأ **GitHub Release** باسم `v1.0.0-android` يتضمن `app-release.apk` جاهزاً للتحميل والتثبيت.

> **بديل أسرع:** في صفحة المستودع اضغط **Actions** → اختر `Build Android APK` → **Run workflow** لبنائه يدوياً دون انتظار دفع.

---

## 🖥️ الطريقة 2: بناء محلي على جهازك

تحتاج: **JDK 17** + **Android SDK** (مع build-tools و platform 35) + **Node 20**.

```bash
# 1) تثبيت التبعيات
npm install

# 2) تجهيز أصول الويب
mkdir -p www && cp -r index.html css js icons manifest.webmanifest sw.js www/

# 3) مزامنة Capacitor مع مشروع أندرويد
npx cap sync android

# 4) مسار الـ SDK
echo "sdk.dir=$ANDROID_HOME" > android/local.properties

# 5) بناء نسخة التصحيح (Debug) — غير موقعة بشكل نهائي لكنها تعمل
cd android && ./gradlew assembleDebug
# الناتج: android/app/build/outputs/apk/debug/app-debug.apk
```

### توقيع نسخة إنتاجية (Release)

```bash
keytool -genkey -v -keystore release.keystore -alias nexora \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -storepass nexora2026 -keypass nexora2026 \
  -dname "CN=إدارة البيانات, O=Nexora, C=YE"

export RELEASE_STORE_FILE=$PWD/release.keystore
export RELEASE_STORE_PASSWORD=nexora2026
export RELEASE_KEY_ALIAS=nexora
export RELEASE_KEY_PASSWORD=nexora2026

cd android && ./gradlew assembleRelease
# الناتج: android/app/build/outputs/apk/release/app-release.apk (موقّع)
```

### التثبيت على الهاتف
- انسخ ملف الـ APK إلى هاتفك وافتحه، ثم فعّل **«تثبيت من مصادر غير معروفة»** عند الطلب.

---

## 🗂️ بنية مشروع أندرويد

```
android/
  app/src/main/
    assets/public/     ← أصول الويب (يُنشئها `cap sync`)
    java/com/nexora/eradata/MainActivity.java
    res/               ← أيقونات وسلاش سكرين و strings.xml (اسم «إدارة البيانات»)
  build.gradle         ← إعدادات التوقيع الإنتاجي
```

## 🛠️ إعدادات التطبيق (capacitor.config.json)
- `appId`: `com.nexora.eradata`
- `appName`: إدارة البيانات
- الوصول: `androidScheme: https` (لا يُسمح بالترافيك النصي)
