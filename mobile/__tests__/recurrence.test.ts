import { addStep, describeRepeat, occurrencesBetween, repeatLabel } from "@/lib/recurrence";

const at = (y: number, m: number, d: number, h = 19, min = 0) => new Date(y, m - 1, d, h, min, 0, 0);
const key = (d: Date) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;

describe("addStep", () => {
  it("steps a week and a fortnight", () => {
    expect(key(addStep(at(2026, 9, 14), "week"))).toBe("2026-9-21");
    expect(key(addStep(at(2026, 9, 14), "fortnight"))).toBe("2026-9-28");
  });

  it("steps a month", () => {
    expect(key(addStep(at(2026, 9, 14), "month"))).toBe("2026-10-14");
  });

  it("keeps the clock time", () => {
    const next = addStep(at(2026, 9, 14, 19, 30), "week");
    expect(next.getHours()).toBe(19);
    expect(next.getMinutes()).toBe(30);
  });

  // The one that goes wrong by default. Adding a month to 31 August gives
  // 31 September, which JavaScript resolves as 1 October -- so a monthly
  // dinner on the 31st would land on the 1st half the year.
  it("clamps a monthly repeat to the last day of a shorter month", () => {
    expect(key(addStep(at(2026, 8, 31), "month"))).toBe("2026-9-30");
    expect(key(addStep(at(2026, 1, 31), "month"))).toBe("2026-2-28");
  });

  it("remembers the original day rather than drifting", () => {
    // 31 Jan -> 28 Feb -> 31 Mar, not 28 Mar. Stepping from the original is
    // what makes this work.
    expect(key(addStep(at(2026, 1, 31), "month", 2))).toBe("2026-3-31");
  });

  it("does nothing for a one-off", () => {
    expect(key(addStep(at(2026, 9, 14), "none"))).toBe("2026-9-14");
  });

  it("takes multiple steps at once", () => {
    expect(key(addStep(at(2026, 9, 14), "week", 3))).toBe("2026-10-5");
  });
});

describe("occurrencesBetween", () => {
  const weekly = {
    start: at(2026, 9, 14, 19),
    end: at(2026, 9, 14, 21),
    repeatEvery: "week" as const,
    repeatUntil: null,
  };

  it("returns the event itself when it does not repeat", () => {
    const once = { ...weekly, repeatEvery: "none" as const };
    const found = occurrencesBetween(once, at(2026, 9, 1), at(2026, 12, 1));
    expect(found).toHaveLength(1);
    expect(key(found[0].start)).toBe("2026-9-14");
  });

  it("leaves out a one-off outside the range", () => {
    const once = { ...weekly, repeatEvery: "none" as const };
    expect(occurrencesBetween(once, at(2026, 10, 1), at(2026, 11, 1))).toHaveLength(0);
  });

  it("repeats weekly through the range", () => {
    const found = occurrencesBetween(weekly, at(2026, 9, 1), at(2026, 10, 12));
    expect(found.map((o) => key(o.start))).toEqual([
      "2026-9-14",
      "2026-9-21",
      "2026-9-28",
      "2026-10-5",
      "2026-10-12",
    ]);
  });

  it("keeps the duration on every occurrence", () => {
    const found = occurrencesBetween(weekly, at(2026, 9, 1), at(2026, 10, 1));
    for (const o of found) {
      expect(o.end.getTime() - o.start.getTime()).toBe(2 * 60 * 60 * 1000);
    }
  });

  it("starts from the range, not from the beginning of time", () => {
    const found = occurrencesBetween(weekly, at(2026, 11, 1), at(2026, 11, 30));
    expect(found.length).toBeGreaterThan(0);
    expect(found[0].start.getMonth()).toBe(10);
  });

  // "Until the 30th" includes the 30th, whatever time the event starts.
  it("includes an occurrence on the until date itself", () => {
    const bounded = { ...weekly, repeatUntil: at(2026, 10, 5, 0, 0) };
    const found = occurrencesBetween(bounded, at(2026, 9, 1), at(2026, 12, 1));
    expect(found.map((o) => key(o.start))).toEqual([
      "2026-9-14",
      "2026-9-21",
      "2026-9-28",
      "2026-10-5",
    ]);
  });

  it("stops after the until date", () => {
    const bounded = { ...weekly, repeatUntil: at(2026, 9, 30) };
    const found = occurrencesBetween(bounded, at(2026, 9, 1), at(2027, 1, 1));
    expect(found).toHaveLength(3);
  });

  it("counts an occurrence that started before the range but runs into it", () => {
    const found = occurrencesBetween(weekly, at(2026, 9, 14, 20), at(2026, 9, 14, 22));
    expect(found).toHaveLength(1);
  });

  it("repeats monthly, clamping short months", () => {
    const monthly = {
      start: at(2026, 1, 31, 19),
      end: at(2026, 1, 31, 21),
      repeatEvery: "month" as const,
      repeatUntil: null,
    };
    const found = occurrencesBetween(monthly, at(2026, 1, 1), at(2026, 5, 1));
    expect(found.map((o) => key(o.start))).toEqual([
      "2026-1-31",
      "2026-2-28",
      "2026-3-31",
      "2026-4-30",
    ]);
  });

  // A bad rule must not be able to hang a screen.
  it("is bounded even over an absurd range", () => {
    const found = occurrencesBetween(weekly, at(2026, 1, 1), at(2060, 1, 1));
    expect(found.length).toBeLessThanOrEqual(400);
  });
});

describe("labels", () => {
  it("names each option", () => {
    expect(repeatLabel("none")).toBe("Once");
    expect(repeatLabel("fortnight")).toBe("Fortnightly");
  });

  it("describes a repeat, with and without an end", () => {
    const fmt = (d: Date) => `${d.getDate()}/${d.getMonth() + 1}`;
    expect(describeRepeat("none", null, fmt)).toBeNull();
    expect(describeRepeat("week", null, fmt)).toBe("Weekly");
    expect(describeRepeat("week", at(2026, 12, 3), fmt)).toBe("Weekly, until 3/12");
  });
});
