package com.nexora.eradata

import android.content.ClipData
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import androidx.core.content.FileProvider
import io.flutter.embedding.android.FlutterFragmentActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel
import java.io.File

/**
 * FlutterFragmentActivity وليس FlutterActivity: مكتبة البصمة (local_auth)
 * تتطلّب FragmentActivity لعرض نافذة المصادقة، وبدونها لا تعمل البصمة.
 */
class MainActivity : FlutterFragmentActivity() {
    private val waChannel = "nexora/whatsapp"
    private val waPackages = listOf("com.whatsapp", "com.whatsapp.w4b")

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)

        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, waChannel)
            .setMethodCallHandler { call, result ->
                when (call.method) {
                    "installed" -> result.success(installedPackages())
                    "send" -> {
                        val phone = call.argument<String>("phone") ?: ""
                        val text = call.argument<String>("text") ?: ""
                        val path = call.argument<String>("path")
                        val pkg = call.argument<String>("package")
                        result.success(send(phone, text, path, pkg))
                    }
                    else -> result.notImplemented()
                }
            }
    }

    private fun installedPackages(): List<String> =
        waPackages.filter { p ->
            try { packageManager.getPackageInfo(p, 0); true }
            catch (e: PackageManager.NameNotFoundException) { false }
        }

    /**
     * يفتح محادثة الرقم مباشرة داخل واتساب مع الصورة والنص دون تكرار أو نوافذ اختيار متعددة.
     */
    private fun send(phone: String, text: String, path: String?, pkg: String?): String {
        val digits = phone.filter { it.isDigit() }
        if (digits.length < 8) return "bad_phone"

        val target = pkg?.takeIf { it in installedPackages() }
            ?: installedPackages().firstOrNull()
            ?: return "no_whatsapp"

        val file = path?.let { File(it) }
            ?.takeIf { it.exists() && it.length() > 0L }
            ?.let { src -> copyToShared(src) }

        if (file != null) {
            val uri: Uri = try {
                FileProvider.getUriForFile(this, "$packageName.fileprovider", file)
            } catch (e: Exception) {
                return "image_failed"
            }

            val jid = "$digits@s.whatsapp.net"
            grantUriPermission(target, uri, Intent.FLAG_GRANT_READ_URI_PERMISSION)

            // 1. فتح واتساب المحدد مباشرة مع رقم المحادثة والمرفق
            val withJid = imageIntent(target, uri, text, jid, includeJid = true)
            if (launch(withJid)) return "ok"

            // 2. محاولة عبر ContactPicker للحزمة المحددة
            val direct = imageIntent(target, uri, text, jid, includeJid = true).apply {
                setClassName(target, "com.whatsapp.ContactPicker")
            }
            if (launch(direct)) return "ok"

            // 3. مشاركة الصورة والنص داخل الحزمة المحددة فقط دون تعميم
            val plain = imageIntent(target, uri, text, jid, includeJid = false)
            if (launch(plain)) return "ok"

            return "image_failed"
        }

        return sendTextOnly(digits, text, target)
    }

    /** يبني Intent صورة مع النص المرافق، مع منح واتساب صلاحية قراءة الملف. */
    private fun imageIntent(
        target: String?,
        uri: Uri,
        text: String,
        jid: String,
        includeJid: Boolean,
    ): Intent = Intent(Intent.ACTION_SEND).apply {
        target?.let { setPackage(it) }
        type = "image/*"
        putExtra(Intent.EXTRA_STREAM, uri)
        putExtra(Intent.EXTRA_TEXT, text)
        putExtra(Intent.EXTRA_TITLE, "سند العملية")
        if (includeJid) putExtra("jid", jid)
        clipData = ClipData.newUri(contentResolver, "voucher", uri)
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }

    private fun sendTextOnly(digits: String, text: String, target: String): String {
        val encoded = Uri.encode(text)
        
        // 1. الرابط المباشر للواجهة البرمجية لواتساب بالحزمة المحددة
        val directApi = Intent(Intent.ACTION_VIEW, Uri.parse("https://api.whatsapp.com/send?phone=$digits&text=$encoded")).apply {
            setPackage(target)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        if (launch(directApi)) return "ok"

        // 2. المخطط المباشر whatsapp:// بالحزمة المحددة
        val schemeIntent = Intent(Intent.ACTION_VIEW, Uri.parse("whatsapp://send?phone=$digits&text=$encoded")).apply {
            setPackage(target)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        if (launch(schemeIntent)) return "ok"

        // 3. رابط wa.me المباشر
        val viaLink = Intent(Intent.ACTION_VIEW, Uri.parse("https://wa.me/$digits?text=$encoded")).apply {
            setPackage(target)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        if (launch(viaLink)) return "ok"

        return "error:تعذّر فتح المحادثة"
    }

    private fun launch(intent: Intent): Boolean = try {
        startActivity(intent); true
    } catch (e: Exception) { false }

    /** FileProvider يتطلّب مسارًا معلنًا في file_paths.xml. */
    private fun copyToShared(src: File): File = try {
        val dir = File(cacheDir, "shared").apply { mkdirs() }
        val dst = File(dir, src.name)
        src.copyTo(dst, overwrite = true)
        dst
    } catch (e: Exception) { src }
}
