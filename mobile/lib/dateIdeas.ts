import { Interval } from "@/lib/freeTime";

/**
 * Date ideas.
 *
 * The reason couples do not plan anything is rarely that they cannot find a
 * time. It is the blank page: "what do you want to do" answered with "I don't
 * mind" by both people until the evening is gone. So this is a list, bundled
 * with the app rather than fetched, because an idea that needs a network call
 * is an idea that fails on the train.
 *
 * Deliberately not clever. No machine learning, no personalisation beyond the
 * filters below. A list somebody wrote is better than a list somebody
 * generated, and these have to survive being read hundreds of times.
 */

export type IdeaCategory = "in" | "out" | "cheap" | "big" | "active" | "new";

export const CATEGORIES: { key: IdeaCategory; label: string; blurb: string }[] = [
  { key: "in", label: "At home", blurb: "No booking, no babysitter" },
  { key: "out", label: "Out", blurb: "Somewhere that isn't the lounge" },
  { key: "cheap", label: "Under $50", blurb: "For the whole thing, both of you" },
  { key: "big", label: "Worth planning", blurb: "A proper night, or a whole day" },
  { key: "active", label: "Outdoors", blurb: "Weather permitting" },
  { key: "new", label: "Neither of you has", blurb: "First time for both" },
];

export type DateIdea = {
  id: string;
  title: string;
  /** What it actually involves, in one line. */
  blurb: string;
  categories: IdeaCategory[];
  /** Minutes. Sets the length of the event when this becomes a plan. */
  minutes: number;
  /** Rough, and only used to filter. Null means it depends entirely. */
  cost: "free" | "low" | "mid" | "high" | null;
  /** Needs to be outdoors, so it is offered less in bad weather months. */
  outdoors?: boolean;
  /** Only makes sense after dark, or only in daylight. */
  timeOfDay?: "day" | "evening";
};

export const IDEAS: DateIdea[] = [
  // --- at home ---
  { id: "cook-together", title: "Cook something neither of you can cook", blurb: "Pick a recipe that scares you both a bit and make it together.", categories: ["in", "cheap", "new"], minutes: 150, cost: "low", timeOfDay: "evening" },
  { id: "no-phones-dinner", title: "Dinner with the phones in another room", blurb: "Same meal you were having anyway. The phones go in a drawer.", categories: ["in", "cheap"], minutes: 90, cost: "free", timeOfDay: "evening" },
  { id: "old-photos", title: "Go through your old photos together", blurb: "Start at the beginning. Plan for it to take longer than you think.", categories: ["in", "cheap"], minutes: 90, cost: "free" },
  { id: "film-they-love", title: "The film they have been telling you to watch", blurb: "The one you have been putting off. Actually watch it.", categories: ["in", "cheap"], minutes: 150, cost: "free", timeOfDay: "evening" },
  { id: "breakfast-in-bed", title: "Breakfast in bed, no reason", blurb: "Whoever wakes first. The other one is not allowed to help.", categories: ["in", "cheap"], minutes: 60, cost: "low", timeOfDay: "day" },
  { id: "learn-something", title: "Learn one thing together", blurb: "A card trick, a cocktail, three chords. One evening, one skill.", categories: ["in", "cheap", "new"], minutes: 90, cost: "free", timeOfDay: "evening" },
  { id: "plan-the-trip", title: "Plan a trip you cannot afford yet", blurb: "Pick a place, price it properly, decide what you would cut to get there.", categories: ["in", "cheap"], minutes: 90, cost: "free" },

  // --- out, cheap ---
  { id: "walk-somewhere-new", title: "Walk somewhere neither of you has walked", blurb: "Pick a suburb on the map and just go and look at it.", categories: ["out", "cheap", "active", "new"], minutes: 120, cost: "free", outdoors: true, timeOfDay: "day" },
  { id: "coffee-and-nothing", title: "Coffee with nothing after it", blurb: "No shopping, no errands attached. Just sit down and talk.", categories: ["out", "cheap"], minutes: 60, cost: "low", timeOfDay: "day" },
  { id: "sunset-somewhere", title: "Watch the sun go down somewhere", blurb: "Find the time it sets, be there twenty minutes before.", categories: ["out", "cheap", "active"], minutes: 90, cost: "free", outdoors: true, timeOfDay: "evening" },
  { id: "markets", title: "The markets, early", blurb: "Go before it gets busy. Buy lunch, eat it there.", categories: ["out", "cheap", "active"], minutes: 150, cost: "low", outdoors: true, timeOfDay: "day" },
  { id: "op-shop-challenge", title: "Op shop, $20 each, best outfit wins", blurb: "One hour, twenty dollars, no consulting. Then dinner in what you picked.", categories: ["out", "cheap", "new"], minutes: 120, cost: "low", timeOfDay: "day" },
  { id: "library-swap", title: "Each pick a book for the other", blurb: "Library or a second-hand shop. You have to actually read it.", categories: ["out", "cheap", "new"], minutes: 60, cost: "free", timeOfDay: "day" },
  { id: "drive-no-destination", title: "Drive an hour in one direction", blurb: "Pick a direction, drive an hour, find somewhere to eat there.", categories: ["out", "active", "new"], minutes: 240, cost: "mid", timeOfDay: "day" },

  // --- out, bigger ---
  { id: "proper-dinner", title: "The restaurant you keep saying you'll try", blurb: "Book it this time. The one you talk about and never do.", categories: ["out", "big"], minutes: 150, cost: "high", timeOfDay: "evening" },
  { id: "live-music", title: "Live music, anyone at all", blurb: "Not a band you know. Whoever is playing somewhere small on Friday.", categories: ["out", "big", "new"], minutes: 180, cost: "mid", timeOfDay: "evening" },
  { id: "gallery-then-argue", title: "A gallery, then argue about it over dinner", blurb: "Each pick a favourite before you leave and defend it.", categories: ["out", "big", "new"], minutes: 210, cost: "mid", timeOfDay: "day" },
  { id: "day-trip", title: "A whole day somewhere else", blurb: "Leave early, come back late. Somewhere that needs a drive.", categories: ["out", "big", "active", "new"], minutes: 480, cost: "mid", outdoors: true, timeOfDay: "day" },
  { id: "class-together", title: "Book a class in something neither of you does", blurb: "Pottery, boxing, pasta, sailing. Being bad at it together is the point.", categories: ["out", "big", "new"], minutes: 150, cost: "mid" },
  { id: "night-away", title: "One night away, anywhere", blurb: "It does not have to be far. It has to be not your house.", categories: ["out", "big"], minutes: 1440, cost: "high" },

  // --- active ---
  { id: "swim-then-chips", title: "Swim, then hot chips", blurb: "Beach, river, pool. The chips are not optional.", categories: ["out", "cheap", "active"], minutes: 180, cost: "low", outdoors: true, timeOfDay: "day" },
  { id: "sunrise-walk", title: "Get up for the sunrise", blurb: "Set two alarms. Be somewhere with a view. Breakfast after.", categories: ["out", "cheap", "active", "new"], minutes: 150, cost: "low", outdoors: true, timeOfDay: "day" },
  { id: "bike-somewhere", title: "Ride somewhere for lunch", blurb: "Pick a place far enough that you have earned the lunch.", categories: ["out", "cheap", "active"], minutes: 210, cost: "low", outdoors: true, timeOfDay: "day" },
];

export type IdeaFilter = {
  categories?: IdeaCategory[];
  /** Longest the window is. An idea that does not fit is not an idea. */
  maxMinutes?: number;
  /** Whether the window is in the evening, so daytime ideas are held back. */
  evening?: boolean;
};

export function filterIdeas(ideas: DateIdea[], filter: IdeaFilter): DateIdea[] {
  return ideas.filter((idea) => {
    if (filter.categories?.length) {
      if (!filter.categories.some((c) => idea.categories.includes(c))) return false;
    }

    // An eight-hour day trip offered for a ninety-minute gap is the app not
    // reading its own screen.
    if (filter.maxMinutes !== undefined && idea.minutes > filter.maxMinutes) return false;

    if (filter.evening !== undefined && idea.timeOfDay) {
      const wantsEvening = idea.timeOfDay === "evening";
      if (wantsEvening !== filter.evening) return false;
    }

    return true;
  });
}

/**
 * One idea, chosen so that the same person does not see the same one twice in
 * a row.
 *
 * Seeded rather than random so that a re-render does not reshuffle the card
 * under somebody's thumb, which is the sort of thing that makes an app feel
 * untrustworthy.
 */
export function pickIdea(ideas: DateIdea[], seed: number): DateIdea | null {
  if (ideas.length === 0) return null;
  return ideas[Math.abs(Math.floor(seed)) % ideas.length];
}

/** A stable seed that changes once a day. */
export function daySeed(at: Date = new Date()): number {
  return Math.floor(at.getTime() / (24 * 60 * 60 * 1000));
}

/** The most options worth offering. Past three it is a survey, not an invitation. */
export const MAX_OPTIONS = 3;

/**
 * The windows to offer.
 *
 * Spread across different days rather than the first three going, because
 * three options on the same evening is one option. Falls back to whatever
 * there is when the diary is too full to spread.
 */
export function spreadOptions(windows: Interval[], count = MAX_OPTIONS): Interval[] {
  // Sorted going in, so "the first window on each day" means the earliest one
  // and not whichever the caller happened to list first. Free windows arrive
  // in order today; relying on that is how this quietly breaks the day
  // somebody calls it with something else.
  const inOrder = [...windows].sort((a, b) => a.start.getTime() - b.start.getTime());

  const byDay = new Map<string, Interval>();
  for (const w of inOrder) {
    const key = w.start.toDateString();
    if (!byDay.has(key)) byDay.set(key, w);
    if (byDay.size >= count) break;
  }

  const chosen = new Set(byDay.values());

  // Not enough distinct days. Top up from the same ones rather than offer
  // fewer, because two options are still a choice.
  for (const w of inOrder) {
    if (chosen.size >= count) break;
    chosen.add(w);
  }

  return [...chosen]
    .sort((a, b) => a.start.getTime() - b.start.getTime())
    .slice(0, count);
}
