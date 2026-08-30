package com.nexora.eradata;

import android.content.ClipData;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.util.Base64;

import androidx.activity.result.ActivityResult;
import androidx.core.content.FileProvider;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.PluginMethod;

import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;

/**
 * Native Android bridge for sending a generated receipt image and its text to
 * WhatsApp. The web implementation remains available for browsers and for
 * devices where WhatsApp is not installed.
 */
@CapacitorPlugin(name = "WhatsAppShare")
public class WhatsAppSharePlugin extends Plugin {

    @PluginMethod
    public void shareReceipt(PluginCall call) {
        final String dataUrl = call.getString("dataUrl", "");
        final String text = call.getString("text", "");
        final String phone = normalizePhone(call.getString("phone", ""));
        if (dataUrl.isEmpty()) {
            call.reject("Receipt image is empty");
            return;
        }
        if (phone.isEmpty()) {
            call.reject("Customer phone is empty");
            return;
        }

        try {
            final int comma = dataUrl.indexOf(',');
            if (comma < 0) {
                call.reject("Invalid receipt image");
                return;
            }
            final String metadata = dataUrl.substring(0, comma);
            final String payload = dataUrl.substring(comma + 1);
            final byte[] bytes = metadata.contains(";base64")
                    ? Base64.decode(payload, Base64.DEFAULT)
                    : Uri.decode(payload).getBytes(StandardCharsets.UTF_8);
            final String mime = metadata.startsWith("data:")
                    ? metadata.substring(5).split("[;,]", 2)[0]
                    : "image/png";

            final File imageFile = new File(getContext().getCacheDir(), "nexora-receipt-" + System.currentTimeMillis() + ".png");
            try (FileOutputStream output = new FileOutputStream(imageFile)) {
                output.write(bytes);
            }
            final Uri imageUri = FileProvider.getUriForFile(
                    getContext(), getContext().getPackageName() + ".fileprovider", imageFile);

            final Intent intent = new Intent(Intent.ACTION_SEND);
            intent.setType(mime.isEmpty() ? "image/png" : mime);
            intent.putExtra(Intent.EXTRA_STREAM, imageUri);
            intent.setClipData(ClipData.newRawUri("receipt", imageUri));
            intent.putExtra(Intent.EXTRA_TEXT, text);
            // WhatsApp uses this extra when it can resolve a direct chat.
            intent.putExtra("jid", phone + "@s.whatsapp.net");
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);

            final PackageManager packageManager = getContext().getPackageManager();
            intent.setPackage("com.whatsapp");
            if (packageManager.resolveActivity(intent, PackageManager.MATCH_DEFAULT_ONLY) == null) {
                intent.setPackage("com.whatsapp.w4b");
            }
            if (packageManager.resolveActivity(intent, PackageManager.MATCH_DEFAULT_ONLY) == null) {
                call.reject("WhatsApp is not installed");
                return;
            }
            startActivityForResult(call, intent, "shareReceiptResult");
        } catch (Exception error) {
            call.reject("Unable to prepare WhatsApp receipt", error);
        }
    }

    @ActivityCallback
    private void shareReceiptResult(PluginCall call, ActivityResult result) {
        // WhatsApp often returns RESULT_CANCELED even after the user completes an
        // ACTION_SEND share. Resolving here prevents a second, duplicate share sheet.
        if (call != null) call.resolve();
    }

    private String normalizePhone(String raw) {
        String phone = raw == null ? "" : raw.replaceAll("\\D", "");
        if (phone.startsWith("00")) phone = phone.substring(2);
        // Local Yemen numbers are commonly stored as 07xxxxxxxx; WhatsApp JIDs need 967.
        if (phone.startsWith("0") && phone.length() >= 9) phone = "967" + phone.substring(1);
        return phone;
    }
}
