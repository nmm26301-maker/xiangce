package com.flipyear.album;

import java.io.*;
import java.util.List;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicBoolean;

/** Cancelling or leaving the screen stops the actual native process. */
final class AiProcess {
    private final AtomicBoolean cancelled = new AtomicBoolean();
    private volatile Process process;
    interface Progress { void line(String text); }
    void cancel() { cancelled.set(true); Process p = process; if (p != null) p.destroyForcibly(); }
    void check() throws IOException { if (cancelled.get()) throw new IOException("已取消处理"); }
    void run(List<String> command, File directory, File nativeDirectory, long timeoutMs, Progress progress) throws Exception {
        check();
        if (command == null || command.isEmpty() || timeoutMs <= 0) throw new IOException("Invalid AI command");
        ProcessBuilder builder = new ProcessBuilder(command).directory(directory).redirectErrorStream(true);
        builder.environment().put("LD_LIBRARY_PATH", nativeDirectory.getAbsolutePath());
        builder.environment().put("OMP_NUM_THREADS", "2");
        ScheduledExecutorService timer = Executors.newSingleThreadScheduledExecutor();
        AtomicBoolean expired = new AtomicBoolean();
        StringBuilder tail = new StringBuilder();
        try {
            process = builder.start();
            check();
            timer.schedule(() -> { expired.set(true); Process p = process; if (p != null) p.destroyForcibly(); }, timeoutMs, TimeUnit.MILLISECONDS);
            try (InputStream stream = process.getInputStream()) {
                byte[] buffer = new byte[1024]; int n;
                while ((n = stream.read(buffer)) != -1) {
                    check(); String chunk = new String(buffer, 0, n, "UTF-8");
                    tail.append(chunk); if (tail.length() > 4096) tail.delete(0, tail.length() - 4096);
                    if (progress != null) progress.line(chunk);
                }
            }
            int code = process.waitFor(); check();
            if (expired.get()) throw new IOException("处理超时，请取消后选择较小尺寸重试");
            if (code != 0) throw new IOException("增强引擎退出 (" + code + ") " + tail);
        } finally {
            timer.shutdownNow(); Process p = process; if (p != null && p.isAlive()) p.destroyForcibly(); process = null;
        }
    }
}
