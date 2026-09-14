import { useCallback, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  RefreshControl,
  GestureResponderEvent,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { press } from "@/components/press";
import { tapped } from "@/lib/haptics";
import { useAuth } from "@/contexts/auth";
import { useCoupleMembers } from "@/hooks/useCoupleMembers";
import { usePartnerColors } from "@/hooks/usePartnerColors";
import { useRefreshOnFocus } from "@/hooks/useRefreshOnFocus";
import { useThemedStyles, useTheme } from "@/contexts/theme";
import { Theme } from "@/theme/tokens";
import { supabase } from "@/lib/supabase";
import { shadeFor } from "@/lib/palette";
import { toISODate, fromISODate, toTimeString } from "@/lib/dates";
import { EVENT_COLUMNS, PlannedEvent } from "@/lib/plannedEvents";
import { KeyDateRow, displayTitleFor, nextOccurrence, tripNights } from "@/lib/keyDates";
import { WorkPattern, WorkShift, expandWorkOccurrences, toDateKey } from "@/lib/workHours";
import { daysCovered } from "@/lib/daySpan";
import {
  DAY_HOURS,
  GRID_HEIGHT,
  HOUR_HEIGHT,
  Placed,
  hourLabel,
  offsetFor,
  placeOnDay,
  slotAt,
} from "@/lib/dayGrid";

/**
 * One thing on the day, whatever it came from. The grid doesn't care whether a
 * block is an event you typed or a meeting synced off your phone -- it needs a
 * time, a label, a colour and, for the ones you can change, something to open.
 */
type Entry = {
  key: string;
  kind: "event" | "busy" | "work";
  start: Date;
  end: Date;
  label: string;
  detail: string | null;
  ownerUserId: string | null;
  /** Only events open an editor; busy time and work hours aren't ours to edit. */
  eventId: string | null;
};

type AllDayEntry = { key: string; label: string; kind: "keydate" | "busy" };

function startOfDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}

function timeLabel(d: Date): string {
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export default function DayView() {
  const styles = useThemedStyles(createStyles);
  const t = useTheme();

  const { session } = useAuth();
  const { me, partner } = useCoupleMembers();
  const colors = usePartnerColors();

  const params = useLocalSearchParams<{ date?: string }>();
  const [day, setDay] = useState<Date>(
    () => (params.date ? fromISODate(params.date) : null) ?? startOfDay(new Date())
  );

  const [events, setEvents] = useState<PlannedEvent[]>([]);
  const [keyDates, setKeyDates] = useState<KeyDateRow[]>([]);
  const [busy, setBusy] = useState<
    { user_id: string; start: Date; end: Date; title: string | null; all_day: boolean }[]
  >([]);
  const [work, setWork] = useState<{ user_id: string; start: Date; end: Date }[]>([]);

  const myId = me.id;
  const partnerId = partner?.id ?? null;

  const nameFor = useCallback(
    (userId: string | null) => {
      if (userId && userId === myId) return me.display_name ?? "You";
      if (userId && userId === partnerId) return partner?.display_name ?? "Partner";
      return partner?.display_name ?? "Partner";
    },
    [myId, partnerId, me.display_name, partner?.display_name]
  );

  const load = useCallback(async () => {
    if (!session?.user.id) return;

    const dayStart = startOfDay(day);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);

    // Events can start the day before and run in, so the window is widened by
    // a day on each side and the grid does the clipping.
    const from = new Date(dayStart);
    from.setDate(from.getDate() - 1);
    const to = new Date(dayEnd);
    to.setDate(to.getDate() + 1);

    const [eventRes, keyRes, busyRes, patternRes, shiftRes] = await Promise.all([
      supabase
        .from("planned_events")
        .select(EVENT_COLUMNS)
        .eq("cancelled", false)
        .gte("end_at", from.toISOString())
        .lte("start_at", to.toISOString()),
      supabase
        .from("key_dates")
        .select("id, title, date, recurring, kind, subject_user_id, reminder_days, notes, end_date, pinned"),
      supabase
        .from("busy_blocks")
        .select("user_id, start_at, end_at, title, all_day")
        .gte("end_at", from.toISOString())
        .lte("start_at", to.toISOString()),
      supabase.from("work_patterns").select("id, user_id, mode, cycle_weeks, anchor_date, shifts"),
      supabase
        .from("work_shifts")
        .select("id, user_id, date, start_time, end_time, kind")
        .gte("date", toDateKey(from))
        .lte("date", toDateKey(to)),
    ]);

    setEvents((eventRes.data as PlannedEvent[]) ?? []);
    setKeyDates((keyRes.data as KeyDateRow[]) ?? []);
    setBusy(
      (busyRes.data ?? []).map((b) => ({
        user_id: b.user_id as string,
        start: new Date(b.start_at as string),
        end: new Date(b.end_at as string),
        title: (b.title as string | null) ?? null,
        all_day: b.all_day === true,
      }))
    );

    const patterns = (patternRes.data as WorkPattern[]) ?? [];
    const allShifts = (shiftRes.data as WorkShift[]) ?? [];
    const expanded: { user_id: string; start: Date; end: Date }[] = [];

    const userIds = new Set<string>([
      ...patterns.map((p) => p.user_id),
      ...allShifts.map((s) => s.user_id),
    ]);

    for (const uid of userIds) {
      const pattern = patterns.find((p) => p.user_id === uid) ?? null;
      const mine = allShifts.filter((s) => s.user_id === uid);
      for (const o of expandWorkOccurrences(pattern, mine, from, to)) {
        expanded.push({ user_id: uid, start: o.interval.start, end: o.interval.end });
      }
    }

    setWork(expanded);
  }, [session?.user.id, day]);

  const { refreshing, onRefresh } = useRefreshOnFocus(load);

  const { timed, allDay } = useMemo(() => {
    const timed: Entry[] = [];
    const allDay: AllDayEntry[] = [];

    for (const ev of events) {
      timed.push({
        key: `event-${ev.id}`,
        kind: "event",
        start: new Date(ev.start_at),
        end: new Date(ev.end_at),
        label: ev.title,
        detail: ev.location,
        ownerUserId: ev.owner_user_id,
        eventId: ev.id,
      });
    }

    for (const b of busy) {
      // An all-day event has no place on an hourly grid -- drawn to scale it
      // would paper over the entire day and hide everything underneath.
      if (b.all_day) {
        allDay.push({
          key: `busy-${b.user_id}-${b.start.getTime()}`,
          kind: "busy",
          label: b.title ? `${nameFor(b.user_id)} · ${b.title}` : `${nameFor(b.user_id)} busy`,
        });
        continue;
      }

      timed.push({
        key: `busy-${b.user_id}-${b.start.getTime()}`,
        kind: "busy",
        start: b.start,
        end: b.end,
        label: b.title ? `${nameFor(b.user_id)} · ${b.title}` : `${nameFor(b.user_id)} busy`,
        detail: null,
        ownerUserId: b.user_id,
        eventId: null,
      });
    }

    for (const w of work) {
      timed.push({
        key: `work-${w.user_id}-${w.start.getTime()}`,
        kind: "work",
        start: w.start,
        end: w.end,
        label: `${nameFor(w.user_id)} working`,
        detail: null,
        ownerUserId: w.user_id,
        eventId: null,
      });
    }

    const dayStart = startOfDay(day);
    const dayEnd = new Date(dayStart);
    dayEnd.setHours(23, 59, 59, 999);

    for (const kd of keyDates) {
      const occurrence = nextOccurrence(kd.date, kd.recurring);
      const span = { start: occurrence, end: occurrence };
      if (tripNights(kd) > 0) {
        const last = new Date(occurrence);
        last.setDate(last.getDate() + tripNights(kd));
        span.end = last;
      }

      if (daysCovered({ start: span.start, end: span.end }, dayStart, dayEnd).length > 0) {
        allDay.push({
          key: `keydate-${kd.id}`,
          kind: "keydate",
          label: displayTitleFor(kd, nameFor),
        });
      }
    }

    return { timed, allDay };
  }, [events, busy, work, keyDates, day, nameFor]);

  const placed = useMemo(
    () => placeOnDay(day, timed, (e) => ({ start: e.start, end: e.end })),
    [day, timed]
  );

  const isToday = toDateKey(day) === toDateKey(new Date());
  const nowOffset = isToday ? offsetFor(day, new Date()) : null;

  // Open the grid near the working day rather than at midnight, which is eight
  // hours of empty rows before anything a person cares about.
  const scrollRef = useRef<ScrollView>(null);
  const [scrolledOnce, setScrolledOnce] = useState(false);

  function shiftDay(delta: number) {
    tapped();
    setDay((d) => {
      const next = new Date(d);
      next.setDate(next.getDate() + delta);
      return next;
    });
  }

  function addAt(event: GestureResponderEvent) {
    const at = slotAt(day, event.nativeEvent.locationY);
    tapped();
    router.push({
      pathname: "/event",
      params: { date: toISODate(at), start: toTimeString(at) },
    });
  }

  function shadeFor_(entry: Entry) {
    const color = colors.forOwner(entry.ownerUserId);
    return color ? shadeFor(color, t.scheme) : null;
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Text style={styles.back}>‹ Month</Text>
        </Pressable>
        <Pressable
          onPress={() =>
            router.push({ pathname: "/event", params: { date: toISODate(day), start: "09:00" } })
          }
          hitSlop={8}
        >
          <Text style={styles.add}>+ Event</Text>
        </Pressable>
      </View>

      <View style={styles.dayHeader}>
        <Pressable onPress={() => shiftDay(-1)} hitSlop={12}>
          <Text style={styles.dayArrow}>‹</Text>
        </Pressable>
        <View style={{ alignItems: "center" }}>
          <Text style={styles.dayTitle}>
            {day.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}
          </Text>
          {isToday ? <Text style={styles.todayTag}>Today</Text> : null}
        </View>
        <Pressable onPress={() => shiftDay(1)} hitSlop={12}>
          <Text style={styles.dayArrow}>›</Text>
        </Pressable>
      </View>

      {allDay.length > 0 ? (
        <View style={styles.allDayBand}>
          {allDay.map((entry) => (
            <View
              key={entry.key}
              style={[styles.allDayChip, entry.kind === "keydate" ? styles.allDayKeyDate : null]}
            >
              <Text style={styles.allDayText} numberOfLines={1}>
                {entry.label}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.gridScroll}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={t.textMuted} />
        }
        onLayout={() => {
          if (scrolledOnce) return;
          setScrolledOnce(true);
          scrollRef.current?.scrollTo({
            y: Math.max(0, (nowOffset ?? 8 * HOUR_HEIGHT) - HOUR_HEIGHT),
            animated: false,
          });
        }}
      >
        <View style={styles.grid}>
          {Array.from({ length: DAY_HOURS }, (_, hour) => (
            <View key={hour} style={[styles.hourRow, { top: hour * HOUR_HEIGHT }]}>
              <Text style={styles.hourLabel}>{hourLabel(hour)}</Text>
              <View style={styles.hourLine} />
            </View>
          ))}

          {/* Behind the blocks, so tapping empty space adds an event at that
              time and tapping a block still opens the block. */}
          <Pressable style={styles.tapLayer} onPress={addAt} />

          {placed.map((p: Placed<Entry>) => {
            const entry = p.item;
            const shade = shadeFor_(entry);

            return (
              <Pressable
                key={entry.key}
                disabled={!entry.eventId}
                onPress={() =>
                  entry.eventId &&
                  router.push({ pathname: "/event", params: { id: entry.eventId } })
                }
                style={[
                  styles.block,
                  styles[`block_${entry.kind}` as const],
                  shade ? { backgroundColor: shade.fill, borderLeftColor: shade.chip } : null,
                  // Overlapping blocks share the width. The gutter is a fixed
                  // margin, so the percentages are of the track beside it.
                  {
                    top: p.top,
                    height: p.height,
                    left: `${(100 / p.columns) * p.column}%`,
                    width: `${100 / p.columns}%`,
                  },
                ]}
              >
                <Text
                  style={[styles.blockLabel, shade ? { color: shade.ink } : null]}
                  numberOfLines={p.height > 40 ? 2 : 1}
                >
                  {entry.label}
                </Text>
                {p.height > 40 ? (
                  <Text
                    style={[styles.blockTime, shade ? { color: shade.ink } : null]}
                    numberOfLines={1}
                  >
                    {p.startsEarlier ? "from earlier" : timeLabel(entry.start)}
                    {p.endsLater ? " · runs on" : ""}
                    {entry.detail ? ` · ${entry.detail}` : ""}
                  </Text>
                ) : null}
              </Pressable>
            );
          })}

          {nowOffset !== null ? (
            <View style={[styles.nowLine, { top: nowOffset }]} pointerEvents="none">
              <View style={styles.nowDot} />
              <View style={styles.nowRule} />
            </View>
          ) : null}
        </View>

        <Text style={styles.footnote}>
          Tap anywhere empty to add an event at that time. Working hours and events from your
          shared calendars can&apos;t be edited here.
        </Text>
      </ScrollView>
    </View>
  );
}

const GUTTER = 58;

const createStyles = (t: Theme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: t.bg, paddingTop: t.space(14) },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: t.space(5),
      marginBottom: t.space(2),
    },
    back: { fontSize: 15, color: t.accent, fontWeight: "600" },
    add: { fontSize: 15, color: t.brand, fontWeight: "700" },
    dayHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: t.space(5),
      marginBottom: t.space(3),
    },
    dayTitle: { fontSize: 18, fontWeight: "700", color: t.textPrimary },
    todayTag: { fontSize: 11, color: t.brand, fontWeight: "700", marginTop: 1 },
    dayArrow: { fontSize: 28, color: t.accent, paddingHorizontal: 12 },
    allDayBand: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 6,
      paddingHorizontal: t.space(5),
      paddingBottom: t.space(3),
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: t.border,
    },
    allDayChip: {
      backgroundColor: t.surfaceSunken,
      borderRadius: t.radius.pill,
      paddingHorizontal: 10,
      paddingVertical: 5,
      maxWidth: "100%",
    },
    allDayKeyDate: { backgroundColor: t.accentSoft },
    allDayText: { fontSize: 12, color: t.textSecondary, fontWeight: "500" },
    gridScroll: { paddingBottom: t.space(12) },
    grid: { height: GRID_HEIGHT, marginTop: t.space(3) },
    hourRow: { position: "absolute", left: 0, right: 0, height: HOUR_HEIGHT, flexDirection: "row" },
    hourLabel: {
      width: GUTTER,
      paddingRight: 8,
      textAlign: "right",
      fontSize: 11,
      color: t.textMuted,
      marginTop: -6,
    },
    hourLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: t.border },
    tapLayer: { position: "absolute", left: GUTTER, right: 0, top: 0, height: GRID_HEIGHT },
    block: {
      position: "absolute",
      marginLeft: GUTTER,
      borderRadius: t.radius.sm,
      borderLeftWidth: 3,
      paddingHorizontal: 8,
      paddingVertical: 4,
      overflow: "hidden",
      backgroundColor: t.surfaceSunken,
      borderLeftColor: t.textMuted,
    },
    // Shared events carry no partner colour, so they take the brand instead.
    block_event: { backgroundColor: t.brandSoft, borderLeftColor: t.brand },
    block_busy: { backgroundColor: t.surfaceSunken, borderLeftColor: t.dotBusy },
    block_work: { backgroundColor: t.surfaceSunken, borderLeftColor: t.dotWork },
    blockLabel: { fontSize: 12, fontWeight: "600", color: t.textPrimary },
    blockTime: { fontSize: 11, color: t.textSecondary, marginTop: 1 },
    nowLine: { position: "absolute", left: GUTTER - 4, right: 0, flexDirection: "row", alignItems: "center" },
    nowDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: t.brand },
    nowRule: { flex: 1, height: 1, backgroundColor: t.brand },
    footnote: {
      fontSize: 11,
      color: t.textMuted,
      lineHeight: 16,
      paddingHorizontal: t.space(5),
      marginTop: t.space(4),
    },
  });
