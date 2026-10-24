package com.flipyear.album;

import java.io.*;
import java.util.*;
import java.util.zip.*;

/** Streaming, bounded ZIP transport; JSON interpretation belongs to the application. */
final class AlbumArchive {
    static final long MAX_VIDEO = 250L * 1024 * 1024;
    static final long MAX_TOTAL = 512L * 1024 * 1024;
    static final int MAX_MANIFEST = 32 * 1024 * 1024;
    static final int MAX_FILES = 200;
    interface Validator { Set<String> validate(byte[] manifest) throws IOException; }
    static final class Restored {
        final byte[] manifest;
        final Map<String, File> files;
        Restored(byte[] json, Map<String, File> videos) { manifest = json; files = videos; }
    }
    private AlbumArchive() { }

    static boolean validId(String id) {
        return id != null && id.matches("local-video-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}");
    }

    static long copy(InputStream in, OutputStream out, long limit) throws IOException {
        if (in == null || out == null || limit < 0) throw new IOException("无法打开文件");
        byte[] buffer = new byte[65536]; long total = 0; int count;
        while ((count = in.read(buffer)) != -1) {
            total += count;
            if (total > limit) throw new IOException("文件超过本次大小限制，请分批处理");
            out.write(buffer, 0, count);
        }
        return total;
    }

    static void write(OutputStream output, byte[] manifest, Map<String, File> files) throws IOException {
        if (manifest == null || manifest.length > MAX_MANIFEST || files.size() > MAX_FILES) throw new IOException("相册备份过大，请逐本导出");
        long total = manifest.length;
        for (Map.Entry<String, File> item : files.entrySet()) {
            File file = item.getValue();
            if (!validId(item.getKey()) || !file.isFile() || file.length() == 0 || file.length() > MAX_VIDEO) throw new IOException("备份视频缺失或过大");
            total += file.length();
            if (total > MAX_TOTAL) throw new IOException("单份备份最多 512MB，请逐本导出");
        }
        try (ZipOutputStream zip = new ZipOutputStream(output)) {
            zip.setLevel(Deflater.BEST_SPEED);
            zip.putNextEntry(new ZipEntry("manifest.json")); zip.write(manifest); zip.closeEntry();
            // Video containers are already compressed; keep the streaming format without recompressing them.
            zip.setLevel(Deflater.NO_COMPRESSION);
            long written = manifest.length;
            for (Map.Entry<String, File> item : files.entrySet()) {
                zip.putNextEntry(new ZipEntry("media/" + item.getKey() + ".bin"));
                try (InputStream in = new FileInputStream(item.getValue())) { written += copy(in, zip, Math.min(MAX_VIDEO, MAX_TOTAL - written)); }
                zip.closeEntry();
            }
            zip.finish();
        }
    }

    static Restored read(InputStream input, File staging, Validator validator) throws IOException {
        if (!staging.isDirectory() || staging.list() == null || staging.list().length != 0) throw new IOException("恢复暂存目录必须为空");
        Map<String, File> files = new LinkedHashMap<>();
        boolean success = false;
        try (ZipInputStream zip = new ZipInputStream(input)) {
            ZipEntry first = zip.getNextEntry();
            if (first == null || !"manifest.json".equals(first.getName()) || first.isDirectory()) throw new IOException("不是 FlipYear ZIP 备份");
            ByteArrayOutputStream json = new ByteArrayOutputStream(); copy(zip, json, MAX_MANIFEST); zip.closeEntry();
            byte[] manifest = json.toByteArray();
            Set<String> expected = validator.validate(manifest);
            if (expected == null || expected.size() > MAX_FILES) throw new IOException("视频数量超限");
            for (String id : expected) if (!validId(id)) throw new IOException("视频编号无效");
            long total = manifest.length; ZipEntry entry;
            while ((entry = zip.getNextEntry()) != null) {
                String name = entry.getName();
                if (!name.startsWith("media/") || !name.endsWith(".bin") || entry.isDirectory()) throw new IOException("备份包含未知文件");
                String id = name.substring(6, name.length() - 4);
                if (!validId(id) || !expected.contains(id) || files.containsKey(id)) throw new IOException("备份视频不匹配或重复");
                File target = new File(staging, id + ".bin");
                if (!target.getCanonicalPath().startsWith(staging.getCanonicalPath() + File.separator) || !target.createNewFile()) throw new IOException("恢复路径无效");
                files.put(id, target);
                try (FileOutputStream out = new FileOutputStream(target)) {
                    long size = copy(zip, out, Math.min(MAX_VIDEO, MAX_TOTAL - total));
                    if (size == 0) throw new IOException("备份视频为空");
                    total += size; out.getFD().sync();
                }
                zip.closeEntry();
            }
            if (!files.keySet().equals(expected)) throw new IOException("备份缺少视频文件");
            success = true; return new Restored(manifest, files);
        } finally {
            if (!success) for (File file : files.values()) file.delete();
        }
    }
}
