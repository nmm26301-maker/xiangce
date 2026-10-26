package com.flipyear.album;

import android.app.Activity;
import android.content.*;
import android.content.res.AssetFileDescriptor;
import android.graphics.BitmapFactory;
import android.media.MediaMetadataRetriever;
import android.net.Uri;
import android.os.*;
import android.provider.MediaStore;
import android.webkit.JavascriptInterface;
import org.json.JSONObject;
import java.io.*;
import java.nio.channels.FileChannel;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicBoolean;

/** Original-byte export and explicit playback of embedded JPEG Motion Photos. */
public final class OriginalMedia {
    private static final int EXPORT = 221;
    private final Activity activity;
    private final MediaLibrary.Callback sink;
    private static final ExecutorService worker = Executors.newSingleThreadExecutor();
    private final AtomicBoolean exporting = new AtomicBoolean(), playing = new AtomicBoolean();
    private volatile String inspection = "";
    private String exportId, exportHash;
    private long exportBytes;
    OriginalMedia(Activity owner, MediaLibrary.Callback callback) { activity = owner; sink = callback; }
    static Uri photoUri(Activity owner, String id) throws IOException {
        if (AlbumArchive.photoId(id)) return Uri.fromFile(CustomMedia.file(owner, id));
        if (id != null && id.matches("device-[1-9][0-9]{0,18}")) {
            try { return ContentUris.withAppendedId(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, Long.parseLong(id.substring(7))); }
            catch (NumberFormatException ignored) { }
        }
        throw new IOException("没有可用的原文件引用；旧版已压缩照片无法还原");
    }
    static boolean motionId(String id) {
        return id != null && id.matches("motion-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}");
    }
    static File motionFile(Activity owner, String id) throws IOException {
        if (!motionId(id)) throw new IOException("实况编号无效");
        return new File(owner.getCacheDir(), id + ".mp4");
    }
    @JavascriptInterface public void inspectPhoto(String id, String token) {
        inspection = token == null ? "" : token;
        if (inspection.isEmpty()) return;
        if (token.length() > 100) { inspection = ""; return; }
        worker.execute(() -> {
            if (!token.equals(inspection)) return;
            boolean found = false; String status = "未检测到受支持的 JPEG 实况；可手动关联 MOV / MP4";
            try { found = withSource(id, (channel, base, length) -> MotionPhoto.find(channel, base, length) != null); }
            catch (Exception e) { status = "暂无法读取实况，请检查原文件和访问权限"; }
            if (token.equals(inspection)) sink.script("window.onPhotoMotion && window.onPhotoMotion(" + JSONObject.quote(token) + "," + found + "," + JSONObject.quote(found ? "JPEG 实况照片" : status) + ")");
        });
    }
    @JavascriptInterface public void playMotion(String id) {
        if (!playing.compareAndSet(false, true)) return;
        worker.execute(() -> {
            File output = null;
            try {
                String key = "motion-" + UUID.randomUUID(); output = motionFile(activity, key); final File destination = output;
                withSource(id, (channel, base, length) -> {
                    MotionPhoto.Range range = MotionPhoto.find(channel, base, length);
                    if (range == null) throw new IOException("没有受支持的内嵌实况视频");
                    try (FileOutputStream out = new FileOutputStream(destination)) { MotionPhoto.extract(channel, base, range, out); out.getFD().sync(); }
                    return true;
                });
                MediaMetadataRetriever reader = new MediaMetadataRetriever();
                try { reader.setDataSource(output.getAbsolutePath()); if (!"yes".equals(reader.extractMetadata(MediaMetadataRetriever.METADATA_KEY_HAS_VIDEO))) throw new IOException("实况容器没有可播放的视频轨道"); }
                finally { reader.release(); }
                activity.runOnUiThread(() -> {
                    try { activity.startActivity(new Intent(activity, VideoPlayerActivity.class).putExtra(VideoPlayerActivity.MEDIA_ID, key)); }
                    catch (Exception e) { destination.delete(); message("实况播放器无法打开"); }
                    finally { playing.set(false); }
                });
            } catch (Exception e) { if (output != null) output.delete(); playing.set(false); message("实况未能播放：" + e.getMessage()); }
        });
    }
    private interface Source<T> { T read(FileChannel channel, long base, long length) throws Exception; }
    private <T> T withSource(String id, Source<T> action) throws Exception {
        try (AssetFileDescriptor asset = activity.getContentResolver().openAssetFileDescriptor(photoUri(activity, id), "r")) {
            if (asset == null) throw new IOException("原文件不可用");
            try (FileInputStream in = asset.createInputStream()) {
                long base = asset.getStartOffset(), length = asset.getDeclaredLength();
                if (length < 0) length = in.getChannel().size() - base;
                return action.read(in.getChannel(), base, length);
            }
        }
    }
    @JavascriptInterface public void exportOriginal(String id, String name, String checksum, long size) {
        if (!exporting.compareAndSet(false, true)) return;
        worker.execute(() -> {
            try {
                Uri source = photoUri(activity, id); String mime;
                if (AlbumArchive.photoId(id)) {
                    File file = CustomMedia.file(activity, id); OriginalBytes.verify(file, size, checksum);
                    BitmapFactory.Options bounds = new BitmapFactory.Options(); bounds.inJustDecodeBounds = true; BitmapFactory.decodeFile(file.getAbsolutePath(), bounds); mime = bounds.outMimeType;
                } else mime = activity.getContentResolver().getType(source);
                if (mime == null || !mime.startsWith("image/")) mime = "application/octet-stream";
                String title = name == null ? "FlipYear-original" : name.replaceAll("[\\\\/\\x00-\\x1f]", "_").trim();
                if (title.isEmpty()) title = "FlipYear-original"; if (title.length() > 180) title = title.substring(0, 180);
                exportId = id; exportHash = checksum; exportBytes = size;
                Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType(mime).putExtra(Intent.EXTRA_TITLE, title);
                activity.runOnUiThread(() -> { try { activity.startActivityForResult(intent, EXPORT); } catch (Exception e) { endExport(); message("保存选择器不可用"); } });
            } catch (Exception e) { endExport(); message("原文件未保存：" + e.getMessage()); }
        });
    }
    boolean handleResult(int code, int result, Intent data) {
        if (code != EXPORT) return false;
        if (result != Activity.RESULT_OK || data == null || data.getData() == null) { endExport(); message("已取消原文件保存"); return true; }
        final String id = exportId, hash = exportHash; final long bytes = exportBytes; final Uri destination = data.getData();
        worker.execute(() -> {
            try {
                if (AlbumArchive.photoId(id)) OriginalBytes.verify(CustomMedia.file(activity, id), bytes, hash);
                OriginalBytes.Identity written;
                try (InputStream in = activity.getContentResolver().openInputStream(photoUri(activity, id)); OutputStream out = activity.getContentResolver().openOutputStream(destination, "wt")) {
                    if (out == null) throw new IOException("无法打开保存位置");
                    written = OriginalBytes.transfer(in, out, AlbumArchive.MAX_VIDEO);
                    if (AlbumArchive.photoId(id)) written.require(bytes, hash);
                }
                // Reopen only after the provider has closed/committed the output stream.
                try (InputStream saved = activity.getContentResolver().openInputStream(destination)) {
                    OriginalBytes.transfer(saved, null, AlbumArchive.MAX_VIDEO).require(written.size, written.checksum);
                }
                message("原文件已保存，大小与 SHA-256 回读校验一致，未重新编码");
            } catch (Exception e) { message("原文件未通过完整保存校验，请勿作为唯一备份：" + e.getMessage()); }
            finally { endExport(); }
        });
        return true;
    }
    private void endExport() { exportId = null; exportHash = null; exportBytes = 0; exporting.set(false); }
    void saveState(Bundle out) { out.putString("photoExportId", exportId); out.putString("photoExportHash", exportHash); out.putLong("photoExportBytes", exportBytes); }
    void restoreState(Bundle in) { if (in != null) { exportId = in.getString("photoExportId"); exportHash = in.getString("photoExportHash"); exportBytes = in.getLong("photoExportBytes"); exporting.set(exportId != null); } }
    private void message(String text) { sink.script("window.onOriginalMessage && window.onOriginalMessage(" + JSONObject.quote(text) + ")"); }
    @JavascriptInterface public String deviceReport() {
        JSONObject report = new JSONObject();
        try {
            report.put("manufacturer", Build.MANUFACTURER).put("model", Build.MODEL).put("android", Build.VERSION.RELEASE).put("sdk", Build.VERSION.SDK_INT);
            android.content.pm.PackageInfo info = android.webkit.WebView.getCurrentWebViewPackage();
            report.put("webview", info == null ? "unknown" : info.packageName + " " + info.versionName);
            android.app.ActivityManager memory = (android.app.ActivityManager) activity.getSystemService(android.content.Context.ACTIVITY_SERVICE);
            report.put("memoryClassMB", memory == null ? 0 : memory.getMemoryClass()).put("lowRam", memory != null && memory.isLowRamDevice());
            report.put("physicalDeviceTest", "用户需实际操作验证；此报告仅记录运行环境");
        } catch (Exception ignored) { }
        return report.toString();
    }
}
