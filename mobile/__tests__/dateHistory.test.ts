import { VERDICTS, howLongAgo } from "@/lib/dateHistory";

describe("VERDICTS", () => {
  // Three answers, not five stars. A five-point scale on an evening with your
  // partner invites a precision nobody has, and "it was fine" is a real answer
  // that a 3/5 makes look like a complaint.
  it("offers three answers", () => {
    expect(VERDICTS).toHaveLength(3);
    expect(VERDICTS.map((v) => v.key)).toEqual(["loved", "good", "not_again"]);
  });

  it("words them as a person would", () => {
    for (const v of VERDICTS) expect(v.label).not.toMatch(/\d|star|rating/i);
  });
});

describe("howLongAgo", () => {
  const now = new Date(2026, 8, 15, 12, 0, 0);

  it("handles the recent past in days", () => {
    expect(howLongAgo(new Date(2026, 8, 15, 9).toISOString(), now)).toBe("today");
    expect(howLongAgo(new Date(2026, 8, 14, 9).toISOString(), now)).toBe("yesterday");
    expect(howLongAgo(new Date(2026, 8, 10, 9).toISOString(), now)).toBe("5 days ago");
  });

  it("switches to weeks, then months, then years", () => {
    expect(howLongAgo(new Date(2026, 7, 15).toISOString(), now)).toMatch(/weeks ago/);
    expect(howLongAgo(new Date(2026, 4, 15).toISOString(), now)).toMatch(/months ago/);
    expect(howLongAgo(new Date(2025, 8, 15).toISOString(), now)).toBe("about a year ago");
    expect(howLongAgo(new Date(2023, 8, 15).toISOString(), now)).toBe("about 3 years ago");
  });

  // A date in the future is a bug upstream, not something to render as
  // "-4 days ago".
  it("does not go negative", () => {
    expect(howLongAgo(new Date(2026, 8, 20).toISOString(), now)).toBe("today");
  });
});
