package com.flipyear.album;

/** Permission and identifier rules, also executed by host-side regression tests. */
final class MediaPolicy {
    private MediaPolicy() { }

    static String access(int sdk, boolean images, boolean videos, boolean selected, boolean storage, boolean video) {
        if (sdk < 33) return storage ? "full" : "denied";
        if (video ? videos : images) return "full";
        return sdk >= 34 && selected ? "partial" : "denied";
    }

    static String combined(String images, String videos) {
        if ("full".equals(images) && "full".equals(videos)) return "full";
        return "denied".equals(images) && "denied".equals(videos) ? "denied" : "partial";
    }

    static long videoId(String value) {
        if (value == null || !value.matches("device-video-[1-9][0-9]{0,18}")) return -1;
        try { return Long.parseLong(value.substring("device-video-".length())); }
        catch (NumberFormatException ignored) { return -1; }
    }
}
