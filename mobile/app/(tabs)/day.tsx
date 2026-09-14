import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { occurrencesBetween } from "@/lib/recurrence";
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
  /** An Untangled Life event; opens the full editor. */
  eventId: string | null;
  /** A busy_blocks row: an event from someone's phone calendar. */
  busyId: string | null;
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

  // This screen is a hidden TAB route, so it stays mounted: pushing to it with
  // a different date updates the params but never re-runs the useState
  // initialiser. Without this, opening 20 September from the month grid shows
  // whatever day you were last looking at.
  //
  // Keyed on the param string rather than `day`, so arrowing to another day
  // isn't immediately undone by the param that got you here.
  const routeDate = params.date;
  useEffect(() => {
    const fromRoute = routeDate ? fromISODate(routeDate) : null;
    if (fromRoute) setDay(startOfDay(fromRoute));
  }, [routeDate]);

  const [events, setEvents] = useState<PlannedEvent[]>([]);
  const [keyDates, setKeyDates] = useState<KeyDateRow[]>([]);
  const [busy, setBusy] = useState<
    {
      id: string;
      user_id: string;
      start: Date;
      end: Date;
      title: string | null;
      all_day: boolean;
    }[]
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
      // Repeating events are fetched whatever their start date: a weekly
      // dinner created in January is still on in December, and filtering on
      // start_at would hide it from every day but the first.
      supabase
        .from("planned_events")
        .select(EVENT_COLUMNS)
        .eq("cancelled", false)
        .or(`and(end_at.gte.${from.toISOString()},start_at.lte.${to.toISOString()}),repeat_every.neq.none`),
      supabase
        .from("key_dates")
        .select("id, title, date, recurring, kind, subject_user_id, reminder_days, reminders_on, notes, end_date, pinned"),
      supabase
        .from("busy_blocks")
        .select("id, user_id, start_at, end_at, title, all_day")
        .gte("end_at", from.toISOString())
        .lte("start_at", to.toISOString()),
      supabase.from("work_patterns").select("id, user_id, mode, cycle_weeks, anchor_date, shifts, time_zone"),
      supabase
        .from("work_shifts")
        .select("id, user_id, date, start_time, end_time, kind, time_zone")
        .gte("date", toDateKey(from))
        .lte("date", toDateKey(to)),
    ]);

    setEvents((eventRes.data as PlannedEvent[]) ?? []);
    setKeyDates((keyRes.data as KeyDateRow[]) ?? []);
    setBusy(
      (busyRes.data ?? []).map((b) => ({
        id: b.id as string,
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

  // useRefreshOnFocus only fires on focus and pull-to-refresh. The ‹ › arrows
  // change `day` while the screen stays focused, so without this the grid
  // shows the day you arrived on -- and once you're two days out, the query
  // window doesn't even cover it and the day renders empty.
  useEffect(() => {
    load();
  }, [load]);

  const { timed, allDay } = useMemo(() => {
    const timed: Entry[] = [];
    const allDay: AllDayEntry[] = [];

    const dayOpen = startOfDay(day);
    const dayShut = new Date(dayOpen);
    dayShut.setDate(dayShut.getDate() + 1);

    for (const ev of events) {
      // A repeating event is one row. Every occurrence that lands on this day
      // has to be drawn, or a weekly date night would only ever appear on the
      // week it was created.
      const occurrences = occurrencesBetween(
        {
          start: new Date(ev.start_at),
          end: new Date(ev.end_at),
          repeatEvery: ev.repeat_every ?? "none",
          repeatUntil: ev.repeat_until ? new Date(`${ev.repeat_until}T00:00:00`) : null,
        },
        dayOpen,
        dayShut
      );

      for (const at of occurrences) {
        timed.push({
          // Keyed by occurrence, not by row: two of them could share a day.
          key: `event-${ev.id}-${at.start.getTime()}`,
          kind: "event",
          start: at.start,
          end: at.end,
          label: ev.title,
          detail: ev.location,
          ownerUserId: ev.owner_user_id,
          eventId: ev.id,
          busyId: null,
        });
      }
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
        busyId: b.id,
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
        busyId: null,
      });
    }

    const dayStart = startOfDay(day);
    const dayEnd = new Date(dayStart);
    dayEnd.setHours(23, 59, 59, 999);

    for (const kd of keyDates) {
      // nextOccurrence looks FORWARD, which is right on Home and wrong here:
      // the day view goes backwards, and last month's anniversary would
      // resolve to next year's and show on neither day. A recurring date is
      // placed in the year being looked at; a one-off stays where it is.
      const stored = new Date(kd.date + "T00:00:00");
      const occurrence = kd.recurring
        ? new Date(day.getFullYear(), stored.getMonth(), stored.getDate())
        : nextOccurrence(kd.date, false);

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

  // Ticks so the now-line moves and "Today" stops being today at midnight.
  // Computing these in the render body alone freezes them until some other
  // state happens to change.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const isToday = toDateKey(day) === toDateKey(now);
  const nowOffset = isToday ? offsetFor(day, now) : null;

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
        <Pressable onPress={() => router.back()} hitSlop={10} style={press(styles.backTap)}>
          <Text style={styles.back}>‹ Month</Text>
        </Pressable>

        {/* The primary action on this screen, so it looks like one. As a
            plain word beside the back link it read as navigation. */}
        <Pressable
          onPress={() =>
            router.push({ pathname: "/event", params: { date: toISODate(day), start: "09:00" } })
          }
          hitSlop={8}
          accessibilityRole="button"
          style={press(styles.addButton)}
        >
          <Text style={styles.add}>+ Event</Text>
        </Pressable>
      </View>

      <View style={styles.dayHeader}>
        <View style={styles.dayTitleWrap}>
          <View style={styles.dayEyebrowRow}>
            <Text style={styles.dayEyebrow}>
              {day.toLocaleDateString(undefined, { weekday: "long" })}
            </Text>
            {isToday ? (
              <View style={styles.todayTag}>
                <Text style={styles.todayTagText}>Today</Text>
              </View>
            ) : null}
          </View>
          <Text style={styles.dayTitle}>
            {day.toLocaleDateString(undefined, { day: "numeric", month: "long" })}
          </Text>
        </View>

        <View style={styles.dayNav}>
          <Pressable
            onPress={() => shiftDay(-1)}
            hitSlop={10}
            accessibilityLabel="Previous day"
            style={press(styles.navButton)}
          >
            <Text style={styles.dayArrow}>‹</Text>
          </Pressable>
          <Pressable
            onPress={() => shiftDay(1)}
            hitSlop={10}
            accessibilityLabel="Next day"
            style={press(styles.navButton)}
          >
            <Text style={styles.dayArrow}>›</Text>
          </Pressable>
        </View>
      </View>

      {allDay.length > 0 ? (
        <View style={styles.allDayBand}>
          <Text style={styles.allDayLabel}>All day</Text>
          <View style={styles.allDayChips}>
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
        </View>
      ) : null}

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.gridScroll}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={t.textMuted} />
        }
        // onContentSizeChange, not onLayout: onLayout fires when the scroll
        // VIEW is laid out, which can precede its content being measured, and
        // a scrollTo past the current content size is clamped to zero -- so
        // the grid opened at midnight, the exact thing this avoids, and never
        // retried.
        onContentSizeChange={() => {
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

          {/* The blocks live in their own track, inset past the hour labels.
              A percentage width resolves against the CONTAINING BLOCK, so
              putting them straight in the grid with a marginLeft made every
              one of them a full screen-width wide starting 58px in -- their
              right-hand side cut off by the edge of the screen. */}
          <View style={styles.blockTrack} pointerEvents="box-none">
          {placed.map((p: Placed<Entry>) => {
            const entry = p.item;
            const shade = shadeFor_(entry);

            return (
              <Pressable
                key={entry.key}
                disabled={!entry.eventId && !entry.busyId}
                // A disabled Pressable still wins the hit test and then
                // declines it -- and React Native walks ancestors, never back
                // to an earlier sibling, so the tap is swallowed rather than
                // reaching the add-an-event layer underneath. On a day with an
                // eight-hour work block that made the whole working day
                // untappable, which reads as the feature being broken.
                pointerEvents={entry.eventId || entry.busyId ? "auto" : "none"}
                onPress={() =>
                  router.push({
                    pathname: "/event",
                    params: entry.eventId
                      ? { id: entry.eventId }
                      : { busy: entry.busyId as string },
                  })
                }
                style={[
                  styles.block,
                  styles[`block_${entry.kind}` as const],
                  // Only an event you can edit takes the owner's fill. Busy
                  // time and work hours keep their own muted background and
                  // just carry the colour on the bar -- otherwise all three
                  // look identical and only one of them responds to a tap.
                  shade
                    ? entry.kind === "event"
                      ? { backgroundColor: shade.fill, borderLeftColor: shade.ink }
                      : { borderLeftColor: shade.ink }
                    : null,
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
                  style={[
                    styles.blockLabel,
                    shade && entry.kind === "event" ? { color: shade.ink } : null,
                  ]}
                  numberOfLines={p.height > 40 ? 2 : 1}
                >
                  {entry.label}
                </Text>
                {p.height > 40 ? (
                  <Text
                    style={[
                      styles.blockTime,
                      shade && entry.kind === "event" ? { color: shade.ink } : null,
                    ]}
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
          </View>

          {nowOffset !== null ? (
            <View style={[styles.nowLine, { top: nowOffset }]} pointerEvents="none">
              <View style={styles.nowDot} />
              <View style={styles.nowRule} />
            </View>
          ) : null}
        </View>

        <Text style={styles.footnote}>
          Tap anywhere empty to add an event at that time. Tap an event to change it, including
          the ones from your own phone calendars, which change there too. Working hours are set
          under Your hours.
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
    backTap: { paddingVertical: t.space(1) },
    back: { ...t.type.label, color: t.accent },
    addButton: {
      backgroundColor: t.brand,
      borderRadius: t.radius.pill,
      paddingHorizontal: t.space(4),
      paddingVertical: t.space(2),
    },
    add: { ...t.type.label, color: t.textOnBrand },
    dayHeader: {
      flexDirection: "row",
      alignItems: "flex-end",
      justifyContent: "space-between",
      paddingHorizontal: t.space(5),
      marginBottom: t.space(4),
    },
    dayTitleWrap: { gap: 2, flexShrink: 1 },
    dayEyebrowRow: { flexDirection: "row", alignItems: "center", gap: t.space(2) },
    dayEyebrow: { ...t.type.eyebrow, color: t.textMuted },
    dayTitle: { ...t.type.display, color: t.textPrimary },
    todayTag: {
      backgroundColor: t.brandSoft,
      borderRadius: t.radius.pill,
      paddingHorizontal: t.space(2),
      paddingVertical: 1,
    },
    todayTagText: { ...t.type.eyebrow, color: t.brand },
    dayNav: { flexDirection: "row", gap: t.space(2) },
    navButton: {
      width: 38,
      height: 38,
      borderRadius: t.radius.pill,
      backgroundColor: t.surfaceSunken,
      alignItems: "center",
      justifyContent: "center",
    },
    dayArrow: { fontSize: 22, lineHeight: 26, color: t.accent },
    allDayBand: {
      paddingHorizontal: t.space(5),
      paddingBottom: t.space(3),
      gap: t.space(2),
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: t.border,
    },
    allDayLabel: { ...t.type.eyebrow, color: t.textMuted },
    allDayChips: { flexDirection: "row", flexWrap: "wrap", gap: t.space(2) },
    allDayChip: {
      backgroundColor: t.surfaceSunken,
      borderRadius: t.radius.pill,
      paddingHorizontal: t.space(3),
      paddingVertical: t.space(1),
      maxWidth: "100%",
    },
    allDayKeyDate: { backgroundColor: t.accentSoft },
    allDayText: { ...t.type.caption, fontWeight: "600", color: t.textSecondary },
    gridScroll: { paddingBottom: t.space(12) },
    grid: { height: GRID_HEIGHT, marginTop: t.space(3) },
    hourRow: { position: "absolute", left: 0, right: 0, height: HOUR_HEIGHT, flexDirection: "row" },
    hourLabel: {
      width: GUTTER,
      paddingRight: 8,
      textAlign: "right",
      ...t.type.caption,
      fontVariant: ["tabular-nums"],
      color: t.textMuted,
      marginTop: -8,
    },
    hourLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: t.border },
    tapLayer: { position: "absolute", left: GUTTER, right: 0, top: 0, height: GRID_HEIGHT },
    blockTrack: { position: "absolute", left: GUTTER, right: 0, top: 0, height: GRID_HEIGHT },
    block: {
      position: "absolute",
      borderRadius: t.radius.sm,
      borderLeftWidth: 4,
      paddingHorizontal: t.space(2),
      paddingVertical: t.space(1),
      overflow: "hidden",
      backgroundColor: t.surfaceSunken,
      borderLeftColor: t.textMuted,
      // A hairline all the way round. Two blocks of the same colour sitting
      // against each other were one block, and at this density a shadow is
      // too heavy to use for the same job.
      borderTopWidth: StyleSheet.hairlineWidth,
      borderRightWidth: StyleSheet.hairlineWidth,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderTopColor: t.border,
      borderRightColor: t.border,
      borderBottomColor: t.border,
    },
    // Shared events carry no partner colour, so they take the brand instead.
    block_event: { backgroundColor: t.brandSoft, borderLeftColor: t.brand },
    block_busy: { backgroundColor: t.surfaceSunken, borderLeftColor: t.dotBusy },
    block_work: { backgroundColor: t.surfaceSunken, borderLeftColor: t.dotWork },
    blockLabel: { ...t.type.caption, fontWeight: "700", color: t.textPrimary },
    blockTime: { ...t.type.caption, ...t.type.caption, color: t.textSecondary },
    nowLine: {
      position: "absolute",
      left: GUTTER - 5,
      right: 0,
      flexDirection: "row",
      alignItems: "center",
    },
    // A ring round the dot so the line still reads where it crosses a block
    // in the brand colour.
    nowDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
      backgroundColor: t.brand,
      borderWidth: 2,
      borderColor: t.bg,
    },
    nowRule: { flex: 1, height: 1.5, backgroundColor: t.brand },
    footnote: {
      ...t.type.caption,
      color: t.textMuted,
      paddingHorizontal: t.space(5),
      marginTop: t.space(4),
    },
  });
