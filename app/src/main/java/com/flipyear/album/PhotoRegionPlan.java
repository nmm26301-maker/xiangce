package com.flipyear.album;

/** Pure geometry: map a visible, EXIF-oriented pixel rectangle to original pixels. */
final class PhotoRegionPlan {
    final int left, top, right, bottom, sample;
    static int width(int rawWidth, int rawHeight, int orientation) { return orientation >= 5 ? rawHeight : rawWidth; }
    static int height(int rawWidth, int rawHeight, int orientation) { return orientation >= 5 ? rawWidth : rawHeight; }
    PhotoRegionPlan(int rawWidth, int rawHeight, int orientation, int x, int y, int w, int h, int edge) {
        int ow = width(rawWidth, rawHeight, orientation), oh = height(rawWidth, rawHeight, orientation);
        if (rawWidth <= 0 || rawHeight <= 0 || orientation < 1 || orientation > 8 || x < 0 || y < 0 || w <= 0 || h <= 0 ||
            (long)x + w > ow || (long)y + h > oh || edge < 64 || edge > 2048) throw new IllegalArgumentException("Invalid original-photo region");
        double minX = 1, minY = 1, maxX = 0, maxY = 0;
        for (int corner = 0; corner < 4; corner++) {
            double u = (x + (corner % 2 == 1 ? w : 0)) / (double)ow;
            double v = (y + (corner >= 2 ? h : 0)) / (double)oh;
            double rx = u, ry = v;
            switch (orientation) {
                case 2: rx = 1-u; break;
                case 3: rx = 1-u; ry = 1-v; break;
                case 4: ry = 1-v; break;
                case 5: rx = v; ry = u; break;
                case 6: rx = v; ry = 1-u; break;
                case 7: rx = 1-v; ry = 1-u; break;
                case 8: rx = 1-v; ry = u; break;
                default: break;
            }
            minX = Math.min(minX, rx); maxX = Math.max(maxX, rx); minY = Math.min(minY, ry); maxY = Math.max(maxY, ry);
        }
        left = Math.max(0, (int)Math.round(minX * rawWidth)); top = Math.max(0, (int)Math.round(minY * rawHeight));
        right = Math.min(rawWidth, (int)Math.round(maxX * rawWidth)); bottom = Math.min(rawHeight, (int)Math.round(maxY * rawHeight));
        int step = 1;
        while ((Math.max(right-left, bottom-top) + (long)step - 1) / step > edge) step *= 2;
        sample = step;
    }
}
