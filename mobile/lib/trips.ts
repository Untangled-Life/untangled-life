/**
 * A trip, and the things inside one.
 *
 * The sections are here rather than in the screen so the order, the wording
 * and the sorting can be tested, and so the same names are used by the list
 * of trips and by the trip itself.
 */

export type TripItemKind = "flight" | "stay" | "tour" | "todo" | "food" | "prep" | "note";

export type Trip = {
  id: string;
  title: string;
  destination: string | null;
  start_date: string | null;
  end_date: string | null;
  notes: string | null;
  cover_path: string | null;
};

export type TripItem = {
  id: string;
  trip_id: string;
  kind: TripItemKind;
  title: string;
  detail: string | null;
  at_date: string | null;
  at_time: string | null;
  reference: string | null;
  url: string | null;
  photo_path: string | null;
  booked: boolean;
};

export const SECTIONS: {
  kind: TripItemKind;
  title: string;
  /** What goes here, said once, where an empty section would otherwise say nothing. */
  blurb: string;
  /** The word on the button that adds one. */
  add: string;
}[] = [
  {
    kind: "flight",
    title: "Getting there",
    blurb: "Flights, trains, the hire car. A screenshot is enough until it is booked.",
    add: "Add a flight",
  },
  {
    kind: "stay",
    title: "Where you're staying",
    blurb: "Hotels, the place you found on Airbnb, the friend's spare room.",
    add: "Add a stay",
  },
  {
    kind: "tour",
    title: "Booked and paid for",
    blurb: "Tours, tickets, the table you had to reserve three months out.",
    add: "Add a booking",
  },
  {
    kind: "todo",
    title: "Things to do",
    blurb: "Everything either of you has said you want to do there.",
    add: "Add an idea",
  },
  {
    kind: "food",
    title: "Eating and drinking",
    blurb: "The places somebody told you about, before you forget which they were.",
    add: "Add a place",
  },
  {
    kind: "prep",
    title: "Before you go",
    blurb: "Passports, jabs, the dog, the thing you always forget to pack.",
    add: "Add a reminder",
  },
  {
    kind: "note",
    title: "Notes",
    blurb: "Anything that is none of the above.",
    add: "Add a note",
  },
];

export const SECTION_TITLES: Record<TripItemKind, string> = SECTIONS.reduce(
  (acc, section) => ({ ...acc, [section.kind]: section.title }),
  {} as Record<TripItemKind, string>
);

/**
 * When a trip is, in words.
 *
 * Both dates are optional, because half the trips worth keeping start as
 * "Japan, maybe April" and a form that will not take that is a form people
 * fill in afterwards.
 */
export function tripWhen(trip: Pick<Trip, "start_date" | "end_date">): string {
  const { start_date: start, end_date: end } = trip;

  if (!start && !end) return "No dates yet";

  const show = (iso: string, withYear: boolean) =>
    new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, {
      day: "numeric",
      month: "short",
      ...(withYear ? { year: "numeric" } : {}),
    });

  if (start && !end) return `From ${show(start, true)}`;
  if (!start && end) return `Until ${show(end as string, true)}`;

  const sameYear = start!.slice(0, 4) === end!.slice(0, 4);
  return `${show(start!, !sameYear)} to ${show(end!, true)}`;
}

/** How many nights it covers, or null when it has no dates yet. */
export function tripNights(trip: Pick<Trip, "start_date" | "end_date">): number | null {
  if (!trip.start_date || !trip.end_date) return null;

  const from = new Date(`${trip.start_date}T00:00:00`);
  const to = new Date(`${trip.end_date}T00:00:00`);
  return Math.round((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Whether a trip has been and gone.
 *
 * Only an end date can retire one: an idea is not something you have missed,
 * and neither is a trip somebody has not decided the length of.
 */
export function isPast(trip: Pick<Trip, "start_date" | "end_date">, now: Date = new Date()): boolean {
  // Only an end date retires a trip. "Japan, from 1 April" with no end is
  // somebody who has not decided how long they are going for, and filing
  // that under "been and gone" on the 2nd of April -- while they are on it --
  // is the app being confidently wrong about the best thing in the list.
  if (!trip.end_date) return false;

  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  return new Date(`${trip.end_date}T00:00:00`) < today;
}

/** Soonest first, with undated ones after the dated ones rather than nowhere. */
export function byStartDate(a: Pick<Trip, "start_date">, b: Pick<Trip, "start_date">): number {
  return (a.start_date ?? "9999-99-99").localeCompare(b.start_date ?? "9999-99-99");
}

/**
 * Inside a section: by when it happens, then by what it is called.
 *
 * Anything without a time sits after the things that have one, because a
 * section reads as a running order and an idea with no time is not part of it
 * yet.
 */
export function byWhen(a: TripItem, b: TripItem): number {
  const dateA = a.at_date ?? "9999-99-99";
  const dateB = b.at_date ?? "9999-99-99";
  if (dateA !== dateB) return dateA.localeCompare(dateB);

  const timeA = a.at_time ?? "99:99";
  const timeB = b.at_time ?? "99:99";
  if (timeA !== timeB) return timeA.localeCompare(timeB);

  return a.title.localeCompare(b.title);
}
