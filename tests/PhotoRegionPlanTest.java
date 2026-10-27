package com.flipyear.album;

/** Tests all EXIF transforms, native-pixel crops and bounded decode sizes. */
public final class PhotoRegionPlanTest {
    private static int checks;
    private static void check(boolean value, String text) { checks++; if (!value) throw new AssertionError(text); }
    public static void main(String[] args) {
        int[][] expected = {{0,0,3000,2000},{3000,0,6000,2000},{3000,2000,6000,4000},{0,2000,3000,4000},
            {0,0,3000,2000},{0,2000,3000,4000},{3000,2000,6000,4000},{3000,0,6000,2000}};
        for (int orientation=1;orientation<=8;orientation++) {
            int w=PhotoRegionPlan.width(6000,4000,orientation),h=PhotoRegionPlan.height(6000,4000,orientation);
            PhotoRegionPlan p=new PhotoRegionPlan(6000,4000,orientation,0,0,w/2,h/2,2048); int[] e=expected[orientation-1];
            check(p.left==e[0]&&p.top==e[1]&&p.right==e[2]&&p.bottom==e[3],"EXIF region "+orientation);
            check(p.sample==2,"Bounded 3000px region "+orientation);
            PhotoRegionPlan full=new PhotoRegionPlan(6000,4000,orientation,0,0,w,h,2048);
            check(full.left==0&&full.top==0&&full.right==6000&&full.bottom==4000,"Full original "+orientation);
            check(full.sample==4,"Large overview remains bounded "+orientation);
            PhotoRegionPlan pixel=new PhotoRegionPlan(6000,4000,orientation,113,257,1,1,2048);
            check(pixel.right-pixel.left==1&&pixel.bottom-pixel.top==1&&pixel.sample==1,"One original pixel remains unsampled "+orientation);
        }
        PhotoRegionPlan detail=new PhotoRegionPlan(12000,9000,1,5000,4000,1080,1920,2048);
        check(detail.sample==1,"High-zoom viewport decodes original pixels, not the 3072px preview");
        int[][] invalid={{-1,0,1,1,2048},{0,-1,1,1,2048},{5999,0,2,1,2048},{0,3999,1,2,2048},{0,0,0,1,2048},{0,0,1,1,0},{0,0,1,1,2049},{2147483647,0,2,1,2048}};
        for(int[] v:invalid){boolean rejected=false;try{new PhotoRegionPlan(6000,4000,1,v[0],v[1],v[2],v[3],v[4]);}catch(IllegalArgumentException e){rejected=true;}check(rejected,"Reject invalid/overflow region");}
        System.out.println("PASS PhotoRegionPlan: "+checks+" assertions; all 8 EXIF transforms, exact original-pixel crops, bounds/overflow and decode memory limits.");
    }
}
