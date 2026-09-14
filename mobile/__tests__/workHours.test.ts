import {
  cycleWeekFor,
  expandWorkHours,
  expandWorkOccurrences,
  describePattern,
  toDateKey,
  WorkPattern,
  WorkShift,
} from "@/lib/workHours";

const pattern = (over: Partial<WorkPattern> = {}): WorkPattern => ({
  id: "p1",
  user_id: "u1",
  mode: "weekly",
  cycle_weeks: 1,
  anchor_date: "2026-09-14", // a Monday
  shifts: [],
  ...over,
});

const weekdays = (days: number[], start = "08:30", end = "17:30", week = 0) =>
  days.map((weekday) => ({ week, weekday, start, end }));

const shift = (over: Partial<WorkShift> = {}): WorkShift => ({
  id: "s1",
  user_id: "u1",
  date: "2026-09-16",
  start_time: "09:00:00",
  end_time: "14:00:00",
  kind: "extra",
  ...over,
});

const RANGE_START = new Date(2026, 8, 14);
const RANGE_END = new Date(2026, 8, 28, 23, 59);

const keysOf = (intervals: { start: Date }[]) => intervals.map((i) => toDateKey(i.start));

describe("cycleWeekFor", () => {
  it("is always week 0 when there is no rotation", () => {
    expect(cycleWeekFor(new Date(2026, 8, 21), "2026-09-14", 1)).toBe(0);
  });

  it("alternates across a fortnight", () => {
    expect(cycleWeekFor(new Date(2026, 8, 14), "2026-09-14", 2)).toBe(0);
    expect(cycleWeekFor(new Date(2026, 8, 21), "2026-09-14", 2)).toBe(1);
    expect(cycleWeekFor(new Date(2026, 8, 28), "2026-09-14", 2)).toBe(0);
  });

  /** REGRESSION -- JS % keeps the dividend's sign, so dates before the anchor
   *  returned negative weeks and matched nothing. */
  it("handles dates before the anchor without going negative", () => {
    expect(cycleWeekFor(new Date(2026, 8, 7), "2026-09-14", 2)).toBe(1);
    expect(cycleWeekFor(new Date(2026, 7, 31), "2026-09-14", 2)).toBe(0);
    expect(cycleWeekFor(new Date(2026, 7, 24), "2026-09-14", 2)).toBe(1);
  });

  it("counts whole weeks, so any day of a week sits in the same slot", () => {
    const week = (d: number) => cycleWeekFor(new Date(2026, 8, d), "2026-09-14", 2);
    expect([week(21), week(22), week(23), week(24), week(25), week(26), week(27)]).toEqual([
      1, 1, 1, 1, 1, 1, 1,
    ]);
  });

  it("does not drift when the anchor is set mid-week", () => {
    // Wednesday the 16th is in the same week as Monday the 14th.
    expect(cycleWeekFor(new Date(2026, 8, 21), "2026-09-16", 2)).toBe(1);
  });

  it("supports longer rotations", () => {
    const week = (d: number) => cycleWeekFor(new Date(2026, 8, d), "2026-09-14", 3);
    expect([week(14), week(21), week(28)]).toEqual([0, 1, 2]);
  });
});

describe("expandWorkHours", () => {
  it("repeats a weekly pattern on every matching day", () => {
    const p = pattern({ shifts: weekdays([1]) }); // Mondays
    expect(keysOf(expandWorkHours(p, [], RANGE_START, RANGE_END))).toEqual([
      "2026-09-14",
      "2026-09-21",
      "2026-09-28",
    ]);
  });

  /**
   * REGRESSION -- regular hours ran fortnightly.
   *
   * The work-hours screen defaults its cycle length to 2 for the rotating
   * case, and persist() wrote it in every mode. Mode must be the authority:
   * a weekly pattern repeats every week whatever number sits beside it.
   */
  it("ignores a stray cycle_weeks on a weekly pattern", () => {
    const p = pattern({ mode: "weekly", cycle_weeks: 2, shifts: weekdays([1]) });
    expect(keysOf(expandWorkHours(p, [], RANGE_START, RANGE_END))).toEqual([
      "2026-09-14",
      "2026-09-21",
      "2026-09-28",
    ]);
  });

  it("alternates a genuine fortnightly rotation", () => {
    const p = pattern({ mode: "rotating", cycle_weeks: 2, shifts: weekdays([1]) });
    expect(keysOf(expandWorkHours(p, [], RANGE_START, RANGE_END))).toEqual([
      "2026-09-14",
      "2026-09-28",
    ]);
  });

  it("places each week of a rotation on its own shifts", () => {
    const p = pattern({
      mode: "rotating",
      cycle_weeks: 2,
      shifts: [...weekdays([1], "08:00", "16:00", 0), ...weekdays([6], "09:00", "13:00", 1)],
    });
    expect(keysOf(expandWorkHours(p, [], RANGE_START, RANGE_END))).toEqual([
      "2026-09-14", // week 0 Monday
      "2026-09-26", // week 1 Saturday
      "2026-09-28", // week 0 Monday again
    ]);
  });

  it("ignores the pattern entirely when the mode is irregular", () => {
    const p = pattern({ mode: "irregular", shifts: weekdays([1, 2, 3, 4, 5]) });
    expect(expandWorkHours(p, [], RANGE_START, RANGE_END)).toHaveLength(0);
  });

  it("runs an overnight shift into the following day", () => {
    const p = pattern({ shifts: weekdays([1], "22:00", "06:00") });
    const [first] = expandWorkHours(p, [], RANGE_START, RANGE_END);
    expect(first.start.getHours()).toBe(22);
    expect(first.end.getHours()).toBe(6);
    expect(first.end.getDate()).toBe(first.start.getDate() + 1);
  });

  it("treats a shift ending exactly when it starts as overnight, not empty", () => {
    const p = pattern({ shifts: weekdays([1], "09:00", "09:00") });
    const [first] = expandWorkHours(p, [], RANGE_START, RANGE_END);
    expect(first.end.getTime() - first.start.getTime()).toBe(24 * 60 * 60 * 1000);
  });

  it("lets a one-off day off clear that day", () => {
    const p = pattern({ shifts: weekdays([1]) });
    const off = [shift({ date: "2026-09-21", kind: "off", start_time: null, end_time: null })];
    expect(keysOf(expandWorkHours(p, off, RANGE_START, RANGE_END))).toEqual([
      "2026-09-14",
      "2026-09-28",
    ]);
  });

  it("adds a one-off shift on top of the pattern", () => {
    const p = pattern({ shifts: weekdays([1]) });
    const extra = [shift({ date: "2026-09-19" })];
    expect(keysOf(expandWorkHours(p, extra, RANGE_START, RANGE_END))).toContain("2026-09-19");
  });

  it("works with one-off shifts and no pattern at all", () => {
    const result = expandWorkHours(null, [shift({ date: "2026-09-17" })], RANGE_START, RANGE_END);
    expect(keysOf(result)).toEqual(["2026-09-17"]);
  });

  it("excludes shifts outside the requested range", () => {
    const p = pattern({ shifts: weekdays([1]) });
    const narrow = expandWorkHours(p, [], new Date(2026, 8, 20), new Date(2026, 8, 22));
    expect(keysOf(narrow)).toEqual(["2026-09-21"]);
  });

  it("returns intervals in chronological order", () => {
    const p = pattern({ shifts: weekdays([1, 3, 5]) });
    const times = expandWorkHours(p, [], RANGE_START, RANGE_END).map((i) => i.start.getTime());
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });
});

describe("expandWorkOccurrences", () => {
  it("says which intervals came from the pattern and which from a row", () => {
    const p = pattern({ shifts: weekdays([1]) });
    const occurrences = expandWorkOccurrences(
      p,
      [shift({ id: "one-off-1", date: "2026-09-16" })],
      RANGE_START,
      RANGE_END
    );

    const oneOff = occurrences.find((o) => toDateKey(o.interval.start) === "2026-09-16");
    const fromPattern = occurrences.find((o) => toDateKey(o.interval.start) === "2026-09-14");

    expect(oneOff?.source).toEqual({ type: "shift", id: "one-off-1" });
    expect(fromPattern?.source).toEqual({ type: "pattern" });
  });
});

describe("describePattern", () => {
  it("describes having no pattern", () => {
    expect(describePattern(null)).toMatch(/No regular hours/i);
  });

  it("describes a weekly pattern without mentioning a rotation", () => {
    const text = describePattern(pattern({ shifts: weekdays([1, 2]) }));
    expect(text).toMatch(/Every week/i);
    expect(text).not.toMatch(/rotation/i);
  });

  it("does not call a weekly pattern a rotation even with a stray cycle", () => {
    const text = describePattern(pattern({ mode: "weekly", cycle_weeks: 2, shifts: weekdays([1]) }));
    expect(text).not.toMatch(/rotation/i);
  });

  it("describes a real rotation", () => {
    const text = describePattern(
      pattern({ mode: "rotating", cycle_weeks: 3, shifts: weekdays([1]) })
    );
    expect(text).toMatch(/3-week rotation/i);
  });
});

describe("a roster entered in another time zone", () => {
  // The suite runs in America/New_York (UTC-4 in September) and Los Angeles is
  // UTC-7, so the device is three hours AHEAD of the roster. Midnight here is
  // still nine o'clock the previous evening there -- which is how a Monday
  // shift used to be placed on the Sunday, the whole roster sliding a day.
  const la = pattern({
    time_zone: "America/Los_Angeles",
    shifts: weekdays([1], "09:00", "17:00"),
  });

  it("puts a Monday shift on the roster's Monday", () => {
    const found = expandWorkHours(
      la,
      [],
      new Date(2026, 8, 13, 0, 0, 0, 0),
      new Date(2026, 8, 20, 0, 0, 0, 0)
    );

    expect(found).toHaveLength(1);
    // 9am in Los Angeles on Monday 14 September is 16:00 UTC.
    expect(found[0].start.toISOString()).toBe("2026-09-14T16:00:00.000Z");
    expect(found[0].end.toISOString()).toBe("2026-09-15T00:00:00.000Z");
  });

  it("does the same for a one-off shift", () => {
    const found = expandWorkHours(
      pattern(),
      [shift({ date: "2026-09-16", start_time: "09:00:00", end_time: "17:00:00", time_zone: "America/Los_Angeles" })],
      new Date(2026, 8, 13, 0, 0, 0, 0),
      new Date(2026, 8, 20, 0, 0, 0, 0)
    );

    expect(found).toHaveLength(1);
    expect(found[0].start.toISOString()).toBe("2026-09-16T16:00:00.000Z");
  });

  it("still uses the device's own clock when no zone is stored", () => {
    const here = pattern({ shifts: weekdays([1], "09:00", "17:00") });
    const found = expandWorkHours(
      here,
      [],
      new Date(2026, 8, 13, 0, 0, 0, 0),
      new Date(2026, 8, 20, 0, 0, 0, 0)
    );

    expect(found).toHaveLength(1);
    expect(found[0].start.getHours()).toBe(9);
    expect(found[0].start.getDate()).toBe(14);
  });
});

// The suite runs in America/New_York: the clocks go forward on 8 March 2026
// and back on 1 November 2026.
describe("a roster across a daylight-saving transition", () => {
  const sundays = pattern({
    time_zone: "America/New_York",
    shifts: weekdays([0], "09:00", "17:00"),
  });

  // Stepping the loop by a fixed twenty-four hours landed on 1 November twice,
  // because that day is twenty-five hours long -- so a Sunday shift was listed
  // twice on the day the clocks went back.
  it("lists a Sunday shift once on the day the clocks go back", () => {
    const found = expandWorkHours(
      sundays,
      [],
      new Date(2026, 9, 29),
      new Date(2026, 10, 5)
    );
    expect(found).toHaveLength(1);
    expect(found[0].start.getDate()).toBe(1);
    expect(found[0].start.getHours()).toBe(9);
  });

  // ...and drifted an hour forward each day after the spring transition, until
  // the last day of the range was stepped clean over and its shifts vanished.
  it("still reaches the last day of a range that starts on the spring transition", () => {
    const thursdays = pattern({
      time_zone: "America/New_York",
      shifts: weekdays([4], "09:00", "17:00"),
    });

    const found = expandWorkHours(
      thursdays,
      [],
      new Date(2026, 2, 8),
      new Date(2026, 2, 12, 23, 59)
    );
    expect(found).toHaveLength(1);
    expect(found[0].start.getDate()).toBe(12);
  });

  // An overnight shift asked for as start plus twenty-four hours finishes an
  // hour out on the two nights a year the clocks move, and those are night
  // shifts, so it is exactly the wrong night to be out.
  it("ends an overnight shift at the right clock time across a transition", () => {
    const nights = pattern({
      time_zone: "America/New_York",
      shifts: weekdays([6], "22:00", "06:00"),
    });

    const found = expandWorkHours(nights, [], new Date(2026, 9, 30), new Date(2026, 10, 3));
    expect(found).toHaveLength(1);
    // Saturday 31 October 10pm through to Sunday 1 November 6am, which is nine
    // real hours because the clocks go back in the middle of it.
    expect(found[0].start.getHours()).toBe(22);
    expect(found[0].end.getHours()).toBe(6);
    expect(found[0].end.getTime() - found[0].start.getTime()).toBe(9 * 60 * 60 * 1000);
  });
});
