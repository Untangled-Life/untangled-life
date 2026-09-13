export type KeyDateKind = "anniversary" | "birthday" | "misc";

export type KeyDateRow = {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD
  recurring: boolean;
  kind: KeyDateKind;
  subject_user_id: string | null;
};

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
