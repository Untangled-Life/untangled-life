import { parseRoster, toPatternShifts, countWarnings } from "@/lib/rosterParser";

const only = (text: string) => parseRoster(text).shifts[0];

describe("plain weekday rosters", () => {
  it("reads a full week written one line each", () => {
    const { shifts } = parseRoster(`
      Mon 08:30-17:30
      Tue 08:30-17:30
      Wed 08:30-17:30
      Thu 08:30-17:30
      Fri 08:30-17:30
    `);
    expect(shifts).toHaveLength(5);
    expect(shifts.map((s) => s.weekday)).toEqual([1, 2, 3, 4, 5]);
    expect(shifts.every((s) => s.start === "08:30" && s.end === "17:30")).toBe(true);
  });

  it("reads full day names", () => {
    expect(only("Wednesday 9:00 - 17:00").weekday).toBe(3);
  });

  it("is case insensitive", () => {
    expect(only("MONDAY 08:30-17:30").weekday).toBe(1);
    expect(only("mon 08:30-17:30").weekday).toBe(1);
  });

  it("handles the Tues/Thurs abbreviations people actually write", () => {
    expect(only("Tues 9-5").weekday).toBe(2);
    expect(only("Thurs 9-5").weekday).toBe(4);
  });

  it("accepts a comma-separated run-on line", () => {
    const { shifts } = parseRoster("Mon 9-5, Tue 9-5, Wed 9-5");
    expect(shifts).toHaveLength(3);
  });

  it("accepts tab-separated cells pasted from a spreadsheet", () => {
    const { shifts } = parseRoster("Mon\t08:30\t17:30\nTue\t08:30\t17:30");
    expect(shifts).toHaveLength(2);
    expect(shifts[0].start).toBe("08:30");
  });
});

describe("time formats", () => {
  it("reads 24-hour with a colon", () => {
    expect(only("Mon 08:30-17:30")).toMatchObject({ start: "08:30", end: "17:30" });
  });

  it("reads a dot as a separator", () => {
    expect(only("Mon 8.30-17.30")).toMatchObject({ start: "08:30", end: "17:30" });
  });

  it("reads military four-digit times", () => {
    expect(only("MON 0830-1730")).toMatchObject({ start: "08:30", end: "17:30" });
  });

  it("reads am/pm", () => {
    expect(only("Mon 8:30am - 5:30pm")).toMatchObject({ start: "08:30", end: "17:30" });
  });

  it("reads am/pm without minutes", () => {
    expect(only("Sat 9am-1pm")).toMatchObject({ start: "09:00", end: "13:00" });
  });

  it("handles 12pm as noon and 12am as midnight", () => {
    expect(only("Mon 12pm-8pm").start).toBe("12:00");
    expect(only("Mon 12am-8am").start).toBe("00:00");
  });

  it("accepts 'to' instead of a dash", () => {
    expect(only("Mon 9am to 5pm")).toMatchObject({ start: "09:00", end: "17:00" });
  });

  it("accepts en and em dashes", () => {
    expect(only("Mon 9am – 5pm").end).toBe("17:00");
    // Deliberately an em dash: this is roster text somebody pasted in, not
    // our own writing, and the parser has to cope with what people send.
    expect(only("Mon 9am \u2014 5pm").end).toBe("17:00");
  });
});

describe("ambiguity -- guesses, flagged", () => {
  /** "9-5" is 9am-5pm to any human. The parser should agree, and admit it. */
  it("reads a bare 9-5 as a working day", () => {
    const s = only("Mon 9-5");
    expect(s.start).toBe("09:00");
    expect(s.end).toBe("17:00");
    expect(s.warnings.length).toBeGreaterThan(0);
  });

  it("flags the Sat 9-1 case from the brief", () => {
    const s = only("Sat 9-1");
    expect(s.start).toBe("09:00");
    expect(s.end).toBe("13:00");
    expect(s.warnings).toContain("Assumed the finish is in the afternoon");
  });

  it("does not flag a range that stated am and pm", () => {
    expect(only("Mon 9am-5pm").warnings).toHaveLength(0);
  });

  it("does not flag unambiguous 24-hour times", () => {
    expect(only("Mon 08:30-17:30").warnings).toHaveLength(0);
  });

  it("leaves a genuine morning range alone", () => {
    const s = only("Mon 6-11");
    expect(s.start).toBe("06:00");
    expect(s.end).toBe("11:00");
  });

  it("flags a shift running past midnight", () => {
    expect(only("Mon 22:00-06:00").warnings).toContain("Runs past midnight");
  });

  it("counts how many rows need a look", () => {
    const { shifts } = parseRoster("Mon 9-5\nTue 08:30-17:30\nWed 9-1");
    expect(countWarnings(shifts)).toBe(2);
  });
});

describe("days off", () => {
  it.each(["Sat OFF", "Sun RDO", "Wed - rest day", "Thu annual leave"])(
    "reads %s as a day off",
    (line) => {
      const s = only(line);
      expect(s.off).toBe(true);
      expect(s.start).toBe("");
    }
  );

  it("does not mistake a shift for a day off just because it has a dash", () => {
    expect(only("Mon 9-5").off).toBe(false);
  });
});

describe("dated rosters", () => {
  it("reads a day and month", () => {
    const s = parseRoster("14/09 9am-5pm", 2026).shifts[0];
    expect(s.date).toBe("2026-09-14");
    expect(s.weekday).toBe(1); // 14 Sep 2026 is a Monday
  });

  it("reads DD-MM-YYYY", () => {
    expect(parseRoster("20-09-2026 9am-1pm").shifts[0].date).toBe("2026-09-20");
  });

  it("reads a two-digit year", () => {
    expect(parseRoster("20/09/26 9am-1pm").shifts[0].date).toBe("2026-09-20");
  });

  it("reads day-first, never month-first", () => {
    // 09/10 is 9 October, not 10 September.
    expect(parseRoster("09/10 9am-5pm", 2026).shifts[0].date).toBe("2026-10-09");
  });

  it("surfaces a line whose date is impossible rather than guessing at it", () => {
    // 31 February can't be placed, and there's no weekday to fall back on, so
    // the line is reported rather than silently dropped.
    const { shifts, unparsed } = parseRoster("31/02 9am-5pm", 2026);
    expect(shifts).toHaveLength(0);
    expect(unparsed).toEqual(["31/02 9am-5pm"]);
  });

  it("prefers a named weekday over the date's own weekday", () => {
    // Trusting the words people wrote over arithmetic they may have got wrong.
    expect(parseRoster("Tue 15/09 9am-5pm", 2026).shifts[0].weekday).toBe(2);
  });
});

describe("noise and nonsense", () => {
  it("skips headers and totals rather than guessing at them", () => {
    const { shifts, unparsed } = parseRoster(`
      ROSTER WEEK COMMENCING
      Employee: R Trimarchi
      Mon 9-5
      Total hours: 38
    `);
    expect(shifts).toHaveLength(1);
    expect(unparsed).toHaveLength(0);
  });

  it("reports a line that named a day but had unreadable hours", () => {
    const { shifts, unparsed } = parseRoster("Mon sometime in the morning");
    expect(shifts).toHaveLength(0);
    expect(unparsed).toEqual(["Mon sometime in the morning"]);
  });

  it("returns nothing for empty input", () => {
    expect(parseRoster("")).toEqual({ shifts: [], unparsed: [] });
  });

  it("keeps the original line so the screen can show its working", () => {
    expect(only("  Mon 9-5  ").source).toBe("Mon 9-5");
  });

  it("rejects an impossible hour", () => {
    const { shifts, unparsed } = parseRoster("Mon 25:00-30:00");
    expect(shifts).toHaveLength(0);
    expect(unparsed).toHaveLength(1);
  });
});

describe("toPatternShifts", () => {
  it("converts to the shape work_patterns stores", () => {
    const { shifts } = parseRoster("Mon 08:30-17:30\nTue 08:30-17:30");
    expect(toPatternShifts(shifts)).toEqual([
      { week: 0, weekday: 1, start: "08:30", end: "17:30" },
      { week: 0, weekday: 2, start: "08:30", end: "17:30" },
    ]);
  });

  it("leaves days off out of the pattern", () => {
    const { shifts } = parseRoster("Mon 9am-5pm\nSat OFF");
    expect(toPatternShifts(shifts)).toHaveLength(1);
  });

  it("can target a rotation week", () => {
    const { shifts } = parseRoster("Mon 9am-5pm");
    expect(toPatternShifts(shifts, 1)[0].week).toBe(1);
  });
});

describe("a whole realistic paste", () => {
  it("reads a dealership-style week", () => {
    const { shifts, unparsed } = parseRoster(`
      WEEK COMMENCING 14/09/2026
      Mon   8:30am - 5:30pm
      Tue   8:30am - 5:30pm
      Wed   RDO
      Thu   8:30am - 5:30pm
      Fri   8:30am - 9:00pm
      Sat   9am - 4pm
      Sun   OFF
    `);

    expect(unparsed).toHaveLength(0);
    expect(shifts).toHaveLength(7);
    expect(shifts.filter((s) => s.off).map((s) => s.weekday)).toEqual([3, 0]);
    expect(shifts.find((s) => s.weekday === 5)).toMatchObject({ start: "08:30", end: "21:00" });
    expect(toPatternShifts(shifts)).toHaveLength(5);
  });
});
