export type KeyDateKind = "anniversary" | "birthday" | "misc";

export type KeyDateRow = {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD
  recurring: boolean;
  kind: KeyDateKind;
};

// Anniversary/Misc use their stored title as-is; Birthday is always shown
// with the partner's current name so it never goes stale if re-paired.
export function displayTitleFor(kd: Pick<KeyDateRow, "kind" | "title">, partnerName: string): string {
  if (kd.kind === "birthday") return `${partnerName}'s Birthday`;
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
