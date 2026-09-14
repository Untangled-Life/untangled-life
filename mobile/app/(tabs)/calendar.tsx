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
import { EVENT_COLUMNS, PlannedEvent } from "@/lib/plannedEvents";
import { occurrencesBetween } from "@/lib/recurrence";
import { WorkPattern, WorkShift, expandWorkOccurrences, WorkSource, toDateKey } from "@/lib/workHours";
import { daysCovered, lastCoveredDay } from "@/lib/daySpan";
import { Chip, MonthEvent, inMonth, packWeek, weeksOfMonth } from "@/lib/monthGrid";

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

// Two letters, not one. A column of M T W T F S S makes the two Ts and the
// two Ss indistinguishable at a glance, so people count across from Monday
// instead of reading.
const WEEK_HEADINGS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];


function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

/**
 * The window the screen actually draws.
 *
 * Not the month: a month view is whole weeks, so September 2026 shows Monday
 * 31 August and the first four days of October. Loading only the month left
 * those days numbered, tappable and permanently empty -- tap 1 October and
 * the app says you have nothing on, however full the day is.
 */
function gridRange(month: Date): { from: Date; to: Date } {
  const weeks = weeksOfMonth(month);
  const from = new Date(weeks[0]);
  const to = new Date(weeks[weeks.length - 1]);
  to.setDate(to.getDate() + 6);
  to.setHours(23, 59, 59, 999);
  return { from, to };
}

/**
 * How many rows of bars a week may grow to before it starts counting instead.
 *
 * Four is enough for an ordinary week and short enough that a busy fortnight
 * cannot push the rest of the month off the screen, which is the one thing a
 * month view exists to prevent.
 */
const MAX_LANES = 4;

type FilterKey = "me" | "partner" | "us" | "work";

type Slot = { key: string; width: number; chip: Chip | null };

/**
 * A lane drawn as a row of flex boxes, gaps included.
 *
 * Absolute positioning would need the cell width measured first, and a
 * percentage would fight the card's padding. Flex weights divide whatever
 * width the row actually has into sevenths on their own.
 */
function laneSlots(lane: Chip[]): Slot[] {
  const slots: Slot[] = [];
  let cursor = 0;

  for (const chip of lane) {
    if (chip.col > cursor) {
      slots.push({ key: `gap${cursor}`, width: chip.col - cursor, chip: null });
    }
    slots.push({ key: chip.event.id, width: chip.span, chip });
    cursor = chip.col + chip.span;
  }

  if (cursor < 7) slots.push({ key: `gap${cursor}`, width: 7 - cursor, chip: null });
  return slots;
}

/**
 * A bar that carries on past the edge of the week loses the corner on that
 * side, so the eye reads the two halves as one thing rather than as two.
 */
function barShape(chip: Chip) {
  return {
    borderTopLeftRadius: chip.continuesLeft ? 0 : 5,
    borderBottomLeftRadius: chip.continuesLeft ? 0 : 5,
    borderTopRightRadius: chip.continuesRight ? 0 : 5,
    borderBottomRightRadius: chip.continuesRight ? 0 : 5,
    marginLeft: chip.continuesLeft ? 0 : 1,
    marginRight: chip.continuesRight ? 0 : 1,
  };
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
          // Work is grey wherever it appears -- on the grid, on the chip that
          // switches it off, and here. A shift belongs to a person, but it is
          // the one thing on the calendar nobody chose.
          tint && entry.kind !== "work" ? { backgroundColor: tint.ink } : null,
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

  const loadSeq = useRef(0);

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

    // Five queries a month, and tapping back three times fires fifteen. If
    // August lands after July, every setter below writes August's rows while
    // the header says July -- and nothing re-fires to correct it. A screenful
    // of bars in the wrong month is a good deal more convincing than a few
    // misplaced dots were.
    const seq = ++loadSeq.current;

    const { from: rangeStart, to: rangeEnd } = gridRange(month);

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

    if (seq !== loadSeq.current) return;

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

  const { from: gridFrom, to: gridTo } = useMemo(() => gridRange(month), [month]);

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
        gridFrom,
        gridTo
      );

      for (const at of occurrences) {
        // A plan can run over more than one day -- a weekend away booked as
        // an event rather than a trip, a flight that lands the next morning.
        // Filing it on its start day alone put a bar on the grid across days
        // whose list said "Nothing on".
        const lastDay = lastCoveredDay({ start: at.start, end: at.end });

        for (const day of daysCovered(
          { start: at.start, end: at.end },
          gridFrom,
          gridTo
        )) {
          const sameDay = toDateKey(day) === toDateKey(at.start);
          const isLastDay = toDateKey(day) === toDateKey(lastDay);

          push(toDateKey(day), {
          kind: "plan",
          label: p.title,
          detail:
            sameDay && isLastDay
              ? `${timeLabel(at.start)} – ${timeLabel(at.end)}`
              : sameDay
                ? `From ${timeLabel(at.start)}`
                : isLastDay
                  ? `Until ${timeLabel(at.end)}`
                  : "All day",
          // An event belongs to whoever it's FOR, not whoever typed it in, so
          // the avatar and colour follow owner_user_id. Roy entering Alyssa's
          // dentist appointment should read as hers.
          whose: p.owner_user_id,
          open: { kind: "event", id: p.id },
          // Cancelling from day three of a weekend away removes the whole
          // weekend, which is not what a row reading "Until 5:00 PM" looks
          // like it does. Same rule as a trip: only the first day offers it.
          action: !sameDay
            ? null
            : {
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
        if (day < gridFrom || day > gridTo) continue;

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
      for (const day of daysCovered(b, gridFrom, gridTo)) {
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
  }, [plans, keyDates, work, busy, gridFrom, gridTo, nameFor, myId]);

  /**
   * The same material as entriesByDay, but as spans rather than per-day rows.
   *
   * A week in Bali is ONE event from the 10th to the 17th here. That is the
   * whole difference between this grid and the old one: the day-keyed map
   * cannot draw a bar, because by the time it is built the trip has already
   * been chopped into eight unrelated rows.
   */
  const monthEvents = useMemo(() => {
    const out: MonthEvent[] = [];
    const { from, to } = gridRange(month);

    for (const p of plans) {
      const occurrences = occurrencesBetween(
        {
          start: new Date(p.start_at),
          end: new Date(p.end_at),
          repeatEvery: p.repeat_every ?? "none",
          repeatUntil: p.repeat_until ? new Date(`${p.repeat_until}T00:00:00`) : null,
        },
        from,
        to
      );

      for (const at of occurrences) {
        out.push({
          // One row can be many occurrences, so the row id alone is not
          // unique -- and lane order breaks ties on id, so a duplicate would
          // make the grid reshuffle itself.
          id: `plan:${p.id}:${at.start.getTime()}`,
          title: p.title,
          start: at.start,
          // Midnight is the natural way to write "ends at the end of the
          // 14th", and taking it literally painted a bar into the 15th.
          end: lastCoveredDay({ start: at.start, end: at.end }),
          kind: "plan",
          whose: p.owner_user_id,
        });
      }
    }

    for (const kd of keyDates) {
      const occurrence = nextOccurrence(kd.date, kd.recurring);
      const nights = tripNights(kd);
      const end = new Date(occurrence);
      end.setDate(end.getDate() + nights);

      out.push({
        id: `key:${kd.id}`,
        title: displayTitleFor(kd, nameFor),
        start: occurrence,
        end,
        kind: "keydate",
        whose: null,
      });
    }

    for (const w of work) {
      out.push({
        id: `work:${w.user_id}:${w.interval.start.getTime()}`,
        title: `${nameFor(w.user_id)} working`,
        start: w.interval.start,
        end: w.interval.start,
        kind: "work",
        whose: w.user_id,
      });
    }

    // Same de-duplication as the day list: one meeting that lands in two
    // connected calendars is one commitment, and two identical bars stacked
    // on each other looks like a double booking.
    const bestBusy = new Map<string, BusyRow>();
    for (const b of busy) {
      const fingerprint = `${b.user_id}|${b.start.getTime()}|${b.end.getTime()}`;
      const existing = bestBusy.get(fingerprint);
      if (!existing || (!existing.title && b.title)) bestBusy.set(fingerprint, b);
    }

    for (const b of bestBusy.values()) {
      out.push({
        id: `busy:${b.id}`,
        // The name leads in the day list because the rows there are mixed
        // together. On the grid the colour already says whose it is, and a
        // bar three days wide has room for about four words.
        title: b.title ?? `${nameFor(b.user_id)} busy`,
        start: b.start,
        end: lastCoveredDay(b),
        kind: "busy",
        whose: b.user_id,
      });
    }

    return out;
  }, [plans, keyDates, work, busy, month, nameFor]);

  // Kept as what is HIDDEN rather than what is shown, so a filter nobody has
  // touched is on, and anything added later appears instead of vanishing.
  const [hidden, setHidden] = useState<FilterKey[]>([]);

  // Takes the shape both views share rather than a MonthEvent, so a filter
  // means the same thing on the grid and in the list underneath it. Hiding
  // your partner and still reading their whole day is not a filter.
  const bucketOf = useCallback(
    (e: { kind: MonthEvent["kind"]; whose: string | null }): FilterKey =>
      e.kind === "work" ? "work" : !e.whose ? "us" : e.whose === myId ? "me" : "partner",
    [myId]
  );

  // Pairing can change underneath a hidden filter, and a hidden filter with
  // no chip on screen is a part of the calendar with no way to bring it back.
  // Derived rather than corrected in an effect, so the choice survives if the
  // chip comes back, and the grid never renders once unfiltered on the way.
  const hiddenNow = useMemo(
    () => hidden.filter((k) => k !== "partner" || (partnerId !== null && partnerTint !== null)),
    [hidden, partnerId, partnerTint]
  );

  const visibleEvents = useMemo(
    () => monthEvents.filter((e) => !hiddenNow.includes(bucketOf(e))),
    [monthEvents, hiddenNow, bucketOf]
  );

  const weeks = useMemo(() => weeksOfMonth(month), [month]);

  // Packed once per month rather than in the render body: selecting a day
  // changes nothing about the bars, and re-sorting every event on every tap
  // is work nobody sees.
  const packedWeeks = useMemo(
    () => weeks.map((w) => packWeek(w, visibleEvents, MAX_LANES)),
    [weeks, visibleEvents]
  );

  const barColours = useCallback(
    (e: MonthEvent) => {
      // Working hours are grey everywhere else in the app and grey is what
      // the Work chip shows. Asking for the owner's colour first made every
      // shift take a partner colour and left the chip advertising a colour
      // that appeared nowhere on the grid.
      if (e.kind === "work") return { fill: t.surfaceSunken, ink: t.textSecondary };

      // Palette ink is a dark tint of its own hue and clears 4.5:1 on its own
      // fill. The theme's soft fills do not: brand on brandSoft is 3.3:1 in
      // light mode, which is too thin to read at 10px.
      const tint = tintFor(e.whose);
      if (tint) return { fill: tint.fill, ink: tint.ink };
      if (e.kind === "keydate") return { fill: t.accentSoft, ink: t.textPrimary };
      return { fill: t.brandSoft, ink: t.textPrimary };
    },
    [tintFor, t]
  );

  const filterOptions = useMemo(() => {
    const opts: { key: FilterKey; label: string; fill: string; ink: string }[] = [
      { key: "me", label: myName, fill: myTint.fill, ink: myTint.ink },
    ];

    if (partnerTint && partnerId) {
      opts.push({
        key: "partner",
        label: partnerName,
        fill: partnerTint.fill,
        ink: partnerTint.ink,
      });
    }

    // Deliberately not a colour: "Us" covers shared plans AND key dates,
    // which are two colours on the grid, so a single swatch here would be
    // explaining something untrue. The two people are the only part of this
    // control that is also a legend, because their colours are the only ones
    // that identify rather than categorise.
    opts.push({ key: "us", label: "Us", fill: t.surfaceSunken, ink: t.textPrimary });
    opts.push({ key: "work", label: "Work", fill: t.surfaceSunken, ink: t.textPrimary });
    return opts;
  }, [myName, partnerName, partnerId, myTint, partnerTint, t]);

  function toggleFilter(key: FilterKey) {
    setHidden((h) => (h.includes(key) ? h.filter((k) => k !== key) : [...h, key]));
  }

  const dayEntries = useMemo(
    () => entriesByDay.get(selected) ?? [],
    [entriesByDay, selected]
  );

  const selectedEntries = useMemo(
    () => dayEntries.filter((e) => !hiddenNow.includes(bucketOf(e))),
    [dayEntries, hiddenNow, bucketOf]
  );

  // The one thing a couple's calendar must never do is say the day is clear
  // when it is not. Once the filters reach the list as well, "Nothing on" and
  // "nothing you are currently looking at" are different sentences.
  const filteredOut = dayEntries.length - selectedEntries.length;
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
    const next = new Date(month.getFullYear(), month.getMonth() + delta, 1);

    // A month view is whole weeks, so most of the time the day you had
    // selected is still on screen -- the 30th of September is in October's
    // grid. When it isn't, leaving it selected left the heading naming a day
    // no cell was highlighting, above a list that had no data for it and so
    // claimed it was free.
    const { from, to } = gridRange(next);
    const current = new Date(`${selected}T00:00:00`);
    if (current < from || current > to) setSelected(toDateKey(next));

    setMonth(next);
  }

  function goToToday() {
    const now = new Date();
    setMonth(startOfMonth(now));
    setSelected(toDateKey(now));
  }

  const viewingThisMonth =
    month.getFullYear() === new Date().getFullYear() && month.getMonth() === new Date().getMonth();

  return (
    <ScrollView
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={t.textMuted} />
      } contentContainerStyle={styles.container}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={press(styles.backTap)}>
          <Text style={styles.back}>‹ Home</Text>
        </Pressable>

        {/* Only offered when it would do something. A Today button on today
            is a button that does nothing, which teaches people not to trust
            the other buttons. */}
        {viewingThisMonth ? null : (
          <Pressable onPress={goToToday} hitSlop={8} style={press(styles.todayPill)}>
            <Text style={styles.todayPillText}>Today</Text>
          </Pressable>
        )}
      </View>

      <View style={styles.monthHeader}>
        <View style={styles.monthTitleWrap}>
          <Text style={styles.monthYear}>{month.getFullYear()}</Text>
          <Text style={styles.monthTitle}>
            {month.toLocaleDateString(undefined, { month: "long" })}
          </Text>
        </View>

        <View style={styles.monthNav}>
          <Pressable
            onPress={() => shiftMonth(-1)}
            hitSlop={10}
            accessibilityLabel="Previous month"
            style={press(styles.navButton)}
          >
            <Text style={styles.monthArrow}>‹</Text>
          </Pressable>
          <Pressable
            onPress={() => shiftMonth(1)}
            hitSlop={10}
            accessibilityLabel="Next month"
            style={press(styles.navButton)}
          >
            <Text style={styles.monthArrow}>›</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.gridCard}>
      <View style={styles.weekHeader}>
        {WEEK_HEADINGS.map((h, i) => (
          <Text key={i} style={styles.weekHeading}>
            {h}
          </Text>
        ))}
      </View>

      <View style={styles.grid}>
        {packedWeeks.map(({ days, lanes, overflow }, wi) => {
          const hasOverflow = overflow.some((n) => n > 0);

          return (
            <View key={wi} style={styles.week}>
              <View style={styles.weekDays}>
                {days.map((day) => {
                  const key = toDateKey(day);
                  const isSelected = key === selected;
                  const isToday = key === todayKey;

                  return (
                    <Pressable
                      key={key}
                      style={press(styles.dayCell)}
                      // First tap selects the day and shows its list below; a
                      // second tap on the day already selected opens the
                      // hour-by-hour view. Going straight there on the first
                      // tap would make the month impossible to browse.
                      onPress={() =>
                        isSelected
                          ? router.push({ pathname: "/day", params: { date: key } })
                          : setSelected(key)
                      }
                    >
                      <View
                        style={[
                          styles.dayPill,
                          isToday && !isSelected ? styles.dayPillToday : null,
                          isSelected ? styles.dayPillSelected : null,
                        ]}
                      >
                        <Text
                          style={[
                            styles.cellDay,
                            inMonth(day, month) ? null : styles.cellDayOutside,
                            isToday && !isSelected ? styles.cellDayToday : null,
                            isSelected ? styles.cellDaySelected : null,
                          ]}
                        >
                          {day.getDate()}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>

              {lanes.map((lane, li) => (
                <View key={li} style={styles.lane}>
                  {laneSlots(lane).map((slot) => {
                    const chip = slot.chip;
                    if (!chip) return <View key={slot.key} style={{ flex: slot.width }} />;

                    const { fill, ink } = barColours(chip.event);

                    return (
                      <Pressable
                        key={slot.key}
                        style={press({ flex: slot.width })}
                        // Tapping a bar selects the first day of it you can
                        // see, so the list underneath is showing the thing
                        // you just tapped rather than the day it began.
                        onPress={() => setSelected(toDateKey(days[chip.col]))}
                      >
                        <View style={[styles.bar, barShape(chip), { backgroundColor: fill }]}>
                          <Text numberOfLines={1} style={[styles.barText, { color: ink }]}>
                            {chip.event.title}
                          </Text>
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              ))}

              {/* Counted per day rather than per week: a day sitting under a
                  long bar still has to say there is more to see. */}
              {hasOverflow ? (
                <View style={styles.lane}>
                  {overflow.map((n, i) => (
                    <View key={i} style={styles.overflowCell}>
                      {n > 0 ? <Text style={styles.overflowText}>+{n} more</Text> : null}
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
          );
        })}
      </View>

      </View>

      {/* The old legend explained four colours and did nothing. These do the
          explaining for the part that needs it -- which of you is which -- and
          they also switch each group off. */}
      <View style={styles.filters}>
        {filterOptions.map((f) => {
          const on = !hiddenNow.includes(f.key);

          return (
            <Pressable
              key={f.key}
              onPress={() => toggleFilter(f.key)}
              accessibilityRole="switch"
              accessibilityState={{ checked: on }}
              accessibilityLabel={`${f.label}, ${on ? "shown" : "hidden"}`}
              style={press([
                styles.filterChip,
                on ? { backgroundColor: f.fill, borderColor: f.fill } : null,
              ])}
            >
              <Text style={[styles.filterText, on ? { color: f.ink } : null]}>{f.label}</Text>
            </Pressable>
          );
        })}
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
          <Text style={styles.emptyText}>
            {filteredOut > 0
              ? `${filteredOut} thing${filteredOut === 1 ? "" : "s"} on, hidden by your filters.`
              : "Nothing on. That's a good sign."}
          </Text>
          {filteredOut > 0 ? (
            <Pressable onPress={() => setHidden([])} hitSlop={8} style={press(styles.emptyTap)}>
              <Text style={styles.emptyAction}>Show everything</Text>
            </Pressable>
          ) : null}
        </View>
      ) : (
        selectedEntries.map((e, i) => (
          <SwipeRow
            // Index keys alone let a row inherit the swipe offset of whatever
            // used to sit at that position once the list shrinks under it.
            // The index stays as the last resort: two identical shifts on one
            // day would otherwise collide.
            key={`${e.kind}:${e.open?.id ?? e.action?.type ?? e.label}:${i}`}
            entry={e}
            avatarUrl={avatarUrlFor(e.whose)}
            avatarName={e.whose ? nameFor(e.whose) : null}
            tint={tintFor(e.whose)}
            onAction={confirmAction}
          />
        ))
      )}

      {selectedEntries.length > 0 && filteredOut > 0 ? (
        <Text style={styles.footnote}>
          {filteredOut} more hidden by your filters.
        </Text>
      ) : null}

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
  container: { flexGrow: 1, padding: t.space(5), paddingTop: t.space(14), paddingBottom: 48 },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: t.space(4),
  },
  backTap: { alignSelf: "flex-start", paddingVertical: t.space(1) },
  back: { ...t.type.label, color: t.accent },
  todayPill: {
    paddingHorizontal: t.space(3),
    paddingVertical: t.space(2),
    borderRadius: t.radius.pill,
    backgroundColor: t.accentSoft,
  },
  todayPillText: { ...t.type.label, color: t.accent },
  monthHeader: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    marginBottom: t.space(4),
  },
  // The year is an eyebrow rather than part of the title. "September 2026" in
  // one line spends the largest type on the half nobody is looking for, and
  // the month name is what you navigate by.
  monthTitleWrap: { gap: 2 },
  monthYear: { ...t.type.eyebrow, color: t.textMuted },
  monthTitle: { ...t.type.display, color: t.textPrimary },
  monthNav: { flexDirection: "row", gap: t.space(2) },
  navButton: {
    width: 38,
    height: 38,
    borderRadius: t.radius.pill,
    backgroundColor: t.surfaceSunken,
    alignItems: "center",
    justifyContent: "center",
  },
  monthArrow: { fontSize: 22, lineHeight: 26, color: t.accent },
  // The grid sits on its own surface. On a cream ground a bare grid of digits
  // reads as a table someone forgot to style; on a card it reads as a
  // calendar.
  gridCard: { ...t.card, padding: t.space(2), paddingBottom: t.space(3) },
  weekHeader: { flexDirection: "row", marginBottom: t.space(1) },
  weekHeading: {
    width: CELL,
    textAlign: "center",
    ...t.type.eyebrow,
    color: t.textMuted,
  },
  // A week at a time rather than forty-two independent cells, because a bar
  // that runs from Friday to Tuesday belongs to the week, not to either day.
  grid: {},
  week: { marginBottom: t.space(2) },
  weekDays: { flexDirection: "row" },
  dayCell: { width: CELL, alignItems: "center", paddingVertical: 2 },
  lane: { flexDirection: "row", height: 17, marginTop: 2 },
  bar: { flex: 1, height: 15, justifyContent: "center", paddingHorizontal: 4 },
  // Smaller than anything else in the app and deliberately so: at t.type
  // sizes a bar fits about one word, which is no better than the dot it
  // replaced. Weight rather than size carries it.
  barText: { fontSize: 10, lineHeight: 13, fontWeight: "700" },
  overflowCell: { flex: 1, alignItems: "center", justifyContent: "center" },
  overflowText: { fontSize: 9, lineHeight: 12, color: t.textMuted, fontWeight: "600" },
  dayPill: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "transparent",
  },
  dayPillToday: { borderColor: t.brand },
  dayPillSelected: { backgroundColor: t.brand, borderColor: t.brand },
  cellDay: { ...t.type.body, color: t.textPrimary, fontVariant: ["tabular-nums"] },
  cellDayOutside: { color: t.textMuted },
  cellDayToday: { color: t.brand, fontWeight: "700" },
  cellDaySelected: { color: t.textOnBrand, fontWeight: "700" },
  filters: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: t.space(2),
    marginTop: t.space(4),
    marginBottom: t.space(7),
  },
  // An off filter is an outline rather than a faded fill: a pale colour at
  // half opacity still reads as a colour, so the two states looked like one
  // colour and a slightly paler version of it.
  filterChip: {
    paddingHorizontal: t.space(3),
    paddingVertical: t.space(2),
    borderRadius: t.radius.pill,
    borderWidth: 1,
    borderColor: t.surfaceSunken,
  },
  filterText: { ...t.type.label, color: t.textMuted },
  dayTitleRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: t.space(3),
    marginBottom: t.space(3),
  },
  dayTitle: { ...t.type.title, color: t.textPrimary, flexShrink: 1 },
  dayTitleAction: { ...t.type.label, color: t.accent, paddingBottom: 2 },
  emptyCard: { backgroundColor: t.surfaceSunken, borderRadius: t.radius.lg, padding: t.space(5) },
  emptyText: { ...t.type.body, color: t.textSecondary },
  emptyTap: { alignSelf: "flex-start", marginTop: t.space(2) },
  emptyAction: { ...t.type.label, color: t.accent },
  entryRow: {
    flexDirection: "row",
    ...t.card,
    padding: t.space(4),
    marginBottom: t.space(2),
    alignItems: "center",
    gap: t.space(3),
  },
  // A wider, fully-rounded bar. At 3px it read as a rendering artefact rather
  // than as the thing that tells you whose event this is.
  entryBar: { width: 4, alignSelf: "stretch", borderRadius: 2, minHeight: 28 },
  bar_plan: { backgroundColor: t.brand },
  bar_keydate: { backgroundColor: t.accent },
  bar_work: { backgroundColor: t.dotWork },
  bar_busy: { backgroundColor: t.dotBusy },
  entryLabel: { ...t.type.heading, color: t.textPrimary },
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
  swipeActionText: { color: t.textOnBrand, ...t.type.label },
  swipeActionTextSoft: { color: t.textSecondary },
  footnote: { ...t.type.caption, color: t.textMuted, marginTop: t.space(2) },
  entryDetail: { ...t.type.caption, color: t.textSecondary, marginTop: 2 },
  entryNote: { ...t.type.caption, color: t.textMuted, marginTop: 4 },
  });
