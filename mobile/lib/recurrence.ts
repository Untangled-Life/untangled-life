import { Interval } from "@/lib/freeTime";

/**
 * Events that repeat.
 *
 * The rule is stored on the event and occurrences are worked out when they are
 * needed, rather than writing a row per occurrence. Materialising them means
 * choosing how far ahead to write, rewriting the lot when someone moves the
 * time, and a table that grows forever to express one sentence.
 */
export type RepeatEvery = "none" | "week" | "fortnight" | "month";

export const REPEAT_OPTIONS: { key: RepeatEvery; label: string; blurb: string }[] = [
  { key: "none", label: "Once", blurb: "Just this one time" },
  { key: "week", label: "Weekly", blurb: "Same day, every week" },
  { key: "fortnight", label: "Fortnightly", blurb: "Same day, every second week" },
  { key: "month", label: "Monthly", blurb: "Same date each month" },
];

export function repeatLabel(every: RepeatEvery): string {
  return REPEAT_OPTIONS.find((o) => o.key === every)?.label ?? "Once";
}

/**
 * Add one step of a repeat to a date, keeping the clock time.
 *
 * Monthly is the awkward one. The 31st has no equivalent in September, and
 * JavaScript's answer is to roll into October -- so a monthly dinner on the
 * 31st would appear on the 1st of the following month half the year. Clamping
 * to the last day of the shorter month is what calendars do and what people
 * mean.
 */
export function addStep(from: Date, every: RepeatEvery, steps = 1): Date {
  const next = new Date(from);

  if (every === "week") next.setDate(next.getDate() + 7 * steps);
  else if (every === "fortnight") next.setDate(next.getDate() + 14 * steps);
  else if (every === "month") {
    const day = next.getDate();
    // Move on the 1st so the month arithmetic cannot overflow, then put the
    // day back, clamped to what that month actually has.
    next.setDate(1);
    next.setMonth(next.getMonth() + steps);
    const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
    next.setDate(Math.min(day, lastDay));
  }

  return next;
}

/** A guard against a bad rule turning one event into an unbounded loop. */
const MAX_OCCURRENCES = 400;

/**
 * Every occurrence of an event that falls inside a range.
 *
 * The first occurrence is the event itself. Each later one keeps the same
 * duration, so moving a weekly dinner from an hour to two moves every one of
 * them -- which is what a repeating event means.
 */
export function occurrencesBetween(
  event: { start: Date; end: Date; repeatEvery: RepeatEvery; repeatUntil: Date | null },
  rangeStart: Date,
  rangeEnd: Date
): Interval[] {
  const duration = event.end.getTime() - event.start.getTime();

  if (event.repeatEvery === "none") {
    return event.end > rangeStart && event.start < rangeEnd
      ? [{ start: new Date(event.start), end: new Date(event.end) }]
      : [];
  }

  const out: Interval[] = [];

  // Walking from the first occurrence rather than jumping straight to the
  // range keeps monthly clamping correct: the 31st has to be remembered as the
  // 31st, so stepping through February and back out to March gives the 31st
  // again rather than the 28th forever.
  let start = new Date(event.start);

  for (let i = 0; i < MAX_OCCURRENCES; i++) {
    if (start > rangeEnd) break;

    // repeatUntil is a day, so an occurrence starting anywhere on that day
    // still counts -- "until the 30th" includes the 30th.
    if (event.repeatUntil) {
      const lastMoment = new Date(event.repeatUntil);
      lastMoment.setHours(23, 59, 59, 999);
      if (start > lastMoment) break;
    }

    const end = new Date(start.getTime() + duration);
    if (end > rangeStart) out.push({ start: new Date(start), end });

    start = addStep(event.start, event.repeatEvery, i + 1);
  }

  return out;
}

/** "Weekly until 3 December", or just "Weekly". Null when it does not repeat. */
export function describeRepeat(
  every: RepeatEvery,
  until: Date | null,
  formatDate: (d: Date) => string
): string | null {
  if (every === "none") return null;
  const label = repeatLabel(every);
  return until ? `${label}, until ${formatDate(until)}` : label;
}
