import { KeyDateRow, daysUntil, displayTitleFor } from "@/lib/keyDates";
import { OnboardingStep } from "@/lib/onboarding";
import { UpcomingPlan } from "@/lib/plannedEvents";

/**
 * Everything the app is waiting on you for, in one place.
 *
 * Before this, each thing had its own card on Home competing for the same
 * space, and anything skipped had nowhere to live at all. A bell that holds
 * all of it means Home can go back to being about what is coming up rather
 * than about what the app wants.
 *
 * Ordered by what it costs to ignore, not by type: a birthday tomorrow beats
 * an unfinished setup step, every time.
 */
export type InboxItemKind = "setup" | "keyDate" | "nudge" | "proposal" | "review";

export type InboxItem = {
  id: string;
  kind: InboxItemKind;
  title: string;
  detail: string;
  /** Where tapping it goes. Null for something answered where it sits. */
  route: string | null;
  /** Lower sorts first. */
  urgency: number;
  /** Set on a proposal, so the bell can offer its options inline. */
  proposalId?: string;
  /** Set on a how-was-it, so the bell can take the answer inline. */
  reviewEventId?: string;
};

export function buildInbox(input: {
  outstanding: OnboardingStep[];
  keyDates: KeyDateRow[];
  plans: UpcomingPlan[];
  nudging: boolean;
  nameFor: (userId: string | null) => string;
  /** Open proposals waiting on THIS person, not the ones they sent. */
  proposalsForYou?: { id: string; title: string; options: unknown[]; proposed_by: string }[];
  /** The one date that has happened and not been asked about. */
  awaitingReview?: { planned_event_id: string; title: string; end_at: string } | null;
}): InboxItem[] {
  const items: InboxItem[] = [];

  // Top of the list, above a birthday tomorrow. Somebody asked you a question
  // and is waiting on the answer, and the cost of ignoring it is that they
  // think you did not care rather than that you forgot a date.
  for (const p of input.proposalsForYou ?? []) {
    items.push({
      id: `proposal:${p.id}`,
      kind: "proposal",
      title: p.title,
      detail: `${input.nameFor(p.proposed_by)} suggested ${
        p.options.length === 1 ? "a time" : `${p.options.length} times`
      }`,
      route: null,
      urgency: -1,
      proposalId: p.id,
    });
  }

  // A key date inside its own reminder window. Not every key date -- one 300
  // days out is not news, and a bell that is always lit is a bell nobody
  // reads.
  for (const kd of input.keyDates) {
    const days = daysUntil(kd.date, kd.recurring);
    if (days < 0) continue;

    const soonest = Math.max(...(kd.reminder_days.length > 0 ? kd.reminder_days : [7]));
    if (days > soonest) continue;
    if (kd.reminders_on === false) continue;

    items.push({
      id: `keyDate:${kd.id}`,
      kind: "keyDate",
      title: displayTitleFor(kd, input.nameFor),
      detail:
        days === 0 ? "Today" : days === 1 ? "Tomorrow" : `In ${days} days`,
      route: "/key-dates",
      // Sorted by how close it is, so tomorrow's birthday is at the top.
      urgency: days,
    });
  }

  // Below a proposal, above everything that is not a question somebody asked
  // you. It is a nice thing to answer rather than a thing you owe.
  if (input.awaitingReview) {
    items.push({
      id: `review:${input.awaitingReview.planned_event_id}`,
      kind: "review",
      title: `How was ${input.awaitingReview.title}?`,
      detail: "Asked once, never again",
      route: null,
      urgency: 800,
      reviewEventId: input.awaitingReview.planned_event_id,
    });
  }

  if (input.nudging) {
    items.push({
      id: "nudge:date",
      kind: "nudge",
      title: "It has been a while since you had a date",
      detail: "Nothing booked in the next fortnight",
      route: "/",
      // Above setup, below anything with a date attached to it.
      urgency: 900,
    });
  }

  for (const step of input.outstanding) {
    items.push({
      id: `setup:${step.key}`,
      kind: "setup",
      title: step.title,
      detail: step.blurb,
      route: "/welcome",
      urgency: 1000,
    });
  }

  return items.sort((a, b) => a.urgency - b.urgency);
}

/**
 * What the badge shows.
 *
 * Capped, because past about nine the number stops being information and
 * starts being a reproach.
 */
export function badgeLabel(count: number): string | null {
  if (count <= 0) return null;
  return count > 9 ? "9+" : String(count);
}
