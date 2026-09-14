import {
  QUESTIONS,
  ValuedAnswers,
  WAYS,
  fallbackLine,
  partnerPrompt,
  wayLabel,
} from "@/lib/valued";

const answers = (over: Partial<ValuedAnswers> = {}): ValuedAnswers => ({
  user_id: "her",
  couple_id: "c",
  ranking: [],
  feels_valued: null,
  little_things: null,
  hard_week: null,
  shared: true,
  updated_at: "2026-09-15T00:00:00Z",
  ...over,
});

describe("the questionnaire itself", () => {
  it("is short enough to finish", () => {
    expect(QUESTIONS.length).toBeLessThanOrEqual(3);
    expect(WAYS).toHaveLength(5);
  });

  it("has no duplicate keys", () => {
    expect(new Set(WAYS.map((w) => w.key)).size).toBe(WAYS.length);
    expect(new Set(QUESTIONS.map((q) => q.key)).size).toBe(QUESTIONS.length);
  });

  it("names the ways in plain words rather than jargon", () => {
    // If a label ever becomes "Acts of Service" this fails, which is the
    // point: the app uses the vocabulary, not the branding.
    for (const w of WAYS) expect(w.label).not.toMatch(/language/i);
    expect(wayLabel("acts")).toBe("Things done without asking");
    expect(wayLabel("nonsense")).toBe("nonsense");
  });
});

describe("partnerPrompt", () => {
  // Nothing reaches Home until they have shared. The query enforces it too;
  // this is the belt to that pair of braces.
  it("says nothing at all when it has not been shared", () => {
    expect(partnerPrompt(answers({ shared: false, little_things: "A coffee" }), "Alyssa", 0)).toBeNull();
  });

  it("says nothing when there is no answer", () => {
    expect(partnerPrompt(null, "Alyssa", 0)).toBeNull();
    expect(partnerPrompt(answers(), "Alyssa", 0)).toBeNull();
  });

  it("quotes their own words when there are any", () => {
    const p = partnerPrompt(answers({ little_things: "A coffee, unasked." }), "Alyssa", 0);
    expect(p?.source).toBe("written");
    expect(p?.line).toBe('Alyssa said: "A coffee, unasked"');
  });

  it("rotates between what they wrote", () => {
    const full = answers({
      little_things: "One",
      feels_valued: "Two",
      hard_week: "Three",
    });
    const seen = new Set([0, 1, 2].map((s) => partnerPrompt(full, "Alyssa", s)?.line));
    expect(seen.size).toBe(3);
  });

  it("falls back to the ranking, still in their voice", () => {
    const p = partnerPrompt(answers({ ranking: ["time"] }), "Alyssa", 0);
    expect(p?.source).toBe("ranking");
    expect(p?.line).toBe('Alyssa put "Undivided attention" first.');
  });

  it("ignores whitespace-only answers", () => {
    const p = partnerPrompt(answers({ little_things: "   ", ranking: ["gifts"] }), "Alyssa", 0);
    expect(p?.source).toBe("ranking");
  });
});

describe("fallbackLine", () => {
  const base = {
    nextFree: null,
    keyDateIn: null,
    keyDateTitle: null,
    partnerAnswered: true,
    partnerName: "Alyssa",
  };

  it("leads with a key date that is close", () => {
    expect(fallbackLine({ ...base, keyDateIn: 1, keyDateTitle: "Her birthday" }, 0)).toContain(
      "tomorrow"
    );
    expect(fallbackLine({ ...base, keyDateIn: 0, keyDateTitle: "Anniversary" }, 0)).toBe(
      "Anniversary is today."
    );
  });

  // Three weeks out is the point of a countdown. Three months out is noise.
  it("ignores a key date that is a long way off", () => {
    const line = fallbackLine({ ...base, keyDateIn: 90, keyDateTitle: "Anniversary" }, 0);
    expect(line).not.toContain("Anniversary");
  });

  it("offers the next free evening when there is one", () => {
    const friday = new Date(2026, 8, 18, 19, 0);
    expect(fallbackLine({ ...base, nextFree: friday }, 0)).toContain("Friday");
  });

  it("asks for the questionnaire when the partner has not done it", () => {
    const line = fallbackLine({ ...base, partnerAnswered: false }, 0);
    expect(line).toContain("Alyssa");
    expect(line).toContain("two minutes");
  });

  it("always has something to say", () => {
    for (const seed of [0, 1, 2, 3, 4, 99]) {
      expect(fallbackLine(base, seed).length).toBeGreaterThan(10);
    }
  });
});
