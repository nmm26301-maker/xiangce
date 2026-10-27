package com.flipyear.album;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.view.View;
import android.view.WindowManager;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

/** FlipYear 离线相册容器；照片通过系统选择器读取，备份通过系统文档选择器写入。 */
public final class MainActivity extends Activity {
    private static final int PICK_PHOTOS = 101;
    private static final int SAVE_BACKUP = 102;
    private WebView web;
    private ValueCallback<Uri[]> picker;
    private String pendingBackup;
    private MediaLibrary mediaLibrary;
    private CustomMedia customMedia;
    private OriginalMedia originalMedia;
    private String previousAccess = "";
    private boolean launchingVideo;
    private volatile int pendingWidgetId;
    private android.database.ContentObserver mediaObserver;
    private final android.os.Handler mediaHandler = new android.os.Handler(android.os.Looper.getMainLooper());
    private final Runnable notifyMedia = () -> { MemoryWidget.refresh(this); if (web != null) web.evaluateJavascript("window.onNativeGalleryChanged && window.onNativeGalleryChanged()", null); };

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        pendingWidgetId = savedInstanceState == null ? getIntent().getIntExtra(MemoryWidget.OPEN_ID, 0) : savedInstanceState.getInt("pendingWidgetId", 0);
        getWindow().setStatusBarColor(0xff101011);
        getWindow().setNavigationBarColor(0xff101011);
        getWindow().getDecorView().setSystemUiVisibility(
            0);
        getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
        web = new WebView(this);
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setTextZoom(Math.round(getResources().getConfiguration().fontScale * 100));
        settings.setSupportZoom(true);
        settings.setBuiltInZoomControls(true);
        settings.setDisplayZoomControls(false);
        web.setBackgroundColor(0xff101011);
        mediaLibrary = new MediaLibrary(this, code -> runOnUiThread(() -> { if (web != null) web.evaluateJavascript(code, null); }));
        customMedia = new CustomMedia(this, code -> runOnUiThread(() -> { if (web != null) web.evaluateJavascript(code, null); }));
        customMedia.restoreTarget(savedInstanceState);
        originalMedia = new OriginalMedia(this, code -> runOnUiThread(() -> { if (web != null) web.evaluateJavascript(code, null); }));
        originalMedia.restoreState(savedInstanceState); web.addJavascriptInterface(originalMedia, "PhotoMedia");
        web.addJavascriptInterface(new BackupBridge(), "Android");
        web.addJavascriptInterface(customMedia, "AlbumMedia");
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return true;
            }
            @Override
            public android.webkit.WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri url = request.getUrl();
                if ("file:///android_asset/migrate.html".equals(url.toString())) return null;
                if ("https".equals(url.getScheme()) && "flipyear.local".equals(url.getHost())) {
                    String path = url.getPath();
                    if (path != null && path.startsWith("/photo-detail/")) return PhotoRegions.resource(MainActivity.this, url);
                    if (path != null && path.startsWith("/media/")) return mediaLibrary.image(url);
                    if (path != null && path.startsWith("/widget-photo/")) return widgetPhoto(url);
                    if (path != null && (path.startsWith("/custom-media/") || path.startsWith("/album-result/"))) return customMedia.resource(url);
                    if (path != null && !path.contains("..") && !path.contains("\\")) {
                        String asset = path.equals("/") ? "index.html" : path.substring(1);
                        String mime = asset.endsWith(".js") ? "application/javascript" : asset.endsWith(".css") ? "text/css" : asset.endsWith(".json") ? "application/json" : "text/html";
                        try { return new android.webkit.WebResourceResponse(mime,"UTF-8", getAssets().open(asset)); }
                        catch (Exception ignored) { }
                    }
                }
                return new android.webkit.WebResourceResponse("text/plain", "UTF-8", new java.io.ByteArrayInputStream(new byte[0]));
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback,
                                              FileChooserParams params) {
                if (picker != null) picker.onReceiveValue(null);
                picker = callback;
                Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                String[] types = params.getAcceptTypes();
                boolean image = types.length > 0 && types[0].startsWith("image/");
                intent.setType(image ? "image/*" : "application/json");
                intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE,
                    params.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE);
                try { startActivityForResult(intent, PICK_PHOTOS); }
                catch (Exception e) { picker.onReceiveValue(null); picker = null; }
                return true;
            }
        });
        setContentView(web);
        if (getPreferences(MODE_PRIVATE).getBoolean("v2-origin-ready", false)) web.loadUrl("https://flipyear.local/index.html");
        else web.loadUrl("file:///android_asset/migrate.html");
    }

    private final class BackupBridge {
        @JavascriptInterface
        public void playVideo(String mediaId) {
            runOnUiThread(() -> {
                if (launchingVideo) return;
                if (MediaPolicy.videoId(mediaId) < 0 && !AlbumArchive.videoId(mediaId)) { videoError(); return; }
                try {
                    launchingVideo = true;
                    startActivity(new Intent(MainActivity.this, VideoPlayerActivity.class).putExtra(VideoPlayerActivity.MEDIA_ID, mediaId));
                } catch (Exception e) { launchingVideo = false; videoError(); }
            });
        }

        @JavascriptInterface
        public void requestMemoryWidget() {
            runOnUiThread(() -> {
                String status = "unsupported";
                try {
                    android.appwidget.AppWidgetManager manager = android.appwidget.AppWidgetManager.getInstance(MainActivity.this);
                    if (manager.isRequestPinAppWidgetSupported()) {
                        status = manager.requestPinAppWidget(new android.content.ComponentName(MainActivity.this, MemoryWidget.class), null, null) ? "requested" : "unsupported";
                    }
                } catch (Exception ignored) { }
                if (web != null) web.evaluateJavascript("window.onNativeWidgetPinResult && window.onNativeWidgetPinResult(" + org.json.JSONObject.quote(status) + ")", null);
            });
        }

        @JavascriptInterface
        public synchronized String consumeWidgetOpen() {
            int id = pendingWidgetId; pendingWidgetId = 0;
            return MemoryWidget.openData(MainActivity.this, id).toString();
        }

        @JavascriptInterface
        public void migrateLegacy(String json) {
            try {
                if (json != null && !json.isEmpty()) {
                    java.io.FileOutputStream out = new java.io.FileOutputStream(new java.io.File(getFilesDir(), "legacy-state.json"));
                    try { out.write(json.getBytes(StandardCharsets.UTF_8)); out.getFD().sync(); }
                    finally { out.close(); }
                }
                getPreferences(MODE_PRIVATE).edit().putBoolean("v2-origin-ready", true).commit();
                runOnUiThread(() -> { if (web != null) web.loadUrl("https://flipyear.local/index.html"); });
            } catch (Exception e) { migrateLegacyError(); }
        }

        @JavascriptInterface
        public void migrateLegacyError() {
            android.util.Log.e("FlipYear", "旧版相册迁移未完成，保留原数据");
            runOnUiThread(() -> {
                if (web != null) web.loadUrl("https://flipyear.local/index.html");
                android.widget.Toast.makeText(MainActivity.this, "旧版数据读取失败，原数据仍保留。请勿卸载应用。", android.widget.Toast.LENGTH_LONG).show();
            });
        }

        @JavascriptInterface
        public String readLegacyState() {
            java.io.File file = new java.io.File(getFilesDir(), "legacy-state.json");
            if (!file.exists()) return "";
            try (java.io.FileInputStream in = new java.io.FileInputStream(file); java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream()) {
                byte[] buffer = new byte[16384]; int count;
                while ((count = in.read(buffer)) != -1) out.write(buffer, 0, count);
                return new String(out.toByteArray(), StandardCharsets.UTF_8);
            } catch (Exception e) { return ""; }
        }

        @JavascriptInterface
        public void clearLegacyState() { new java.io.File(getFilesDir(), "legacy-state.json").delete(); }
        @JavascriptInterface
        public void scanGallery() { runOnUiThread(() -> mediaLibrary.requestScan()); }

        @JavascriptInterface
        public String galleryAccess() { return mediaLibrary.access(); }

        @JavascriptInterface
        public void refreshGallery() {
            runOnUiThread(() -> {
                if ("denied".equals(mediaLibrary.access())) { if (web != null) web.evaluateJavascript("window.onGalleryPermissionChanged && window.onGalleryPermissionChanged()", null); }
                else mediaLibrary.scan();
            });
        }

        @JavascriptInterface
        public void saveBackup(String name, String json) {
            if (json == null || json.length() > 160 * 1024 * 1024) {
                runOnUiThread(() -> notifySaved(false));
                return;
            }
            runOnUiThread(() -> {
                if (pendingBackup != null) { notifySaved(false); return; }
                pendingBackup = json;
                Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType("application/json");
                intent.putExtra(Intent.EXTRA_TITLE, name != null && name.matches("FlipYear-[A-Za-z0-9_.-]{1,80}\\.json") ? name : "FlipYear-Backup.json");
                try { startActivityForResult(intent, SAVE_BACKUP); }
                catch (Exception e) { pendingBackup = null; notifySaved(false); }
            });
        }
    }

    private void videoError() {
        if (web != null) web.evaluateJavascript("window.onNativeVideoError && window.onNativeVideoError()", null);
    }

    private android.webkit.WebResourceResponse widgetPhoto(Uri url) {
        android.graphics.Bitmap image = null;
        try {
            int id = Integer.parseInt(url.getLastPathSegment());
            if (!MemoryWidget.owned(this, id)) throw new java.io.IOException("Widget removed");
            String uri = MemoryWidget.prefs(this).getString(MemoryWidget.key(id, "shownUri"), "");
            // Decode through the resolver on every request: stale widget data cannot bypass revoked grants.
            image = PhotoDecoder.decode(getContentResolver(), Uri.parse(uri), 1600);
            java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream();
            image.compress(android.graphics.Bitmap.CompressFormat.JPEG, 88, out);
            return new android.webkit.WebResourceResponse("image/jpeg", null, new java.io.ByteArrayInputStream(out.toByteArray()));
        } catch (Exception e) {
            return new android.webkit.WebResourceResponse("text/plain", "UTF-8", 404, "Not Found", java.util.Collections.emptyMap(), new java.io.ByteArrayInputStream(new byte[0]));
        } finally { if (image != null) image.recycle(); }
    }

    @Override protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent); setIntent(intent);
        pendingWidgetId = intent.getIntExtra(MemoryWidget.OPEN_ID, 0);
        if (web != null) web.evaluateJavascript("window.onNativeWidgetOpen && window.onNativeWidgetOpen()", null);
    }

    @Override protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out); out.putInt("pendingWidgetId", pendingWidgetId);
        if (customMedia != null) customMedia.saveTarget(out);
        if (originalMedia != null) originalMedia.saveState(out);
    }

    private void notifySaved(boolean success) {
        if (web != null) web.evaluateJavascript(
            "window.onNativeSaveResult && window.onNativeSaveResult(" + success + ")", null);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (originalMedia != null && originalMedia.handleResult(requestCode, resultCode, data)) return;
        if (customMedia != null && customMedia.handleResult(requestCode, resultCode, data)) return;
        if (requestCode == PICK_PHOTOS && picker != null) {
            Uri[] values = null;
            if (resultCode == RESULT_OK && data != null) {
                if (data.getClipData() != null) {
                    int count = data.getClipData().getItemCount();
                    values = new Uri[count];
                    for (int i = 0; i < count; i++) values[i] = data.getClipData().getItemAt(i).getUri();
                } else if (data.getData() != null) values = new Uri[] { data.getData() };
            }
            final Uri[] selected = values;
            final ValueCallback<Uri[]> receiving = picker;
            picker = null;
            new Thread(() -> {
                final String metadata = mediaLibrary.selectedMetadata(selected).toString();
                runOnUiThread(() -> {
                    if (web == null) { receiving.onReceiveValue(null); return; }
                    web.evaluateJavascript("window.nativePhotoMetadata=" + metadata, ignored -> receiving.onReceiveValue(selected));
                });
            }, "flipyear-selected-metadata").start();
        }
        if (requestCode == SAVE_BACKUP) {
            final String backup = pendingBackup;
            pendingBackup = null;
            if (resultCode != RESULT_OK || data == null || data.getData() == null || backup == null) {
                notifySaved(false);
                return;
            }
            final Uri uri = data.getData();
            new Thread(() -> {
                boolean saved = false;
                try (OutputStream stream = getContentResolver().openOutputStream(uri, "wt")) {
                    if (stream == null) throw new java.io.IOException("无法打开备份文件");
                    stream.write(backup.getBytes(StandardCharsets.UTF_8));
                    stream.flush();
                    saved = true;
                } catch (Exception e) { android.util.Log.e("FlipYear", "备份保存失败", e); }
                final boolean result = saved;
                runOnUiThread(() -> notifySaved(result));
            }, "flipyear-backup").start();
        }
    }

    @Override
    public void onRequestPermissionsResult(int code, String[] permissions, int[] grants) {
        super.onRequestPermissionsResult(code, permissions, grants);
        if (code == 103) { previousAccess = mediaLibrary.accessFingerprint(); mediaLibrary.permissionResult(); observeLibrary(); MemoryWidget.refresh(this); }
    }

    @Override
    protected void onResume() {
        super.onResume();
        launchingVideo = false;
        if (mediaLibrary == null) return;
        if (web != null) web.evaluateJavascript("window.onAlbumMediaResult && window.onAlbumMediaResult()", null);
        String currentAccess = mediaLibrary.accessFingerprint();
        if (!previousAccess.isEmpty() && !previousAccess.equals(currentAccess) && web != null) {
            web.evaluateJavascript("window.onGalleryPermissionChanged && window.onGalleryPermissionChanged()", null);
        } else if (web != null) {
            // The selected set can change while both permission enums remain 'partial'.
            web.evaluateJavascript("window.onNativeGalleryChanged && window.onNativeGalleryChanged()", null);
        }
        previousAccess = currentAccess;
        observeLibrary();
        MemoryWidget.refresh(this);
    }

    private void observeLibrary() {
        if (mediaObserver != null || mediaLibrary == null || "denied".equals(mediaLibrary.access())) return;
        mediaObserver = new android.database.ContentObserver(mediaHandler) {
            @Override public void onChange(boolean selfChange) {
                mediaHandler.removeCallbacks(notifyMedia);
                mediaHandler.postDelayed(notifyMedia, 1200);
            }
        };
        boolean registered = false;
        for (Uri source : new Uri[] {android.provider.MediaStore.Images.Media.EXTERNAL_CONTENT_URI, android.provider.MediaStore.Video.Media.EXTERNAL_CONTENT_URI}) {
            try { getContentResolver().registerContentObserver(source, true, mediaObserver); registered = true; }
            catch (Exception e) { android.util.Log.e("FlipYear", "无法监听影像变化", e); }
        }
        if (!registered) mediaObserver = null;
    }

    @Override
    public void onBackPressed() {
        web.evaluateJavascript("Boolean(window.goBack && window.goBack())", result -> {
            if (!"true".equals(result)) finish();
        });
    }

    @Override
    protected void onDestroy() {
        if (picker != null) { picker.onReceiveValue(null); picker = null; }
        mediaHandler.removeCallbacks(notifyMedia);
        if (mediaObserver != null) { getContentResolver().unregisterContentObserver(mediaObserver); mediaObserver = null; }
        if (customMedia != null) customMedia.close();
        if (web != null) { web.removeJavascriptInterface("Android"); web.removeJavascriptInterface("AlbumMedia"); web.destroy(); web = null; }
        super.onDestroy();
    }
}
