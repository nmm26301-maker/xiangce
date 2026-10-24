package com.flipyear.album;

import android.app.Activity;
import android.content.ContentUris;
import android.content.res.AssetFileDescriptor;
import android.net.Uri;
import android.os.Bundle;
import android.provider.MediaStore;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.MediaController;
import android.widget.TextView;
import android.widget.VideoView;

/** Local system-video playback. Seeking is handled by MediaPlayer, outside WebView. */
public final class VideoPlayerActivity extends Activity {
    static final String MEDIA_ID = "mediaId";
    private VideoView video;
    private MediaController controller;
    private TextView status;
    private Uri source;
    private int position;
    private boolean active, prepared, loaded, failed;
    private boolean initialPlay = true;

    @Override public void onCreate(Bundle saved) {
        super.onCreate(saved);
        getWindow().setStatusBarColor(0xff101011);
        getWindow().setNavigationBarColor(0xff101011);
        getWindow().getDecorView().setSystemUiVisibility(0);
        String mediaId = getIntent().getStringExtra(MEDIA_ID);
        if (AlbumArchive.validId(mediaId)) {
            try { source = Uri.fromFile(CustomMedia.file(this, mediaId)); }
            catch (java.io.IOException e) { finish(); return; }
        } else {
            long id = MediaPolicy.videoId(mediaId);
            if (id < 0) { finish(); return; }
            source = ContentUris.withAppendedId(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, id);
        }
        position = saved == null ? 0 : Math.max(0, saved.getInt("position", 0));
        initialPlay = saved == null;
        LinearLayout body = new LinearLayout(this); body.setOrientation(LinearLayout.VERTICAL); body.setBackgroundColor(0xff101011);
        LinearLayout header = new LinearLayout(this); header.setGravity(Gravity.CENTER_VERTICAL);
        Button back = new Button(this); back.setText("返回相册"); back.setAllCaps(false); back.setOnClickListener(v -> finish());
        header.addView(back, new LinearLayout.LayoutParams(-2, dp(56)));
        TextView title = new TextView(this); title.setText("这一刻，动起来。"); title.setTextColor(0xfff4ead8); title.setTextSize(18); title.setPadding(dp(12), 0, dp(12), 0); header.addView(title, new LinearLayout.LayoutParams(0, -2, 1));
        body.addView(header);
        FrameLayout frame = new FrameLayout(this);
        video = new VideoView(this); frame.addView(video, new FrameLayout.LayoutParams(-1, -1, Gravity.CENTER));
        status = new TextView(this); status.setText("正在读取本地视频…"); status.setTextColor(0xffd9cfbf); status.setTextSize(16); status.setGravity(Gravity.CENTER); status.setPadding(dp(24), dp(24), dp(24), dp(24));
        frame.addView(status, new FrameLayout.LayoutParams(-1, -1)); body.addView(frame, new LinearLayout.LayoutParams(-1, 0, 1));
        setContentView(body);
        controller = new MediaController(this); controller.setAnchorView(frame); video.setMediaController(controller);
        video.setOnPreparedListener(player -> {
            prepared = true; status.setVisibility(View.GONE);
            int duration = video.getDuration();
            video.seekTo(duration > 0 ? Math.min(position, Math.max(0, duration - 1)) : position);
            if (active && initialPlay) video.start(); else video.pause();
            initialPlay = false;
            if (active) controller.show(5000);
        });
        video.setOnErrorListener((player, what, extra) -> { showError(); return true; });
        video.setOnCompletionListener(player -> { position = 0; video.seekTo(0); video.pause(); if (active) controller.show(0); });
    }

    @Override protected void onResume() {
        super.onResume(); active = true;
        if (video == null || failed) return;
        if (!loaded) {
            try (AssetFileDescriptor check = getContentResolver().openAssetFileDescriptor(source, "r")) {
                if (check == null) throw new java.io.IOException("Video unavailable");
                loaded = true; video.setVideoURI(source); video.requestFocus();
            } catch (Exception e) { showError(); }
        } else if (prepared) controller.show(5000);
    }

    @Override protected void onPause() {
        active = false; initialPlay = false;
        if (video != null && prepared) { position = Math.max(0, video.getCurrentPosition()); video.pause(); }
        if (controller != null) controller.hide();
        super.onPause();
    }

    @Override protected void onStop() {
        if (video != null) video.stopPlayback();
        prepared = false; loaded = false;
        super.onStop();
    }

    @Override protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        out.putInt("position", video != null && prepared ? Math.max(0, video.getCurrentPosition()) : position);
    }

    private void showError() {
        failed = true; prepared = false;
        if (controller != null) controller.hide();
        if (video != null) video.stopPlayback();
        status.setVisibility(View.VISIBLE);
        status.setText("视频暂时无法播放。\n请检查照片与视频授权、源文件是否仍在手机中，以及系统是否支持此编码。\n\n可返回相册后重新连接。");
    }
    private int dp(int value) { return Math.round(value * getResources().getDisplayMetrics().density); }
}
