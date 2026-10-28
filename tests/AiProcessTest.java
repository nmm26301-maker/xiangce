package com.flipyear.album;
import java.io.File;
import java.util.*;
import java.util.concurrent.*;
public class AiProcessTest {
    static int checks;
    static void require(boolean condition) { checks++; if (!condition) throw new AssertionError("Process check " + checks); }
    static List<String> child(String mode) {
        return Arrays.asList(System.getProperty("java.home") + "/bin/java", "-cp", System.getProperty("java.class.path"), AiProcessTest.class.getName(), mode);
    }
    public static void main(String[] args) throws Exception {
        if (args.length > 0) {
            if (args[0].equals("fail")) { System.err.println("engine failed"); System.exit(9); }
            System.out.println("ready"); System.out.flush();
            if (args[0].equals("sleep")) Thread.sleep(30000); return;
        }
        File directory = new File(System.getProperty("java.io.tmpdir"));
        StringBuilder output = new StringBuilder();
        new AiProcess().run(child("ok"), directory, directory, 5000, output::append); require(output.toString().contains("ready"));
        try { new AiProcess().run(child("fail"), directory, directory, 5000, null); throw new AssertionError("failure accepted"); }
        catch (java.io.IOException error) { require(error.getMessage().contains("9")); require(error.getMessage().contains("engine failed")); }
        long before = System.nanoTime();
        try { new AiProcess().run(child("sleep"), directory, directory, 200, null); throw new AssertionError("timeout accepted"); }
        catch (java.io.IOException error) { require(TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - before) < 5000); }
        AiProcess pre = new AiProcess(); pre.cancel();
        try { pre.run(child("ok"), directory, directory, 5000, null); throw new AssertionError("cancel accepted"); } catch (java.io.IOException expected) { require(expected.getMessage().contains("取消")); }
        AiProcess active = new AiProcess(); CountDownLatch ready = new CountDownLatch(1); ExecutorService worker = Executors.newSingleThreadExecutor();
        try {
            Future<Boolean> task = worker.submit(() -> { try { active.run(child("sleep"), directory, directory, 10000, line -> ready.countDown()); return false; } catch (java.io.IOException expected) { return true; } });
            require(ready.await(5, TimeUnit.SECONDS)); active.cancel(); require(task.get(5, TimeUnit.SECONDS));
        } finally { active.cancel(); worker.shutdownNow(); }
        System.out.println("AI subprocess: " + checks + " assertions passed");
    }
}
