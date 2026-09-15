import {
  CATEGORIES,
  IDEAS,
  daySeed,
  filterIdeas,
  lengthLabel,
  pickIdea,
  spreadOptions,
} from "@/lib/dateIdeas";


describe("the idea list itself", () => {
  it("has no duplicate ids", () => {
    const ids = IDEAS.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("only uses categories that exist", () => {
    const known = new Set(CATEGORIES.map((c) => c.key));
    for (const idea of IDEAS) {
      for (const c of idea.categories) expect(known.has(c)).toBe(true);
    }
  });

  // Every category needs something in it, or a chip opens onto an empty list,
  // which reads as the app being broken rather than the category being thin.
  it("has at least three ideas in every category", () => {
    for (const c of CATEGORIES) {
      const count = IDEAS.filter((i) => i.categories.includes(c.key)).length;
      expect({ category: c.key, count }).toEqual({ category: c.key, count: expect.any(Number) });
      expect(count).toBeGreaterThanOrEqual(3);
    }
  });

  it("gives everything a sensible length", () => {
    for (const idea of IDEAS) {
      expect(idea.minutes).toBeGreaterThanOrEqual(30);
      expect(idea.minutes).toBeLessThanOrEqual(1440);
    }
  });
});

describe("filterIdeas", () => {
  // An eight-hour day trip offered for a ninety-minute gap is the app not
  // reading its own screen.
  it("leaves out anything longer than the window", () => {
    const short = filterIdeas(IDEAS, { maxMinutes: 90 });
    expect(short.length).toBeGreaterThan(0);
    for (const idea of short) expect(idea.minutes).toBeLessThanOrEqual(90);
  });

  it("matches any of the categories asked for, not all", () => {
    const found = filterIdeas(IDEAS, { categories: ["in", "big"] });
    for (const idea of found) {
      expect(idea.categories.some((c) => c === "in" || c === "big")).toBe(true);
    }
    expect(found.length).toBeGreaterThan(
      filterIdeas(IDEAS, { categories: ["big"] }).length
    );
  });

  it("holds back daytime ideas for an evening window", () => {
    const evening = filterIdeas(IDEAS, { evening: true });
    for (const idea of evening) {
      if (idea.timeOfDay) expect(idea.timeOfDay).toBe("evening");
    }
    // Anything without a stated time of day works either way and stays in.
    expect(evening.some((i) => !i.timeOfDay)).toBe(true);
  });

  it("returns everything when asked for nothing", () => {
    expect(filterIdeas(IDEAS, {})).toHaveLength(IDEAS.length);
  });
});

describe("pickIdea", () => {
  it("is stable for the same seed", () => {
    expect(pickIdea(IDEAS, 12)?.id).toBe(pickIdea(IDEAS, 12)?.id);
  });

  it("moves on with the seed", () => {
    const seen = new Set([0, 1, 2, 3, 4].map((s) => pickIdea(IDEAS, s)?.id));
    expect(seen.size).toBeGreaterThan(1);
  });

  it("copes with an empty list and a silly seed", () => {
    expect(pickIdea([], 5)).toBeNull();
    expect(pickIdea(IDEAS, -7)).not.toBeNull();
    expect(pickIdea(IDEAS, 1e15)).not.toBeNull();
  });
});

describe("daySeed", () => {
  it("holds steady through a day and moves the next", () => {
    const morning = daySeed(new Date("2026-09-15T01:00:00Z"));
    const night = daySeed(new Date("2026-09-15T22:00:00Z"));
    const tomorrow = daySeed(new Date("2026-09-16T10:00:00Z"));

    expect(morning).toBe(night);
    expect(tomorrow).toBe(morning + 1);
  });
});

describe("spreadOptions", () => {
  const iv = (day: number, hour: number) => ({
    start: new Date(2026, 8, day, hour, 0, 0, 0),
    end: new Date(2026, 8, day, hour + 2, 0, 0, 0),
  });

  // Three options on the same evening is one option.
  it("takes one window per day before taking a second from any", () => {
    const windows = [iv(15, 19), iv(15, 21), iv(16, 19), iv(17, 19)];
    const chosen = spreadOptions(windows);

    expect(chosen).toHaveLength(3);
    expect(new Set(chosen.map((c) => c.start.getDate())).size).toBe(3);
  });

  it("tops up from the same day when there are not enough days", () => {
    const windows = [iv(15, 12), iv(15, 19), iv(15, 21)];
    const chosen = spreadOptions(windows);

    expect(chosen).toHaveLength(3);
    expect(chosen.map((c) => c.start.getHours())).toEqual([12, 19, 21]);
  });

  it("copes with fewer windows than options", () => {
    expect(spreadOptions([iv(15, 19)])).toHaveLength(1);
    expect(spreadOptions([])).toEqual([]);
  });

  it("returns them in time order", () => {
    const windows = [iv(17, 19), iv(15, 19), iv(16, 19)];
    const chosen = spreadOptions(windows);
    const times = chosen.map((c) => c.start.getTime());
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });
});

describe("lengthLabel", () => {
  // "About 1 hours" was on three of the ideas, and a night away was
  // described as "most of a day".
  it("never says 1 hours", () => {
    expect(lengthLabel(60)).toBe("About an hour");
    expect(lengthLabel(45)).toBe("About an hour");
  });

  it("has a word for ninety minutes", () => {
    expect(lengthLabel(90)).toBe("About an hour and a half");
  });

  it("rounds the rest to hours", () => {
    expect(lengthLabel(120)).toBe("About 2 hours");
    expect(lengthLabel(150)).toBe("About 3 hours");
  });

  it("knows a night away is not an afternoon", () => {
    expect(lengthLabel(480)).toBe("Most of a day");
    expect(lengthLabel(1440)).toBe("Overnight");
  });

  it("says something sensible about every idea we ship", () => {
    for (const idea of IDEAS) {
      expect(lengthLabel(idea.minutes)).not.toMatch(/\b1 hours\b/);
    }
  });
});
