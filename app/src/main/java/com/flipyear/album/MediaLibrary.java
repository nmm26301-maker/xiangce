package com.flipyear.album;

import android.Manifest;
import android.app.Activity;
import android.content.ContentUris;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.media.ExifInterface;
import android.net.Uri;
import android.os.Build;
import android.provider.MediaStore;
import android.webkit.WebResourceResponse;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.concurrent.atomic.AtomicBoolean;

/** 系统照片与视频的本地索引及按需封面，不读取定位、不上传原始媒体。 */
final class MediaLibrary {
    interface Callback { void script(String code); }
    private final Activity activity;
    private final Callback callback;
    private final AtomicBoolean scanning = new AtomicBoolean(false);
    private static final String PARTIAL = "android.permission.READ_MEDIA_VISUAL_USER_SELECTED";

    MediaLibrary(Activity owner, Callback sink) { activity = owner; callback = sink; }

    private boolean granted(String permission) { return activity.checkSelfPermission(permission) == PackageManager.PERMISSION_GRANTED; }

    String typeAccess(boolean video) {
        return MediaPolicy.access(Build.VERSION.SDK_INT, granted(Manifest.permission.READ_MEDIA_IMAGES),
            granted(Manifest.permission.READ_MEDIA_VIDEO), granted(PARTIAL), granted(Manifest.permission.READ_EXTERNAL_STORAGE), video);
    }

    String access() { return MediaPolicy.combined(typeAccess(false), typeAccess(true)); }
    String accessFingerprint() { return typeAccess(false) + "/" + typeAccess(true); }
    JSONObject accessDetails() {
        JSONObject result = new JSONObject();
        try { result.put("images", typeAccess(false)); result.put("videos", typeAccess(true)); }
        catch (Exception ignored) { }
        return result;
    }

    void requestScan() {
        if ("full".equals(access())) { scan(); return; }
        if (Build.VERSION.SDK_INT >= 34) activity.requestPermissions(new String[] {Manifest.permission.READ_MEDIA_IMAGES, Manifest.permission.READ_MEDIA_VIDEO, PARTIAL}, 103);
        else if (Build.VERSION.SDK_INT >= 33) activity.requestPermissions(new String[] {Manifest.permission.READ_MEDIA_IMAGES, Manifest.permission.READ_MEDIA_VIDEO}, 103);
        else activity.requestPermissions(new String[] {Manifest.permission.READ_EXTERNAL_STORAGE}, 103);
    }

    void permissionResult() {
        if ("denied".equals(access())) {
            callback.script("window.finishGalleryImport && window.finishGalleryImport('denied','未获得照片权限，仍可手动制作相册。')");
        } else scan();
    }

    void scan() {
        if (!scanning.compareAndSet(false, true)) return;
        new Thread(() -> {
            callback.script("window.beginGalleryImport && window.beginGalleryImport()");
            String error = null;
            try {
                if (!"denied".equals(typeAccess(false))) scanCollection(false);
                if (!"denied".equals(typeAccess(true))) scanCollection(true);
            } catch (Exception e) {
                android.util.Log.e("FlipYear", "系统相册索引失败", e);
                error = "读取中断，保留原有年鉴。请检查照片权限后重新扫描。";
            }
            String code = "window.finishGalleryImport && window.finishGalleryImport(" + JSONObject.quote(access()) + "," +
                (error == null ? "null" : JSONObject.quote(error)) + "," + accessDetails().toString() + ")";
            callback.script(code);
            scanning.set(false);
        }, "flipyear-media-index").start();
    }

    private void scanCollection(boolean video) throws Exception {
        Uri collection = video ? MediaStore.Video.Media.EXTERNAL_CONTENT_URI : MediaStore.Images.Media.EXTERNAL_CONTENT_URI;
        String[] projection = {"_id", "datetaken", "date_added", "date_modified", "_display_name", "bucket_display_name", video ? "duration" : "width"};
        try (Cursor c = activity.getContentResolver().query(collection, projection, null, null, "datetaken DESC, _id DESC")) {
            if (c == null) throw new java.io.IOException("无法读取系统影像索引");
            JSONArray batch = new JSONArray();
            SimpleDateFormat formatter = new SimpleDateFormat("yyyy-MM-dd", Locale.US);
            while (c.moveToNext()) {
                long id = c.getLong(0), taken = c.getLong(1), added = c.getLong(2), changed = c.getLong(3);
                JSONObject p = new JSONObject();
                p.put("id", video ? "device-video-" + id : "device-" + id);
                p.put("kind", video ? "video" : "photo");
                p.put("src", "https://flipyear.local/media/" + (video ? "video/" : "") + id + "?v=" + Math.max(0, changed));
                p.put("durationMs", video ? Math.max(0, c.getLong(6)) : 0);
                p.put("date", taken > 0 || added > 0 ? formatter.format(new Date(taken > 0 ? taken : added * 1000L)) : "");
                p.put("dateSource", taken > 0 ? "taken" : added > 0 ? "added" : "unknown");
                p.put("filename", c.getString(4)); p.put("bucket", c.getString(5)); p.put("caption", "");
                batch.put(p);
                if (batch.length() >= 200) { sendBatch(batch); batch = new JSONArray(); }
            }
            if (batch.length() > 0) sendBatch(batch);
        }
    }

    private void sendBatch(JSONArray batch) { callback.script("window.receiveGalleryBatch && window.receiveGalleryBatch(" + batch.toString() + ")"); }

    JSONArray selectedMetadata(Uri[] uris) {
        JSONArray result = new JSONArray();
        if (uris == null) return result;
        for (Uri uri : uris) {
            JSONObject p = new JSONObject();
            String date = "";
            try (Cursor c = activity.getContentResolver().query(uri, new String[] {MediaStore.Images.Media.DATE_TAKEN}, null, null, null)) {
                if (c != null && c.moveToFirst() && c.getLong(0) > 0) date = new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(new Date(c.getLong(0)));
            } catch (Exception ignored) { }
            if (date.isEmpty()) {
                try (InputStream stream = activity.getContentResolver().openInputStream(uri)) {
                    String original = new ExifInterface(stream).getAttribute(ExifInterface.TAG_DATETIME_ORIGINAL);
                    if (original != null && original.matches("\\d{4}:\\d{2}:\\d{2}.*")) date = original.substring(0,10).replace(':','-');
                } catch (Exception ignored) { }
            }
            try { p.put("date", date); } catch (Exception ignored) { }
            result.put(p);
        }
        return result;
    }

    WebResourceResponse image(Uri request) {
        try {
            String idPart = request.getLastPathSegment();
            if (idPart == null || !idPart.matches("[0-9]{1,20}")) return missingImage();
            long id = Long.parseLong(idPart);
            boolean video = request.getPath() != null && request.getPath().matches("/media/video/[0-9]{1,20}");
            if (!video && (request.getPath() == null || !request.getPath().matches("/media/[0-9]{1,20}"))) return missingImage();
            Uri source = ContentUris.withAppendedId(video ? MediaStore.Video.Media.EXTERNAL_CONTENT_URI : MediaStore.Images.Media.EXTERNAL_CONTENT_URI, id);
            // 每次请求先让系统验证 URI 访问权，避免缓存绕过部分授权或源文件删除。
            try (InputStream check = activity.getContentResolver().openInputStream(source)) {
                if (check == null) return missingImage();
            }
            String size = request.getQueryParameter("size");
            boolean full = !video && "full".equals(size);
            android.app.ActivityManager memory = (android.app.ActivityManager) activity.getSystemService(android.content.Context.ACTIVITY_SERVICE);
            int detailEdge = memory != null && memory.isLowRamDevice() ? 2048 : 3072;
            int edge = "thumb".equals(size) ? 320 : video ? 640 : full ? detailEdge : 1600;
            String version = request.getQueryParameter("v");
            if (version == null || !version.matches("[0-9]{1,20}")) version = "0";
            File folder = new File(activity.getCacheDir(), "photo-previews");
            if (!folder.exists() && !folder.mkdirs()) throw new java.io.IOException("无法创建预览缓存");
            File target = new File(folder, (video ? "video-" : "") + id + "-" + version + "-" + edge + ".jpg");
            if (!target.exists()) generatePreview(source, target, edge, video, id);
            FileInputStream stream = new FileInputStream(target);
            if (full) trimPreviewCache(folder, target);
            return new WebResourceResponse("image/jpeg", null, stream);
        } catch (Exception e) {
            // Let the viewer fall back to its standard-size preview if detail decoding fails.
            if ("full".equals(request.getQueryParameter("size")))
                return new WebResourceResponse("image/jpeg", null, new ByteArrayInputStream(new byte[0]));
            return missingImage();
        }
    }

    // The full-resolution tier uses cached bounded JPEG previews rather than raw photos.
    // Trim only when the viewer requests detail to avoid O(n) scans for calendar thumbnails.
    private void trimPreviewCache(File folder, File active) {
        synchronized (this) {
            File[] photos = folder.listFiles((dir, name) -> name.endsWith(".jpg"));
            if (photos == null) return;
            long bytes = 0;
            for (File file : photos) bytes += file.length();
            active.setLastModified(System.currentTimeMillis());
            java.util.Arrays.sort(photos, (left, right) -> Long.compare(left.lastModified(), right.lastModified()));
            final long budget = 160L * 1024L * 1024L;
            for (File file : photos) {
                if (bytes <= budget) break;
                if (file.equals(active)) continue;
                long length = file.length();
                if (file.delete()) bytes -= length;
            }
        }
    }

    private void generatePreview(Uri source, File target, int edge, boolean video, long id) throws Exception {
        Bitmap image = video ? videoPoster(source, id, edge) : PhotoDecoder.decode(activity.getContentResolver(), source, edge);
        File temporary = File.createTempFile("preview-", ".jpg", target.getParentFile());
        try {
            try (FileOutputStream out = new FileOutputStream(temporary)) { if (!image.compress(Bitmap.CompressFormat.JPEG,85,out)) throw new java.io.IOException("无法生成预览"); }
            if (!temporary.renameTo(target) && !target.exists()) throw new java.io.IOException("无法保存预览");
        } finally { temporary.delete(); image.recycle(); }
    }

    private Bitmap videoPoster(Uri source, long id, int edge) throws Exception {
        Bitmap image;
        if (Build.VERSION.SDK_INT >= 27) {
            android.media.MediaMetadataRetriever retriever = new android.media.MediaMetadataRetriever();
            try {
                retriever.setDataSource(activity, source);
                image = retriever.getScaledFrameAtTime(-1, android.media.MediaMetadataRetriever.OPTION_CLOSEST_SYNC, edge, edge);
            } finally { retriever.release(); }
        } else {
            // API 26 has no scaled frame extraction; the platform thumbnail is already bounded.
            image = MediaStore.Video.Thumbnails.getThumbnail(activity.getContentResolver(), id, MediaStore.Video.Thumbnails.MINI_KIND, null);
        }
        if (image == null) throw new java.io.IOException("视频封面不可用");
        return image;
    }

    private WebResourceResponse missingImage() {
        String svg = "<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240'><rect width='240' height='240' fill='#d9d1c2'/><text x='120' y='125' text-anchor='middle' fill='#736b5c' font-size='14'>Photo unavailable</text></svg>";
        return new WebResourceResponse("image/svg+xml", "UTF-8", new ByteArrayInputStream(svg.getBytes(java.nio.charset.StandardCharsets.UTF_8)));
    }
}
