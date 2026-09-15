import { IDEAS, type DateIdea } from "@/lib/dateIdeas";
import { hasPreferences, rankIdeas, verdictsByTitle } from "@/lib/ideaRanking";
import type { ValuedAnswers } from "@/lib/valued";

const answers = (ranking: ValuedAnswers["ranking"], shared = true): ValuedAnswers => ({
  user_id: "them",
  couple_id: "us",
  ranking,
  feels_valued: null,
  little_things: null,
  hard_week: null,
  shared,
  updated_at: "2026-01-01T00:00:00Z",
});

const idea = (id: string, ways: DateIdea["ways"], title = id): DateIdea => ({
  id,
  title,
  blurb: "",
  categories: ["in"],
  minutes: 60,
  cost: "free",
  ways,
});

describe("rankIdeas", () => {
  it("puts ideas that serve their first choice at the top, and says so", () => {
    const ideas = [idea("a", ["gifts"]), idea("b", ["closeness"]), idea("c", ["time"])];
    const ranked = rankIdeas(ideas, answers(["closeness", "time", "words", "acts", "gifts"]), "Alyssa");

    expect(ranked[0].idea.id).toBe("b");
    expect(ranked[0].why).toBe('Alyssa put "Physical closeness" first.');
    expect(ranked[1].idea.id).toBe("c");
    expect(ranked[1].why).toBe('Alyssa put "Undivided attention" second.');
  });

  it("gives no reason for a match on their third choice or lower", () => {
    const ranked = rankIdeas([idea("a", ["words"])], answers(["closeness", "time", "words", "acts", "gifts"]), "Alyssa");
    expect(ranked[0].why).toBeNull();
  });

  it("weights an idea's leading way more than its second", () => {
    // Both serve closeness and time. "a" is mostly closeness, "b" is mostly time.
    const ideas = [idea("a", ["closeness", "time"]), idea("b", ["time", "closeness"])];
    const ranked = rankIdeas(ideas, answers(["closeness", "time", "words", "acts", "gifts"]), "Alyssa");
    expect(ranked[0].idea.id).toBe("a");
  });

  it("ignores answers that have not been shared", () => {
    const ideas = [idea("a", ["gifts"]), idea("b", ["closeness"])];
    const ranked = rankIdeas(ideas, answers(["closeness", "time", "words", "acts", "gifts"], false), "Alyssa");
    expect(ranked.every((r) => r.why === null)).toBe(true);
    expect(ranked.every((r) => r.score < 1)).toBe(true);
  });

  it("drops anything one of you said not again, whatever the survey says", () => {
    const ideas = [idea("a", ["closeness"], "Bath"), idea("b", ["gifts"], "Markets")];
    const verdicts = verdictsByTitle([{ title: "Bath", verdict: "not_again" }]);
    const ranked = rankIdeas(ideas, answers(["closeness", "time", "words", "acts", "gifts"]), "Alyssa", verdicts);
    expect(ranked[0].idea.id).toBe("b");
    expect(ranked[1].why).toBeNull();
  });

  it("lifts what you both loved above what the survey suggests", () => {
    const ideas = [idea("a", ["closeness"], "Bath"), idea("b", ["gifts"], "Markets")];
    const verdicts = verdictsByTitle([
      { title: "Markets", verdict: "loved" },
      { title: "Markets", verdict: "loved" },
    ]);
    const ranked = rankIdeas(ideas, answers(["closeness", "time", "words", "acts", "gifts"]), "Alyssa", verdicts);
    expect(ranked[0].idea.id).toBe("b");
    expect(ranked[0].why).toBe("You both loved this last time.");
  });

  it("is stable for the same seed and different for another day", () => {
    const ideas = [idea("a", []), idea("b", []), idea("c", []), idea("d", [])];
    const one = rankIdeas(ideas, null, "Alyssa", new Map(), 1).map((r) => r.idea.id);
    const same = rankIdeas(ideas, null, "Alyssa", new Map(), 1).map((r) => r.idea.id);
    const other = rankIdeas(ideas, null, "Alyssa", new Map(), 2).map((r) => r.idea.id);
    expect(same).toEqual(one);
    expect(other).not.toEqual(one);
  });
});

describe("the ideas themselves", () => {
  it("every idea names at least one way it serves", () => {
    expect(IDEAS.filter((i) => i.ways.length === 0).map((i) => i.id)).toEqual([]);
  });

  it("every Under $50 idea is actually cheap", () => {
    const dear = IDEAS.filter(
      (i) => i.categories.includes("cheap") && (i.cost === "mid" || i.cost === "high")
    );
    expect(dear.map((i) => i.id)).toEqual([]);
  });

  it("every idea is either at home or going out", () => {
    const homeless = IDEAS.filter(
      (i) => !i.categories.includes("in") && !i.categories.includes("out")
    );
    expect(homeless.map((i) => i.id)).toEqual([]);
  });

  it("has no duplicate ids or titles", () => {
    const ids = IDEAS.map((i) => i.id);
    const titles = IDEAS.map((i) => i.title);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(titles).size).toBe(titles.length);
  });

  it("does not use em dashes anywhere", () => {
    expect(IDEAS.filter((i) => /—/.test(i.title + i.blurb)).map((i) => i.id)).toEqual([]);
  });
});

describe("hasPreferences", () => {
  it("is true only for a shared ranking", () => {
    expect(hasPreferences(null)).toBe(false);
    expect(hasPreferences(answers([], true))).toBe(false);
    expect(hasPreferences(answers(["time"], false))).toBe(false);
    expect(hasPreferences(answers(["time"], true))).toBe(true);
  });
});
