import { useCallback, useMemo, useState } from "react";
import { useRef } from "react";
import {
  RefreshControl,
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Alert,
  Animated,
  PanResponder,
} from "react-native";
import { press } from "@/components/press";
import { succeeded, warned } from "@/lib/haptics";
import { useRefreshOnFocus } from "@/hooks/useRefreshOnFocus";
import { useThemedStyles, useTheme } from "@/contexts/theme";
import { Theme } from "@/theme/tokens";
import { router } from "expo-router";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/auth";
import { useCoupleMembers } from "@/hooks/useCoupleMembers";
import { useCouplePhotos } from "@/hooks/useCouplePhotos";
import { usePartnerColors } from "@/hooks/usePartnerColors";
import { shadeFor } from "@/lib/palette";
import { Avatar } from "@/components/avatar";
import { Interval } from "@/lib/freeTime";
import { KeyDateRow, displayTitleFor, nextOccurrence, tripNights } from "@/lib/keyDates";
import { EVENT_COLUMNS, PlannedEvent, formatPlanWhen } from "@/lib/plannedEvents";
import { occurrencesBetween } from "@/lib/recurrence";
import { WorkPattern, WorkShift, expandWorkOccurrences, WorkSource, toDateKey } from "@/lib/workHours";
import { daysCovered, lastCoveredDay } from "@/lib/daySpan";

type BusyRow = {
  id: string;
  user_id: string;
  start: Date;
  end: Date;
  title: string | null;
  location: string | null;
  notes: string | null;
  all_day: boolean;
};

type DayEntry = {
  kind: "plan" | "keydate" | "work" | "busy";
  label: string;
  detail: string;
  /** Free text shown under the detail line, e.g. an event's notes. */
  note?: string | null;
  /** Where tapping the row goes, if anywhere. */
  open?: { kind: "event"; id: string } | { kind: "busy"; id: string } | null;
  whose: string | null;
  /**
   * What removing this row actually means. Not every row is a row you can
   * delete: an occurrence of a recurring work pattern isn't stored anywhere on
   * its own, and busy time is a reflection of the phone's calendar -- deleting
   * that here would simply come back on the next sync, so it isn't offered.
   */
  action:
    | { type: "cancelPlan"; id: string; repeats: boolean }
    | { type: "deleteKeyDate"; id: string }
    | { type: "deleteShift"; id: string }
    | { type: "markDayOff"; date: string }
    | null;
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

const ACTION_WIDTH = 96;
const OPEN_THRESHOLD = 40;

const ACTION_LABELS: Record<string, string> = {
  cancelPlan: "Cancel",
  deleteKeyDate: "Delete",
  deleteShift: "Delete",
  markDayOff: "Day off",
};

/**
 * Swipe-to-reveal built on React Native's own Animated + PanResponder.
 *
 * Deliberately not react-native-gesture-handler's Swipeable: that pulls in
 * Reanimated, whose worklets runtime needs a native module matching the one
 * Expo Go ships. Reanimated 4 wants worklets 0.12 while Expo Go SDK 57 has
 * 0.10, so importing it crashes the app at startup. A swipe affordance isn't
 * worth a native dependency and a version matrix.
 */
function SwipeRow({
  entry,
  avatarUrl,
  avatarName,
  tint,
  onAction,
}: {
  entry: DayEntry;
  avatarUrl: string | null;
  avatarName: string | null;
  /** The owner's colour, or null for anything that belongs to both of you. */
  tint: { fill: string; ink: string; chip: string } | null;
  onAction: (entry: DayEntry) => void;
}) {
  const styles = useThemedStyles(createStyles);
  const t = useTheme();

  const translateX = useRef(new Animated.Value(0)).current;
  const openRef = useRef(false);

  const settle = (toValue: number) => {
    openRef.current = toValue !== 0;
    Animated.spring(translateX, {
      toValue,
      useNativeDriver: true,
      bounciness: 0,
      speed: 18,
    }).start();
  };

  const responder = useRef(
    PanResponder.create({
      // Only claim clearly horizontal drags, so the month list still scrolls.
      onMoveShouldSetPanResponder: (_e, g) =>
        Math.abs(g.dx) > Math.abs(g.dy) * 1.5 && Math.abs(g.dx) > 6,
      onPanResponderMove: (_e, g) => {
        const base = openRef.current ? -ACTION_WIDTH : 0;
        const next = Math.min(0, Math.max(-ACTION_WIDTH, base + g.dx));
        translateX.setValue(next);
      },
      onPanResponderRelease: (_e, g) => {
        const base = openRef.current ? -ACTION_WIDTH : 0;
        const finalX = base + g.dx;
        settle(finalX < -OPEN_THRESHOLD ? -ACTION_WIDTH : 0);
      },
      onPanResponderTerminate: () => settle(openRef.current ? -ACTION_WIDTH : 0),
    })
  ).current;

  const row = (
    <Pressable
      style={styles.entryRow}
      disabled={!entry.open}
      onPress={() =>
        entry.open &&
        router.push({
          pathname: "/event",
          params: entry.open.kind === "event" ? { id: entry.open.id } : { busy: entry.open.id },
        })
      }
    >
      {/* The bar carries the owner's colour; the row keeps its kind. Tinting
          the background as well made a synced busy block, a work shift and an
          editable event owned by the same person pixel-identical -- and only
          one of the three does anything when you tap it. */}
      <View
        style={[
          styles.entryBar,
          styles[`bar_${entry.kind}` as const],
          tint ? { backgroundColor: tint.ink } : null,
        ]}
      />
      {/* Only rows that belong to one person get a face. A shared date or a
          key date belongs to both, and a picture of one of you beside it
          would say something untrue. */}
      {entry.whose ? <Avatar url={avatarUrl} name={avatarName} size={30} /> : null}
      <View style={{ flex: 1 }}>
        <Text style={styles.entryLabel}>{entry.label}</Text>
        <Text style={styles.entryDetail}>{entry.detail}</Text>
        {entry.note ? (
          <Text style={styles.entryNote} numberOfLines={3}>
            {entry.note}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );

  // Rows with nothing to delete don't swipe at all, rather than swiping to
  // reveal an action that would fail or silently undo itself.
  if (!entry.action) return row;

  const label = ACTION_LABELS[entry.action.type] ?? "Delete";
  const soft = entry.action.type === "markDayOff";

  return (
    <View style={styles.swipeWrap}>
      <View style={styles.swipeActionLayer}>
        <Pressable
          style={press([styles.swipeAction, soft ? styles.swipeActionSoft : null])}
          onPress={() => {
            settle(0);
            onAction(entry);
          }}
        >
          <Text style={[styles.swipeActionText, soft ? styles.swipeActionTextSoft : null]}>
            {label}
          </Text>
        </Pressable>
      </View>

      <Animated.View style={{ transform: [{ translateX }] }} {...responder.panHandlers}>
        {row}
      </Animated.View>
    </View>
  );
}

export default function CalendarScreen() {
  const styles = useThemedStyles(createStyles);
  const t = useTheme();

  const { session, profile } = useAuth();
  const { me, partner } = useCoupleMembers();
  const { avatarUrlFor } = useCouplePhotos();
  const partnerColors = usePartnerColors();

  const myTint = shadeFor(partnerColors.mine, t.scheme);
  const partnerTint = partnerColors.theirs ? shadeFor(partnerColors.theirs, t.scheme) : null;

  const tintFor = useCallback(
    (ownerUserId: string | null) => {
      const color = partnerColors.forOwner(ownerUserId);
      return color ? shadeFor(color, t.scheme) : null;
    },
    [partnerColors, t.scheme]
  );
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [selected, setSelected] = useState<string>(toDateKey(new Date()));

  const [plans, setPlans] = useState<PlannedEvent[]>([]);
  const [keyDates, setKeyDates] = useState<KeyDateRow[]>([]);
  const [busy, setBusy] = useState<BusyRow[]>([]);
  const [work, setWork] = useState<{ user_id: string; interval: Interval; source: WorkSource }[]>([]);

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
        // Repeating events come back whatever their start date: a weekly
        // dinner created in January is still on in December, and filtering on
        // start_at would hide it from every month but the first.
        .select(EVENT_COLUMNS)
        .eq("cancelled", false)
        .or(
          `and(end_at.gte.${rangeStart.toISOString()},start_at.lte.${rangeEnd.toISOString()}),` +
            `and(repeat_every.neq.none,start_at.lte.${rangeEnd.toISOString()},` +
            `or(repeat_until.is.null,repeat_until.gte.${toDateKey(rangeStart)}))`
        ),
      supabase.from("key_dates").select("id, title, date, recurring, kind, subject_user_id, reminder_days, reminders_on, notes, end_date, pinned"),
      supabase
        .from("busy_blocks")
        .select("id, user_id, start_at, end_at, title, location, notes, all_day")
        .gte("end_at", rangeStart.toISOString())
        .lte("start_at", rangeEnd.toISOString()),
      supabase.from("work_patterns").select("id, user_id, mode, cycle_weeks, anchor_date, shifts, time_zone"),
      supabase
        .from("work_shifts")
        .select("id, user_id, date, start_time, end_time, kind, time_zone")
        .gte("date", toDateKey(rangeStart))
        .lte("date", toDateKey(rangeEnd)),
    ]);

    setPlans((planRes.data as PlannedEvent[]) ?? []);
    setKeyDates((keyRes.data as KeyDateRow[]) ?? []);
    setBusy(
      (busyRes.data ?? []).map((b) => ({
        id: b.id as string,
        user_id: b.user_id as string,
        start: new Date(b.start_at as string),
        end: new Date(b.end_at as string),
        title: (b.title as string | null) ?? null,
        location: (b.location as string | null) ?? null,
        notes: (b.notes as string | null) ?? null,
        all_day: b.all_day === true,
      }))
    );

    const patterns = (patternRes.data as WorkPattern[]) ?? [];
    const allShifts = (shiftRes.data as WorkShift[]) ?? [];
    const expanded: { user_id: string; interval: Interval; source: WorkSource }[] = [];

    for (const p of patterns) {
      const mine = allShifts.filter((s) => s.user_id === p.user_id);
      for (const o of expandWorkOccurrences(p, mine, rangeStart, rangeEnd)) {
        expanded.push({ user_id: p.user_id, interval: o.interval, source: o.source });
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
      for (const o of expandWorkOccurrences(null, rows, rangeStart, rangeEnd)) {
        expanded.push({ user_id: uid, interval: o.interval, source: o.source });
      }
    }

    setWork(expanded);
  }, [session?.user.id, month]);

  // Refreshes whenever this screen comes back into view, not just on
  // mount -- otherwise changes made elsewhere aren't here until a restart.
  const { refreshing, onRefresh } = useRefreshOnFocus(load);

  // Everything that falls on each day, keyed by YYYY-MM-DD.
  const entriesByDay = useMemo(() => {
    const map = new Map<string, DayEntry[]>();
    const push = (key: string, entry: DayEntry) => {
      map.set(key, [...(map.get(key) ?? []), entry]);
    };

    for (const p of plans) {
      // A repeating event is one row, so every occurrence landing in this
      // month has to be drawn -- otherwise a weekly date night shows up in the
      // week it was created and nowhere else.
      const occurrences = occurrencesBetween(
        {
          start: new Date(p.start_at),
          end: new Date(p.end_at),
          repeatEvery: p.repeat_every ?? "none",
          repeatUntil: p.repeat_until ? new Date(`${p.repeat_until}T00:00:00`) : null,
        },
        startOfMonth(month),
        endOfMonth(month)
      );

      for (const at of occurrences) {
        push(toDateKey(at.start), {
          kind: "plan",
          label: p.title,
          detail: formatPlanWhen(at.start.toISOString(), at.end.toISOString())
            .split(", ")
            .slice(1)
            .join(", "),
          // An event belongs to whoever it's FOR, not whoever typed it in, so
          // the avatar and colour follow owner_user_id. Roy entering Alyssa's
          // dentist appointment should read as hers.
          whose: p.owner_user_id,
          open: { kind: "event", id: p.id },
          action: {
            type: "cancelPlan",
            id: p.id,
            // Cancelling sets a flag on the ROW, and a repeating event is one
            // row. There is no per-occurrence exception yet, so the only
            // honest thing is to say so before the tap rather than after it.
            repeats: (p.repeat_every ?? "none") !== "none",
          },
        });
      }
    }

    for (const kd of keyDates) {
      const occurrence = nextOccurrence(kd.date, kd.recurring);
      const nights = tripNights(kd);

      // A trip belongs on every day it covers, not just the day it starts.
      // Anyone looking at the 14th wants to know they're in Bali, and a single
      // dot on the 10th doesn't tell them that.
      for (let offset = 0; offset <= nights; offset++) {
        const day = new Date(occurrence);
        day.setDate(day.getDate() + offset);
        if (day < startOfMonth(month) || day > endOfMonth(month)) continue;

        push(toDateKey(day), {
          kind: "keydate",
          label: displayTitleFor(kd, nameFor),
          detail:
            nights === 0
              ? "All day"
              : offset === 0
                ? `Starts today · ${nights} night${nights === 1 ? "" : "s"}`
                : offset === nights
                  ? "Last day"
                  : `Day ${offset + 1} of ${nights + 1}`,
          note: kd.notes,
          whose: null,
          // Deleting a trip from the middle of it would be deleting the whole
          // trip from a row that says "Day 3 of 8", which is not what the
          // swipe looks like it does. Only the first day offers it.
          action: offset === 0 ? { type: "deleteKeyDate", id: kd.id } : null,
        });
      }
    }

    for (const w of work) {
      const dayKey = toDateKey(w.interval.start);
      // Only your own working hours are yours to change -- and RLS agrees, so
      // offering it on your partner's rows would just produce a failed write.
      const mine = w.user_id === myId;
      push(dayKey, {
        kind: "work",
        label: `${nameFor(w.user_id)} working`,
        detail: `${timeLabel(w.interval.start)} – ${timeLabel(w.interval.end)}`,
        whose: w.user_id,
        action: !mine
          ? null
          : w.source.type === "shift"
            ? { type: "deleteShift", id: w.source.id }
            : { type: "markDayOff", date: dayKey },
      });
    }

    // The same event often lives in two calendars at once -- a meeting invite
    // that lands in both your work and personal accounts is routine. Those are
    // two rows at identical times, and if the two calendars are shared at
    // different levels one row carries a title and the other doesn't.
    //
    // So the fingerprint deliberately does NOT include the title: it would
    // make the pair look like two separate commitments, "Standup" stacked on
    // top of an anonymous "busy" at the same time. Where there's a clash the
    // titled row wins, because it's the one that tells you something.
    const bestBusy = new Map<string, BusyRow>();

    for (const b of busy) {
      const fingerprint = `${b.user_id}|${b.start.getTime()}|${b.end.getTime()}`;
      const existing = bestBusy.get(fingerprint);
      if (!existing || (!existing.title && b.title)) bestBusy.set(fingerprint, b);
    }

    for (const b of bestBusy.values()) {
      // The title is the whole point of sharing a calendar in full -- without
      // it this row is the anonymous grey block it used to be. Whose it is
      // still leads, because on a shared calendar "Dentist" is ambiguous.
      const where = b.location ? ` · ${b.location}` : "";

      // An event can run over several days -- annual leave, a conference, a
      // multi-day all-day block. It belongs on every day it covers, not just
      // the day it starts, for the same reason a trip does: somebody looking
      // at Wednesday wants to know their partner is away.
      for (const day of daysCovered(b, startOfMonth(month), endOfMonth(month))) {
        const sameDay = toDateKey(day) === toDateKey(b.start);
        const lastDay = toDateKey(day) === toDateKey(lastCoveredDay(b));

        const when = b.all_day
          ? "All day"
          : sameDay && lastDay
            ? `${timeLabel(b.start)} – ${timeLabel(b.end)}`
            : sameDay
              ? `From ${timeLabel(b.start)}`
              : lastDay
                ? `Until ${timeLabel(b.end)}`
                : "All day";

        push(toDateKey(day), {
          kind: "busy",
          label: b.title ? `${nameFor(b.user_id)} · ${b.title}` : `${nameFor(b.user_id)} busy`,
          detail: `${when}${where}`,
          note: b.notes,
          whose: b.user_id,
          open: { kind: "busy", id: b.id },
          action: null,
        });
      }
    }

    return map;
  }, [plans, keyDates, work, busy, month, nameFor, myId]);

  const cells = useMemo(() => monthGrid(month), [month]);
  const selectedEntries = entriesByDay.get(selected) ?? [];
  const todayKey = toDateKey(new Date());

  async function performAction(entry: DayEntry) {
    const action = entry.action;
    if (!action || !session?.user.id || !profile?.couple_id) return;

    let error: { message: string } | null = null;

    if (action.type === "cancelPlan") {
      ({ error } = await supabase
        .from("planned_events")
        .update({ cancelled: true })
        .eq("id", action.id));
    } else if (action.type === "deleteKeyDate") {
      ({ error } = await supabase.from("key_dates").delete().eq("id", action.id));
    } else if (action.type === "deleteShift") {
      ({ error } = await supabase.from("work_shifts").delete().eq("id", action.id));
    } else if (action.type === "markDayOff") {
      ({ error } = await supabase.from("work_shifts").insert({
        couple_id: profile.couple_id,
        user_id: session.user.id,
        date: action.date,
        kind: "off",
      }));
    }

    if (error) {
      warned();
      Alert.alert("Couldn't remove that", error.message);
      return;
    }

    succeeded();

    load();
  }

  function confirmAction(entry: DayEntry) {
    // A cancelled date disappears from both partners' phone calendars, and a
    // deleted key date takes its reminders with it. Worth one tap of
    // confirmation; a one-off shift isn't.
    if (entry.action?.type === "deleteShift") {
      performAction(entry);
      return;
    }

    const message =
      entry.action?.type === "cancelPlan"
        ? entry.action.repeats
          ? `"${entry.label}" repeats. Every occurrence will come off both your calendars, not just this one.`
          : `"${entry.label}" will come off both your calendars.`
        : entry.action?.type === "deleteKeyDate"
          ? `"${entry.label}" and its reminders will be removed for both of you.`
          : "This day will be marked off, and your working hours won't count against free time.";

    Alert.alert("Are you sure?", message, [
      { text: "Keep it", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: () => performAction(entry) },
    ]);
  }

  function shiftMonth(delta: number) {
    setMonth((m) => new Date(m.getFullYear(), m.getMonth() + delta, 1));
  }

  return (
    <ScrollView
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={t.textMuted} />
      } contentContainerStyle={styles.container}>
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

          // Two kinds of dot, and they must not describe the same thing
          // twice. Anything belonging to one person gets that person's dot;
          // anything belonging to both of you gets its kind's dot. Keyed by
          // user id rather than by colour, because two partners CAN end up the
          // same colour and duplicate React keys drop a dot at random.
          const owners = [
            ...new Map(
              entries
                .filter((e) => e.whose)
                .map((e) => [e.whose as string, tintFor(e.whose)] as const)
            ).entries(),
          ].filter((pair): pair is [string, NonNullable<ReturnType<typeof tintFor>>] =>
            pair[1] !== null
          );

          const sharedKinds = [...new Set(entries.filter((e) => !e.whose).map((e) => e.kind))];

          return (
            <Pressable
              key={i}
              style={press([styles.cell, isSelected ? styles.cellSelected : null])}
              // First tap selects the day and shows its list below; a second
              // tap on the day already selected opens the hour-by-hour view.
              // Going straight there on the first tap would make the month
              // grid impossible to browse.
              onPress={() =>
                isSelected
                  ? router.push({ pathname: "/day", params: { date: key } })
                  : setSelected(key)
              }
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
                {owners.slice(0, 2).map(([userId, tint]) => (
                  // ink, not chip: a 5px dot in a pastel is invisible against
                  // the page -- the pale yellows sit at about 1.3:1.
                  <View key={userId} style={[styles.dot, { backgroundColor: tint.ink }]} />
                ))}
                {sharedKinds.slice(0, 2).map((k) => (
                  <View key={k} style={[styles.dot, styles[`dot_${k}` as const]]} />
                ))}
              </View>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.dot, { backgroundColor: myTint.ink }]} />
          <Text style={styles.legendText}>{me.display_name ?? "You"}</Text>
        </View>
        {partnerTint ? (
          <View style={styles.legendItem}>
            <View style={[styles.dot, { backgroundColor: partnerTint.ink }]} />
            <Text style={styles.legendText}>{partnerName}</Text>
          </View>
        ) : null}
        <View style={styles.legendItem}>
          <View style={[styles.dot, styles.dot_plan]} />
          <Text style={styles.legendText}>Both of you</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.dot, styles.dot_keydate]} />
          <Text style={styles.legendText}>Key date</Text>
        </View>
      </View>

      <View style={styles.dayTitleRow}>
        <Text style={styles.dayTitle}>
          {new Date(selected + "T00:00:00").toLocaleDateString(undefined, {
            weekday: "long",
            day: "numeric",
            month: "long",
          })}
        </Text>
        <Pressable
          onPress={() => router.push({ pathname: "/day", params: { date: selected } })}
          hitSlop={8}
        >
          <Text style={styles.dayTitleAction}>Open day ›</Text>
        </Pressable>
      </View>

      {selectedEntries.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>Nothing on. That&apos;s a good sign.</Text>
        </View>
      ) : (
        selectedEntries.map((e, i) => (
          <SwipeRow
            key={i}
            entry={e}
            avatarUrl={avatarUrlFor(e.whose)}
            avatarName={e.whose ? nameFor(e.whose) : null}
            tint={tintFor(e.whose)}
            onAction={confirmAction}
          />
        ))
      )}

      {selectedEntries.some((e) => e.kind === "busy") ? (
        <Text style={styles.footnote}>
          Events come from the calendars you&apos;ve connected. Change them there and they update
          here.
        </Text>
      ) : null}

      {selectedEntries.some((e) => e.action) ? (
        <Text style={styles.footnote}>Swipe an entry left to remove it.</Text>
      ) : null}
    </ScrollView>
  );
}

const CELL = `${100 / 7}%`;

const createStyles = (t: Theme) =>
  StyleSheet.create({
  container: { flexGrow: 1, padding: 20, paddingTop: 70, paddingBottom: 48 },
  back: { fontSize: 15, color: t.accent, fontWeight: "600", marginBottom: 12 },
  monthHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  monthTitle: { fontSize: 20, fontWeight: "600", color: t.textPrimary },
  monthArrow: { fontSize: 28, color: t.accent, paddingHorizontal: 12 },
  weekHeader: { flexDirection: "row", marginBottom: 4 },
  weekHeading: {
    width: CELL,
    textAlign: "center",
    fontSize: 11,
    color: t.textMuted,
    fontWeight: "600",
  },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  cell: {
    width: CELL,
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: t.radius.sm,
  },
  cellSelected: { backgroundColor: t.accentSoft },
  cellDay: { fontSize: 14, color: t.textPrimary },
  cellDayToday: { color: t.brand, fontWeight: "700" },
  cellDaySelected: { fontWeight: "700" },
  dotRow: { flexDirection: "row", gap: 3, marginTop: 3, height: 5 },
  dot: { width: 5, height: 5, borderRadius: 3 },
  dot_plan: { backgroundColor: t.brand },
  dot_keydate: { backgroundColor: t.accent },
  dot_work: { backgroundColor: t.dotWork },
  dot_busy: { backgroundColor: t.dotBusy },
  legend: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 14,
    marginTop: 14,
    marginBottom: 20,
    justifyContent: "center",
  },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  legendText: { fontSize: 11, color: t.textMuted },
  dayTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  dayTitle: { fontSize: 16, fontWeight: "600", color: t.textPrimary },
  dayTitleAction: { fontSize: 13, fontWeight: "600", color: t.accent },
  emptyCard: { backgroundColor: t.surface, borderRadius: t.radius.md, padding: 18 },
  emptyText: { fontSize: 13, color: t.textSecondary },
  entryRow: {
    flexDirection: "row",
    backgroundColor: t.surface,
    borderRadius: t.radius.md,
    padding: 14,
    marginBottom: 8,
    alignItems: "center",
    gap: 12,
  },
  entryBar: { width: 3, alignSelf: "stretch", borderRadius: 2 },
  bar_plan: { backgroundColor: t.brand },
  bar_keydate: { backgroundColor: t.accent },
  bar_work: { backgroundColor: t.dotWork },
  bar_busy: { backgroundColor: t.dotBusy },
  entryLabel: { fontSize: 14, fontWeight: "500", color: t.textPrimary },
  swipeWrap: { position: "relative" },
  swipeActionLayer: {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 8,
    width: ACTION_WIDTH,
    flexDirection: "row",
  },
  swipeAction: {
    flex: 1,
    backgroundColor: t.danger,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: t.radius.md,
    marginLeft: 8,
  },
  swipeActionSoft: { backgroundColor: t.surfaceSunken },
  swipeActionText: { color: t.surface, fontWeight: "600", fontSize: 13 },
  swipeActionTextSoft: { color: t.textSecondary },
  footnote: { fontSize: 11, color: t.textMuted, marginTop: 6, lineHeight: 16 },
  entryDetail: { fontSize: 12, color: t.textSecondary, marginTop: 2 },
  entryNote: { fontSize: 12, color: t.textMuted, marginTop: 4, lineHeight: 17 },
  });
