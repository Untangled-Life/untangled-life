import { dateKeyInZone, localZone, zonedTimeToInstant } from "@/lib/timezone";

export type Interval = { start: Date; end: Date };

const LOOKAHEAD_DAYS = 7;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * What counts as time you're free.
 *
 * These used to be constants, which meant the app assumed office hours for
 * everybody -- including the shift workers it's most useful to. Someone
 * finishing nights at 7am shouldn't lose their one free morning to a hard-coded
 * number.
 */
export type FreeTimePrefs = {
  dayStartHour: number;
  dayEndHour: number;
  minFreeMinutes: number;
};

export const DEFAULT_FREE_TIME_PREFS: FreeTimePrefs = {
  dayStartHour: 7,
  dayEndHour: 23,
  minFreeMinutes: 30,
};

export function mergeIntervals(intervals: Interval[]): Interval[] {
  if (intervals.length === 0) return [];
  const sorted = [...intervals].sort((a, b) => a.start.getTime() - b.start.getTime());
  const merged: Interval[] = [{ ...sorted[0] }];

  for (const cur of sorted.slice(1)) {
    const last = merged[merged.length - 1];
    if (cur.start.getTime() <= last.end.getTime()) {
      if (cur.end.getTime() > last.end.getTime()) last.end = cur.end;
    } else {
      merged.push({ ...cur });
    }
  }

  return merged;
}

/** Everything in `from` that is not covered by `minus`. */
export function subtractIntervals(from: Interval[], minus: Interval[]): Interval[] {
  const blocked = mergeIntervals(minus);
  let remaining = from.map((i) => ({ ...i }));

  for (const block of blocked) {
    const next: Interval[] = [];

    for (const piece of remaining) {
      if (block.end <= piece.start || block.start >= piece.end) {
        next.push(piece);
        continue;
      }
      if (block.start > piece.start) next.push({ start: piece.start, end: block.start });
      if (block.end < piece.end) next.push({ start: block.end, end: piece.end });
    }

    remaining = next;
  }

  return remaining;
}

/** The stretches covered by both lists. */
export function intersectIntervals(a: Interval[], b: Interval[]): Interval[] {
  const left = mergeIntervals(a);
  const right = mergeIntervals(b);
  const out: Interval[] = [];

  for (const x of left) {
    for (const y of right) {
      const start = x.start > y.start ? x.start : y.start;
      const end = x.end < y.end ? x.end : y.end;
      if (start < end) out.push({ start, end });
    }
  }

  return mergeIntervals(out);
}

// Round up to the next quarter hour, so today's remaining window starts at a
// time worth reading ("6:45 pm") rather than whenever the query happened to run.
function nextQuarterHour(from: Date): Date {
  const rounded = new Date(from);
  rounded.setSeconds(0, 0);
  rounded.setMinutes(Math.ceil(rounded.getMinutes() / 15) * 15);
  return rounded;
}

/**
 * The hours one person counts as being up and about, across a range.
 *
 * Built in THAT PERSON'S zone. "Our evening is 7pm to 11pm" means each of you
 * in your own evening; in the same place this is identical to what it always
 * was, and apart it is the only sensible reading.
 */
export function awakeIntervals(
  rangeStart: Date,
  rangeEnd: Date,
  prefs: FreeTimePrefs,
  timeZone: string
): Interval[] {
  const out: Interval[] = [];

  // Start a day early, so a window that began the evening before the range
  // still contributes its tail.
  const cursor = new Date(rangeStart);
  cursor.setDate(cursor.getDate() - 1);

  // Driven by the range asked for rather than a fixed count, so this answers
  // the question it was given. A hard-coded length silently truncates the
  // moment anything asks about a longer stretch, and truncation here reads as
  // "you are never free again" rather than as a bug.
  const days = Math.ceil((rangeEnd.getTime() - rangeStart.getTime()) / MS_PER_DAY) + 2;

  for (let i = 0; i < days; i++) {
    const [year, month, day] = dateKeyInZone(cursor, timeZone).split("-").map(Number);

    const start = zonedTimeToInstant(year, month, day, prefs.dayStartHour, 0, timeZone);

    // An end hour of 24 is midnight at the END of the day. So is an end hour
    // at or before the start: someone on nights whose day runs 10pm to 6am
    // means tomorrow morning, not a window that finishes sixteen hours before
    // it opens. Both are the next day's clock.
    const endHour = prefs.dayEndHour >= 24 ? 0 : prefs.dayEndHour;
    const endsNextDay = prefs.dayEndHour >= 24 || prefs.dayEndHour <= prefs.dayStartHour;

    const end = endsNextDay
      ? zonedTimeToInstant(year, month, day + 1, endHour, 0, timeZone)
      : zonedTimeToInstant(year, month, day, endHour, 0, timeZone);

    if (end > rangeStart && start < rangeEnd) {
      out.push({
        start: start < rangeStart ? rangeStart : start,
        end: end > rangeEnd ? rangeEnd : end,
      });
    }

    cursor.setDate(cursor.getDate() + 1);
  }

  return mergeIntervals(out);
}

/**
 * The next few stretches you are both free.
 *
 * Computed as an intersection of absolute instants rather than day by day: the
 * hours each of you counts as being up, overlapped, with everything either of
 * you is busy with taken out. Same answer as before when you are in one place,
 * and the only correct one when you are not -- a day-by-day loop has to pick
 * whose day it is looping over, and there is no right choice.
 */
export function nextSharedFreeWindows(
  myBusy: Interval[],
  partnerBusy: Interval[],
  prefs: FreeTimePrefs = DEFAULT_FREE_TIME_PREFS,
  // Defaulting to UTC here would quietly move everybody's evening: the caller
  // that forgets to pass a zone is the common case, not the exotic one.
  zones: { mine: string; theirs: string | null } = { mine: localZone(), theirs: null },
  maxResults = 5
): Interval[] {
  const now = new Date();
  const rangeStart = nextQuarterHour(now);

  // Midnight at the far end rather than 23:59:59.999. The old bound clamped
  // any window running to the end of the last day to "11:59 pm", which is a
  // time nobody chose and reads as a made-up deadline.
  const rangeEnd = new Date(now);
  rangeEnd.setDate(rangeEnd.getDate() + LOOKAHEAD_DAYS);
  rangeEnd.setHours(0, 0, 0, 0);

  if (rangeEnd <= rangeStart) return [];

  const myAwake = awakeIntervals(rangeStart, rangeEnd, prefs, zones.mine);

  // No partner zone recorded yet means they are almost certainly beside you.
  // Reusing your own window is a better guess than assuming UTC.
  const theirAwake = zones.theirs
    ? awakeIntervals(rangeStart, rangeEnd, prefs, zones.theirs)
    : myAwake;

  const bothAwake = intersectIntervals(myAwake, theirAwake);
  const free = subtractIntervals(bothAwake, [...myBusy, ...partnerBusy]);

  return free
    .filter((w) => (w.end.getTime() - w.start.getTime()) / 60000 >= prefs.minFreeMinutes)
    .slice(0, maxResults);
}

export function formatWindow(w: Interval): string {
  const dayLabel = w.start.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  const timeFmt: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit" };
  const startLabel = w.start.toLocaleTimeString(undefined, timeFmt);
  const endLabel = w.end.toLocaleTimeString(undefined, timeFmt);
  return `${dayLabel}, ${startLabel} – ${endLabel}`;
}
