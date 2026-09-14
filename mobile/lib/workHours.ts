import { Interval } from "@/lib/freeTime";
import { zonedTimeToInstant } from "@/lib/timezone";


export type WorkMode = "weekly" | "rotating" | "irregular";

/** weekday: 0 = Sunday .. 6 = Saturday, matching JS getDay(). */
export type PatternShift = {
  week: number;
  weekday: number;
  start: string; // "HH:MM" local wall-clock
  end: string; // "HH:MM"; <= start means it runs past midnight
};

export type WorkPattern = {
  /** The zone the roster was entered in. Null means the device's own. */
  time_zone?: string | null;
  id: string;
  user_id: string;
  mode: WorkMode;
  cycle_weeks: number;
  anchor_date: string; // YYYY-MM-DD
  shifts: PatternShift[];
};

export type WorkShift = {
  id: string;
  user_id: string;
  date: string; // YYYY-MM-DD
  start_time: string | null; // "HH:MM:SS"
  end_time: string | null;
  kind: "extra" | "off";
  /** The zone these hours were entered in. Null means the device's own. */
  time_zone?: string | null;
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * A shift's clock time, turned into a real instant.
 *
 * `timeZone` is the zone the roster was ENTERED in, not the one the phone is
 * currently showing. A 9am start means nine o'clock at work; without an anchor
 * it silently becomes nine o'clock wherever its owner happens to be standing,
 * so flying Sydney to Perth would move every shift three hours and quietly
 * offer your partner time you are actually at work.
 *
 * Null falls back to the device, which is what every row did before this and
 * is correct for anyone who has not travelled.
 *
 * The day arrives as a CALENDAR KEY rather than a Date, and that is the whole
 * point. A Date is an instant, so reading its date in another zone can land on
 * a different day: midnight in Sydney is still the previous afternoon in
 * Perth. "Monday's shift" is a claim about the roster's own calendar, so it
 * has to be handed over as one.
 */
function atShiftTime(dateKey: string, hhmm: string, timeZone: string | null): Date {
  const [h, m] = hhmm.split(":").map(Number);
  const [year, month, date] = dateKey.split("-").map(Number);

  if (!timeZone) {
    const d = new Date(year, month - 1, date);
    d.setHours(h, m ?? 0, 0, 0);
    return d;
  }

  return zonedTimeToInstant(year, month, date, h, m ?? 0, timeZone);
}

function startOfDay(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

/** The calendar day after a YYYY-MM-DD key. */
function nextDateKey(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  return toDateKey(new Date(y, m - 1, d + 1));
}

export function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Which week of the rotation a given day falls in.
 *
 * Counted in whole weeks from the Monday on or before anchor_date, so the
 * rotation doesn't drift when the anchor is set mid-week -- someone entering
 * "my cycle started this Wednesday" means the week containing that Wednesday.
 */
export function cycleWeekFor(day: Date, anchorDate: string, cycleWeeks: number): number {
  if (cycleWeeks <= 1) return 0;

  const anchor = startOfDay(new Date(anchorDate + "T00:00:00"));
  // Shift so Monday is 0 (JS getDay has Sunday as 0).
  const anchorMondayOffset = (anchor.getDay() + 6) % 7;
  const anchorWeekStart = new Date(anchor.getTime() - anchorMondayOffset * MS_PER_DAY);

  const target = startOfDay(day);
  const targetMondayOffset = (target.getDay() + 6) % 7;
  const targetWeekStart = new Date(target.getTime() - targetMondayOffset * MS_PER_DAY);

  const weeksApart = Math.round(
    (targetWeekStart.getTime() - anchorWeekStart.getTime()) / (7 * MS_PER_DAY)
  );

  // JS % keeps the sign of the dividend, which breaks for dates before the
  // anchor. Normalise into [0, cycleWeeks).
  return ((weeksApart % cycleWeeks) + cycleWeeks) % cycleWeeks;
}

/**
 * Expand someone's working hours into real intervals across a date range, so
 * they can be merged with calendar busy time when working out when a couple is
 * free.
 *
 * One-off entries win over the pattern: an 'off' clears that day entirely, and
 * an 'extra' is added on top. That's what lets a mostly-regular roster absorb
 * the weeks it isn't.
 */
/**
 * Where a working-hours interval came from. Deleting one from the calendar
 * means different things: a one-off shift is a row you remove, while an
 * occurrence of a recurring pattern isn't a row at all -- cancelling that day
 * means recording a day off against it.
 */
export type WorkSource = { type: "pattern" } | { type: "shift"; id: string };

export type WorkOccurrence = { interval: Interval; source: WorkSource };

export function expandWorkHours(
  pattern: WorkPattern | null,
  oneOffs: WorkShift[],
  rangeStart: Date,
  rangeEnd: Date
): Interval[] {
  return expandWorkOccurrences(pattern, oneOffs, rangeStart, rangeEnd).map((o) => o.interval);
}

export function expandWorkOccurrences(
  pattern: WorkPattern | null,
  oneOffs: WorkShift[],
  rangeStart: Date,
  rangeEnd: Date
): WorkOccurrence[] {
  const intervals: WorkOccurrence[] = [];

  const offDays = new Set(oneOffs.filter((s) => s.kind === "off").map((s) => s.date));

  if (pattern && pattern.mode !== "irregular" && pattern.shifts.length > 0) {
    const last = startOfDay(rangeEnd);

    // Stepped by CALENDAR day, not by 24 hours. The two are not the same twice
    // a year: adding a fixed day across the autumn transition lands on the
    // same date again, which listed every Sunday shift twice, and across the
    // spring one it drifts an hour forward each time until the last day of the
    // range is stepped clean over and its shifts vanish.
    let day = startOfDay(rangeStart);

    while (day <= last) {
      const thisDay = day;
      const next = new Date(day);
      next.setDate(next.getDate() + 1);
      day = startOfDay(next);

      const dayKey = toDateKey(thisDay);
      if (offDays.has(dayKey)) continue;

      // Mode is the authority, not cycle_weeks. A weekly pattern repeats every
      // week whatever number happens to be stored alongside it -- otherwise a
      // stray cycle length silently turns "every Monday" into "every second
      // Monday", which looks like the roster working rather than a bug.
      const rotating = pattern.mode === "rotating" && pattern.cycle_weeks > 1;
      const week = rotating ? cycleWeekFor(thisDay, pattern.anchor_date, pattern.cycle_weeks) : 0;

      for (const shift of pattern.shifts) {
        if (shift.weekday !== thisDay.getDay()) continue;
        if (rotating && shift.week !== week) continue;

        const zone = pattern.time_zone ?? null;
        const start = atShiftTime(dayKey, shift.start, zone);
        let end = atShiftTime(dayKey, shift.end, zone);

        // A shift ending at or before it starts runs past midnight. Asked for
        // as the next day's clock rather than as start plus twenty-four hours,
        // which is an hour out on the two nights a year the clocks move -- and
        // those are night shifts, so it is exactly the wrong night to be out.
        if (end <= start) end = atShiftTime(nextDateKey(dayKey), shift.end, zone);

        intervals.push({ interval: { start, end }, source: { type: "pattern" } });
      }
    }
  }

  for (const s of oneOffs) {
    if (s.kind !== "extra" || !s.start_time || !s.end_time) continue;

    const zone = s.time_zone ?? null;
    const start = atShiftTime(s.date, s.start_time.slice(0, 5), zone);
    let end = atShiftTime(s.date, s.end_time.slice(0, 5), zone);
    if (end <= start) end = atShiftTime(nextDateKey(s.date), s.end_time.slice(0, 5), zone);

    intervals.push({ interval: { start, end }, source: { type: "shift", id: s.id } });
  }

  return intervals
    .filter((o) => o.interval.end > rangeStart && o.interval.start < rangeEnd)
    .sort((a, b) => a.interval.start.getTime() - b.interval.start.getTime());
}

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function weekdayLabel(weekday: number): string {
  return WEEKDAY_LABELS[weekday] ?? "";
}

export function describePattern(pattern: WorkPattern | null): string {
  if (!pattern || pattern.mode === "irregular" || pattern.shifts.length === 0) {
    return "No regular hours set. Shifts added one at a time.";
  }

  const days = [...new Set(pattern.shifts.map((s) => s.weekday))]
    .sort()
    .map(weekdayLabel)
    .join(", ");

  if (pattern.mode === "rotating" && pattern.cycle_weeks > 1) {
    return `${pattern.cycle_weeks}-week rotation · ${pattern.shifts.length} shifts · ${days}`;
  }

  return `Every week · ${days}`;
}
