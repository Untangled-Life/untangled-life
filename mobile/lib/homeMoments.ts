/**
 * The two things Home can say that no other screen can, because they depend
 * on today's date rather than on a list.
 *
 * "On this day" -- a key date or a date you both loved whose anniversary is
 * today. This is the one thing in the app that gets better the longer a couple
 * uses it, and it costs nothing but reading the dates already loaded.
 *
 * "Gift hint" -- the partner's birthday is close, so their own wishlist
 * surfaces where the other one will see it, well before the night before.
 *
 * Both are pure, so they are tested rather than trusted, and neither reaches
 * for the network: Home already has what they need.
 */

/** An ISO timestamp to its LOCAL YYYY-MM-DD, so a memory lands on the day the couple lived it. */
function localDayOf(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** A date, as YYYY-MM-DD, with the year ignored: same month and day as today. */
function isSameDayOfYear(dateStr: string, now: Date): boolean {
  const [, m, d] = dateStr.split("-").map((n) => parseInt(n, 10));
  return m === now.getMonth() + 1 && d === now.getDate();
}

/** Whole years between a past date and today, both at midnight. */
export function yearsSince(dateStr: string, now: Date = new Date()): number {
  const then = new Date(dateStr + "T00:00:00");
  let years = now.getFullYear() - then.getFullYear();
  // Not had this year's anniversary yet? One fewer.
  const beforeAnniversary =
    now.getMonth() < then.getMonth() ||
    (now.getMonth() === then.getMonth() && now.getDate() < then.getDate());
  if (beforeAnniversary) years -= 1;
  return years;
}

export type OnThisDay = {
  kind: "keydate" | "loved";
  title: string;
  years: number;
  /** Where tapping it goes. */
  href: string;
};

export type KeyDateLike = {
  title: string;
  date: string;
  end_date: string | null;
  recurring: boolean;
};

export type LovedLike = {
  planned_event_id: string;
  title: string;
  last_at: string; // ISO
};

/**
 * What happened on this day in another year.
 *
 * A recurring key date's own day is its countdown's job, not a memory, so
 * only a NON-recurring one echoes here: the day you moved in, the trip you
 * took, the concert. And a loved date from a past year. Anything from this
 * year is not a memory yet, so it needs at least one year behind it.
 */
export function onThisDay(
  keyDates: KeyDateLike[],
  loved: LovedLike[],
  now: Date = new Date()
): OnThisDay | null {
  for (const kd of keyDates) {
    if (kd.recurring) continue;
    if (!isSameDayOfYear(kd.date, now)) continue;
    const years = yearsSince(kd.date, now);
    if (years < 1) continue;
    return { kind: "keydate", title: kd.title, years, href: "/key-dates" };
  }

  for (const date of loved) {
    // The LOCAL calendar day the date happened, not the UTC slice. A dinner
    // at 8pm on the 15th in Sydney is stored as the 16th in UTC, and slicing
    // the timestamp would fire this memory a day early and link to the wrong
    // day.
    const day = localDayOf(date.last_at);
    if (!isSameDayOfYear(day, now)) continue;
    const years = yearsSince(day, now);
    if (years < 1) continue;
    return {
      kind: "loved",
      title: date.title,
      years,
      href: `/day?date=${day}`,
    };
  }

  return null;
}

/** "A year ago today", "Two years ago today". */
export function yearsAgoLabel(years: number): string {
  const words = ["", "A year", "Two years", "Three years", "Four years", "Five years"];
  const label = years < words.length ? words[years] : `${years} years`;
  return `${label} ago today`;
}

export type GiftHint = {
  partnerName: string;
  daysUntil: number;
  /** The wishlist of theirs to open, if they have one. */
  wishlistId: string | null;
  wishlistName: string | null;
};

export type BirthdayLike = {
  date: string;
  recurring: boolean;
  subject_user_id: string | null;
};

export type WishlistLike = {
  id: string;
  name: string;
  created_by: string;
  itemCount: number;
};

/**
 * Their birthday is close: point at what they actually want.
 *
 * "Close" is a fortnight, which is enough time to order something and not so
 * far ahead that it is noise. The wishlist offered is one THEY made -- their
 * own wants -- not the "Gifts for them" list the giver keeps, which they must
 * never be steered towards on their own birthday. Falls back to naming the
 * birthday with no list when they have not made one.
 */
export function giftHint(
  partnerId: string | null,
  partnerName: string,
  birthdays: BirthdayLike[],
  wishlists: WishlistLike[],
  daysUntilFn: (date: string, recurring: boolean) => number,
  within = 14
): GiftHint | null {
  if (!partnerId) return null;

  const theirBirthday = birthdays.find((b) => b.subject_user_id === partnerId);
  if (!theirBirthday) return null;

  const days = daysUntilFn(theirBirthday.date, theirBirthday.recurring);
  if (days < 0 || days > within) return null;

  // Their own list, the fullest one, so the hint opens somewhere useful.
  const theirs = wishlists
    .filter((w) => w.created_by === partnerId && w.itemCount > 0)
    .sort((a, b) => b.itemCount - a.itemCount)[0];

  return {
    partnerName,
    daysUntil: days,
    wishlistId: theirs?.id ?? null,
    wishlistName: theirs?.name ?? null,
  };
}
