/**
 * A date that has happened is not finished.
 *
 * Asked once, quietly, and never asked again. Nothing else in this category
 * does it, and it is the one feature here that gets better the longer a couple
 * uses the app: after a year it knows what the two of you actually enjoyed,
 * which is a far better answer to "what should we do" than any list.
 */
export type Verdict = "loved" | "good" | "not_again";

export const VERDICTS: { key: Verdict; label: string }[] = [
  { key: "loved", label: "Loved it" },
  { key: "good", label: "It was good" },
  { key: "not_again", label: "Not again" },
];

export type AwaitingReview = {
  planned_event_id: string;
  title: string;
  start_at: string;
  end_at: string;
};

export type LovedDate = {
  planned_event_id: string;
  title: string;
  last_at: string;
};

/** "Three months ago", for a do-it-again suggestion. */
export function howLongAgo(iso: string, now: Date = new Date()): string {
  const days = Math.floor((now.getTime() - new Date(iso).getTime()) / (24 * 60 * 60 * 1000));

  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.round(days / 7)} weeks ago`;
  if (days < 365) return `${Math.round(days / 30)} months ago`;

  const years = Math.round(days / 365);
  return years === 1 ? "about a year ago" : `about ${years} years ago`;
}
