/**
 * Which sections the Home screen shows, and in what order.
 *
 * Stored per person, not per couple: one of you lives by the countdowns and
 * the other only opens the app to see when you're both free. There's no reason
 * they should have to agree.
 */
export type HomeSection =
  | "pinned"
  | "keyDates"
  | "bookedIn"
  | "freeTogether"
  | "workHours"
  | "calendars";

export const HOME_SECTIONS: { key: HomeSection; label: string; blurb: string }[] = [
  { key: "pinned", label: "Pinned countdown", blurb: "The big one at the top" },
  { key: "keyDates", label: "Key dates & countdowns", blurb: "The row you swipe through" },
  { key: "bookedIn", label: "Booked in", blurb: "Dates you've already got in" },
  { key: "freeTogether", label: "Free together", blurb: "When you're both actually free" },
  { key: "workHours", label: "Your working hours", blurb: "Your shifts or pattern" },
  { key: "calendars", label: "Calendars", blurb: "What each calendar shares" },
];

export const DEFAULT_HOME_ORDER: HomeSection[] = HOME_SECTIONS.map((s) => s.key);

const KNOWN = new Set<string>(DEFAULT_HOME_ORDER);
const HIDDEN_PREFIX = "!";

/**
 * The arrangement: every section this build knows about, in the order they
 * appear, plus which of them are switched off.
 *
 * Order and visibility have to be stored together, and a hidden section can't
 * just be one that's missing from the list. If it were, there would be no way
 * to tell "the user hid this" from "this section didn't exist when they last
 * arranged their Home" -- and the next section we add would be invisible to
 * everyone who had ever touched this screen, looking exactly like a feature
 * that shipped broken. So hidden sections stay in the list, marked with a "!",
 * and anything genuinely absent is new and gets appended, visible.
 */
export type HomeLayout = {
  order: HomeSection[];
  hidden: Set<HomeSection>;
};

export function resolveHomeLayout(stored: string[] | null | undefined): HomeLayout {
  const order: HomeSection[] = [];
  const hidden = new Set<HomeSection>();
  const seen = new Set<HomeSection>();

  for (const entry of stored ?? []) {
    const isHidden = entry.startsWith(HIDDEN_PREFIX);
    const key = isHidden ? entry.slice(HIDDEN_PREFIX.length) : entry;

    if (!KNOWN.has(key)) continue; // a section this build no longer has
    const section = key as HomeSection;
    if (seen.has(section)) continue;

    seen.add(section);
    order.push(section);
    if (isHidden) hidden.add(section);
  }

  // Anything this build knows about that the stored arrangement never
  // mentioned is new. It goes in at its default position and is visible.
  for (const key of DEFAULT_HOME_ORDER) {
    if (seen.has(key)) continue;
    const insertAt = order.findIndex(
      (k) => DEFAULT_HOME_ORDER.indexOf(k) > DEFAULT_HOME_ORDER.indexOf(key)
    );
    if (insertAt < 0) order.push(key);
    else order.splice(insertAt, 0, key);
  }

  return { order, hidden };
}

/** The stored form: order preserved, hidden ones marked. */
export function serializeHomeLayout(layout: HomeLayout): string[] {
  return layout.order.map((key) => (layout.hidden.has(key) ? HIDDEN_PREFIX + key : key));
}

/** The sections to actually render, in order. */
export function visibleSections(layout: HomeLayout): HomeSection[] {
  return layout.order.filter((key) => !layout.hidden.has(key));
}

export function moveSection(
  layout: HomeLayout,
  key: HomeSection,
  direction: -1 | 1
): HomeLayout {
  const index = layout.order.indexOf(key);
  if (index < 0) return layout;

  const target = index + direction;
  if (target < 0 || target >= layout.order.length) return layout;

  const order = [...layout.order];
  [order[index], order[target]] = [order[target], order[index]];
  return { order, hidden: new Set(layout.hidden) };
}

export function toggleSection(layout: HomeLayout, key: HomeSection): HomeLayout {
  const hidden = new Set(layout.hidden);
  if (hidden.has(key)) hidden.delete(key);
  else hidden.add(key);

  // Position is untouched. Switching a section off and on again shouldn't
  // move it -- it stays where you put it, greyed out in between.
  return { order: [...layout.order], hidden };
}
