package com.flipyear.album;

import android.content.Context;
import android.os.Build;
import java.io.*;
import java.security.MessageDigest;
import java.util.Arrays;

/** Models are writable data; executable code is only loaded from the installed signed APK. */
final class AiFiles {
    static final String ENGINE_HASH = "bf1608a272d43a062f55370dead6578583fc651025733c4c5335df45efc88d94";
    static final String NCNN_HASH = "17f3c033ef4837262919e179f26c4ef439dbb4a452d595a12086cbdf953310fb";
    private static final String[] NAMES = {"x4.param", "x4.bin"};
    private static final String[] HASHES = {"59d9422b09a684445a4185addaa6c504368b7cb58607805d5b9bca7a4b5d61e4", "01450f4a79b81c0f1f3eeefc31121167886125c25e41a6d4773e8ec8062528a1"};
    static String hash(File file) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        try (InputStream in = new FileInputStream(file)) { byte[] b = new byte[65536]; int n; while ((n = in.read(b)) != -1) digest.update(b, 0, n); }
        StringBuilder s = new StringBuilder(); for (byte b : digest.digest()) s.append(String.format(java.util.Locale.ROOT, "%02x", b & 255)); return s.toString();
    }
    static File engine(Context context) throws Exception {
        if (!Arrays.asList(Build.SUPPORTED_ABIS).contains("arm64-v8a")) throw new IOException("本版需要 ARM64 手机");
        File directory = new File(context.getApplicationInfo().nativeLibraryDir);
        File engine = new File(directory, "libflipyear_realsr.so"), runtime = new File(directory, "libncnn.so");
        if (!engine.canExecute() || !ENGINE_HASH.equals(hash(engine)) || !NCNN_HASH.equals(hash(runtime)))
            throw new IOException("内置增强引擎校验失败，请重新安装本版 APK");
        return engine;
    }
    static synchronized File models(Context context) throws Exception {
        // Upstream CLI requires "models" in this directory name.
        File dir = new File(context.getFilesDir(), "models-Real-ESRGANv3-general-v1");
        if (!dir.isDirectory() && !dir.mkdirs()) throw new IOException("模型目录不可用");
        for (int i = 0; i < NAMES.length; i++) {
            File dest = new File(dir, NAMES[i]);
            if (dest.isFile() && HASHES[i].equals(hash(dest))) continue;
            File tmp = new File(dir, NAMES[i] + ".tmp");
            try (InputStream in = context.getAssets().open("ai-engine/" + NAMES[i]); FileOutputStream out = new FileOutputStream(tmp)) {
                byte[] b = new byte[65536]; int n; while ((n = in.read(b)) != -1) out.write(b, 0, n); out.getFD().sync();
            }
            if (!HASHES[i].equals(hash(tmp))) { tmp.delete(); throw new IOException("内置模型校验失败"); }
            if (!tmp.renameTo(dest)) throw new IOException("无法保存本机模型");
        }
        return dir;
    }
    static void remove(File file) { if (file == null) return; File[] children = file.listFiles(); if (children != null) for (File child : children) remove(child); file.delete(); }
}
