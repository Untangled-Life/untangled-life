/**
 * Laying a month out as bars rather than dots.
 *
 * A dot tells you something is on. A bar tells you what, whose, and how long,
 * which is the difference between a calendar you check and one you read. The
 * cost is that it stops being a grid of independent cells: a trip from Friday
 * to Tuesday is ONE thing that crosses a week boundary, and drawing it as five
 * separate chips is how you end up with a month view nobody trusts.
 *
 * So the unit is the week, not the day. Each week is a set of lanes, and an
 * event occupies a horizontal span of columns in one of them. An event longer
 * than the week is clipped at both ends and marked as continuing, so the bar
 * can lose its rounded corner on the side where it carries on.
 */

export type MonthEventKind = "plan" | "keydate" | "work" | "busy" | "trip";

export type MonthEvent = {
  id: string;
  title: string;
  /** First day it covers. Time of day is ignored: this is a grid of days. */
  start: Date;
  /** LAST day it covers, inclusive. Not the exclusive end. */
  end: Date;
  kind: MonthEventKind;
  /** Whose it is. Null means the couple's. */
  whose: string | null;
};

export type Chip = {
  event: MonthEvent;
  /** Column 0 to 6 within this week, Monday first. */
  col: number;
  /** How many columns it covers in THIS week, at least 1. */
  span: number;
  /** It started before this week, so the bar should run off the left edge. */
  continuesLeft: boolean;
  /** It carries on after this week. */
  continuesRight: boolean;
};

export type WeekLanes = {
  /** The seven days, Monday first. */
  days: Date[];
  /** Lanes top to bottom; each holds non-overlapping chips left to right. */
  lanes: Chip[][];
  /** Per column, how many events did not fit. Zero where everything did. */
  overflow: number[];
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function atMidnight(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

/**
 * Whole days between two dates.
 *
 * Counted from local midnights rather than by dividing the millisecond gap,
 * because a day is not always 24 hours. Across a daylight-saving boundary the
 * naive version is off by an hour, which floors to the wrong day and shifts
 * every bar in that week by a column.
 */
export function daysBetween(from: Date, to: Date): number {
  const a = atMidnight(from);
  const b = atMidnight(to);
  return Math.round((b.getTime() - a.getTime()) / MS_PER_DAY);
}

/**
 * The order bars are placed in, which is the order they end up stacked.
 *
 * Longest first, so a week away sits above the appointments inside it. That
 * is not a tidiness preference: a long bar broken across lanes by a short one
 * placed first reads as two separate trips.
 *
 * Then earliest, then by id, so the same month always draws the same way.
 * Without the last tiebreak the lanes reshuffle whenever the query returns
 * rows in a different order, and the calendar appears to twitch on every
 * refresh.
 */
function placementOrder(a: MonthEvent, b: MonthEvent): number {
  const lengthA = daysBetween(a.start, a.end);
  const lengthB = daysBetween(b.start, b.end);
  if (lengthA !== lengthB) return lengthB - lengthA;

  const startA = atMidnight(a.start).getTime();
  const startB = atMidnight(b.start).getTime();
  if (startA !== startB) return startA - startB;

  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * One week's worth of bars.
 *
 * `maxLanes` is a promise about height rather than about content: anything
 * that does not fit is counted per day so the cell can say "+2 more". A month
 * view whose rows grow without limit is one where a busy fortnight pushes the
 * rest of the month off the screen, which is exactly what it exists to show.
 */
export function packWeek(weekStart: Date, events: MonthEvent[], maxLanes = 4): WeekLanes {
  const start = atMidnight(weekStart);

  const days: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const day = new Date(start);
    day.setDate(day.getDate() + i);
    days.push(atMidnight(day));
  }

  const weekEnd = days[6];

  const lanes: Chip[][] = [];
  const overflow = [0, 0, 0, 0, 0, 0, 0];

  // Which columns each lane has already spoken for.
  const taken: boolean[][] = [];

  const sorted = [...events].sort(placementOrder);

  for (const event of sorted) {
    const first = atMidnight(event.start);
    // An end before its start is a bad row rather than a zero-length event.
    // Treating it as one day keeps it visible instead of silently dropping it.
    const last = atMidnight(event.end) < first ? first : atMidnight(event.end);

    if (last < start || first > weekEnd) continue;

    const col = Math.max(0, daysBetween(start, first));
    const endCol = Math.min(6, daysBetween(start, last));
    const span = endCol - col + 1;

    const chip: Chip = {
      event,
      col,
      span,
      continuesLeft: first < start,
      continuesRight: last > weekEnd,
    };

    let placed = false;

    for (let lane = 0; lane < maxLanes; lane++) {
      if (!taken[lane]) {
        taken[lane] = [false, false, false, false, false, false, false];
        lanes[lane] = [];
      }

      let free = true;
      for (let c = col; c <= endCol; c++) {
        if (taken[lane][c]) {
          free = false;
          break;
        }
      }

      if (!free) continue;

      for (let c = col; c <= endCol; c++) taken[lane][c] = true;
      lanes[lane].push(chip);
      placed = true;
      break;
    }

    if (!placed) {
      // Counted on every day it would have covered, so a day hidden by a long
      // bar still says there is more to see.
      for (let c = col; c <= endCol; c++) overflow[c] += 1;
    }
  }

  // Placement order is longest-first, which is about which lane a bar lands
  // in. Within a lane the chips have to come out left to right, because that
  // is how they are DRAWN: a renderer walking the lane and emitting a gap
  // before each chip has no way to go backwards, so one chip out of order
  // throws every bar in that lane into the wrong column.
  //
  // Lanes are filled in order, so a trailing empty one only happens when
  // nothing was placed at all.
  return {
    days,
    lanes: lanes.filter((l) => l && l.length > 0).map((l) => [...l].sort((a, b) => a.col - b.col)),
    overflow,
  };
}

/**
 * The Mondays a month view has to draw.
 *
 * Includes the trailing days of the previous month and the leading days of the
 * next, because a week is seven days and a bar that runs into October has to
 * have somewhere to end.
 */
export function weeksOfMonth(month: Date): Date[] {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);

  // Monday first. JS puts Sunday at 0, which is the wrong end.
  const back = (first.getDay() + 6) % 7;
  const cursor = new Date(first);
  cursor.setDate(cursor.getDate() - back);

  const lastOfMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0);

  const weeks: Date[] = [];
  // Six is the most any month can need, and the guard stops a bad month value
  // turning this into an unbounded loop.
  for (let i = 0; i < 6; i++) {
    weeks.push(atMidnight(new Date(cursor)));
    cursor.setDate(cursor.getDate() + 7);
    if (cursor > lastOfMonth) break;
  }

  return weeks;
}

/** Whether a day belongs to the month being shown, as opposed to its edges. */
export function inMonth(day: Date, month: Date): boolean {
  return day.getMonth() === month.getMonth() && day.getFullYear() === month.getFullYear();
}
