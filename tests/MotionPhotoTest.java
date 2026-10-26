package com.flipyear.album;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;

public final class MotionPhotoTest {
    private static int checks;
    private static File root;
    private static byte[] video;
    private static final String PREFIX = "http://ns.adobe.com/xap/1.0/\0";
    private static void check(boolean value, String message) { checks++; if (!value) throw new AssertionError(message); }
    private static String xml(String attributes, String body) {
        return "<x:xmpmeta xmlns:x='adobe:ns:meta/' xmlns:c='"+MotionPhoto.CAMERA+"' xmlns:k='"+MotionPhoto.CONTAINER+"' xmlns:i='"+MotionPhoto.ITEM+"'><d "+attributes+">"+body+"</d></x:xmpmeta>";
    }
    private static byte[] jpeg(String xmp, byte[] tail) throws Exception {
        ByteArrayOutputStream bytes = new ByteArrayOutputStream(); DataOutputStream out = new DataOutputStream(bytes);
        out.writeShort(0xffd8);
        if (xmp != null) { byte[] packet=(PREFIX+xmp).getBytes(StandardCharsets.UTF_8); out.writeShort(0xffe1); out.writeShort(packet.length+2); out.write(packet); }
        out.writeShort(0xffda); out.writeShort(2); out.write(new byte[]{1,2,3,(byte)255,(byte)217}); out.write(tail); return bytes.toByteArray();
    }
    private static File file(byte[] bytes) throws Exception { File f=File.createTempFile("photo-", ".bin", root); Files.write(f.toPath(),bytes); return f; }
    private static void reject(byte[] bytes,String label)throws Exception{
        File f=file(bytes);boolean rejected=false;
        try{rejected=MotionPhoto.find(f)==null;}catch(IOException expected){rejected=true;}
        check(rejected,label);check(Arrays.equals(Files.readAllBytes(f.toPath()),bytes),label+" does not modify input");
    }
    private static void roundtrip(String xmp,byte[] tail,int suffix)throws Exception{
        byte[] original=jpeg(xmp,tail);File source=file(original);MotionPhoto.Range range=MotionPhoto.find(source);
        check(range!=null,"Supported JPEG motion metadata");check(range.length==video.length,"Exact video length");
        check(range.offset==original.length-video.length-suffix,"Exact offset despite trailing items/padding");
        ByteArrayOutputStream output=new ByteArrayOutputStream();
        try(FileInputStream in=new FileInputStream(source)){MotionPhoto.extract(in.getChannel(),0,range,output);}
        check(Arrays.equals(video,output.toByteArray()),"Real MP4 extracted without transcoding");
        check(Arrays.equals(original,Files.readAllBytes(source.toPath())),"JPEG, EXIF-like metadata and video bytes unchanged");
        byte[] embedded=new byte[original.length+17];System.arraycopy(original,0,embedded,17,original.length);File asset=file(embedded);
        try(FileInputStream in=new FileInputStream(asset)){check(MotionPhoto.find(in.getChannel(),17,original.length).offset==range.offset,"Nonzero content-provider asset offset");}
    }
    public static void main(String[] args)throws Exception{
        root=Files.createTempDirectory("flipyear-photo-test").toFile();video=Files.readAllBytes(Paths.get("tests/fixtures/motion-video.mp4"));
        try{
            String legacy=xml("c:MicroVideo='1' c:MicroVideoOffset='"+video.length+"'","");roundtrip(legacy,video,0);
            String items="<k:Item i:Semantic='Primary' i:Mime='image/jpeg' i:Length='0'/>"+
                "<k:Item i:Semantic='MotionPhoto' i:Mime='video/mp4' i:Length='"+video.length+"'/>";
            roundtrip(xml("c:MotionPhoto='1' c:MotionPhotoVersion='1' c:MicroVideoOffset='1'",items),video,0);
            roundtrip(xml("", "<c:MicroVideo>1</c:MicroVideo><c:MicroVideoOffset>"+video.length+"</c:MicroVideoOffset>"),video,0);
            byte[] extra=Arrays.copyOf(video,video.length+7);Arrays.fill(extra,video.length,extra.length,(byte)3);
            roundtrip(xml("c:MotionPhoto='1'",items+"<k:Item i:Semantic='Other' i:Mime='application/octet-stream' i:Length='3' i:Padding='4'/>"),extra,7);
            reject(jpeg(null,video),"Filename or appended MP4 alone is not evidence");
            reject(jpeg(xml("c:MicroVideo='0' c:MicroVideoOffset='"+video.length+"'",""),video),"Disabled metadata");
            reject(jpeg(xml("c:MicroVideo='1' c:MicroVideoOffset='999999999999999999'",""),video),"Oversized offset");
            reject(jpeg(xml("c:MicroVideo='1' c:MicroVideoOffset='-1'",""),video),"Negative offset");
            reject(jpeg(xml("c:MotionPhoto='1' c:MotionPhotoVersion='2'",items),video),"Unknown format version");
            reject(jpeg(xml("c:MotionPhoto='1'",items.replace("image/jpeg","image/heic")),video),"HEIC is not misidentified as supported JPEG");
            reject(jpeg(xml("c:MotionPhoto='1'",items.replace("i:Length='"+video.length+"'","i:Length='999999999999999999'")),video),"Directory bounds");
            reject(jpeg("<!DOCTYPE x [<!ENTITY e SYSTEM 'file:///etc/passwd'>]>"+legacy,video),"External entity rejection");
            reject(jpeg("<broken",video),"Malformed XMP");
            byte[] bad=video.clone();bad[4]='X';reject(jpeg(legacy,bad),"MP4 signature required");
            reject(jpeg(legacy,Arrays.copyOf(video,video.length-8)),"Truncated MP4");
            byte[] overflow=video.clone();Arrays.fill(overflow,0,4,(byte)255);reject(jpeg(legacy,overflow),"MP4 box length overflow");
            File original=file(jpeg(legacy,video));String hash=OriginalBytes.sha256(original);OriginalBytes.verify(original,original.length(),hash);check(hash.length()==64,"SHA-256 identity");
            Files.write(original.toPath(),new byte[]{7},StandardOpenOption.APPEND);
            boolean failed=false;try{OriginalBytes.verify(original,original.length()-1,hash);}catch(IOException expected){failed=true;}check(failed,"Changed original rejected by size and hash");
            String photoId="local-photo-11111111-1111-4111-8111-111111111111";
            check(AlbumArchive.photoId(photoId)&&!AlbumArchive.videoId(photoId),"Photo and video ID namespaces remain separate");
            Map<String,File> payload=new LinkedHashMap<>();payload.put(photoId,original);
            ByteArrayOutputStream zip=new ByteArrayOutputStream();AlbumArchive.write(zip,"{\"version\":3}".getBytes(StandardCharsets.UTF_8),payload);
            File stage=new File(root,"restore");stage.mkdir();AlbumArchive.Restored restored=AlbumArchive.read(new ByteArrayInputStream(zip.toByteArray()),stage,m->Collections.singleton(photoId));
            check(Arrays.equals(Files.readAllBytes(original.toPath()),Files.readAllBytes(restored.files.get(photoId).toPath())),"Original JPEG + embedded video ZIP roundtrip is byte-identical");
            System.out.println("PASS MotionPhoto/OriginalBytes: "+checks+" assertions; legacy/current namespace-aware XMP, actual MP4 extraction, asset offsets, corrupt/truncated bounds, XML rejection, SHA-256 and original ZIP identity.");
        }finally{Files.walk(root.toPath()).sorted(Comparator.reverseOrder()).forEach(p->{try{Files.delete(p);}catch(IOException ignored){}});}
    }
}
