import { UpcomingPlan } from "@/lib/plannedEvents";

/**
 * Whether a couple has drifted.
 *
 * Two conditions, and both have to hold. Nothing BOOKED in the next fortnight,
 * and nothing PLANNED in the last fortnight. Either on its own gets it wrong:
 * a couple with a holiday booked for March has an empty next two weeks and
 * does not need telling, and a couple who booked six things on Sunday have a
 * quiet fortnight behind them by definition.
 *
 * The window is deliberately generous. A nudge that arrives while the memory
 * of the last date is still fresh reads as nagging, and an app that nags is
 * one you turn the notifications off for -- which costs every other
 * notification too.
 */
export const NUDGE_AFTER_DAYS = 14;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function shouldNudge(
  upcoming: UpcomingPlan[],
  lastPlannedAt: Date | null,
  now: Date = new Date()
): boolean {
  const horizon = new Date(now.getTime() + NUDGE_AFTER_DAYS * MS_PER_DAY);

  const somethingSoon = upcoming.some((p) => p.occurrenceStart <= horizon);
  if (somethingSoon) return false;

  // Never planned anything at all counts. A couple who has had the app a
  // fortnight and booked nothing is exactly who this is for.
  if (!lastPlannedAt) return true;

  return now.getTime() - lastPlannedAt.getTime() >= NUDGE_AFTER_DAYS * MS_PER_DAY;
}

/**
 * A sensible time to open the date editor at.
 *
 * The next window the two of you are actually free, when there is one. Landing
 * on a time that already works is the difference between "plan a date" being
 * an invitation and being a form.
 */
export function suggestedSlot(
  freeWindows: { start: Date; end: Date }[],
  now: Date = new Date()
): { date: string; start: string } {
  const window = freeWindows.find((w) => w.start > now);

  const at = window ? new Date(window.start) : defaultEvening(now);

  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    date: `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`,
    start: `${pad(at.getHours())}:${pad(at.getMinutes())}`,
  };
}

/** Seven in the evening, tomorrow if tonight has already got away. */
function defaultEvening(now: Date): Date {
  const at = new Date(now);
  at.setHours(19, 0, 0, 0);
  if (at <= now) at.setDate(at.getDate() + 1);
  return at;
}
