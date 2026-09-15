import { BUCKETS, bucketFor, byDueDate, daysFromToday, dueLabel, isoToday } from "@/lib/todos";

// The suite runs in America/New_York, so the daylight-saving cases below are
// real: 8 March 2026 is 23 hours long and 1 November 2026 is 25.
const at = (iso: string) => new Date(`${iso}T09:00:00`);

describe("isoToday", () => {
  it("is the phone's own date, not UTC's", () => {
    // 22:30 in New York is already tomorrow in UTC. A due date is a day on a
    // calendar, so it has to follow the calendar the person is looking at.
    expect(isoToday(new Date("2026-09-15T22:30:00-04:00"))).toBe("2026-09-15");
  });

  it("pads", () => {
    expect(isoToday(new Date(2026, 0, 5, 12))).toBe("2026-01-05");
  });
});

describe("daysFromToday", () => {
  it("counts whole days", () => {
    expect(daysFromToday("2026-09-15", at("2026-09-15"))).toBe(0);
    expect(daysFromToday("2026-09-18", at("2026-09-15"))).toBe(3);
    expect(daysFromToday("2026-09-12", at("2026-09-15"))).toBe(-3);
  });

  it("ignores the time of day", () => {
    expect(daysFromToday("2026-09-16", new Date("2026-09-15T23:59:00"))).toBe(1);
    expect(daysFromToday("2026-09-16", new Date("2026-09-15T00:01:00"))).toBe(1);
  });

  // Flooring the millisecond gap turns tomorrow into today on the morning the
  // clocks go forward, which is the morning somebody finds a thing they
  // thought they had another day for.
  it("survives the clocks going forward", () => {
    expect(daysFromToday("2026-03-08", at("2026-03-07"))).toBe(1);
    expect(daysFromToday("2026-03-09", at("2026-03-07"))).toBe(2);
  });

  it("survives the clocks going back", () => {
    expect(daysFromToday("2026-11-01", at("2026-10-31"))).toBe(1);
    expect(daysFromToday("2026-11-02", at("2026-10-31"))).toBe(2);
  });
});

describe("bucketFor", () => {
  it("has a heading for each horizon", () => {
    expect(bucketFor("2026-09-14", at("2026-09-15"))).toBe("Overdue");
    expect(bucketFor("2026-09-15", at("2026-09-15"))).toBe("Today");
    expect(bucketFor("2026-09-16", at("2026-09-15"))).toBe("Tomorrow");
    expect(bucketFor("2026-09-20", at("2026-09-15"))).toBe("This Week");
    expect(bucketFor("2026-09-30", at("2026-09-15"))).toBe("Someday");
  });

  it("puts a thing with no date at the bottom rather than nowhere", () => {
    expect(bucketFor(null, at("2026-09-15"))).toBe("Someday");
  });

  // A week means seven days, not "this calendar week".
  it("draws the week boundary at seven days", () => {
    expect(bucketFor("2026-09-22", at("2026-09-15"))).toBe("This Week");
    expect(bucketFor("2026-09-23", at("2026-09-15"))).toBe("Someday");
  });

  it("only ever returns a heading the list draws", () => {
    for (const offset of [-40, -1, 0, 1, 3, 7, 8, 400]) {
      const day = new Date(2026, 8, 15 + offset);
      expect(BUCKETS).toContain(bucketFor(isoToday(day), at("2026-09-15")));
    }
  });
});

describe("dueLabel", () => {
  it("uses words where there are words", () => {
    expect(dueLabel("2026-09-15", at("2026-09-15"))).toBe("Today");
    expect(dueLabel("2026-09-16", at("2026-09-15"))).toBe("Tomorrow");
    expect(dueLabel("2026-09-14", at("2026-09-15"))).toBe("Yesterday");
  });

  it("says how late something is", () => {
    expect(dueLabel("2026-09-12", at("2026-09-15"))).toBe("3 days ago");
  });

  it("names the day for anything further out", () => {
    expect(dueLabel("2026-09-18", at("2026-09-15"))).toMatch(/Sep/);
  });
});

describe("byDueDate", () => {
  it("puts the soonest first and the undated last", () => {
    const rows = [
      { due_date: null },
      { due_date: "2026-09-20" },
      { due_date: "2026-09-16" },
    ];

    expect([...rows].sort(byDueDate).map((r) => r.due_date)).toEqual([
      "2026-09-16",
      "2026-09-20",
      null,
    ]);
  });
});
