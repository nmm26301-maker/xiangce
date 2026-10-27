package com.flipyear.album;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;
import java.io.File;
import java.io.FileNotFoundException;
import java.util.List;

/** 只读原图分享通道；仅临时授权用户选定的外部图片处理应用。 */
public final class OriginalShareProvider extends ContentProvider {
    static final String AUTHORITY = "com.flipyear.album.originalshare";

    static Uri uri(String id) {
        return new Uri.Builder().scheme("content").authority(AUTHORITY)
            .appendPath("original").appendPath(id).build();
    }

    @Override public boolean onCreate() { return true; }

    private File original(Uri uri) throws FileNotFoundException {
        List<String> path = uri == null ? null : uri.getPathSegments();
        if (path == null || path.size() != 2 || !"original".equals(path.get(0))
                || !AlbumArchive.photoId(path.get(1)) || getContext() == null) {
            throw new FileNotFoundException("无效的原图访问");
        }
        File file = new File(new File(getContext().getFilesDir(), "album-videos"),
            path.get(1) + ".bin");
        if (!file.isFile() || file.length() <= 0 || file.length() > 250L * 1024 * 1024) {
            throw new FileNotFoundException("原图不存在或文件过大");
        }
        return file;
    }

    @Override public ParcelFileDescriptor openFile(Uri uri, String mode)
            throws FileNotFoundException {
        if (!"r".equals(mode)) throw new FileNotFoundException("仅允许读取");
        return ParcelFileDescriptor.open(original(uri), ParcelFileDescriptor.MODE_READ_ONLY);
    }

    @Override public String getType(Uri uri) {
        try {
            BitmapFactory.Options options = new BitmapFactory.Options();
            options.inJustDecodeBounds = true;
            BitmapFactory.decodeFile(original(uri).getAbsolutePath(), options);
            return options.outMimeType != null ? options.outMimeType : "image/*";
        } catch (FileNotFoundException error) { return null; }
    }

    @Override public Cursor query(Uri uri, String[] projection, String selection,
                                  String[] selectionArgs, String sortOrder) {
        try {
            File file = original(uri);
            String[] columns = projection == null
                ? new String[] { OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE }
                : projection;
            MatrixCursor cursor = new MatrixCursor(columns, 1);
            Object[] row = new Object[columns.length];
            String mime = getType(uri);
            String suffix = "image/png".equals(mime) ? ".png"
                : "image/heic".equals(mime) || "image/heif".equals(mime) ? ".heic"
                : "image/webp".equals(mime) ? ".webp" : ".jpg";
            for (int i = 0; i < columns.length; i++) {
                if (OpenableColumns.DISPLAY_NAME.equals(columns[i])) row[i] = "FlipYear-original" + suffix;
                else if (OpenableColumns.SIZE.equals(columns[i])) row[i] = file.length();
            }
            cursor.addRow(row);
            return cursor;
        } catch (FileNotFoundException error) { return null; }
    }

    @Override public Uri insert(Uri uri, ContentValues values) {
        throw new UnsupportedOperationException("只读原图");
    }

    @Override public int delete(Uri uri, String selection, String[] selectionArgs) {
        throw new UnsupportedOperationException("只读原图");
    }

    @Override public int update(Uri uri, ContentValues values, String selection,
                                String[] selectionArgs) {
        throw new UnsupportedOperationException("只读原图");
    }
}
