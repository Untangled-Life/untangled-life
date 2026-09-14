import { Interval } from "@/lib/freeTime";

/**
 * Laying entries out on a 24-hour day grid.
 *
 * The arithmetic lives here rather than in the screen so the awkward cases --
 * an entry that starts before the day, one that runs past midnight, two that
 * overlap -- can be tested without a device.
 */

export const HOUR_HEIGHT = 56;
export const DAY_HOURS = 24;
export const GRID_HEIGHT = HOUR_HEIGHT * DAY_HOURS;

/** Minimum drawn height, so a 15-minute event is still readable and tappable. */
const MIN_BLOCK_HEIGHT = 22;

export type Placed<T> = {
  item: T;
  top: number;
  height: number;
  /** 0-based position among entries sharing this stretch of the day. */
  column: number;
  /** How many entries share it, so the screen can divide the width. */
  columns: number;
  /** True when the entry began before this day started. */
  startsEarlier: boolean;
  /** True when the entry runs past the end of this day. */
  endsLater: boolean;
};

function startOfDay(day: Date): Date {
  const d = new Date(day);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Minutes from midnight, clamped to the day -- measured on the CLOCK, not by
 * elapsed time.
 *
 * These have to agree with the hour rows, which are drawn at `hour *
 * HOUR_HEIGHT`, and with slotAt, which writes a time back with setMinutes.
 * Both of those are wall-clock. Subtracting timestamps is elapsed time, and on
 * the two days a year the clocks move the two disagree by an hour: every block
 * after the transition draws against the wrong row, and on the autumn day
 * everything from 11pm collapses onto the bottom edge with no height.
 */
function minutesInto(day: Date, at: Date): number {
  const dayStart = startOfDay(day);
  if (at < dayStart) return 0;

  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);
  if (at >= dayEnd) return DAY_HOURS * 60;

  return at.getHours() * 60 + at.getMinutes() + at.getSeconds() / 60;
}

export function offsetFor(day: Date, at: Date): number {
  return (minutesInto(day, at) / 60) * HOUR_HEIGHT;
}

/**
 * Place entries on the grid, giving overlapping ones a column each.
 *
 * The column assignment is deliberately simple: entries are laid out in start
 * order and each takes the first column free at its start time. That reads
 * correctly for the handful of entries a real day holds, and avoids the
 * cascading re-layout a general interval-graph colouring needs.
 */
export function placeOnDay<T>(
  day: Date,
  entries: T[],
  intervalOf: (item: T) => Interval
): Placed<T>[] {
  const dayStart = startOfDay(day);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);

  const touching = entries
    .filter((item) => {
      const { start, end } = intervalOf(item);
      // An entry ending exactly at midnight belongs to the day before, not to
      // this one -- otherwise every all-day event paints a phantom block at
      // the top of the following morning.
      return end > dayStart && start < dayEnd;
    })
    .sort((a, b) => intervalOf(a).start.getTime() - intervalOf(b).start.getTime());

  // Each column holds the end offset of whatever is in it, so a new entry can
  // take the first column it doesn't collide with.
  const columnEnds: number[] = [];
  const placed: Omit<Placed<T>, "columns">[] = [];

  for (const item of touching) {
    const { start, end } = intervalOf(item);

    const top = offsetFor(day, start);
    const rawHeight = offsetFor(day, end) - top;
    const height = Math.max(MIN_BLOCK_HEIGHT, rawHeight);

    let column = columnEnds.findIndex((endsAt) => endsAt <= top);
    if (column === -1) {
      column = columnEnds.length;
      columnEnds.push(0);
    }
    // The drawn height, not the real one, decides overlap -- a 15-minute event
    // padded up to the minimum would otherwise be drawn over the next block.
    columnEnds[column] = top + height;

    placed.push({
      item,
      top,
      height,
      column,
      startsEarlier: start < dayStart,
      endsLater: end > dayEnd,
    });
  }

  // Width is divided by how many columns are in use across the whole day.
  // Per-cluster widths would be tidier, but shifting a block's width as you
  // scroll past an unrelated overlap is more confusing than a narrower column.
  const columns = Math.max(1, columnEnds.length);

  return placed.map((p) => ({ ...p, columns }));
}

export function hourLabel(hour: number): string {
  if (hour === 0) return "12 am";
  if (hour === 12) return "12 pm";
  return hour < 12 ? `${hour} am` : `${hour - 12} pm`;
}

/**
 * The slot a tap at a given vertical offset lands in, rounded down to the
 * half hour. Tapping the top half of the 9am row should offer 9:00, not 9:07.
 */
export function slotAt(day: Date, offset: number): Date {
  const minutes = Math.max(0, Math.min(DAY_HOURS * 60 - 30, (offset / HOUR_HEIGHT) * 60));
  const rounded = Math.floor(minutes / 30) * 30;

  const at = startOfDay(day);
  at.setMinutes(rounded);
  return at;
}
