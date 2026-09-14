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

/**
 * A guard against a bad rule turning one event into an unbounded loop.
 *
 * It is a budget for occurrences INSIDE the range being asked about, not for
 * the whole history of the event. Counting from the very first occurrence
 * instead meant a weekly dinner quietly stopped appearing after about seven
 * and a half years, and every month view cost a little more than the last.
 */
const MAX_OCCURRENCES = 400;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * How many whole steps fit between two dates, less one.
 *
 * Used to skip the years of occurrences nobody asked about. It deliberately
 * lands a step EARLY -- calendar arithmetic is not uniform (a week is not
 * always 168 hours once the clocks move, and months vary), so the estimate is
 * a floor and the loop walks the last stretch properly.
 *
 * The walk still steps from the ORIGINAL date with a multiplier rather than
 * from the previous occurrence, so monthly clamping stays correct: the 31st is
 * remembered as the 31st through February rather than becoming the 28th
 * forever.
 */
function stepsBefore(from: Date, target: Date, every: RepeatEvery): number {
  if (target <= from) return 0;

  if (every === "week" || every === "fortnight") {
    const days = (target.getTime() - from.getTime()) / MS_PER_DAY;
    return Math.max(0, Math.floor(days / (every === "week" ? 7 : 14)) - 1);
  }

  if (every === "month") {
    const months =
      (target.getFullYear() - from.getFullYear()) * 12 + (target.getMonth() - from.getMonth());
    return Math.max(0, months - 1);
  }

  return 0;
}

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

  // Jump to just before the first occurrence that could overlap the range. An
  // occurrence is wanted when its END is after rangeStart, so the target to
  // skip past is rangeStart less the event's own length.
  let i = stepsBefore(event.start, new Date(rangeStart.getTime() - duration), event.repeatEvery);
  let start = addStep(event.start, event.repeatEvery, i);

  for (let drawn = 0; drawn < MAX_OCCURRENCES; drawn++, i++) {
    // Half-open at the top, matching the non-repeating case above. Including
    // an occurrence that starts exactly at rangeEnd puts a midnight event on
    // both the day it belongs to and the day before.
    if (start >= rangeEnd) break;

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
