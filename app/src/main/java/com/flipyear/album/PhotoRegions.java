package com.flipyear.album;

import android.app.Activity;
import android.graphics.*;
import android.media.ExifInterface;
import android.net.Uri;
import android.webkit.WebResourceResponse;
import org.json.JSONObject;
import java.io.*;
import java.util.*;

/** One bounded region at a time. Only validated private/MediaStore photo IDs are accepted. */
final class PhotoRegions {
    private PhotoRegions() { }
    static synchronized WebResourceResponse resource(Activity owner, Uri request) {
        Bitmap image = null;
        try {
            List<String> parts = request.getPathSegments();
            if (parts.size() != 3) throw new IOException("Invalid detail path");
            Uri source = OriginalMedia.photoUri(owner, parts.get(1));
            int orientation = 1;
            try (InputStream in = owner.getContentResolver().openInputStream(source)) {
                orientation = new ExifInterface(in).getAttributeInt(ExifInterface.TAG_ORIENTATION, 1);
            } catch (IOException ignored) { }
            if (orientation < 1 || orientation > 8) orientation = 1;
            try (android.os.ParcelFileDescriptor descriptor = owner.getContentResolver().openFileDescriptor(source, "r")) {
                if (descriptor == null) throw new IOException("Original descriptor unavailable");
                BitmapRegionDecoder decoder = BitmapRegionDecoder.newInstance(descriptor.getFileDescriptor(), false);
                if (decoder == null) throw new IOException("Region decoding unavailable");
                try {
                    int rw = decoder.getWidth(), rh = decoder.getHeight();
                    if ("info".equals(parts.get(2))) {
                        String json = new JSONObject().put("width", PhotoRegionPlan.width(rw,rh,orientation))
                            .put("height", PhotoRegionPlan.height(rw,rh,orientation)).put("regionSupported", true).toString();
                        return response("application/json", json.getBytes("UTF-8"));
                    }
                    if (!"tile".equals(parts.get(2))) throw new IOException("Invalid detail operation");
                    PhotoRegionPlan plan = new PhotoRegionPlan(rw,rh,orientation,number(request,"x"),number(request,"y"),number(request,"w"),number(request,"h"),number(request,"edge"));
                    BitmapFactory.Options options = new BitmapFactory.Options(); options.inSampleSize = plan.sample;
                    options.inPreferredConfig = Bitmap.Config.ARGB_8888;
                    image = decoder.decodeRegion(new Rect(plan.left,plan.top,plan.right,plan.bottom),options);
                    if (image == null) throw new IOException("Original region unavailable");
                } finally { decoder.recycle(); }
            }
            Matrix transform = new Matrix();
            switch (orientation) {
                case 2: transform.setScale(-1,1); break;
                case 3: transform.setRotate(180); break;
                case 4: transform.setScale(1,-1); break;
                case 5: transform.setRotate(90); transform.postScale(-1,1); break;
                case 6: transform.setRotate(90); break;
                case 7: transform.setRotate(270); transform.postScale(-1,1); break;
                case 8: transform.setRotate(270); break;
                default: break;
            }
            if (!transform.isIdentity()) {
                Bitmap upright = Bitmap.createBitmap(image,0,0,image.getWidth(),image.getHeight(),transform,false);
                if (upright != image) image.recycle(); image = upright;
            }
            ByteArrayOutputStream encoded = new ByteArrayOutputStream();
            if (!image.compress(Bitmap.CompressFormat.PNG,100,encoded)) throw new IOException("Region encoding failed");
            return response("image/png",encoded.toByteArray());
        } catch (Exception | OutOfMemoryError e) {
            return new WebResourceResponse("text/plain","UTF-8",404,"Unavailable",Collections.singletonMap("Cache-Control","no-store"),new ByteArrayInputStream(new byte[0]));
        } finally { if (image != null) image.recycle(); }
    }
    private static int number(Uri request, String name) {
        String value = request.getQueryParameter(name);
        if (value == null || !value.matches("[0-9]{1,9}")) throw new IllegalArgumentException("Invalid region parameter");
        return Integer.parseInt(value);
    }
    private static WebResourceResponse response(String mime, byte[] bytes) {
        return new WebResourceResponse(mime,"application/json".equals(mime)?"UTF-8":null,200,"OK",Collections.singletonMap("Cache-Control","no-store"),new ByteArrayInputStream(bytes));
    }
}
