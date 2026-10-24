package com.flipyear.album;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.ContentUris;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.net.Uri;
import android.os.Bundle;
import android.os.CancellationSignal;
import android.os.Handler;
import android.os.Looper;
import android.provider.MediaStore;
import android.view.View;
import android.widget.RemoteViews;
import org.json.JSONObject;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicBoolean;

/** Native, offline photo widget. No background service, exact alarm or image-copy store. */
public final class MemoryWidget extends AppWidgetProvider {
    static final String NEXT = "com.flipyear.album.WIDGET_NEXT";
    static final String REFRESH = "com.flipyear.album.WIDGET_REFRESH";
    static final String OPEN_ID = "flipyear.widget.id";
    private static final Handler MAIN = new Handler(Looper.getMainLooper());

    static SharedPreferences prefs(Context context) { return context.getSharedPreferences("memory-widgets", Context.MODE_PRIVATE); }
    static String key(int id, String name) { return id + "." + name; }
    static boolean owned(Context context, int id) {
        if (id == AppWidgetManager.INVALID_APPWIDGET_ID) return false;
        android.appwidget.AppWidgetProviderInfo info = AppWidgetManager.getInstance(context).getAppWidgetInfo(id);
        return info != null && new ComponentName(context, MemoryWidget.class).equals(info.provider);
    }

    @Override public void onReceive(Context context, Intent intent) {
        String action = intent.getAction();
        if (NEXT.equals(action) || REFRESH.equals(action)) {
            int id = intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, 0);
            int[] ids = id == 0 && REFRESH.equals(action) ? ids(context) : new int[] {id};
            updateAsync(context, ids, NEXT.equals(action));
        } else super.onReceive(context, intent);
    }

    @Override public void onUpdate(Context context, AppWidgetManager manager, int[] ids) { updateAsync(context, ids, false); }
    @Override public void onAppWidgetOptionsChanged(Context context, AppWidgetManager manager, int id, Bundle options) { updateAsync(context, new int[] {id}, false); }

    private void updateAsync(Context context, int[] ids, boolean next) {
        if (ids.length == 0) return;
        final PendingResult pending = goAsync();
        final AtomicBoolean finished = new AtomicBoolean();
        final CancellationSignal cancel = new CancellationSignal();
        Runnable finish = () -> { if (finished.compareAndSet(false, true)) pending.finish(); };
        // Never keep the broadcast alive indefinitely if a document provider stalls.
        Runnable timeout = () -> { cancel.cancel(); finish.run(); };
        MAIN.postDelayed(timeout, 8000);
        Context app = context.getApplicationContext();
        new Thread(() -> {
            try {
                for (int id : ids) {
                    if (cancel.isCanceled()) break;
                    if (owned(app, id)) render(app, id, next, cancel);
                }
            } finally { MAIN.removeCallbacks(timeout); finish.run(); }
        }, "flipyear-widget").start();
    }

    static void refresh(Context context) {
        context.sendBroadcast(new Intent(context, MemoryWidget.class).setAction(REFRESH));
    }
    static int[] ids(Context context) {
        return AppWidgetManager.getInstance(context).getAppWidgetIds(new ComponentName(context, MemoryWidget.class));
    }

    private static synchronized void render(Context context, int id, boolean advance, CancellationSignal cancel) {
        if (cancel.isCanceled()) return;
        SharedPreferences store = prefs(context);
        boolean fixed = "fixed".equals(store.getString(key(id, "mode"), "today"));
        String uri = "", date = "", message = "往年的今天暂无照片", title = fixed ? "珍藏一刻" : "那年今日";
        Bitmap image = null;
        int count = 0, index = 0;
        try {
            List<String[]> photos = new ArrayList<>();
            if (fixed) {
                String picked = store.getString(key(id, "uri"), "");
                if (!picked.isEmpty()) photos.add(new String[] {picked, ""});
                message = "点右上角设置，选择一张照片";
            } else {
                message = "请先在应用中连接系统相册";
                boolean granted = context.checkSelfPermission(android.os.Build.VERSION.SDK_INT >= 33 ?
                    "android.permission.READ_MEDIA_IMAGES" : "android.permission.READ_EXTERNAL_STORAGE") == android.content.pm.PackageManager.PERMISSION_GRANTED;
                if (!granted && android.os.Build.VERSION.SDK_INT >= 34) granted = context.checkSelfPermission("android.permission.READ_MEDIA_VISUAL_USER_SELECTED") == android.content.pm.PackageManager.PERMISSION_GRANTED;
                if (granted) { photos = memories(context, cancel); message = "往年的今天暂无照片"; }
            }
            count = photos.size();
            String today = LocalDate.now().toString();
            int oldIndex = today.equals(store.getString(key(id, "day"), "")) ? store.getInt(key(id, "index"), 0) : 0;
            index = WidgetPolicy.nextIndex(oldIndex, count, advance);
            if (count > 0) {
                uri = photos.get(index)[0]; date = photos.get(index)[1];
                Bundle options = AppWidgetManager.getInstance(context).getAppWidgetOptions(id);
                int edge = WidgetPolicy.imageEdge(options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 180), options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 180), context.getResources().getDisplayMetrics().density);
                image = PhotoDecoder.decode(context.getContentResolver(), Uri.parse(uri), edge);
            }
        } catch (Exception e) { uri = ""; date = ""; message = "照片不可用，请重新选择或检查授权"; }
        if (cancel.isCanceled()) { if (image != null) image.recycle(); return; }
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.memory_widget);
        views.setTextViewText(R.id.widget_title, title);
        views.setTextViewText(R.id.widget_date, LocalDate.now().getMonthValue() + " 月 " + LocalDate.now().getDayOfMonth() + " 日");
        views.setTextViewText(R.id.widget_empty, message);
        views.setViewVisibility(R.id.widget_empty, image == null ? View.VISIBLE : View.GONE);
        views.setViewVisibility(R.id.widget_photo, image == null ? View.GONE : View.VISIBLE);
        views.setViewVisibility(R.id.widget_next, !fixed && count > 1 ? View.VISIBLE : View.GONE);
        views.setTextViewText(R.id.widget_caption, image == null ? "FlipYear · 好好收藏，慢慢翻阅" : fixed ? "轻点照片，完整查看" : date + " · " + (index + 1) + "/" + count);
        // Two XML ImageViews give a user-controlled fit/crop choice without bitmap copies.
        boolean crop = store.getBoolean(key(id, "crop"), false);
        views.setViewVisibility(R.id.widget_crop, crop && image != null ? View.VISIBLE : View.GONE);
        if (crop) views.setViewVisibility(R.id.widget_photo, View.GONE);
        if (image != null) views.setImageViewBitmap(crop ? R.id.widget_crop : R.id.widget_photo, image);
        Intent open = new Intent(context, MainActivity.class).putExtra(OPEN_ID, id)
            .setData(Uri.parse("flipyear://widget/open/" + id)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        views.setOnClickPendingIntent(R.id.widget_frame, PendingIntent.getActivity(context, id, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
        Intent configure = new Intent(context, WidgetConfigActivity.class).putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, id)
            .setData(Uri.parse("flipyear://widget/config/" + id));
        views.setOnClickPendingIntent(R.id.widget_config, PendingIntent.getActivity(context, id, configure, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
        Intent turn = new Intent(context, MemoryWidget.class).setAction(NEXT).putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, id)
            .setData(Uri.parse("flipyear://widget/next/" + id));
        views.setOnClickPendingIntent(R.id.widget_next, PendingIntent.getBroadcast(context, id, turn, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
        Intent refresh = new Intent(context, MemoryWidget.class).setAction(REFRESH).putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, id)
            .setData(Uri.parse("flipyear://widget/refresh/" + id));
        views.setOnClickPendingIntent(R.id.widget_refresh, PendingIntent.getBroadcast(context, id, refresh, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
        try {
            if (!owned(context, id)) return;
            // Full replacement releases previous host image actions and bitmap allocations.
            AppWidgetManager.getInstance(context).updateAppWidget(id, views);
            store.edit().putInt(key(id, "index"), index).putString(key(id, "day"), LocalDate.now().toString())
                .putString(key(id, "shownUri"), uri).putString(key(id, "shownDate"), date).apply();
        } catch (RuntimeException e) { android.util.Log.e("FlipYear", "Widget host rejected update", e); }
        finally { if (image != null) image.recycle(); }
    }

    private static List<String[]> memories(Context context, CancellationSignal cancel) {
        List<String[]> photos = new ArrayList<>();
        List<long[]> ranges = WidgetPolicy.memoryRanges(LocalDate.now(), ZoneId.systemDefault());
        if (ranges.isEmpty()) return photos;
        StringBuilder where = new StringBuilder();
        List<String> args = new ArrayList<>();
        for (long[] range : ranges) {
            if (where.length() > 0) where.append(" OR ");
            where.append("(datetaken >= ? AND datetaken < ?)");
            args.add(Long.toString(range[0])); args.add(Long.toString(range[1]));
        }
        try (Cursor cursor = context.getContentResolver().query(MediaStore.Images.Media.EXTERNAL_CONTENT_URI,
                new String[] {MediaStore.Images.Media._ID, MediaStore.Images.Media.DATE_TAKEN}, where.toString(),
                args.toArray(new String[0]), "datetaken DESC, _id DESC", cancel)) {
            if (cursor == null) throw new IllegalStateException("Photo index unavailable");
            while (cursor.moveToNext() && photos.size() < 128 && !cancel.isCanceled()) {
                String uri = ContentUris.withAppendedId(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, cursor.getLong(0)).toString();
                String date = Instant.ofEpochMilli(cursor.getLong(1)).atZone(ZoneId.systemDefault()).toLocalDate().toString();
                photos.add(new String[] {uri, date});
            }
        }
        return photos;
    }

    static JSONObject openData(Context context, int id) {
        JSONObject result = new JSONObject();
        if (!owned(context, id)) return result;
        try {
            result.put("open", true);
            if (!prefs(context).getString(key(id, "shownUri"), "").isEmpty()) {
                result.put("src", "https://flipyear.local/widget-photo/" + id + "?v=" + System.currentTimeMillis());
                result.put("date", prefs(context).getString(key(id, "shownDate"), ""));
                result.put("caption", "桌面珍藏的照片");
            }
        } catch (org.json.JSONException ignored) { }
        return result;
    }

    static void releaseUnused(Context context, String uri) {
        if (uri == null || uri.isEmpty()) return;
        for (java.util.Map.Entry<String, ?> entry : prefs(context).getAll().entrySet()) {
            if (entry.getKey().endsWith(".uri") && uri.equals(entry.getValue())) return;
        }
        try { context.getContentResolver().releasePersistableUriPermission(Uri.parse(uri), Intent.FLAG_GRANT_READ_URI_PERMISSION); }
        catch (Exception ignored) { }
    }

    @Override public void onDeleted(Context context, int[] ids) {
        SharedPreferences store = prefs(context);
        List<String> oldUris = new ArrayList<>();
        SharedPreferences.Editor edit = store.edit();
        for (int id : ids) {
            oldUris.add(store.getString(key(id, "uri"), ""));
            for (String name : store.getAll().keySet()) if (name.startsWith(id + ".")) edit.remove(name);
        }
        edit.commit();
        for (String uri : oldUris) releaseUnused(context, uri);
    }
}
