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
  /**
   * Whether it is actually happening.
   *
   * Set by hand, because nothing here can tell the difference: flights paid
   * for and nothing else is a booked trip, a hotel held on free cancellation
   * is not, and only the two of you know which. It is what moves a trip off
   * the Travel screen and onto Home with a countdown against it.
   */
  booked: boolean;
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
  /** Whole cents, so the sums are exact. Null means no price entered. */
  cost_cents: number | null;
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
    add: "Add Travel",
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

/**
 * Said at the moment of adding, not before it.
 *
 * Most of what goes in a trip before it is booked only exists as a
 * screenshot, and the place to put one is on the row -- which does not exist
 * until the row does. Somebody typing a name into an empty box has no way of
 * knowing that, and "there is nowhere to put the booking email" is the point
 * at which people stop filling a screen in.
 */
export const ADD_HINT = "Screenshots can be uploaded once it\u2019s added in.";

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

/**
 * The one Home should count down to: the soonest booked trip that has not
 * finished. Null when there is nothing to look forward to yet.
 *
 * A trip that has started counts -- being ON one is the best case for
 * showing it -- and only its end retires it, on the same rule as isPast.
 */
export function nextBookedTrip<T extends Trip>(trips: T[], now: Date = new Date()): T | null {
  const candidates = trips
    .filter((trip) => trip.booked && trip.start_date && !isPast(trip, now))
    .sort(byStartDate);

  return candidates[0] ?? null;
}

/**
 * Days until it starts. Zero on the day, negative once you are on it.
 *
 * Whole days from midnight to midnight rather than by dividing the gap,
 * because a day is not always 24 hours and the answer is a number people
 * read on a screen and believe.
 */
export function daysUntilTrip(
  trip: Pick<Trip, "start_date">,
  now: Date = new Date()
): number | null {
  if (!trip.start_date) return null;

  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  const start = new Date(`${trip.start_date}T00:00:00`);
  return Math.round((start.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

/** "In 34 days", "Tomorrow", "You're away". */
export function tripCountdown(
  trip: Pick<Trip, "start_date" | "end_date">,
  now: Date = new Date()
): string {
  const days = daysUntilTrip(trip, now);
  if (days === null) return "No dates yet";

  if (days > 1) return `In ${days} days`;
  if (days === 1) return "Tomorrow";
  if (days === 0) return "Today";

  // Already started. Not a countdown any more, and saying "-3 days" about a
  // holiday somebody is on is the app not paying attention.
  return "You're away";
}

/**
 * Once you are on it, the number that matters is the other end.
 *
 * "In -3 days" is nonsense and "You're away" is something you already know.
 * The question somebody on a trip actually asks the app is when they are
 * home.
 */
export function tripHomecoming(
  trip: Pick<Trip, "end_date">,
  now: Date = new Date()
): string {
  const days = trip.end_date ? daysUntilTrip({ start_date: trip.end_date }, now) : null;

  // Half the trips that matter start as "Japan, maybe April", and plenty of
  // them leave without a date home. Saying "You're away" under a heading that
  // already says it is the app taking up the biggest line on the screen to
  // repeat itself.
  if (days === null || days < 0) return "No date home yet";

  if (days > 1) return `Home in ${days} days`;
  if (days === 1) return "Home tomorrow";
  return "Home today";
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

/**
 * The running total of a trip, in cents.
 *
 * Cents rather than dollars, because adding 19.99 and 0.10 as floats is how a
 * budget ends in 20.089999999. Everything is stored and summed as whole
 * cents and only turned into money for display.
 */
export function tripTotal(items: Pick<TripItem, "cost_cents">[]): number {
  return items.reduce((sum, item) => sum + (item.cost_cents ?? 0), 0);
}

/** Whether anything has a price on it at all, so the total can stay hidden until it means something. */
export function hasAnyCost(items: Pick<TripItem, "cost_cents">[]): boolean {
  return items.some((item) => item.cost_cents != null);
}

/** Cents to "$1,299.00". No currency guessing: the app is Australian and shows dollars. */
export function formatMoney(cents: number): string {
  const dollars = cents / 100;
  return `$${dollars.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * A typed price to cents, or null when it is not a number.
 *
 * Lenient about how people actually type money: a leading dollar sign,
 * thousands commas, and any number of decimal places, of which only the first
 * two count. "$1,299.9" is 129990 cents. Rounded, not truncated, so 0.1 + ...
 * does not quietly lose a cent.
 */
export function parseMoney(input: string): number | null {
  const cleaned = input.replace(/[$,\s]/g, "");
  if (cleaned === "") return null;
  const value = Number(cleaned);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 100);
}
