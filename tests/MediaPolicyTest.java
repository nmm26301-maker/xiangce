package com.flipyear.album;

public final class MediaPolicyTest {
    private static int checks;
    private static void check(boolean condition, String message) { checks++; if (!condition) throw new AssertionError(message); }
    public static void main(String[] args) {
        check("denied".equals(MediaPolicy.access(26, true, true, true, false, true)), "Legacy Android needs storage grant");
        check("full".equals(MediaPolicy.access(26, false, false, false, true, false)), "Legacy storage grant allows images");
        check("full".equals(MediaPolicy.access(32, false, false, false, true, true)), "Legacy storage grant allows videos");
        check("full".equals(MediaPolicy.access(33, true, false, false, false, false)), "Image-only grant allows photos");
        check("denied".equals(MediaPolicy.access(33, true, false, false, true, true)), "Image grant never implies video grant on Android 13");
        check("denied".equals(MediaPolicy.access(33, false, true, false, true, false)), "Video grant never implies image grant on Android 13");
        check("full".equals(MediaPolicy.access(33, false, true, false, false, true)), "Video-only grant allows videos");
        check("denied".equals(MediaPolicy.access(33, false, false, true, true, false)), "Selected grant is unavailable before Android 14");
        check("partial".equals(MediaPolicy.access(34, false, false, true, false, false)), "Selected images");
        check("partial".equals(MediaPolicy.access(34, false, false, true, false, true)), "Selected videos");
        check("full".equals(MediaPolicy.access(35, true, false, true, false, false)), "Full image access wins over selected access");
        check("partial".equals(MediaPolicy.access(35, true, false, true, false, true)), "Mixed full images and selected videos");
        check("denied".equals(MediaPolicy.access(35, false, false, false, true, true)), "Legacy storage grant does not bypass modern grants");
        check("full".equals(MediaPolicy.combined("full", "full")), "Both types fully granted");
        check("partial".equals(MediaPolicy.combined("full", "denied")), "Photo-only access is not advertised as full media access");
        check("partial".equals(MediaPolicy.combined("denied", "full")), "Video-only access remains usable");
        check("partial".equals(MediaPolicy.combined("partial", "partial")), "Selected set remains partial");
        check("denied".equals(MediaPolicy.combined("denied", "denied")), "Both types revoked");
        check(MediaPolicy.videoId("device-video-7") == 7, "Video ID");
        check(MediaPolicy.videoId("device-video-9223372036854775807") == Long.MAX_VALUE, "Largest valid MediaStore ID");
        for (String invalid : new String[] {null, "", "device-7", "device-video-0", "device-video--1", "device-video-01", "device-video-9223372036854775808", "device-video-18446744073709551615", "device-video-7\n", "https://example.com/7", "content://media/external/video/media/7", "device-video-7/../../1"}) {
            check(MediaPolicy.videoId(invalid) == -1, "Reject arbitrary URI, overflow or malformed ID: " + invalid);
        }
        System.out.println("PASS MediaPolicy: " + checks + " assertions; independent grants, partial/legacy access and local video ID validation.");
    }
}
