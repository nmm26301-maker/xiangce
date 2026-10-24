package com.flipyear.album;

import android.Manifest;
import android.app.Activity;
import android.content.ContentUris;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Matrix;
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

/** 系统照片的本地索引与按需预览，不读取定位、不上传原图。 */
final class MediaLibrary {
    interface Callback { void script(String code); }
    private final Activity activity;
    private final Callback callback;
    private final AtomicBoolean scanning = new AtomicBoolean(false);
    private static final String PARTIAL = "android.permission.READ_MEDIA_VISUAL_USER_SELECTED";

    MediaLibrary(Activity owner, Callback sink) { activity = owner; callback = sink; }

    String access() {
        if (Build.VERSION.SDK_INT >= 33) {
            if (activity.checkSelfPermission(Manifest.permission.READ_MEDIA_IMAGES) == PackageManager.PERMISSION_GRANTED) return "full";
            if (Build.VERSION.SDK_INT >= 34 && activity.checkSelfPermission(PARTIAL) == PackageManager.PERMISSION_GRANTED) return "partial";
            return "denied";
        }
        return activity.checkSelfPermission(Manifest.permission.READ_EXTERNAL_STORAGE) == PackageManager.PERMISSION_GRANTED ? "full" : "denied";
    }

    void requestScan() {
        if ("full".equals(access())) { scan(); return; }
        if (Build.VERSION.SDK_INT >= 34) activity.requestPermissions(new String[] {Manifest.permission.READ_MEDIA_IMAGES, PARTIAL}, 103);
        else if (Build.VERSION.SDK_INT >= 33) activity.requestPermissions(new String[] {Manifest.permission.READ_MEDIA_IMAGES}, 103);
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
                Uri collection = MediaStore.Images.Media.EXTERNAL_CONTENT_URI;
                String[] projection = {MediaStore.Images.Media._ID, MediaStore.Images.Media.DATE_TAKEN,
                    MediaStore.Images.Media.DATE_ADDED, MediaStore.Images.Media.DATE_MODIFIED,
                    MediaStore.Images.Media.DISPLAY_NAME, MediaStore.Images.Media.BUCKET_DISPLAY_NAME};
                try (Cursor c = activity.getContentResolver().query(collection, projection, null, null,
                        MediaStore.Images.Media.DATE_TAKEN + " DESC")) {
                    if (c == null) throw new java.io.IOException("无法读取系统照片索引");
                    JSONArray batch = new JSONArray();
                    SimpleDateFormat formatter = new SimpleDateFormat("yyyy-MM-dd", Locale.US);
                    while (c.moveToNext()) {
                        long id = c.getLong(0), taken = c.getLong(1), added = c.getLong(2), changed = c.getLong(3);
                        JSONObject p = new JSONObject();
                        p.put("id", "device-" + id);
                        p.put("src", "https://flipyear.local/media/" + id + "?v=" + changed);
                        p.put("date", taken > 0 || added > 0 ? formatter.format(new Date(taken > 0 ? taken : added * 1000L)) : "");
                        p.put("dateSource", taken > 0 ? "taken" : added > 0 ? "added" : "unknown");
                        p.put("filename", c.getString(4));
                        p.put("bucket", c.getString(5));
                        p.put("caption", "");
                        batch.put(p);
                        if (batch.length() >= 200) { sendBatch(batch); batch = new JSONArray(); }
                    }
                    if (batch.length() > 0) sendBatch(batch);
                }
            } catch (Exception e) {
                android.util.Log.e("FlipYear", "系统相册索引失败", e);
                error = "读取中断，保留原有年鉴。请检查照片权限后重新扫描。";
            }
            String code = "window.finishGalleryImport && window.finishGalleryImport(" + JSONObject.quote(access()) + "," +
                (error == null ? "null" : JSONObject.quote(error)) + ")";
            callback.script(code);
            scanning.set(false);
        }, "flipyear-media-index").start();
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
            Uri source = ContentUris.withAppendedId(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, id);
            // 每次请求先让系统验证 URI 访问权，避免缓存绕过部分授权或源文件删除。
            try (InputStream check = activity.getContentResolver().openInputStream(source)) {
                if (check == null) return missingImage();
            }
            int edge = "thumb".equals(request.getQueryParameter("size")) ? 320 : 1600;
            String version = request.getQueryParameter("v");
            if (version == null || !version.matches("[0-9]{1,20}")) version = "0";
            File folder = new File(activity.getCacheDir(), "photo-previews");
            if (!folder.exists() && !folder.mkdirs()) throw new java.io.IOException("无法创建预览缓存");
            File target = new File(folder, id + "-" + version + "-" + edge + ".jpg");
            if (!target.exists()) generatePreview(source, target, edge);
            return new WebResourceResponse("image/jpeg", null, new FileInputStream(target));
        } catch (Exception e) { return missingImage(); }
    }

    private void generatePreview(Uri source, File target, int edge) throws Exception {
        BitmapFactory.Options options = new BitmapFactory.Options();
        options.inJustDecodeBounds = true;
        try (InputStream s = activity.getContentResolver().openInputStream(source)) { BitmapFactory.decodeStream(s, null, options); }
        int sample = 1;
        while (Math.max(options.outWidth, options.outHeight) / (sample * 2) >= edge) sample *= 2;
        options.inSampleSize = sample; options.inJustDecodeBounds = false;
        Bitmap image;
        try (InputStream s = activity.getContentResolver().openInputStream(source)) { image = BitmapFactory.decodeStream(s, null, options); }
        if (image == null) throw new java.io.IOException("暂不支持此图片格式");
        int orientation = ExifInterface.ORIENTATION_NORMAL;
        try (InputStream s = activity.getContentResolver().openInputStream(source)) {
            orientation = new ExifInterface(s).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL);
        } catch (Exception ignored) { }
        Matrix m = new Matrix();
        switch (orientation) {
            case ExifInterface.ORIENTATION_FLIP_HORIZONTAL: m.setScale(-1,1); break;
            case ExifInterface.ORIENTATION_ROTATE_180: m.setRotate(180); break;
            case ExifInterface.ORIENTATION_FLIP_VERTICAL: m.setScale(1,-1); break;
            case ExifInterface.ORIENTATION_TRANSPOSE: m.setRotate(90); m.postScale(-1,1); break;
            case ExifInterface.ORIENTATION_ROTATE_90: m.setRotate(90); break;
            case ExifInterface.ORIENTATION_TRANSVERSE: m.setRotate(270); m.postScale(-1,1); break;
            case ExifInterface.ORIENTATION_ROTATE_270: m.setRotate(270); break;
            default: break;
        }
        if (!m.isIdentity()) { Bitmap rotated = Bitmap.createBitmap(image,0,0,image.getWidth(),image.getHeight(),m,true); if (rotated != image) image.recycle(); image = rotated; }
        float ratio = Math.min(1f, (float)edge / Math.max(image.getWidth(),image.getHeight()));
        if (ratio < 1) { Bitmap scaled = Bitmap.createScaledBitmap(image,Math.max(1,Math.round(image.getWidth()*ratio)),Math.max(1,Math.round(image.getHeight()*ratio)),true); if (scaled != image) image.recycle(); image = scaled; }
        File temporary = File.createTempFile("preview-", ".jpg", target.getParentFile());
        try {
            try (FileOutputStream out = new FileOutputStream(temporary)) { if (!image.compress(Bitmap.CompressFormat.JPEG,85,out)) throw new java.io.IOException("无法生成预览"); }
            if (!temporary.renameTo(target) && !target.exists()) throw new java.io.IOException("无法保存预览");
        } finally { temporary.delete(); image.recycle(); }
    }

    private WebResourceResponse missingImage() {
        String svg = "<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240'><rect width='240' height='240' fill='#d9d1c2'/><text x='120' y='125' text-anchor='middle' fill='#736b5c' font-size='14'>Photo unavailable</text></svg>";
        return new WebResourceResponse("image/svg+xml", "UTF-8", new ByteArrayInputStream(svg.getBytes(java.nio.charset.StandardCharsets.UTF_8)));
    }
}
