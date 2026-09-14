import { Interval } from "@/lib/freeTime";

export type WorkMode = "weekly" | "rotating" | "irregular";

/** weekday: 0 = Sunday .. 6 = Saturday, matching JS getDay(). */
export type PatternShift = {
  week: number;
  weekday: number;
  start: string; // "HH:MM" local wall-clock
  end: string; // "HH:MM"; <= start means it runs past midnight
};

export type WorkPattern = {
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
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function atLocalTime(day: Date, hhmm: string): Date {
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date(day);
  d.setHours(h, m ?? 0, 0, 0);
  return d;
}

function startOfDay(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
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
    const cursor = startOfDay(rangeStart);
    const last = startOfDay(rangeEnd);

    for (let day = cursor; day <= last; day = new Date(day.getTime() + MS_PER_DAY)) {
      if (offDays.has(toDateKey(day))) continue;

      // Mode is the authority, not cycle_weeks. A weekly pattern repeats every
      // week whatever number happens to be stored alongside it -- otherwise a
      // stray cycle length silently turns "every Monday" into "every second
      // Monday", which looks like the roster working rather than a bug.
      const rotating = pattern.mode === "rotating" && pattern.cycle_weeks > 1;
      const week = rotating ? cycleWeekFor(day, pattern.anchor_date, pattern.cycle_weeks) : 0;

      for (const shift of pattern.shifts) {
        if (shift.weekday !== day.getDay()) continue;
        if (rotating && shift.week !== week) continue;

        const start = atLocalTime(day, shift.start);
        let end = atLocalTime(day, shift.end);
        // A shift ending at or before it starts runs past midnight.
        if (end <= start) end = new Date(end.getTime() + MS_PER_DAY);

        intervals.push({ interval: { start, end }, source: { type: "pattern" } });
      }
    }
  }

  for (const s of oneOffs) {
    if (s.kind !== "extra" || !s.start_time || !s.end_time) continue;

    const day = new Date(s.date + "T00:00:00");
    const start = atLocalTime(day, s.start_time.slice(0, 5));
    let end = atLocalTime(day, s.end_time.slice(0, 5));
    if (end <= start) end = new Date(end.getTime() + MS_PER_DAY);

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
