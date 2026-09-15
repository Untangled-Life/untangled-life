/**
 * Where a to-do sits in the list, and how its date reads.
 *
 * Here rather than in the screen so the date arithmetic can be tested
 * without pulling in the theme context and the native module chain behind
 * it. The suite runs in America/New_York, which is what makes the
 * daylight-saving cases in the tests real rather than theoretical.
 */

export type Bucket = "Overdue" | "Today" | "Tomorrow" | "This Week" | "Someday";

export const BUCKETS: Bucket[] = ["Overdue", "Today", "Tomorrow", "This Week", "Someday"];

/** Today as YYYY-MM-DD in the phone's own zone, which is what a due date is. */
export function isoToday(now: Date = new Date()): string {
  const month = `${now.getMonth() + 1}`.padStart(2, "0");
  const day = `${now.getDate()}`.padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

/**
 * Whole days from today to a due date.
 *
 * Rounded rather than floored, because a day is not always 24 hours: across
 * a daylight-saving boundary the gap is 23 or 25, and flooring turns
 * tomorrow into today on one morning a year -- which is the morning somebody
 * finds a thing they thought they had another day for.
 */
export function daysFromToday(dueDate: string, now: Date = new Date()): number {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  const due = new Date(`${dueDate}T00:00:00`);
  return Math.round((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

export function bucketFor(dueDate: string | null, now: Date = new Date()): Bucket {
  if (!dueDate) return "Someday";

  const days = daysFromToday(dueDate, now);

  // Its own heading rather than folded into Today. Something due on Tuesday
  // is not something to do today: it is something already missed, and it
  // should not be able to hide among today's.
  if (days < 0) return "Overdue";
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days <= 7) return "This Week";
  return "Someday";
}

/** "Fri 19 Sep", or "3 days ago" for something already missed. */
export function dueLabel(dueDate: string, now: Date = new Date()): string {
  const days = daysFromToday(dueDate, now);

  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days === -1) return "Yesterday";
  if (days < 0) return `${Math.abs(days)} days ago`;

  return new Date(`${dueDate}T00:00:00`).toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

/**
 * The order things are drawn in within a heading.
 *
 * By the day they are actually due, with anything undated last: "this week"
 * holding Friday above Tuesday is a list in no order at all.
 */
export function byDueDate(a: { due_date: string | null }, b: { due_date: string | null }): number {
  return (a.due_date ?? "9999-99-99").localeCompare(b.due_date ?? "9999-99-99");
}
