export type KeyDateKind = "anniversary" | "birthday" | "misc";

export type KeyDateRow = {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD
  recurring: boolean;
  kind: KeyDateKind;
  subject_user_id: string | null;
  /** Days before the date to be reminded. Empty means don't remind me. */
  reminder_days: number[];
  notes: string | null;
  /** Last day of a multi-day date. Null means it's a single day. */
  end_date: string | null;
  /** Show it large at the top of Home. */
  pinned: boolean;
};

export function isTrip(kd: Pick<KeyDateRow, "end_date">): boolean {
  return Boolean(kd.end_date);
}

/**
 * How many nights a trip runs for. A trip that starts and ends on the same day
 * is a day out, not a night away, so this can legitimately be 0.
 */
export function tripNights(kd: Pick<KeyDateRow, "date" | "end_date">): number {
  if (!kd.end_date) return 0;
  const start = new Date(kd.date + "T00:00:00");
  const end = new Date(kd.end_date + "T00:00:00");
  return Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * The countdown line: "47 days to go", "Tomorrow", "Today", or -- once a trip
 * has started -- how much of it is left. A trip that says "0 days to go" on
 * day three of a week in Bali is worse than saying nothing.
 */
export function countdownLabel(kd: Pick<KeyDateRow, "date" | "end_date" | "recurring">): string {
  const days = daysUntil(kd.date, kd.recurring);

  if (days > 1) return `${days} days to go`;
  if (days === 1) return "Tomorrow";
  if (days === 0) return "Today";

  // Only a non-recurring date can be in the past -- daysUntil rolls a
  // recurring one forward to next year.
  if (kd.end_date) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const end = new Date(kd.end_date + "T00:00:00");
    const left = Math.round((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    if (left > 1) return `${left} days left`;
    if (left === 1) return "Last day tomorrow";
    if (left === 0) return "Last day";
  }

  return "Been and gone";
}

/** The reminder offsets offered in the UI, in the order they're shown. */
export const REMINDER_CHOICES = [30, 14, 7, 3, 1, 0] as const;

export const DEFAULT_REMINDER_DAYS = [14, 7, 3];

/** "2 weeks, 1 week and 3 days before" -- or "No reminders". */
export function describeReminders(days: number[]): string {
  if (days.length === 0) return "No reminders";

  const sorted = [...days].sort((a, b) => b - a);
  const labels = sorted.map(reminderLabel);

  const joined =
    labels.length === 1
      ? labels[0]
      : `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;

  // "on the day" already says when it is, so the trailing "before" would
  // contradict it -- "1 week and on the day before" is nonsense.
  return sorted[sorted.length - 1] === 0 ? joined : `${joined} before`;
}

export function reminderLabel(days: number): string {
  if (days === 0) return "on the day";
  if (days === 1) return "1 day";
  if (days === 7) return "1 week";
  if (days === 14) return "2 weeks";
  if (days === 21) return "3 weeks";
  if (days === 30) return "1 month";
  return `${days} days`;
}

/**
 * Anniversary and Misc use their stored title as-is. A birthday is labelled
 * with the name of the person whose birthday it is -- resolved from
 * subject_user_id, so both partners see the same thing. Labelling it "your
 * partner's birthday" relative to the viewer meant one shared row read as a
 * different person's birthday on each phone.
 */
export function displayTitleFor(
  kd: Pick<KeyDateRow, "kind" | "title" | "subject_user_id">,
  nameFor: (userId: string | null) => string
): string {
  if (kd.kind === "birthday") return `${nameFor(kd.subject_user_id)}'s Birthday`;
  return kd.title;
}

export function nextOccurrence(dateStr: string, recurring: boolean): Date {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + "T00:00:00");

  if (recurring) {
    target.setFullYear(today.getFullYear());
    if (target < today) {
      target.setFullYear(today.getFullYear() + 1);
    }
  }

  return target;
}

export function daysUntil(dateStr: string, recurring: boolean): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = nextOccurrence(dateStr, recurring);
  return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}
