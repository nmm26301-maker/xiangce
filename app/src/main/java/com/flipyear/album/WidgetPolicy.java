package com.flipyear.album;

import java.time.DateTimeException;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;

/** Pure date and memory-budget rules shared by the widget and host-side tests. */
final class WidgetPolicy {
    private WidgetPolicy() { }

    static List<long[]> memoryRanges(LocalDate today, ZoneId zone) {
        List<long[]> ranges = new ArrayList<>();
        if (today.getYear() > 2200) return ranges;
        for (int year = today.getYear() - 1; year >= 1900; year--) {
            try {
                LocalDate day = LocalDate.of(year, today.getMonthValue(), today.getDayOfMonth());
                ranges.add(new long[] {day.atStartOfDay(zone).toInstant().toEpochMilli(),
                    day.plusDays(1).atStartOfDay(zone).toInstant().toEpochMilli()});
            } catch (DateTimeException ignored) { /* Feb 29 has no match in ordinary years. */ }
        }
        return ranges;
    }

    static int imageEdge(int widthDp, int heightDp, float density) {
        float scale = Float.isFinite(density) && density > 0 ? density : 1;
        // One bitmap, at most 640 KB; also stay within small hosts' pixel budgets.
        return Math.max(32, Math.min(400, Math.round(Math.min(Math.max(32, widthDp), Math.max(32, heightDp)) * scale)));
    }

    static int nextIndex(int oldIndex, int count, boolean advance) {
        if (count <= 0) return 0;
        int index = Math.floorMod(oldIndex, count);
        return advance ? (index + 1) % count : index;
    }
}
