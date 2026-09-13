export type Interval = { start: Date; end: Date };

const MIN_FREE_MINUTES = 30;
const DAY_START_HOUR = 7;
const DAY_END_HOUR = 23;
const LOOKAHEAD_DAYS = 7;

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

function freeWindowsForDay(day: Date, busy: Interval[]): Interval[] {
  const dayStart = new Date(day);
  dayStart.setHours(DAY_START_HOUR, 0, 0, 0);
  const dayEnd = new Date(day);
  dayEnd.setHours(DAY_END_HOUR, 0, 0, 0);

  const relevant = mergeIntervals(
    busy
      .filter((b) => b.end > dayStart && b.start < dayEnd)
      .map((b) => ({
        start: b.start < dayStart ? dayStart : b.start,
        end: b.end > dayEnd ? dayEnd : b.end,
      }))
  );

  const free: Interval[] = [];
  let cursor = dayStart;
  for (const b of relevant) {
    if (b.start > cursor) free.push({ start: cursor, end: b.start });
    if (b.end > cursor) cursor = b.end;
  }
  if (cursor < dayEnd) free.push({ start: cursor, end: dayEnd });

  return free.filter((f) => (f.end.getTime() - f.start.getTime()) / 60000 >= MIN_FREE_MINUTES);
}

// Combines both partners' busy time (either one busy = not free together)
// and returns the next few stretches of time you're both actually free,
// within a waking-hours window each day, over the coming week.
export function nextSharedFreeWindows(
  myBusy: Interval[],
  partnerBusy: Interval[],
  maxResults = 5
): Interval[] {
  const combinedBusy = [...myBusy, ...partnerBusy];
  const results: Interval[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let i = 0; i < LOOKAHEAD_DAYS && results.length < maxResults; i++) {
    const day = new Date(today);
    day.setDate(day.getDate() + i);
    const windows = freeWindowsForDay(day, combinedBusy).filter((w) => w.end > new Date());
    results.push(...windows);
  }

  return results.slice(0, maxResults);
}

export function formatWindow(w: Interval): string {
  const dayLabel = w.start.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  const timeFmt: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit" };
  const startLabel = w.start.toLocaleTimeString(undefined, timeFmt);
  const endLabel = w.end.toLocaleTimeString(undefined, timeFmt);
  return `${dayLabel}, ${startLabel} – ${endLabel}`;
}
