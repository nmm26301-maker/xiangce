package com.flipyear.album;

import android.content.ContentResolver;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Matrix;
import android.media.ExifInterface;
import android.net.Uri;
import java.io.IOException;
import java.io.InputStream;

/** Bounded local decoding, preserving EXIF orientation and the full image aspect. */
final class PhotoDecoder {
    private PhotoDecoder() { }

    static Bitmap decode(ContentResolver resolver, Uri source, int edge) throws IOException {
        if (!"content".equals(source.getScheme())) throw new IOException("Unsupported photo URI");
        BitmapFactory.Options options = new BitmapFactory.Options();
        options.inJustDecodeBounds = true;
        try (InputStream stream = resolver.openInputStream(source)) { BitmapFactory.decodeStream(stream, null, options); }
        int sample = 1;
        while (Math.max(options.outWidth, options.outHeight) / (sample * 2) >= edge) sample *= 2;
        options.inSampleSize = sample;
        options.inJustDecodeBounds = false;
        Bitmap image;
        try (InputStream stream = resolver.openInputStream(source)) { image = BitmapFactory.decodeStream(stream, null, options); }
        if (image == null) throw new IOException("Unsupported photo format");
        try {
            int orientation = ExifInterface.ORIENTATION_NORMAL;
            try (InputStream stream = resolver.openInputStream(source)) {
                orientation = new ExifInterface(stream).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL);
            } catch (IOException ignored) { }
            Matrix matrix = new Matrix();
            switch (orientation) {
                case ExifInterface.ORIENTATION_FLIP_HORIZONTAL: matrix.setScale(-1, 1); break;
                case ExifInterface.ORIENTATION_ROTATE_180: matrix.setRotate(180); break;
                case ExifInterface.ORIENTATION_FLIP_VERTICAL: matrix.setScale(1, -1); break;
                case ExifInterface.ORIENTATION_TRANSPOSE: matrix.setRotate(90); matrix.postScale(-1, 1); break;
                case ExifInterface.ORIENTATION_ROTATE_90: matrix.setRotate(90); break;
                case ExifInterface.ORIENTATION_TRANSVERSE: matrix.setRotate(270); matrix.postScale(-1, 1); break;
                case ExifInterface.ORIENTATION_ROTATE_270: matrix.setRotate(270); break;
                default: break;
            }
            if (!matrix.isIdentity()) {
                Bitmap rotated = Bitmap.createBitmap(image, 0, 0, image.getWidth(), image.getHeight(), matrix, true);
                if (rotated != image) image.recycle();
                image = rotated;
            }
            float ratio = Math.min(1f, (float) edge / Math.max(image.getWidth(), image.getHeight()));
            if (ratio < 1) {
                Bitmap scaled = Bitmap.createScaledBitmap(image, Math.max(1, Math.round(image.getWidth() * ratio)), Math.max(1, Math.round(image.getHeight() * ratio)), true);
                if (scaled != image) image.recycle();
                image = scaled;
            }
            return image;
        } catch (RuntimeException e) { image.recycle(); throw e; }
    }
}
