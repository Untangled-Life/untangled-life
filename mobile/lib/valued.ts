/**
 * What makes each of you feel valued.
 *
 * Three things this is deliberately not.
 *
 * It is not a test. There is no score, no percentage, no compatibility
 * rating. A number invites a couple to feel bad about a number, and there is
 * no version of "your relationship is 74%" that helps anybody.
 *
 * It is not a secret. The whole point is that your partner reads it, which is
 * why the app says so on the first screen rather than after the last question,
 * and why nothing is visible to them until you say it is.
 *
 * It is not a scorecard. No streaks, no "you have not acted on this in three
 * weeks". The moment it grades you it stops being sweet, and an app that
 * grades your relationship is one you delete.
 *
 * The five ways below are the vocabulary people recognise. They are a popular
 * framework rather than a validated one, so the app uses the words and never
 * claims the science: the results are always "here is what Alyssa said", never
 * "Alyssa is a Words person".
 */

export type ValuedWay = "words" | "time" | "acts" | "gifts" | "closeness";

export const WAYS: { key: ValuedWay; label: string; blurb: string }[] = [
  {
    key: "words",
    label: "Being told",
    blurb: "Hearing it out loud. What you did well, what they like about you, that they noticed.",
  },
  {
    key: "time",
    label: "Undivided attention",
    blurb: "Time where nothing else is happening. No phone, no telly, no half-listening.",
  },
  {
    key: "acts",
    label: "Things done without asking",
    blurb: "The washing up already done. The appointment already booked. One less thing.",
  },
  {
    key: "gifts",
    label: "Something thought of",
    blurb: "Not the cost. The evidence that they were thinking about you when you were not there.",
  },
  {
    key: "closeness",
    label: "Physical closeness",
    blurb: "Sitting close. A hand on the shoulder on the way past. Being reached for.",
  },
];

export function wayLabel(key: string): string {
  return WAYS.find((w) => w.key === key)?.label ?? key;
}

/**
 * The written questions.
 *
 * Three, not ten. A questionnaire long enough to feel like admin is one that
 * gets abandoned at question four, and what makes this worth reading is a
 * sentence in somebody's own voice rather than the number of them.
 */
export const QUESTIONS: {
  key: "feels_valued" | "little_things" | "hard_week";
  prompt: string;
  hint: string;
  placeholder: string;
}[] = [
  {
    key: "feels_valued",
    prompt: "When have you felt most valued by me?",
    hint: "A real moment beats a general answer. They can repeat a moment.",
    placeholder: "When you...",
  },
  {
    key: "little_things",
    prompt: "What small thing would you notice every time?",
    hint: "Small enough to happen on an ordinary Tuesday.",
    placeholder: "A coffee brought to me without asking...",
  },
  {
    key: "hard_week",
    prompt: "On a hard week, what actually helps?",
    hint: "This is the one people get wrong about each other most often.",
    placeholder: "Leave me alone for an hour, then...",
  },
];

export type ValuedAnswers = {
  user_id: string;
  couple_id: string;
  ranking: ValuedWay[];
  feels_valued: string | null;
  little_things: string | null;
  hard_week: string | null;
  shared: boolean;
  updated_at: string;
};

/**
 * What Home shows, in their words.
 *
 * Their own sentence wherever there is one, because a thing your partner said
 * about themselves is worth more than anything this app could generate. The
 * ranking is the fallback within the fallback: less specific, still theirs.
 *
 * Nothing here is shown at all until they have shared, which the query
 * enforces as well -- this is only about choosing between what came back.
 */
export type ValuedPrompt = { line: string; source: "written" | "ranking" };

export function partnerPrompt(
  answers: ValuedAnswers | null,
  partnerName: string,
  seed: number
): ValuedPrompt | null {
  if (!answers || !answers.shared) return null;

  const written = [answers.little_things, answers.feels_valued, answers.hard_week]
    .map((a) => a?.trim())
    .filter((a): a is string => Boolean(a));

  if (written.length > 0) {
    const chosen = written[Math.abs(Math.floor(seed)) % written.length];
    return { line: `${partnerName} said: "${stripTrailingStop(chosen)}"`, source: "written" };
  }

  const top = answers.ranking[0];
  if (!top) return null;

  return {
    line: `${partnerName} put "${wayLabel(top)}" first.`,
    source: "ranking",
  };
}

/** Their sentence, inside quotation marks, without a doubled full stop. */
function stripTrailingStop(text: string): string {
  return text.replace(/\.\s*$/, "");
}

/**
 * The fallback when there is nothing personal to say yet.
 *
 * Tied to what the app actually knows rather than a generic quote. A rotating
 * quote feels lovely on day one and is invisible by day ten, because it is not
 * about you and it never changes in response to anything.
 */
export type Nudgeable = {
  /** The next window the two of you are free, if there is one. */
  nextFree: Date | null;
  /** Days until the nearest key date, if one is close. */
  keyDateIn: number | null;
  keyDateTitle: string | null;
  /** Whether the partner has filled anything in. */
  partnerAnswered: boolean;
  partnerName: string;
};

export function fallbackLine(facts: Nudgeable, seed: number): string {
  if (facts.keyDateIn !== null && facts.keyDateIn <= 21 && facts.keyDateTitle) {
    return facts.keyDateIn === 0
      ? `${facts.keyDateTitle} is today.`
      : `${facts.keyDateTitle} is ${facts.keyDateIn === 1 ? "tomorrow" : `in ${facts.keyDateIn} days`}. Worth thinking about now rather than the night before.`;
  }

  if (facts.nextFree) {
    const day = facts.nextFree.toLocaleDateString(undefined, { weekday: "long" });
    return `You are both free ${day}. That is the easiest date you will get all week.`;
  }

  if (!facts.partnerAnswered) {
    return `${facts.partnerName} has not answered "what makes you feel valued" yet. It takes about two minutes and it is the most useful thing in here.`;
  }

  const general = [
    "Ask about the thing they mentioned last week. Remembering is most of it.",
    "The washing up, done before they get to it, outlasts most grand gestures.",
    "Say the specific thing you noticed, not the general one.",
    "Twenty minutes with both phones in another room counts as a date.",
  ];

  return general[Math.abs(Math.floor(seed)) % general.length];
}
