package com.flipyear.album;
import java.io.File;
import java.util.List;
public class AiPolicyTest {
    static int checks;
    static void require(boolean condition) { checks++; if (!condition) throw new AssertionError("AI check " + checks); }
    public static void main(String[] args) {
        require(AiPolicy.edge(false, false) == 1024); require(AiPolicy.edge(false, true) == 1536); require(AiPolicy.edge(true, true) == 768);
        require(AiPolicy.validOutput(1024, 683, 4096, 2732)); require(AiPolicy.validOutput(1536, 1536, 6144, 6144));
        require(!AiPolicy.validOutput(0, 0, 0, 0)); require(!AiPolicy.validOutput(-1, 4, -4, 16));
        require(!AiPolicy.validOutput(2048, 4, 8192, 16)); require(!AiPolicy.validOutput(Integer.MAX_VALUE, 1, -4, 4));
        require(!AiPolicy.validOutput(10, 10, 40, 41));
        File source = new File("/private/source $(touch injected).png");
        List<String> command = AiPolicy.command(new File("/native/engine"), source, new File("/private/output.png"), new File("/private/models-v1"));
        require(command.size() == 17); require(command.get(2).equals(source.getAbsolutePath())); require(command.get(10).equals("-1"));
        require(command.get(12).equals("64")); require(command.get(14).equals("1:2:1")); require(command.get(16).equals("png"));
        require(!command.contains("sh")); require(!command.get(2).equals(command.get(4)));
        System.out.println("AI policy: " + checks + " assertions passed");
    }
}
