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
};

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
