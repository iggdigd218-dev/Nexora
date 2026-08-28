# ============ Flutter ============
-keep class io.flutter.app.** { *; }
-keep class io.flutter.plugin.** { *; }
-keep class io.flutter.embedding.** { *; }
-keep class io.flutter.plugins.** { *; }
-dontwarn io.flutter.embedding.**

# ============ الإضافات المستدعاة عبر الانعكاس ============
# هذه الأصناف تُسجَّل ديناميكيًا، وحذفها يسبب انهيارًا وقت التشغيل
-keep class co.quis.flutter_contacts.** { *; }
-keep class dev.flutter.plugins.** { *; }
-keep class com.crazecoder.openfile.** { *; }
-keep class io.flutter.plugins.imagepicker.** { *; }
-keep class dev.fluttercommunity.plus.share.** { *; }

# ============ البصمة / local_auth ============
-keep class androidx.biometric.** { *; }
-keep class androidx.fragment.app.** { *; }
-keep class io.flutter.plugins.localauth.** { *; }

# ============ جسور الكود الأصلي ============
-keep class com.tadween.tadween_app.** { *; }
-keep class android.accounts.** { *; }

# ============ sqflite ============
-keep class com.tekartik.sqflite.** { *; }

# ============ تحذيرات غير مؤثرة ============
-dontwarn javax.annotation.**
-dontwarn com.google.errorprone.annotations.**
-dontwarn com.google.android.play.core.**

# الحفاظ على أسماء الأسطر لتتبّع الأعطال
-keepattributes SourceFile,LineNumberTable,*Annotation*,Signature
