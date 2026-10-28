package com.flipyear.album;

import android.app.*;
import android.content.*;
import android.graphics.*;
import android.net.Uri;
import android.os.Bundle;
import android.view.WindowManager;
import android.widget.*;
import java.io.*;
import java.util.UUID;
import java.util.concurrent.*;

/** Offline Real-ESRGAN workflow. The source URI is only ever opened for reading. */
public final class EnhanceActivity extends Activity {
    static final String PHOTO_ID = "photo-id";
    private static final int SAVE = 330;
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private volatile AiProcess process;
    private volatile boolean running, saving, destroyed;
    private Uri source;
    private File job, result;
    private Bitmap previewBitmap;
    private ImageView preview;
    private TextView status;
    private ProgressBar progress;
    private Button start, cancel, compare, save;
    private CheckBox large;
    private boolean originalShown;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        try { source = OriginalMedia.photoUri(this, getIntent().getStringExtra(PHOTO_ID)); }
        catch (Exception error) { Toast.makeText(this, "原图不可用，请重新导入原图", Toast.LENGTH_LONG).show(); finish(); return; }
        ScrollView scroll = new ScrollView(this); scroll.setFillViewport(true);
        LinearLayout body = new LinearLayout(this); body.setOrientation(LinearLayout.VERTICAL); body.setPadding(dp(16), dp(16), dp(16), dp(24)); scroll.addView(body);
        Button back = button(body, "返回相册"); back.setOnClickListener(v -> finish());
        text(body, "本机 AI 高清增强", 24, 0xfff3eee5);
        text(body, "引擎与模型已内置 · 无需另装 App · 离线处理", 15, 0xffe4c691);
        preview = new ImageView(this); preview.setScaleType(ImageView.ScaleType.FIT_CENTER); preview.setContentDescription("照片预览");
        int height = Math.min(240, Math.max(128, getResources().getConfiguration().screenHeightDp / 3));
        body.addView(preview, new LinearLayout.LayoutParams(-1, dp(height)));
        large = new CheckBox(this); large.setText("较大尺寸：最长边 1536 → 6144 像素（较慢）"); large.setTextColor(0xfff3eee5); large.setMinHeight(dp(48)); body.addView(large);
        ActivityManager manager = (ActivityManager) getSystemService(ACTIVITY_SERVICE);
        boolean lowRam = manager != null && manager.isLowRamDevice();
        large.setEnabled(!lowRam);
        text(body, lowRam ? "本机使用 768 → 3072 像素，降低内存占用。" : "默认最长边 1024 → 4096 像素；处理副本，不改原图。", 15, 0xfff3eee5);
        text(body, "使用 Real-ESRGAN 通用照片模型。AI 补出的细节是推测，不能保证恢复真实细节。处理时请保持此页打开，离开会停止。", 14, 0xffc8c4bd);
        progress = new ProgressBar(this); body.addView(progress); progress.setVisibility(android.view.View.GONE);
        status = text(body, "准备就绪。首次处理会在本机解包模型。", 15, 0xfff3eee5); status.setAccessibilityLiveRegion(android.view.View.ACCESSIBILITY_LIVE_REGION_POLITE);
        start = button(body, "开始 AI 增强"); cancel = button(body, "取消处理"); compare = button(body, "查看原图对比"); save = button(body, "另存增强图 PNG");
        Button notices = button(body, "开源引擎与模型许可");
        start.setOnClickListener(v -> begin(lowRam));
        cancel.setOnClickListener(v -> { AiProcess p = process; if (p != null) p.cancel(); status.setText("正在停止处理…"); cancel.setEnabled(false); });
        compare.setOnClickListener(v -> { originalShown = !originalShown; showPreview(originalShown ? source : Uri.fromFile(result)); compare.setText(originalShown ? "查看增强图" : "查看原图对比"); });
        save.setOnClickListener(v -> {
            if (result == null || running || saving) return;
            Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("image/png").putExtra(Intent.EXTRA_TITLE, "FlipYear-AI-" + System.currentTimeMillis() + ".png");
            try { startActivityForResult(intent, SAVE); } catch (Exception error) { status.setText("保存选择器不可用：" + error.getMessage()); }
        });
        notices.setOnClickListener(v -> {
            try (InputStream in = getAssets().open("ai-engine/NOTICES.txt")) {
                ByteArrayOutputStream bytes = new ByteArrayOutputStream(); byte[] b = new byte[4096]; int n;
                while ((n = in.read(b)) != -1) { bytes.write(b, 0, n); if (bytes.size() > 262144) throw new IOException("许可文件过大"); }
                new AlertDialog.Builder(this).setTitle("开源许可").setMessage(bytes.toString("UTF-8")).setPositiveButton("关闭", null).show();
            } catch (Exception error) { status.setText("许可文件不可用：" + error.getMessage()); }
        });
        setContentView(scroll); updateControls(); showPreview(source);
    }
    private int dp(int value) { return Math.round(value * getResources().getDisplayMetrics().density); }
    private TextView text(LinearLayout body, String value, int size, int color) {
        TextView view = new TextView(this); view.setText(value); view.setTextSize(size); view.setTextColor(color); view.setPadding(0, dp(8), 0, dp(8)); body.addView(view); return view;
    }
    private Button button(LinearLayout body, String label) { Button b = new Button(this); b.setText(label); b.setMinHeight(dp(48)); body.addView(b, new LinearLayout.LayoutParams(-1, -2)); return b; }
    private void ui(Runnable action) { runOnUiThread(() -> { if (!destroyed && !isFinishing()) action.run(); }); }
    private void updateControls() {
        start.setEnabled(!running && !saving); large.setEnabled(!running && !saving && !((ActivityManager)getSystemService(ACTIVITY_SERVICE)).isLowRamDevice());
        cancel.setEnabled(running); compare.setEnabled(result != null && !running && !saving); save.setEnabled(result != null && !running && !saving);
        progress.setVisibility(running || saving ? android.view.View.VISIBLE : android.view.View.GONE);
        if (running || saving) getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON); else getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    }
    private void showPreview(Uri uri) {
        worker.execute(() -> {
            try {
                Bitmap bitmap = PhotoDecoder.decode(getContentResolver(), uri, 1200);
                runOnUiThread(() -> { if (destroyed || isFinishing()) { bitmap.recycle(); return; } preview.setImageBitmap(bitmap); if (previewBitmap != null) previewBitmap.recycle(); previewBitmap = bitmap; });
            } catch (Exception | OutOfMemoryError error) { ui(() -> status.setText("预览无法显示：" + error.getMessage())); }
        });
    }
    private void begin(boolean lowRam) {
        if (running || saving) return;
        int edge = AiPolicy.edge(lowRam, large.isChecked());
        final AiProcess task = new AiProcess(); process = task; running = true; updateControls(); status.setText("正在校验内置引擎和模型…");
        worker.execute(() -> {
            File next = null; Bitmap input = null;
            try {
                File engine = AiFiles.engine(this), models = AiFiles.models(this); task.check();
                File parent = new File(getFilesDir(), "ai-work"); if (!parent.isDirectory() && !parent.mkdirs()) throw new IOException("工作目录不可用");
                File[] oldJobs = parent.listFiles(); if (oldJobs != null) for (File old : oldJobs) if (!old.equals(job) && System.currentTimeMillis() - old.lastModified() > 86400000L) AiFiles.remove(old);
                next = new File(parent, "job-" + UUID.randomUUID()); if (!next.mkdir()) throw new IOException("无法创建处理副本");
                File inputFile = new File(next, "input.png"), output = new File(next, "enhanced.png");
                input = PhotoDecoder.decode(getContentResolver(), source, edge); int iw = input.getWidth(), ih = input.getHeight();
                try (FileOutputStream out = new FileOutputStream(inputFile)) { if (!input.compress(Bitmap.CompressFormat.PNG, 100, out)) throw new IOException("处理副本写入失败"); out.getFD().sync(); }
                input.recycle(); input = null; task.check();
                ui(() -> status.setText("正在本机增强（CPU）…\n" + iw + " × " + ih + " → " + (iw * 4) + " × " + (ih * 4) + "\n可能需要数分钟，可取消。"));
                task.run(AiPolicy.command(engine, inputFile, output, models), models, engine.getParentFile(), 15 * 60 * 1000L, null);
                task.check(); BitmapFactory.Options bounds = new BitmapFactory.Options(); bounds.inJustDecodeBounds = true; BitmapFactory.decodeFile(output.getAbsolutePath(), bounds);
                try (FileInputStream signature = new FileInputStream(output)) {
                    byte[] header = new byte[8]; if (signature.read(header) != 8 || !java.util.Arrays.equals(header, new byte[]{(byte)137,80,78,71,13,10,26,10})) throw new IOException("增强输出不是完整 PNG");
                }
                if (!AiPolicy.validOutput(iw, ih, bounds.outWidth, bounds.outHeight)) throw new IOException("增强输出尺寸不正确");
                // Fully decode the generated image on a bounded preview before accepting a result.
                Bitmap checked = PhotoDecoder.decode(getContentResolver(), Uri.fromFile(output), 1200); checked.recycle(); task.check();
                File completedJob = next, previousJob = job; next = null;
                ui(() -> {
                    job = completedJob; result = output; originalShown = false; compare.setText("查看原图对比");
                    status.setText("增强完成：" + bounds.outWidth + " × " + bounds.outHeight + "。原照片保持不变，请另存增强图。");
                    showPreview(Uri.fromFile(result)); if (previousJob != null) worker.execute(() -> AiFiles.remove(previousJob));
                });
                // If the activity was closed before delivery, this result is not presented as successful.
                if (destroyed) AiFiles.remove(completedJob);
            } catch (Exception | OutOfMemoryError error) { ui(() -> status.setText("未完成增强：" + error.getMessage())); }
            finally {
                if (input != null) input.recycle(); AiFiles.remove(next); running = false; process = null;
                ui(this::updateControls); if (destroyed) AiFiles.remove(job);
            }
        });
    }
    @Override protected void onActivityResult(int request, int response, Intent data) {
        super.onActivityResult(request, response, data);
        if (request != SAVE) return;
        if (response != RESULT_OK || data == null || data.getData() == null) { status.setText("已取消保存，增强结果仍可另存。"); return; }
        final File savedResult = result; final Uri destination = data.getData();
        if (savedResult == null || !savedResult.isFile()) { status.setText("增强结果已不可用，请重新处理。"); return; }
        saving = true; updateControls(); status.setText("正在另存增强图并校验…");
        worker.execute(() -> {
            try {
                OriginalBytes.Identity written;
                try (InputStream in = new FileInputStream(savedResult); OutputStream out = getContentResolver().openOutputStream(destination, "wt")) {
                    if (out == null) throw new IOException("保存位置不可写"); written = OriginalBytes.transfer(in, out, AlbumArchive.MAX_VIDEO);
                }
                try (InputStream in = getContentResolver().openInputStream(destination)) { OriginalBytes.transfer(in, null, AlbumArchive.MAX_VIDEO).require(written.size, written.checksum); }
                ui(() -> status.setText("增强图已另存，SHA-256 回读校验通过。可以回到相册，将保存的 PNG 添加到书中。"));
            } catch (Exception error) { ui(() -> status.setText("未通过保存校验，请重试：" + error.getMessage())); }
            finally { saving = false; ui(this::updateControls); if (destroyed) AiFiles.remove(job); }
        });
    }
    @Override protected void onStop() { super.onStop(); AiProcess p = process; if (running && p != null) p.cancel(); }
    @Override protected void onDestroy() {
        destroyed = true; AiProcess p = process; if (p != null) p.cancel();
        if (preview != null) preview.setImageDrawable(null); if (previewBitmap != null) previewBitmap.recycle();
        if (!running && !saving) AiFiles.remove(job); worker.shutdown(); super.onDestroy();
    }
}
