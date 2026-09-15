/**
 * The first-run walkthrough, and the bell that remembers what you skipped.
 *
 * Most of a step's state is DERIVED rather than stored. A calendar is shared
 * or it is not; a photo exists or it does not. Storing "done" alongside would
 * go stale the moment somebody turned their last calendar back off, and the
 * app would insist they were set up while showing them an empty Home.
 *
 * The stored list is only for the two things the data cannot answer: a step
 * with nothing to measure (personalisation is finished when you say it is),
 * and a step somebody has decided they will never want.
 *
 * Skipping stores nothing at all, deliberately. A skipped step stays
 * outstanding and shows up under the bell, which is what "do this later"
 * should mean -- otherwise "later" means "never" and the app quietly forgets
 * the thing you asked it to remind you about.
 */

export type OnboardingStepKey =
  | "calendars"
  | "hours"
  | "photo"
  | "cover"
  | "personalisation";

/** Everything the rules need to know, gathered once by the caller. */
export type OnboardingFacts = {
  /** Has the phone granted calendar access at all. */
  calendarAccess: boolean;
  /** How many of this phone's calendars are set to anything but Off. */
  calendarsShared: number;
  /** A work pattern with at least one shift in it. */
  hasWorkPattern: boolean;
  hasAvatar: boolean;
  /** The couple's cover photo. Shared, so either partner setting it finishes it for both. */
  hasCover: boolean;
  /** profiles.onboarding_done: steps explicitly finished or dismissed for good. */
  dismissed: string[];
};

export type OnboardingStep = {
  key: OnboardingStepKey;
  title: string;
  blurb: string;
  /** Where the step happens. Null means it happens in the walkthrough itself. */
  route: "/calendars" | "/work-hours" | "/personalisation" | null;
  done: boolean;
};

const STEPS: {
  key: OnboardingStepKey;
  title: string;
  blurb: string;
  route: OnboardingStep["route"];
  satisfied: (f: OnboardingFacts) => boolean;
}[] = [
  {
    key: "calendars",
    title: "Connect your calendar",
    blurb: "So the app can find the time you are actually free -- and the time you are both free, once somebody joins you. Nothing is shared until you say so, calendar by calendar.",
    route: "/calendars",
    satisfied: (f) => f.calendarAccess && f.calendarsShared > 0,
  },
  {
    key: "hours",
    title: "Add your working hours",
    blurb: "So free time never offers the middle of a shift you are working.",
    route: "/work-hours",
    satisfied: (f) => f.hasWorkPattern,
  },
  {
    key: "photo",
    title: "Add your photo",
    blurb: "It sits beside your events, so you can tell at a glance whose is whose.",
    route: null,
    satisfied: (f) => f.hasAvatar,
  },
  {
    key: "cover",
    // Not "a photo of you both": the walkthrough runs before pairing now, and
    // there may not be a photo of the two of you yet, or a two of you.
    title: "Add a cover photo",
    blurb: "The one across the top of your home screen. It is shared, so whoever joins you sees it too.",
    route: null,
    satisfied: (f) => f.hasCover,
  },
  {
    key: "personalisation",
    title: "Make it yours",
    blurb: "Light or dark, an accent colour, and which sections your home screen shows.",
    route: "/personalisation",
    // Nothing to measure. Finished when they say it is.
    satisfied: () => false,
  },
];

export function onboardingSteps(facts: OnboardingFacts): OnboardingStep[] {
  const dismissed = new Set(facts.dismissed);

  return STEPS.map(({ satisfied, ...step }) => ({
    ...step,
    done: satisfied(facts) || dismissed.has(step.key),
  }));
}

/** What the bell is for: everything still waiting on you, in order. */
export function outstandingSteps(facts: OnboardingFacts): OnboardingStep[] {
  return onboardingSteps(facts).filter((s) => !s.done);
}

/**
 * The step the walkthrough should be showing.
 *
 * The first one not done, which means finishing step three and coming back
 * lands you on step four without the walkthrough tracking an index. A stored
 * index would go wrong the moment somebody did a step from somewhere else --
 * and every one of these can be done from somewhere else.
 */
export function nextStep(facts: OnboardingFacts): OnboardingStep | null {
  return outstandingSteps(facts)[0] ?? null;
}

export function allDone(facts: OnboardingFacts): boolean {
  return outstandingSteps(facts).length === 0;
}

/** "2 of 5" for the walkthrough's progress line. */
export function progress(facts: OnboardingFacts): { done: number; total: number } {
  const steps = onboardingSteps(facts);
  return { done: steps.filter((s) => s.done).length, total: steps.length };
}

export const TOTAL_STEPS = STEPS.length;

/**
 * A plain weekly roster, for the great majority who work the same hours every
 * week.
 *
 * Offered because sending somebody whose answer is "nine to five, weekdays"
 * into a rotating-cycle builder with an anchor date is why that step gets
 * skipped. The result is a real work_patterns row, identical to one built the
 * long way, so nothing downstream has to know which route it came by.
 */
export function weeklyShifts(
  weekdays: number[],
  start: string,
  end: string
): { week: number; weekday: number; start: string; end: string }[] {
  return [...new Set(weekdays)]
    .sort((a, b) => a - b)
    .map((weekday) => ({ week: 0, weekday, start, end }));
}

/** Monday to Friday, as JS weekday numbers. */
export const WEEKDAYS_DEFAULT = [1, 2, 3, 4, 5];
