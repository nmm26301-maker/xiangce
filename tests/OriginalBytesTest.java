package com.flipyear.album;
import java.io.*;
import java.util.*;

/** Exercises the production streaming export/readback path with real binary data. */
public final class OriginalBytesTest {
    private static int checks;
    private interface Operation { void run() throws Exception; }
    private static void check(boolean value, String label) { checks++; if (!value) throw new AssertionError(label); }
    private static void rejects(Operation operation, String label) throws Exception {
        boolean failed = false;
        try { operation.run(); } catch (IOException expected) { failed = true; }
        check(failed, label);
    }
    public static void main(String[] args) throws Exception {
        byte[] source = new byte[262147]; new Random(2026).nextBytes(source);
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        InputStream fragmented = new ByteArrayInputStream(source) {
            public synchronized int read(byte[] bytes, int offset, int length) { return super.read(bytes, offset, Math.min(7, length)); }
        };
        OriginalBytes.Identity written = OriginalBytes.transfer(fragmented, output, source.length);
        check(Arrays.equals(source, output.toByteArray()), "Fragmented original copied byte-for-byte");
        check(written.size == source.length && written.checksum.matches("[0-9a-f]{64}"), "Size and SHA-256 recorded");
        OriginalBytes.Identity saved = OriginalBytes.transfer(new ByteArrayInputStream(output.toByteArray()), null, source.length);
        saved.require(written.size, written.checksum); check(true, "Readback confirms copied bytes");
        check(OriginalBytes.transfer(new ByteArrayInputStream(new byte[]{97,98,99}), null, 3).checksum.equals(
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"), "Known SHA-256 reference vector");
        byte[] damaged = source.clone(); damaged[65537] ^= 1;
        rejects(() -> OriginalBytes.transfer(new ByteArrayInputStream(damaged), null, source.length).require(written.size, written.checksum), "Same-size corruption rejected");
        rejects(() -> OriginalBytes.transfer(new ByteArrayInputStream(Arrays.copyOf(source, source.length - 1)), null, source.length).require(written.size, written.checksum), "Truncated destination rejected");
        rejects(() -> saved.require(written.size + 1, written.checksum), "Size mismatch rejected");
        rejects(() -> saved.require(written.size, null), "Missing checksum rejected");
        rejects(() -> OriginalBytes.transfer(new ByteArrayInputStream(source), output, source.length - 1), "Bounded export rejects overflow");
        rejects(() -> OriginalBytes.transfer(new ByteArrayInputStream(new byte[0]), null, 10), "Empty source rejected");
        rejects(() -> OriginalBytes.transfer(null, null, 10), "Unavailable provider input rejected");
        rejects(() -> OriginalBytes.transfer(new ByteArrayInputStream(source), null, 0), "Invalid budget rejected");
        rejects(() -> OriginalBytes.transfer(new ByteArrayInputStream(source), new OutputStream() {
            public void write(int value) throws IOException { throw new IOException("provider full"); }
        }, source.length), "Write failure is not success");
        rejects(() -> OriginalBytes.transfer(new InputStream() {
            public int read() throws IOException { throw new IOException("permission revoked"); }
        }, null, source.length), "Readback failure is not success");
        InputStream zeroRead = new ByteArrayInputStream(source) {
            private boolean first = true;
            public synchronized int read(byte[] bytes, int offset, int length) {
                if (first) { first = false; return 0; } return super.read(bytes, offset, length);
            }
        };
        OriginalBytes.transfer(zeroRead, null, source.length).require(written.size, written.checksum);
        check(true, "Zero-length provider read progresses without spinning");
        System.out.println("PASS OriginalBytes export/readback: " + checks + " assertions; real binary identity, corruption, truncation, size limits and provider failures.");
    }
}
