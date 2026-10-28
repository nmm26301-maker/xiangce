package com.flipyear.album;

import java.io.File;
import java.util.Arrays;
import java.util.List;

/** Fixed, shell-free invocation and bounded working image size. */
final class AiPolicy {
    static int edge(boolean lowRam, boolean large) { return lowRam ? 768 : large ? 1536 : 1024; }
    static boolean validOutput(int iw, int ih, int ow, int oh) {
        return iw > 0 && ih > 0 && iw <= 1536 && ih <= 1536 && ow == iw * 4 && oh == ih * 4;
    }
    static List<String> command(File engine, File input, File output, File models) {
        return Arrays.asList(engine.getAbsolutePath(), "-i", input.getAbsolutePath(), "-o", output.getAbsolutePath(),
            "-m", models.getAbsolutePath(), "-s", "4", "-g", "-1", "-t", "64", "-j", "1:2:1", "-f", "png");
    }
}
