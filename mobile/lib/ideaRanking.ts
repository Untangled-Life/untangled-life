import type { DateIdea } from "@/lib/dateIdeas";
import { WAYS, type ValuedAnswers, type ValuedWay, wayLabel } from "@/lib/valued";
import type { Verdict } from "@/lib/dateHistory";

/**
 * Which ideas come first, and why.
 *
 * Two things the app knows that a list of ideas does not. What your partner
 * said makes them feel valued, which they ranked one to five. And what the
 * two of you said about the dates you have already had. Both are folded in
 * here, and every idea that moves up carries a line saying what moved it,
 * because a list that reorders itself without explanation reads as random.
 *
 * Deliberately not a score anybody sees. The ranking exists to put the right
 * thing at the top, not to tell somebody their picnic is a 7.
 */

/** What the two of you said about a date with this title. */
export type TitleVerdicts = Map<string, { loved: number; notAgain: number }>;

export type RankedIdea = {
  idea: DateIdea;
  /** A reason in plain words, or null when it is simply in the list. */
  why: string | null;
  score: number;
};

/**
 * Weight for a way by where it sits in their ranking: first is worth the
 * most, fifth is worth a little. Unranked ways score nothing, which is what
 * makes "their first choice" mean something.
 */
function wayWeights(ranking: ValuedWay[]): Map<ValuedWay, number> {
  const weights = new Map<ValuedWay, number>();
  const count = WAYS.length;
  ranking.forEach((way, index) => weights.set(way, count - index));
  return weights;
}

const ORDINAL = ["first", "second", "third", "fourth", "fifth"];

export function rankIdeas(
  ideas: DateIdea[],
  answers: ValuedAnswers | null,
  partnerName: string,
  verdicts: TitleVerdicts = new Map(),
  seed = 0
): RankedIdea[] {
  // Only a SHARED answer counts. The database will not hand over one that
  // has not been shared, but this file is pure and tested, so it says so
  // itself rather than trusting the caller.
  const ranking = answers?.shared ? answers.ranking : [];
  const weights = wayWeights(ranking);

  const ranked = ideas.map((idea, index) => {
    let score = 0;
    let why: string | null = null;

    // Their words first. The idea's own leading way gets full weight and a
    // second way half, so an idea that is mostly about closeness with a bit
    // of attention sorts near a partner who put closeness first, ahead of
    // one that is mostly attention with a bit of closeness.
    idea.ways.forEach((way, position) => {
      const weight = weights.get(way) ?? 0;
      score += position === 0 ? weight * 2 : weight;
    });

    const best = idea.ways
      .map((way) => ({ way, rank: ranking.indexOf(way) }))
      .filter((w) => w.rank >= 0)
      .sort((a, b) => a.rank - b.rank)[0];

    // Only the top two earn a line. "Because they put it fifth" is not a
    // reason, it is the list explaining itself for the sake of it.
    if (best && best.rank <= 1) {
      why = `${partnerName} put "${wayLabel(best.way)}" ${ORDINAL[best.rank]}.`;
    }

    // Then what actually happened. Both of you loving a date with this name
    // is the strongest signal there is, and outranks anything the survey
    // says; one "not again" is enough to drop it to the bottom, because a
    // suggestion to repeat something one of you disliked is worse than none.
    const verdict = verdicts.get(idea.title);
    if (verdict) {
      if (verdict.notAgain > 0) {
        score -= 100;
        why = null;
      } else if (verdict.loved >= 2) {
        score += 50;
        why = "You both loved this last time.";
      } else if (verdict.loved === 1) {
        score += 10;
        why = why ?? "One of you loved this last time.";
      }
    }

    // A stable shuffle underneath, so ties do not fall out in the order the
    // file was typed and the same ten ideas do not sit at the top of every
    // category forever. Seeded by the day: a re-render must not move a card
    // under somebody's thumb.
    const jitter = mix(index, seed) / 10000;

    return { idea, why, score: score + jitter };
  });

  return ranked.sort((a, b) => b.score - a.score);
}

/**
 * A small hash, so that the day's shuffle is a shuffle. Adding the seed to
 * every index and taking a modulus moved every idea by the same amount and
 * changed nothing about the order, which a test caught on the first run.
 */
function mix(index: number, seed: number): number {
  let h = (index * 374761393 + seed * 668265263) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 1274126177) >>> 0;
  h ^= h >>> 16;
  return h % 997;
}

/** From the raw review rows to something the ranker can use. */
export function verdictsByTitle(
  rows: { title: string | null; verdict: Verdict }[]
): TitleVerdicts {
  const out: TitleVerdicts = new Map();
  for (const row of rows) {
    if (!row.title) continue;
    const entry = out.get(row.title) ?? { loved: 0, notAgain: 0 };
    if (row.verdict === "loved") entry.loved += 1;
    if (row.verdict === "not_again") entry.notAgain += 1;
    out.set(row.title, entry);
  }
  return out;
}

/**
 * Whether the partner has given the ranker anything to go on. The screen
 * says something different when they have not, and it should not pretend the
 * order means anything.
 */
export function hasPreferences(answers: ValuedAnswers | null): boolean {
  return Boolean(answers?.shared && answers.ranking.length > 0);
}
