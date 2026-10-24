package com.flipyear.album;

import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.*;
import java.util.zip.*;

/** Executes the production ZIP transport with real streams and files, without Android. */
public final class AlbumArchiveTest {
    private static final String A="local-video-11111111-1111-4111-8111-111111111111", B="local-video-22222222-2222-4222-8222-222222222222", C="local-video-33333333-3333-4333-8333-333333333333";
    private static final byte[] MANIFEST="{\"format\":\"flipyear\",\"version\":2}".getBytes(StandardCharsets.UTF_8);
    private static int checks;
    private static File root;
    private static void check(boolean value,String message){checks++;if(!value)throw new AssertionError(message);}
    private static File stage()throws IOException{return Files.createTempDirectory(root.toPath(),"stage-").toFile();}
    private static Set<String> ids(String...values){return new LinkedHashSet<>(Arrays.asList(values));}
    private static byte[] zip(String[] names,String[] contents)throws IOException{
        ByteArrayOutputStream bytes=new ByteArrayOutputStream();
        try(ZipOutputStream z=new ZipOutputStream(bytes)){for(int i=0;i<names.length;i++){byte[] data=contents[i].getBytes(StandardCharsets.UTF_8);ZipEntry e=new ZipEntry(names[i]);e.setMethod(ZipEntry.STORED);e.setSize(data.length);CRC32 crc=new CRC32();crc.update(data);e.setCrc(crc.getValue());z.putNextEntry(e);z.write(data);z.closeEntry();}}
        return bytes.toByteArray();
    }
    private static void reject(byte[] data,Set<String> expected,String label)throws Exception{
        File staging=stage();boolean rejected=false;
        try{AlbumArchive.read(new ByteArrayInputStream(data),staging,m->expected);}catch(IOException e){rejected=true;}
        check(rejected,label);check(staging.list().length==0,label+" rolls back staged files");
    }
    private static void replace(byte[] data,String from,String to){byte[] a=from.getBytes(StandardCharsets.UTF_8),b=to.getBytes(StandardCharsets.UTF_8);for(int i=0;i<=data.length-a.length;i++){boolean match=true;for(int j=0;j<a.length;j++)if(data[i+j]!=a[j]){match=false;break;}if(match){System.arraycopy(b,0,data,i,b.length);i+=a.length-1;}}}
    public static void main(String[] args)throws Exception{
        root=Files.createTempDirectory("flipyear-archive-").toFile();
        try{
            check(AlbumArchive.validId(A),"Valid private UUID");
            for(String id:new String[]{null,"",A+"\n",A.toUpperCase(),"../"+A,"device-video-1",A.replace("4111","3111")})check(!AlbumArchive.validId(id),"Invalid ID rejected");
            File first=new File(root,"first"),second=new File(root,"second");Files.write(first.toPath(),new byte[]{0,1,2,3,4});Files.write(second.toPath(),"second video".getBytes(StandardCharsets.UTF_8));
            Map<String,File> originals=new LinkedHashMap<>();originals.put(A,first);originals.put(B,second);
            ByteArrayOutputStream out=new ByteArrayOutputStream();AlbumArchive.write(out,MANIFEST,originals);
            File staging=stage();AlbumArchive.Restored restored=AlbumArchive.read(new ByteArrayInputStream(out.toByteArray()),staging,m->{check(Arrays.equals(m,MANIFEST),"UTF-8 manifest survives ZIP");return ids(A,B);});
            check(restored.files.keySet().equals(ids(A,B)),"Exactly the referenced videos restored");
            check(Arrays.equals(Files.readAllBytes(first.toPath()),Files.readAllBytes(restored.files.get(A).toPath())),"First binary unchanged");
            check(Arrays.equals(Files.readAllBytes(second.toPath()),Files.readAllBytes(restored.files.get(B).toPath())),"Second binary unchanged");
            reject(new byte[0],ids(),"Empty input rejected");
            reject(zip(new String[]{"x","manifest.json"},new String[]{"x","{}"}),ids(),"Manifest must be first");
            reject(zip(new String[]{"manifest.json"},new String[]{"{}"}),ids(A),"Missing referenced video");
            reject(zip(new String[]{"manifest.json","media/"+A+".bin"},new String[]{"{}","x"}),ids(B),"Extra video rejected");
            reject(zip(new String[]{"manifest.json","media/../escape.bin"},new String[]{"{}","x"}),ids(A),"Zip traversal rejected");
            reject(zip(new String[]{"manifest.json","/absolute.bin"},new String[]{"{}","x"}),ids(),"Absolute path rejected");
            reject(zip(new String[]{"manifest.json","other.txt"},new String[]{"{}","x"}),ids(),"Unknown file rejected");
            reject(zip(new String[]{"manifest.json","media/"+A+".bin"},new String[]{"{}",""}),ids(A),"Empty video rejected");
            byte[] duplicate=zip(new String[]{"manifest.json","media/"+A+".bin","media/"+B+".bin"},new String[]{"{}","first","second"});replace(duplicate,B,A);reject(duplicate,ids(A,B),"Duplicate entries rejected");
            byte[] corrupt=zip(new String[]{"manifest.json","media/"+A+".bin"},new String[]{"{}","PAYLOAD-CORRUPT"});replace(corrupt,"PAYLOAD-CORRUPT","PAYLOAD-CORRUPX");reject(corrupt,ids(A),"Bad CRC rejected");
            byte[] truncated=Arrays.copyOf(corrupt,80);reject(truncated,ids(A),"Truncated payload rejected");
            File occupied=stage();File keep=new File(occupied,"existing");Files.write(keep.toPath(),new byte[]{9});boolean refused=false;try{AlbumArchive.read(new ByteArrayInputStream(out.toByteArray()),occupied,m->ids(A,B));}catch(IOException e){refused=true;}check(refused&&Files.readAllBytes(keep.toPath())[0]==9,"Occupied destination never overwritten");
            File clean=stage();try{AlbumArchive.read(new ByteArrayInputStream(out.toByteArray()),clean,m->{throw new IOException("invalid JSON");});throw new AssertionError();}catch(IOException expected){check(clean.list().length==0,"Rejected manifest writes no videos");}
            ByteArrayOutputStream bounded=new ByteArrayOutputStream();boolean limited=false;try{AlbumArchive.copy(new ByteArrayInputStream(new byte[20]),bounded,10);}catch(IOException e){limited=true;}check(limited&&bounded.size()<=10,"Streaming copy obeys byte limit");
            File huge=new File(root,"huge");try(RandomAccessFile f=new RandomAccessFile(huge,"rw")){f.setLength(AlbumArchive.MAX_VIDEO+1);}Map<String,File> large=new LinkedHashMap<>();large.put(A,huge);boolean big=false;try{AlbumArchive.write(new ByteArrayOutputStream(),MANIFEST,large);}catch(IOException e){big=true;}check(big,"Overlarge video rejected before export");
            ByteArrayOutputStream bomb=new ByteArrayOutputStream();try(ZipOutputStream z=new ZipOutputStream(bomb)){z.putNextEntry(new ZipEntry("manifest.json"));byte[] block=new byte[8192];for(int i=0;i<=AlbumArchive.MAX_MANIFEST/block.length;i++)z.write(block);z.closeEntry();}reject(bomb.toByteArray(),ids(),"Compressed overlarge manifest bounded");
            check(Files.readAllBytes(first.toPath())[4]==4,"Source video never changed");
            System.out.println("PASS AlbumArchive: "+checks+" assertions; real ZIP/binary roundtrip, path and duplicate rejection, CRC/truncation, size bounds, rollback and source preservation.");
        }finally{Files.walk(root.toPath()).sorted(Comparator.reverseOrder()).forEach(p->{try{Files.delete(p);}catch(IOException ignored){}});}
    }
}
