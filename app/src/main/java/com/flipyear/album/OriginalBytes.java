package com.flipyear.album;
import java.io.*;
import java.security.*;

/** File identity for original photos; previews never replace these bytes. */
final class OriginalBytes {
    private OriginalBytes() { }
    static final class Identity {
        final long size;
        final String checksum;
        Identity(long count, String hash) { size = count; checksum = hash; }
        void require(long expectedSize, String expectedHash) throws IOException {
            if (expectedSize <= 0 || size != expectedSize || expectedHash == null || !expectedHash.equals(checksum))
                throw new IOException("原文件大小或 SHA-256 校验失败");
        }
    }
    /** Hash exactly the streamed bytes, without decoding or allocating the whole photo. */
    static Identity transfer(InputStream in, OutputStream out, long limit) throws IOException {
        if (in == null || limit <= 0) throw new IOException("原文件输入不可用");
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] block = new byte[65536]; long total = 0; int count;
            while ((count = in.read(block)) != -1) {
                if (count == 0) { int next = in.read(); if (next == -1) break; block[0] = (byte) next; count = 1; }
                if (count > limit - total) throw new IOException("原文件超过大小限制");
                if (out != null) out.write(block, 0, count);
                digest.update(block, 0, count); total += count;
            }
            if (total == 0) throw new IOException("原文件为空");
            StringBuilder hex = new StringBuilder();
            for (byte b : digest.digest()) hex.append(String.format(java.util.Locale.US, "%02x", b & 255));
            return new Identity(total, hex.toString());
        } catch (NoSuchAlgorithmException e) { throw new IOException(e); }
    }
    static String sha256(File file) throws IOException {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256"); byte[] block = new byte[65536]; int count;
            try (InputStream in = new FileInputStream(file)) { while ((count = in.read(block)) != -1) digest.update(block, 0, count); }
            StringBuilder hex = new StringBuilder(); for (byte b : digest.digest()) hex.append(String.format(java.util.Locale.US, "%02x", b & 255)); return hex.toString();
        } catch (NoSuchAlgorithmException e) { throw new IOException(e); }
    }
    static void verify(File file, long size, String checksum) throws IOException {
        if (file == null || !file.isFile() || size <= 0 || file.length() != size || checksum == null || !checksum.matches("[0-9a-f]{64}") || !checksum.equals(sha256(file)))
            throw new IOException("原文件完整性校验失败，请保留原备份并重新导入");
    }
}
