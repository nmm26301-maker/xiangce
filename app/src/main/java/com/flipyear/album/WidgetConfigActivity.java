package com.flipyear.album;

import android.app.Activity;
import android.appwidget.AppWidgetManager;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.LinearLayout;
import android.widget.RadioButton;
import android.widget.RadioGroup;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

/** Each desktop instance has its own source, fit mode and persistent document grant. */
public final class WidgetConfigActivity extends Activity {
    private static final int PICK = 201;
    private int widgetId;
    private String photoUri = "";
    private RadioButton today, fixed;
    private CheckBox crop;
    private TextView selection;
    private Button choose;

    @Override public void onCreate(Bundle saved) {
        super.onCreate(saved);
        setResult(RESULT_CANCELED);
        widgetId = getIntent().getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, 0);
        if (!MemoryWidget.owned(this, widgetId)) { finish(); return; }
        SharedPreferences store = MemoryWidget.prefs(this);
        photoUri = saved == null ? store.getString(MemoryWidget.key(widgetId, "uri"), "") : saved.getString("photo", "");
        getWindow().setStatusBarColor(0xff101011);
        getWindow().setNavigationBarColor(0xff101011);
        getWindow().getDecorView().setSystemUiVisibility(0);
        LinearLayout body = new LinearLayout(this);
        body.setOrientation(LinearLayout.VERTICAL); body.setPadding(dp(24), dp(24), dp(24), dp(24)); body.setBackgroundColor(0xff101011);
        ScrollView scroll = new ScrollView(this); scroll.setFillViewport(true); scroll.addView(body); setContentView(scroll);
        text(body, "留一张回忆在桌面", 26, 0xfff4ead8);
        text(body, "每个小组件可单独设置。照片仅在本地读取。", 15, 0xffbfb6a7);
        RadioGroup group = new RadioGroup(this);
        today = new RadioButton(this); today.setId(View.generateViewId()); today.setText("那年今日 · 往年同月同日的照片"); today.setTextColor(0xfff4ead8); today.setMinHeight(dp(56));
        fixed = new RadioButton(this); fixed.setId(View.generateViewId()); fixed.setText("固定照片 · 珍藏一个瞬间"); fixed.setTextColor(0xfff4ead8); fixed.setMinHeight(dp(56));
        group.addView(today); group.addView(fixed); body.addView(group);
        boolean isFixed = saved == null ? "fixed".equals(store.getString(MemoryWidget.key(widgetId, "mode"), "today")) : saved.getBoolean("fixed");
        group.check(isFixed ? fixed.getId() : today.getId());
        selection = text(body, "", 15, 0xffbfb6a7);
        choose = button(body, "选择 / 更换照片");
        choose.setOnClickListener(v -> {
            Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("image/*")
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
            try { startActivityForResult(intent, PICK); }
            catch (Exception e) { Toast.makeText(this, "系统照片选择器不可用", Toast.LENGTH_LONG).show(); }
        });
        crop = new CheckBox(this); crop.setText("填满画框（裁切边缘）"); crop.setTextColor(0xfff4ead8); crop.setMinHeight(dp(56));
        crop.setChecked(saved == null ? store.getBoolean(MemoryWidget.key(widgetId, "crop"), false) : saved.getBoolean("crop")); body.addView(crop);
        text(body, "默认完整呈现照片。那年今日需要先在应用中连接系统相册，仅显示已授权且有拍摄日期的照片；无匹配时保留空白。桌面会显示你选择的照片，请按自己的隐私偏好设置。", 14, 0xffbfb6a7);
        group.setOnCheckedChangeListener((g, id) -> updateSelection());
        button(body, "保存小组件").setOnClickListener(v -> save());
        button(body, "取消").setOnClickListener(v -> finish());
        updateSelection();
    }

    private void updateSelection() {
        choose.setVisibility(fixed.isChecked() ? View.VISIBLE : View.GONE);
        selection.setText(fixed.isChecked() ? photoUri.isEmpty() ? "尚未选择照片" : "已选择照片，保存后显示" : "使用当前系统照片授权范围，点照片打开回忆，点换图浏览其他照片。");
    }

    private void save() {
        if (fixed.isChecked() && photoUri.isEmpty()) { Toast.makeText(this, "请先选择一张照片", Toast.LENGTH_SHORT).show(); return; }
        if (!MemoryWidget.owned(this, widgetId)) { finish(); return; }
        SharedPreferences store = MemoryWidget.prefs(this);
        String old = store.getString(MemoryWidget.key(widgetId, "uri"), "");
        String chosen = fixed.isChecked() ? photoUri : "";
        boolean saved = store.edit().putString(MemoryWidget.key(widgetId, "mode"), fixed.isChecked() ? "fixed" : "today")
            .putString(MemoryWidget.key(widgetId, "uri"), chosen).putBoolean(MemoryWidget.key(widgetId, "crop"), crop.isChecked())
            .putInt(MemoryWidget.key(widgetId, "index"), 0).remove(MemoryWidget.key(widgetId, "shownUri")).commit();
        if (!saved) { Toast.makeText(this, "设置未保存，请重试", Toast.LENGTH_SHORT).show(); return; }
        MemoryWidget.releaseUnused(this, old);
        MemoryWidget.refresh(this);
        setResult(RESULT_OK, new Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId));
        finish();
    }

    @Override protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (request != PICK || result != RESULT_OK || data == null || data.getData() == null) return;
        Uri uri = data.getData();
        if (!"content".equals(uri.getScheme())) return;
        try {
            // A fixed photo must survive reboot; reject providers without persistent grants.
            getContentResolver().takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION);
            String old = photoUri; photoUri = uri.toString();
            if (!old.equals(photoUri)) MemoryWidget.releaseUnused(this, old);
            updateSelection();
        } catch (Exception e) { Toast.makeText(this, "无法保留照片访问权，请从系统文件或照片中重新选择", Toast.LENGTH_LONG).show(); }
    }

    @Override protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        if (fixed != null && crop != null) { out.putString("photo", photoUri); out.putBoolean("fixed", fixed.isChecked()); out.putBoolean("crop", crop.isChecked()); }
    }
    @Override protected void onDestroy() {
        if (!isChangingConfigurations()) MemoryWidget.releaseUnused(this, photoUri);
        super.onDestroy();
    }
    private int dp(int value) { return Math.round(value * getResources().getDisplayMetrics().density); }
    private TextView text(LinearLayout body, String value, int size, int color) {
        TextView view = new TextView(this); view.setText(value); view.setTextSize(size); view.setTextColor(color); view.setPadding(0, dp(8), 0, dp(12)); body.addView(view); return view;
    }
    private Button button(LinearLayout body, String label) {
        Button button = new Button(this); button.setText(label); button.setAllCaps(false); button.setMinHeight(dp(52)); body.addView(button); return button;
    }
}
