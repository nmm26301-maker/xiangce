package com.flipyear.album;

import java.io.*;
import java.nio.ByteBuffer;
import java.nio.channels.FileChannel;
import java.nio.charset.StandardCharsets;
import java.util.*;
import javax.xml.parsers.SAXParserFactory;
import org.xml.sax.*;
import org.xml.sax.helpers.DefaultHandler;

/** Bounded JPEG XMP reader. No filename guesses, network access or image rewriting. */
final class MotionPhoto {
    static final String CAMERA = "http://ns.google.com/photos/1.0/camera/";
    static final String ITEM = "http://ns.google.com/photos/1.0/container/item/";
    static final String CONTAINER = "http://ns.google.com/photos/1.0/container/";
    static final long MAX_VIDEO = 250L * 1024 * 1024;
    static final class Range {
        final long offset, length;
        Range(long start, long size) { offset = start; length = size; }
    }
    private MotionPhoto() { }
    private static long number(String value) throws IOException {
        if (value == null || !value.matches("[0-9]{1,18}")) throw new IOException("实况长度无效");
        return Long.parseLong(value);
    }
    private static byte[] read(FileChannel channel, long offset, int count) throws IOException {
        ByteBuffer buffer = ByteBuffer.allocate(count); channel.position(offset);
        while (buffer.hasRemaining()) { if (channel.read(buffer) < 0) throw new EOFException("实况文件不完整"); }
        return buffer.array();
    }
    static Range find(File file) throws IOException {
        try (FileInputStream in = new FileInputStream(file)) { return find(in.getChannel(), 0, file.length()); }
    }
    static Range find(FileChannel channel, long base, long length) throws IOException {
        if (base < 0 || length < 4 || length > channel.size() - base) return null;
        if (!Arrays.equals(read(channel, base, 2), new byte[] {(byte)255, (byte)216})) return null;
        long at = base + 2, end = base + length;
        Metadata metadata = null;
        for (int segments = 0; segments < 512 && at < end && at - base < 1024 * 1024; segments++) {
            byte[] marker = read(channel, at, 2);
            if ((marker[0] & 255) != 255) return null;
            int code = marker[1] & 255; at += 2;
            if (code == 255) { at--; continue; }
            if (code == 218 || code == 217) break;
            if (code == 1 || code >= 208 && code <= 215) continue;
            byte[] size = read(channel, at, 2);
            int count = (size[0] & 255) * 256 + (size[1] & 255);
            if (count < 2 || count > end - at) return null;
            if (code == 225) {
                byte[] payload = read(channel, at + 2, count - 2);
                String prefix = "http://ns.adobe.com/xap/1.0/\0";
                if (payload.length > prefix.length() && new String(payload, 0, prefix.length(), StandardCharsets.US_ASCII).equals(prefix)) {
                    if (metadata != null) return null; // Ambiguous duplicate XMP is not guessed.
                    metadata = parse(Arrays.copyOfRange(payload, prefix.length(), payload.length));
                }
            }
            at += count;
        }
        if (metadata == null) return null;
        Range range = metadata.range(length);
        if (range == null || range.offset < at - base || range.length > MAX_VIDEO || range.length > length - range.offset) return null;
        return validMp4(channel, base + range.offset, range.length) ? range : null;
    }
    private static Metadata parse(byte[] bytes) throws IOException {
        String xml = new String(bytes, StandardCharsets.UTF_8);
        if (xml.contains("<!DOCTYPE") || xml.contains("<!ENTITY") || xml.indexOf('\0') >= 0) throw new IOException("不接受外部实体元数据");
        try {
            SAXParserFactory factory = SAXParserFactory.newInstance(); factory.setNamespaceAware(true);
            XMLReader reader = factory.newSAXParser().getXMLReader();
            reader.setEntityResolver((publicId, systemId) -> { throw new SAXException("外部实体已禁用"); });
            Metadata metadata = new Metadata(); reader.setContentHandler(metadata);
            reader.setErrorHandler(metadata); reader.parse(new InputSource(new StringReader(xml))); return metadata;
        } catch (Exception e) { throw new IOException("实况元数据无效", e); }
    }
    private static final class Metadata extends DefaultHandler {
        final Map<String, String> camera = new HashMap<>();
        final List<Map<String, String>> items = new ArrayList<>();
        String property; StringBuilder text;
        @Override public void startElement(String uri, String local, String qName, Attributes attrs) throws SAXException {
            if (CAMERA.equals(uri)) { property = local; text = new StringBuilder(); }
            for (int i = 0; i < attrs.getLength(); i++) if (CAMERA.equals(attrs.getURI(i))) camera.put(attrs.getLocalName(i), attrs.getValue(i));
            if (CONTAINER.equals(uri) && "Item".equals(local)) {
                if (items.size() >= 64) throw new SAXException("实况条目过多");
                Map<String, String> item = new HashMap<>();
                for (int i = 0; i < attrs.getLength(); i++) if (ITEM.equals(attrs.getURI(i))) item.put(attrs.getLocalName(i), attrs.getValue(i));
                items.add(item);
            }
        }
        @Override public void characters(char[] chars, int start, int length) { if (text != null) text.append(chars, start, length); }
        @Override public void endElement(String uri, String local, String qName) {
            if (CAMERA.equals(uri) && local.equals(property)) { camera.put(property, text.toString().trim()); property = null; text = null; }
        }
        @Override public void error(SAXParseException e) throws SAXException { throw e; }
        @Override public void fatalError(SAXParseException e) throws SAXException { throw e; }
        Range range(long fileSize) throws IOException {
            if ("1".equals(camera.get("MotionPhoto"))) {
                if (!"1".equals(camera.getOrDefault("MotionPhotoVersion", "1"))) return null;
                if (items.size() < 2 || !"Primary".equals(items.get(0).get("Semantic")) || !"image/jpeg".equals(items.get(0).get("Mime"))) return null;
                long at = fileSize; Range result = null;
                for (int i = items.size() - 1; i > 0; i--) {
                    Map<String, String> item = items.get(i);
                    long length = number(item.get("Length")), padding = number(item.getOrDefault("Padding", "0"));
                    if (length <= 0 || padding > at || length > at - padding) return null;
                    at -= length + padding;
                    if ("MotionPhoto".equals(item.get("Semantic")) && "video/mp4".equals(item.get("Mime"))) {
                        if (result != null) return null; result = new Range(at, length);
                    }
                }
                return result;
            }
            if (!"1".equals(camera.get("MicroVideo"))) return null;
            long offset = number(camera.get("MicroVideoOffset"));
            return offset > 0 && offset < fileSize ? new Range(fileSize - offset, offset) : null;
        }
    }
    private static boolean validMp4(FileChannel channel, long start, long length) throws IOException {
        if (length < 24) return false;
        long at = start, end = start + length; boolean movie = false, data = false;
        for (int boxes = 0; at < end && boxes < 4096; boxes++) {
            if (end - at < 8) return false;
            ByteBuffer header = ByteBuffer.wrap(read(channel, at, 8)); long size = header.getInt() & 0xffffffffL;
            byte[] type = new byte[4]; header.get(type); String name = new String(type, StandardCharsets.US_ASCII); int head = 8;
            if (size == 1) { if (end - at < 16) return false; size = ByteBuffer.wrap(read(channel, at + 8, 8)).getLong(); head = 16; }
            if (size == 0) size = end - at;
            if (size < head || size > end - at) return false;
            if (at == start && (!"ftyp".equals(name) || size < 16)) return false;
            if ("moov".equals(name)) movie = true;
            if ("mdat".equals(name) && size > head) data = true;
            at += size;
        }
        return at == end && movie && data;
    }
    static void extract(FileChannel source, long base, Range range, OutputStream output) throws IOException {
        source.position(base + range.offset); long left = range.length; ByteBuffer buffer = ByteBuffer.allocate(65536);
        while (left > 0) {
            buffer.clear(); buffer.limit((int)Math.min(left, buffer.capacity())); int count = source.read(buffer);
            if (count < 0) throw new EOFException("实况视频不完整");
            output.write(buffer.array(), 0, count); left -= count;
        }
    }
}
