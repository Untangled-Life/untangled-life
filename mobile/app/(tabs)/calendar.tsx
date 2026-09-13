import { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import { router } from "expo-router";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/auth";
import { useCoupleMembers } from "@/hooks/useCoupleMembers";
import { Interval } from "@/lib/freeTime";
import { KeyDateRow, displayTitleFor, nextOccurrence } from "@/lib/keyDates";
import { PlannedEvent, formatPlanWhen } from "@/lib/plannedEvents";
import { WorkPattern, WorkShift, expandWorkHours, toDateKey } from "@/lib/workHours";

type DayEntry = {
  kind: "plan" | "keydate" | "work" | "busy";
  label: string;
  detail: string;
  whose: string | null;
};

const WEEK_HEADINGS = ["M", "T", "W", "T", "F", "S", "S"];

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
}

// Monday-first grid, padded to whole weeks.
function monthGrid(month: Date): (Date | null)[] {
  const first = startOfMonth(month);
  const daysInMonth = endOfMonth(month).getDate();
  const leading = (first.getDay() + 6) % 7;

  const cells: (Date | null)[] = Array(leading).fill(null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(new Date(month.getFullYear(), month.getMonth(), d));
  }
  while (cells.length % 7 !== 0) cells.push(null);

  return cells;
}

function timeLabel(d: Date): string {
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export default function CalendarScreen() {
  const { session } = useAuth();
  const { me, partner } = useCoupleMembers();
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [selected, setSelected] = useState<string>(toDateKey(new Date()));

  const [plans, setPlans] = useState<PlannedEvent[]>([]);
  const [keyDates, setKeyDates] = useState<KeyDateRow[]>([]);
  const [busy, setBusy] = useState<{ user_id: string; start: Date; end: Date }[]>([]);
  const [work, setWork] = useState<{ user_id: string; interval: Interval }[]>([]);

  const myId = me.id;
  const partnerId = partner?.id ?? null;
  const partnerName = partner?.display_name ?? "Partner";
  const myName = me.display_name ?? "You";

  const nameFor = useCallback(
    (userId: string | null) => {
      if (userId && userId === myId) return myName;
      if (userId && userId === partnerId) return partnerName;
      return partnerName;
    },
    [myId, partnerId, myName, partnerName]
  );

  const load = useCallback(async () => {
    if (!session?.user.id) return;

    const rangeStart = startOfMonth(month);
    const rangeEnd = endOfMonth(month);

    const [planRes, keyRes, busyRes, patternRes, shiftRes] = await Promise.all([
      supabase
        .from("planned_events")
        .select("id, title, start_at, end_at, location, notes, cancelled, created_by")
        .eq("cancelled", false)
        .gte("end_at", rangeStart.toISOString())
        .lte("start_at", rangeEnd.toISOString()),
      supabase.from("key_dates").select("id, title, date, recurring, kind, subject_user_id"),
      supabase
        .from("busy_blocks")
        .select("user_id, start_at, end_at")
        .gte("end_at", rangeStart.toISOString())
        .lte("start_at", rangeEnd.toISOString()),
      supabase.from("work_patterns").select("id, user_id, mode, cycle_weeks, anchor_date, shifts"),
      supabase
        .from("work_shifts")
        .select("id, user_id, date, start_time, end_time, kind")
        .gte("date", toDateKey(rangeStart))
        .lte("date", toDateKey(rangeEnd)),
    ]);

    setPlans((planRes.data as PlannedEvent[]) ?? []);
    setKeyDates((keyRes.data as KeyDateRow[]) ?? []);
    setBusy(
      (busyRes.data ?? []).map((b) => ({
        user_id: b.user_id as string,
        start: new Date(b.start_at as string),
        end: new Date(b.end_at as string),
      }))
    );

    const patterns = (patternRes.data as WorkPattern[]) ?? [];
    const allShifts = (shiftRes.data as WorkShift[]) ?? [];
    const expanded: { user_id: string; interval: Interval }[] = [];

    for (const p of patterns) {
      const mine = allShifts.filter((s) => s.user_id === p.user_id);
      for (const interval of expandWorkHours(p, mine, rangeStart, rangeEnd)) {
        expanded.push({ user_id: p.user_id, interval });
      }
    }

    // Someone with one-off shifts but no saved pattern still has work to show.
    const withoutPattern = allShifts.filter(
      (s) => !patterns.some((p) => p.user_id === s.user_id)
    );
    const byUser = new Map<string, WorkShift[]>();
    for (const s of withoutPattern) {
      byUser.set(s.user_id, [...(byUser.get(s.user_id) ?? []), s]);
    }
    for (const [uid, rows] of byUser) {
      for (const interval of expandWorkHours(null, rows, rangeStart, rangeEnd)) {
        expanded.push({ user_id: uid, interval });
      }
    }

    setWork(expanded);
  }, [session?.user.id, month]);

  useEffect(() => {
    load();
  }, [load]);

  // Everything that falls on each day, keyed by YYYY-MM-DD.
  const entriesByDay = useMemo(() => {
    const map = new Map<string, DayEntry[]>();
    const push = (key: string, entry: DayEntry) => {
      map.set(key, [...(map.get(key) ?? []), entry]);
    };

    for (const p of plans) {
      const start = new Date(p.start_at);
      push(toDateKey(start), {
        kind: "plan",
        label: p.title,
        detail: formatPlanWhen(p.start_at, p.end_at).split(", ").slice(1).join(", "),
        whose: null,
      });
    }

    for (const kd of keyDates) {
      const occurrence = nextOccurrence(kd.date, kd.recurring);
      if (occurrence >= startOfMonth(month) && occurrence <= endOfMonth(month)) {
        push(toDateKey(occurrence), {
          kind: "keydate",
          label: displayTitleFor(kd, nameFor),
          detail: "All day",
          whose: null,
        });
      }
    }

    for (const w of work) {
      push(toDateKey(w.interval.start), {
        kind: "work",
        label: `${nameFor(w.user_id)} working`,
        detail: `${timeLabel(w.interval.start)} – ${timeLabel(w.interval.end)}`,
        whose: w.user_id,
      });
    }

    for (const b of busy) {
      push(toDateKey(b.start), {
        kind: "busy",
        label: `${nameFor(b.user_id)} busy`,
        detail: `${timeLabel(b.start)} – ${timeLabel(b.end)}`,
        whose: b.user_id,
      });
    }

    return map;
  }, [plans, keyDates, work, busy, month, nameFor]);

  const cells = useMemo(() => monthGrid(month), [month]);
  const selectedEntries = entriesByDay.get(selected) ?? [];
  const todayKey = toDateKey(new Date());

  function shiftMonth(delta: number) {
    setMonth((m) => new Date(m.getFullYear(), m.getMonth() + delta, 1));
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Pressable onPress={() => router.back()} hitSlop={8}>
        <Text style={styles.back}>‹ Back</Text>
      </Pressable>

      <View style={styles.monthHeader}>
        <Pressable onPress={() => shiftMonth(-1)} hitSlop={12}>
          <Text style={styles.monthArrow}>‹</Text>
        </Pressable>
        <Text style={styles.monthTitle}>
          {month.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
        </Text>
        <Pressable onPress={() => shiftMonth(1)} hitSlop={12}>
          <Text style={styles.monthArrow}>›</Text>
        </Pressable>
      </View>

      <View style={styles.weekHeader}>
        {WEEK_HEADINGS.map((h, i) => (
          <Text key={i} style={styles.weekHeading}>
            {h}
          </Text>
        ))}
      </View>

      <View style={styles.grid}>
        {cells.map((cell, i) => {
          if (!cell) return <View key={i} style={styles.cell} />;

          const key = toDateKey(cell);
          const entries = entriesByDay.get(key) ?? [];
          const isSelected = key === selected;
          const isToday = key === todayKey;

          const dotKinds = [...new Set(entries.map((e) => e.kind))];

          return (
            <Pressable
              key={i}
              style={[styles.cell, isSelected ? styles.cellSelected : null]}
              onPress={() => setSelected(key)}
            >
              <Text
                style={[
                  styles.cellDay,
                  isToday ? styles.cellDayToday : null,
                  isSelected ? styles.cellDaySelected : null,
                ]}
              >
                {cell.getDate()}
              </Text>
              <View style={styles.dotRow}>
                {dotKinds.slice(0, 3).map((k) => (
                  <View key={k} style={[styles.dot, styles[`dot_${k}` as const]]} />
                ))}
              </View>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.dot, styles.dot_plan]} />
          <Text style={styles.legendText}>Date</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.dot, styles.dot_keydate]} />
          <Text style={styles.legendText}>Key date</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.dot, styles.dot_work]} />
          <Text style={styles.legendText}>Work</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.dot, styles.dot_busy]} />
          <Text style={styles.legendText}>Busy</Text>
        </View>
      </View>

      <Text style={styles.dayTitle}>
        {new Date(selected + "T00:00:00").toLocaleDateString(undefined, {
          weekday: "long",
          day: "numeric",
          month: "long",
        })}
      </Text>

      {selectedEntries.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>Nothing on. That&apos;s a good sign.</Text>
        </View>
      ) : (
        selectedEntries.map((e, i) => (
          <View key={i} style={styles.entryRow}>
            <View style={[styles.entryBar, styles[`bar_${e.kind}` as const]]} />
            <View style={{ flex: 1 }}>
              <Text style={styles.entryLabel}>{e.label}</Text>
              <Text style={styles.entryDetail}>{e.detail}</Text>
            </View>
          </View>
        ))
      )}
    </ScrollView>
  );
}

const CELL = `${100 / 7}%`;

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: 20, paddingTop: 70, paddingBottom: 48 },
  back: { fontSize: 15, color: "#1D9E75", fontWeight: "600", marginBottom: 12 },
  monthHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  monthTitle: { fontSize: 20, fontWeight: "600", color: "#14140F" },
  monthArrow: { fontSize: 28, color: "#1D9E75", paddingHorizontal: 12 },
  weekHeader: { flexDirection: "row", marginBottom: 4 },
  weekHeading: {
    width: CELL,
    textAlign: "center",
    fontSize: 11,
    color: "#9A9A9A",
    fontWeight: "600",
  },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  cell: {
    width: CELL,
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
  },
  cellSelected: { backgroundColor: "#E8F5EF" },
  cellDay: { fontSize: 14, color: "#14140F" },
  cellDayToday: { color: "#D85A30", fontWeight: "700" },
  cellDaySelected: { fontWeight: "700" },
  dotRow: { flexDirection: "row", gap: 3, marginTop: 3, height: 5 },
  dot: { width: 5, height: 5, borderRadius: 3 },
  dot_plan: { backgroundColor: "#D85A30" },
  dot_keydate: { backgroundColor: "#1D9E75" },
  dot_work: { backgroundColor: "#7A8B99" },
  dot_busy: { backgroundColor: "#D6D2C8" },
  legend: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 14,
    marginTop: 14,
    marginBottom: 20,
    justifyContent: "center",
  },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  legendText: { fontSize: 11, color: "#9A9A9A" },
  dayTitle: { fontSize: 16, fontWeight: "600", color: "#14140F", marginBottom: 12 },
  emptyCard: { backgroundColor: "#fff", borderRadius: 14, padding: 18 },
  emptyText: { fontSize: 13, color: "#6B6B6B" },
  entryRow: {
    flexDirection: "row",
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 14,
    marginBottom: 8,
    alignItems: "center",
    gap: 12,
  },
  entryBar: { width: 3, alignSelf: "stretch", borderRadius: 2 },
  bar_plan: { backgroundColor: "#D85A30" },
  bar_keydate: { backgroundColor: "#1D9E75" },
  bar_work: { backgroundColor: "#7A8B99" },
  bar_busy: { backgroundColor: "#D6D2C8" },
  entryLabel: { fontSize: 14, fontWeight: "500", color: "#14140F" },
  entryDetail: { fontSize: 12, color: "#6B6B6B", marginTop: 2 },
});
