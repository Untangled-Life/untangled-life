/**
 * Which days an event actually covers.
 *
 * Lives here rather than in the calendar screen so the midnight edge case can
 * be tested without pulling in the theme context and the native module chain
 * behind it.
 */

/**
 * The last day an event touches.
 *
 * An event ending at exactly midnight ends at the START of the next day, so
 * using its end date directly paints an extra day onto every event that runs
 * to midnight -- which is every all-day event, whose end is midnight by
 * definition. A one-day "Annual leave" would show as two.
 */
export function lastCoveredDay(event: { start: Date; end: Date }): Date {
  const end = new Date(event.end);

  if (end.getHours() === 0 && end.getMinutes() === 0 && end.getSeconds() === 0) {
    end.setDate(end.getDate() - 1);
  }

  // A zero-length event, or one whose end is before its start, still covers
  // the day it starts on.
  return end < event.start ? new Date(event.start) : end;
}

/** Each day an event touches, clipped to a range (typically the month on screen). */
export function daysCovered(
  event: { start: Date; end: Date },
  from: Date,
  to: Date
): Date[] {
  const days: Date[] = [];

  const cursor = new Date(event.start);
  cursor.setHours(0, 0, 0, 0);
  const last = lastCoveredDay(event);

  // Start at the range rather than at the event, when the event began before
  // it. The guard below is a fixed number of steps, so an event that started
  // long ago used to spend all of them walking through days nobody asked
  // about and run out before reaching the ones they did -- which drew a bar
  // across a month whose day list said there was nothing on.
  const begin = new Date(from);
  begin.setHours(0, 0, 0, 0);
  if (cursor < begin) cursor.setTime(begin.getTime());

  // The guard is against a bad row -- an end far in the future -- turning one
  // event into an unbounded loop. A year is far more than any month view needs.
  for (let i = 0; i <= 366 && cursor <= last; i++) {
    if (cursor >= from && cursor <= to) days.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  return days;
}
