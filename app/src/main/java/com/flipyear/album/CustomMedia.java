package com.flipyear.album;

import android.app.Activity;
import android.content.Intent;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.media.MediaMetadataRetriever;
import android.media.ThumbnailUtils;
import android.net.Uri;
import android.os.Build;
import android.provider.OpenableColumns;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceResponse;
import org.json.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicBoolean;

/** Private video copies and self-contained album archives, transported through SAF. */
public final class CustomMedia {
    private static final int PICK = 211, EXPORT = 212, RESTORE = 213;
    private final Activity activity;
    private final MediaLibrary.Callback sink;
    // One application-wide queue also protects copies during Activity recreation.
    private static final ThreadPoolExecutor worker = new ThreadPoolExecutor(1, 1, 0, TimeUnit.MILLISECONDS, new LinkedBlockingQueue<>());
    private static final AtomicBoolean busy = new AtomicBoolean();
    private String target, archive;
    private volatile String pendingToken;

    CustomMedia(Activity owner, MediaLibrary.Callback callback) {
        activity = owner; sink = callback;
        pendingToken = owner.getSharedPreferences("album-media", 0).getString("pending", "");
        if (!pendingToken.isEmpty()) busy.set(true);
        else if (worker.getActiveCount() == 0 && worker.getQueue().isEmpty()) busy.set(false);
    }

    static File file(Activity activity, String id) throws IOException {
        if (!AlbumArchive.validId(id)) throw new IOException("视频编号无效");
        File folder = new File(activity.getFilesDir(), "album-videos");
        if (!folder.isDirectory() && !folder.mkdirs()) throw new IOException("无法创建视频目录");
        return new File(folder, id + ".bin");
    }

    private File resultFile(String token) { return new File(activity.getFilesDir(), "album-result-" + token + ".json"); }
    void restoreTarget(android.os.Bundle saved) { if (saved != null) target = saved.getString("albumVideoTarget"); }
    void saveTarget(android.os.Bundle out) { out.putString("albumVideoTarget", target); }
    private boolean claim() { return busy.compareAndSet(false, true); }
    private void error(String message) {
        busy.set(false);
        sink.script("window.onAlbumMediaError && window.onAlbumMediaError(" + JSONObject.quote(message) + ")");
    }
    private void launch(Intent intent, int code) {
        activity.runOnUiThread(() -> { try { activity.startActivityForResult(intent, code); } catch (Exception e) { error("系统文件选择器不可用"); } });
    }

    @JavascriptInterface public void chooseVideos(String bookId) {
        if (!claim()) { sink.script("window.onAlbumMediaError && window.onAlbumMediaError('请先完成当前视频操作')"); return; }
        if (bookId == null || bookId.isEmpty() || bookId.length() > 100) { error("相册编号无效"); return; }
        target = bookId;
        launch(new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("video/*").putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true), PICK);
    }

    @JavascriptInterface public void saveArchive(String json) {
        if (!claim()) { sink.script("window.onAlbumMediaError && window.onAlbumMediaError('请先完成当前视频操作')"); return; }
        worker.execute(() -> {
            try {
                if (json == null || json.getBytes(StandardCharsets.UTF_8).length > AlbumArchive.MAX_MANIFEST) throw new IOException("相册说明超过 32MB，请逐本导出");
                referenced(new JSONObject(json)); archive = json;
                launch(new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("application/zip")
                    .putExtra(Intent.EXTRA_TITLE, "FlipYear-" + new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(new Date()) + ".zip"), EXPORT);
            } catch (Exception e) { error("备份无法准备：" + e.getMessage()); }
        });
    }

    @JavascriptInterface public void restoreArchive() {
        if (!claim()) { sink.script("window.onAlbumMediaError && window.onAlbumMediaError('请先完成当前视频操作')"); return; }
        launch(new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*")
            .putExtra(Intent.EXTRA_MIME_TYPES, new String[] {"application/zip", "application/x-zip-compressed", "application/octet-stream"}), RESTORE);
    }

    @JavascriptInterface public String resultUrl() {
        pendingToken = activity.getSharedPreferences("album-media", 0).getString("pending", "");
        String token = pendingToken;
        return token.isEmpty() ? "" : "https://flipyear.local/album-result/" + token;
    }

    @JavascriptInterface public void finishResult(String token, boolean keep) {
        if (token == null || !token.equals(pendingToken)) return;
        worker.execute(() -> {
            try {
                if (!token.equals(pendingToken)) return;
                if (!keep) {
                    JSONArray ids = new JSONArray(activity.getSharedPreferences("album-media", 0).getString("created", "[]"));
                    for (int i = 0; i < ids.length(); i++) file(activity, ids.getString(i)).delete();
                }
                resultFile(token).delete();
                activity.getSharedPreferences("album-media", 0).edit().remove("pending").remove("created").commit();
                pendingToken = ""; busy.set(false);
            } catch (Exception e) { sink.script("window.onAlbumMediaError && window.onAlbumMediaError('视频操作收尾失败，请重启后重试')"); }
        });
    }

    @JavascriptInterface public void cleanup(String keptJson) {
        if (!claim()) { sink.script("window.onAlbumMediaError && window.onAlbumMediaError('请先完成当前视频操作')"); return; }
        worker.execute(() -> {
            try {
                JSONArray values = new JSONArray(keptJson); Set<String> kept = new HashSet<>();
                if (values.length() > 10000) throw new IOException("视频引用过多");
                for (int i = 0; i < values.length(); i++) { String id = values.getString(i); if (!AlbumArchive.validId(id)) throw new IOException("视频引用无效"); kept.add(id); }
                File folder = new File(activity.getFilesDir(), "album-videos"); File[] files = folder.listFiles(); int deleted = 0;
                if (files != null) for (File f : files) {
                    String name = f.getName(); String id = name.endsWith(".bin") ? name.substring(0, name.length() - 4) : "";
                    if (AlbumArchive.validId(id) && !kept.contains(id)) { if (!f.delete()) throw new IOException("部分副本无法清理，请重试"); deleted++; }
                }
                busy.set(false); sink.script("window.onAlbumCleanup && window.onAlbumCleanup(" + deleted + ")");
            } catch (Exception e) { error("清理未完成：" + e.getMessage()); }
        });
    }

    boolean handleResult(int code, int result, Intent data) {
        if (code != PICK && code != EXPORT && code != RESTORE) return false;
        busy.set(true);
        if (result != Activity.RESULT_OK || data == null) { archive = null; error("操作已取消，现有相册保留"); return true; }
        if (code == PICK) {
            List<Uri> sources = new ArrayList<>();
            if (data.getClipData() != null) for (int i = 0; i < data.getClipData().getItemCount(); i++) sources.add(data.getClipData().getItemAt(i).getUri());
            else if (data.getData() != null) sources.add(data.getData());
            final String book = target; worker.execute(() -> importVideos(book, sources));
        } else if (data.getData() == null) { error("没有选择文件"); }
        else if (code == EXPORT) {
            final String manifest = archive; archive = null; final Uri destination = data.getData();
            worker.execute(() -> export(manifest, destination));
        } else { final Uri source = data.getData(); worker.execute(() -> restore(source)); }
        return true;
    }

    private void importVideos(String book, List<Uri> sources) {
        List<File> created = new ArrayList<>();
        try {
            if (book == null || sources.isEmpty() || sources.size() > 20) throw new IOException("每批请选择 1–20 段视频");
            JSONArray pages = new JSONArray(); long total = 0;
            for (int i = 0; i < sources.size(); i++) {
                Uri uri = sources.get(i);
                if (!"content".equals(uri.getScheme())) throw new IOException("请选择系统文件中的视频");
                sink.script("window.onAlbumMediaProgress && window.onAlbumMediaProgress(" + (i + 1) + "," + sources.size() + ")");
                String id = "local-video-" + UUID.randomUUID(); File dest = file(activity, id);
                if (!dest.createNewFile()) throw new IOException("无法创建独立视频副本");
                created.add(dest);
                try (InputStream in = activity.getContentResolver().openInputStream(uri); FileOutputStream out = new FileOutputStream(dest)) {
                    long size = AlbumArchive.copy(in, out, Math.min(AlbumArchive.MAX_VIDEO, AlbumArchive.MAX_TOTAL - total));
                    if (size == 0) throw new IOException("视频文件为空"); total += size; out.getFD().sync();
                }
                JSONObject p = metadata(dest, id); String name = "视频";
                try (Cursor c = activity.getContentResolver().query(uri, new String[] {OpenableColumns.DISPLAY_NAME}, null, null, null)) { if (c != null && c.moveToFirst()) name = c.getString(0); }
                catch (Exception ignored) { }
                p.put("filename", name == null ? "视频" : name.substring(0, Math.min(500, name.length()))); pages.put(p);
            }
            JSONObject payload = new JSONObject().put("type", "import").put("target", book).put("pages", pages);
            emit(payload, created);
        } catch (Exception e) { for (File f : created) f.delete(); error("视频导入失败：" + e.getMessage()); }
    }

    private JSONObject metadata(File f, String id) throws Exception {
        MediaMetadataRetriever r = new MediaMetadataRetriever();
        try {
            r.setDataSource(f.getAbsolutePath());
            if (!"yes".equals(r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_HAS_VIDEO))) throw new IOException("无法识别视频格式");
            String rawDate = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DATE), date = "";
            if (rawDate != null && rawDate.matches("[0-9]{8}T[0-9]{6}\\.[0-9]{3}Z")) {
                SimpleDateFormat parser = new SimpleDateFormat("yyyyMMdd'T'HHmmss.SSS'Z'", Locale.US); parser.setTimeZone(TimeZone.getTimeZone("UTC")); parser.setLenient(false);
                try { date = new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(parser.parse(rawDate)); } catch (Exception ignored) { }
            }
            long duration = 0; try { duration = Math.max(0, Long.parseLong(r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION))); } catch (Exception ignored) { }
            return new JSONObject().put("id", UUID.randomUUID().toString()).put("videoId", id).put("kind", "video")
                .put("src", posterUrl(id)).put("durationMs", duration).put("date", date).put("caption", "").put("layout", "classic");
        } finally { r.release(); }
    }

    private void emit(JSONObject result, List<File> created) throws Exception {
        String token = UUID.randomUUID().toString(); JSONArray ids = new JSONArray();
        for (File f : created) ids.put(f.getName().substring(0, f.getName().length() - 4));
        result.put("token", token).put("created", ids);
        File temp = File.createTempFile("album-result-", ".tmp", activity.getFilesDir());
        try {
            try (FileOutputStream out = new FileOutputStream(temp)) { out.write(result.toString().getBytes(StandardCharsets.UTF_8)); out.getFD().sync(); }
            if (!temp.renameTo(resultFile(token))) throw new IOException("无法保留导入结果");
            if (!activity.getSharedPreferences("album-media", 0).edit().putString("pending", token).putString("created", ids.toString()).commit()) throw new IOException("无法保留导入记录");
            pendingToken = token;
            sink.script("window.onAlbumMediaResult && window.onAlbumMediaResult()");
        } finally { temp.delete(); }
    }

    private Set<String> referenced(JSONObject manifest) throws Exception {
        if (!"flipyear".equals(manifest.optString("format")) || manifest.optInt("version") != 2) throw new IOException("备份格式无效");
        JSONArray books = manifest.getJSONArray("books"); if (books.length() > 200) throw new IOException("相册数量超限");
        Set<String> ids = new LinkedHashSet<>(); int total = 0;
        for (int b = 0; b < books.length(); b++) {
            JSONArray pages = books.getJSONObject(b).getJSONArray("pages"); total += pages.length();
            if (pages.length() > 1000 || total > 3000) throw new IOException("照片页数量超限");
            for (int p = 0; p < pages.length(); p++) if ("video".equals(pages.getJSONObject(p).optString("kind"))) {
                String id = pages.getJSONObject(p).getString("videoId"); if (!AlbumArchive.validId(id)) throw new IOException("视频编号无效"); ids.add(id);
            }
        }
        if (ids.size() > AlbumArchive.MAX_FILES) throw new IOException("单份备份最多 200 个视频");
        return ids;
    }

    private void export(String json, Uri destination) {
        try {
            if (json == null) throw new IOException("备份会话已结束，请重新导出");
            Map<String, File> files = new LinkedHashMap<>(); for (String id : referenced(new JSONObject(json))) files.put(id, file(activity, id));
            try (OutputStream out = activity.getContentResolver().openOutputStream(destination, "wt")) {
                if (out == null) throw new IOException("无法打开保存位置");
                AlbumArchive.write(out, json.getBytes(StandardCharsets.UTF_8), files);
            }
            busy.set(false); sink.script("window.onAlbumArchiveSaved && window.onAlbumArchiveSaved()");
        } catch (Exception e) { error("视频备份未保存：" + e.getMessage()); }
    }

    private void restore(Uri source) {
        File staging = new File(activity.getFilesDir(), "album-restore-" + UUID.randomUUID()); List<File> committed = new ArrayList<>();
        try {
            if (!staging.mkdir()) throw new IOException("无法创建恢复暂存目录");
            AlbumArchive.Restored restored;
            try (InputStream in = activity.getContentResolver().openInputStream(source)) {
                restored = AlbumArchive.read(in, staging, bytes -> {
                    try { return referenced(new JSONObject(new String(bytes, StandardCharsets.UTF_8))); }
                    catch (Exception e) { throw new IOException("备份说明无效", e); }
                });
            }
            JSONObject backup = new JSONObject(new String(restored.manifest, StandardCharsets.UTF_8)); Map<String, String> remap = new HashMap<>();
            for (Map.Entry<String, File> item : restored.files.entrySet()) {
                String id = "local-video-" + UUID.randomUUID(); File dest = file(activity, id);
                if (dest.exists() || !item.getValue().renameTo(dest)) throw new IOException("无法提交恢复的视频");
                committed.add(dest); remap.put(item.getKey(), id);
            }
            JSONArray books = backup.getJSONArray("books");
            for (int b = 0; b < books.length(); b++) {
                JSONArray pages = books.getJSONObject(b).getJSONArray("pages");
                for (int p = 0; p < pages.length(); p++) {
                    JSONObject page = pages.getJSONObject(p);
                    if ("video".equals(page.optString("kind"))) { String id = remap.get(page.getString("videoId")); page.put("videoId", id).put("src", posterUrl(id)); }
                }
            }
            emit(new JSONObject().put("type", "restore").put("backup", backup), committed);
        } catch (Exception e) { for (File f : committed) f.delete(); error("恢复未完成，现有相册保留：" + e.getMessage()); }
        finally { File[] leftovers = staging.listFiles(); if (leftovers != null) for (File f : leftovers) f.delete(); staging.delete(); }
    }

    static String posterUrl(String id) { return "https://flipyear.local/custom-media/" + id + "/poster"; }
    WebResourceResponse resource(Uri uri) {
        try {
            if (uri.getPath().startsWith("/album-result/")) {
                String token = uri.getLastPathSegment();
                if (!token.equals(pendingToken) || pendingToken.isEmpty()) throw new IOException("导入结果已结束");
                return new WebResourceResponse("application/json", "UTF-8", new FileInputStream(resultFile(token)));
            }
            List<String> segments = uri.getPathSegments();
            if (segments.size() != 3 || !"custom-media".equals(segments.get(0)) || !"poster".equals(segments.get(2))) throw new IOException("预览路径无效");
            String id = segments.get(1); File source = file(activity, id); if (!source.isFile()) throw new IOException("视频副本不可用");
            int edge = "thumb".equals(uri.getQueryParameter("size")) ? 320 : 640;
            File cached = new File(activity.getCacheDir(), id + "-" + edge + ".jpg");
            if (!cached.isFile()) {
                Bitmap image;
                if (Build.VERSION.SDK_INT >= 27) {
                    MediaMetadataRetriever r = new MediaMetadataRetriever();
                    try { r.setDataSource(source.getAbsolutePath()); image = r.getScaledFrameAtTime(-1, MediaMetadataRetriever.OPTION_CLOSEST_SYNC, edge, edge); } finally { r.release(); }
                } else image = ThumbnailUtils.createVideoThumbnail(source.getAbsolutePath(), android.provider.MediaStore.Video.Thumbnails.MINI_KIND);
                if (image == null) throw new IOException("视频封面不可用");
                File temp = File.createTempFile("album-poster-", ".jpg", activity.getCacheDir());
                try { try (OutputStream out = new FileOutputStream(temp)) { if (!image.compress(Bitmap.CompressFormat.JPEG, 85, out)) throw new IOException("封面生成失败"); } if (!temp.renameTo(cached) && !cached.isFile()) throw new IOException("封面保存失败"); }
                finally { image.recycle(); temp.delete(); }
            }
            return new WebResourceResponse("image/jpeg", null, new FileInputStream(cached));
        } catch (Exception e) { return new WebResourceResponse("text/plain", "UTF-8", 404, "Not Found", Collections.emptyMap(), new ByteArrayInputStream(new byte[0])); }
    }
    void close() { /* In-flight SAF work belongs to the application-wide queue. */ }
}
