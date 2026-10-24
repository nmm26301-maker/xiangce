package com.flipyear.album;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;

/** Exercises the production query boundaries without an Android device or mock calendar. */
public final class WidgetPolicyTest {
    private static int checks;
    private static void check(boolean condition, String message) {
        checks++;
        if (!condition) throw new AssertionError(message);
    }
    private static boolean contains(List<long[]> ranges, String instant) {
        long value = Instant.parse(instant).toEpochMilli();
        for (long[] range : ranges) if (value >= range[0] && value < range[1]) return true;
        return false;
    }
    public static void main(String[] args) {
        List<long[]> shanghai = WidgetPolicy.memoryRanges(LocalDate.of(2026, 10, 24), ZoneId.of("Asia/Shanghai"));
        check(shanghai.size() == 126, "One range per previous year from 1900");
        check(contains(shanghai, "2025-10-23T16:00:00Z"), "Local midnight included");
        check(contains(shanghai, "2025-10-24T15:59:59.999Z"), "Last local millisecond included");
        check(!contains(shanghai, "2025-10-24T16:00:00Z"), "Next day excluded");
        check(!contains(shanghai, "2025-10-23T15:59:59.999Z"), "Previous day excluded");
        check(!contains(shanghai, "2026-10-24T00:00:00Z"), "Current year excluded");
        check(!contains(shanghai, "2027-10-24T00:00:00Z"), "Future year excluded");
        List<long[]> leap = WidgetPolicy.memoryRanges(LocalDate.of(2028, 2, 29), ZoneId.of("UTC"));
        check(contains(leap, "2024-02-29T12:00:00Z"), "Leap-day memory included");
        check(!contains(leap, "2025-02-28T12:00:00Z"), "Leap day never silently becomes Feb 28");
        check(!contains(leap, "2024-03-01T00:00:00Z"), "March boundary excluded");
        for (long[] range : leap) check(Instant.ofEpochMilli(range[0]).atZone(ZoneId.of("UTC")).getDayOfMonth() == 29, "Leap boundaries are real dates");
        List<long[]> spring = WidgetPolicy.memoryRanges(LocalDate.of(2025, 3, 10), ZoneId.of("America/Los_Angeles"));
        long[] spring2024 = spring.get(0);
        check(spring2024[1] - spring2024[0] == 23 * 3600000L, "DST spring date uses 23 hours");
        List<long[]> autumn = WidgetPolicy.memoryRanges(LocalDate.of(2025, 11, 3), ZoneId.of("America/Los_Angeles"));
        check(autumn.get(0)[1] - autumn.get(0)[0] == 25 * 3600000L, "DST autumn date uses 25 hours");
        check(WidgetPolicy.memoryRanges(LocalDate.of(1900, 1, 1), ZoneId.of("UTC")).isEmpty(), "No invented earlier range");
        check(WidgetPolicy.memoryRanges(LocalDate.of(9999, 1, 1), ZoneId.of("UTC")).isEmpty(), "Invalid device date stays bounded");
        check(WidgetPolicy.nextIndex(0, 0, true) == 0, "Empty source");
        check(WidgetPolicy.nextIndex(0, 1, true) == 0, "Single photo");
        check(WidgetPolicy.nextIndex(2, 3, true) == 0, "Wrap to first");
        check(WidgetPolicy.nextIndex(8, 3, false) == 2, "Deleted photos normalize saved index");
        check(WidgetPolicy.nextIndex(Integer.MAX_VALUE, 3, true) == 2, "Large saved index cannot overflow");
        for (int w : new int[] {0, 140, 180, 600}) for (float density : new float[] {1, 2, 3, Float.NaN, Float.POSITIVE_INFINITY}) {
            int edge = WidgetPolicy.imageEdge(w, 160, density);
            check(edge >= 32 && edge <= 400 && edge * edge * 4 <= 640000, "Bitmap stays below IPC budget");
        }
        check(WidgetPolicy.imageEdge(140, 160, 1) == 140, "Small low-density host is not overallocated");
        System.out.println("PASS WidgetPolicy: " + checks + " assertions; timezone/day bounds, leap years, DST, paging and image budget.");
    }
}
