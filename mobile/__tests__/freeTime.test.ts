import {
  mergeIntervals,
  nextSharedFreeWindows,
  formatWindow,
  DEFAULT_FREE_TIME_PREFS,
  FreeTimePrefs,
  subtractIntervals,
  intersectIntervals,
  awakeIntervals,
} from "@/lib/freeTime";
import { dateKeyInZone } from "@/lib/timezone";

const at = (day: number, h: number, m = 0) => new Date(2026, 8, day, h, m, 0, 0);
const iv = (day: number, h1: number, h2: number) => ({ start: at(day, h1), end: at(day, h2) });

describe("mergeIntervals", () => {
  it("returns nothing for no input", () => {
    expect(mergeIntervals([])).toEqual([]);
  });

  it("merges overlapping intervals", () => {
    const merged = mergeIntervals([iv(14, 9, 12), iv(14, 11, 14)]);
    expect(merged).toHaveLength(1);
    expect(merged[0].start).toEqual(at(14, 9));
    expect(merged[0].end).toEqual(at(14, 14));
  });

  it("merges a fully contained interval without shrinking the outer one", () => {
    const merged = mergeIntervals([iv(14, 9, 17), iv(14, 12, 13)]);
    expect(merged).toHaveLength(1);
    expect(merged[0].end).toEqual(at(14, 17));
  });

  it("keeps genuinely separate intervals apart", () => {
    expect(mergeIntervals([iv(14, 9, 10), iv(14, 15, 16)])).toHaveLength(2);
  });

  it("merges regardless of input order", () => {
    expect(mergeIntervals([iv(14, 15, 16), iv(14, 9, 16)])).toHaveLength(1);
  });

  it("does not mutate its input", () => {
    const input = [iv(14, 9, 12), iv(14, 11, 14)];
    const originalEnd = input[0].end.getTime();
    mergeIntervals(input);
    expect(input[0].end.getTime()).toBe(originalEnd);
  });
});

describe("nextSharedFreeWindows", () => {
  afterEach(() => jest.useRealTimers());

  const freeze = (d: Date) => jest.useFakeTimers().setSystemTime(d);

  /**
   * REGRESSION -- bookings never reached the calendar.
   *
   * The filter only required a window's END to be in the future, so today's
   * 7am-11pm span stayed on offer all evening. Booking it created an event
   * that had already finished, which the calendar sync correctly skipped.
   */
  it("never offers a window that has already started", () => {
    freeze(at(14, 18, 40)); // 6:40pm
    const windows = nextSharedFreeWindows([], []);
    const today = windows.filter((w) => w.start.getDate() === 14);

    expect(today).toHaveLength(1);
    expect(today[0].start.getTime()).toBeGreaterThanOrEqual(at(14, 18, 40).getTime());
    expect(today[0].start.getHours()).toBe(18);
    expect(today[0].start.getMinutes()).toBe(45); // rounded up to the quarter hour
  });

  it("rounds a start up to the next quarter hour", () => {
    freeze(at(14, 18, 47));
    const today = nextSharedFreeWindows([], []).filter((w) => w.start.getDate() === 14);
    expect(today[0].start.getHours()).toBe(19);
    expect(today[0].start.getMinutes()).toBe(0);
  });

  it("drops today once too little of it remains to be worth offering", () => {
    freeze(at(14, 22, 50)); // under 30 minutes before the 11pm cutoff
    const today = nextSharedFreeWindows([], []).filter((w) => w.start.getDate() === 14);
    expect(today).toHaveLength(0);
  });

  it("offers the full waking day before it has started", () => {
    freeze(at(14, 5, 0));
    const today = nextSharedFreeWindows([], []).filter((w) => w.start.getDate() === 14);
    expect(today[0].start.getHours()).toBe(7);
    expect(today[0].end.getHours()).toBe(23);
  });

  it("treats either partner being busy as not free together", () => {
    freeze(at(14, 6, 0));
    const mine = [iv(14, 9, 12)];
    const theirs = [iv(14, 14, 16)];
    const today = nextSharedFreeWindows(mine, theirs).filter((w) => w.start.getDate() === 14);

    // 7-9, 12-14, 16-23
    expect(today).toHaveLength(3);
    expect(today.map((w) => [w.start.getHours(), w.end.getHours()])).toEqual([
      [7, 9],
      [12, 14],
      [16, 23],
    ]);
  });

  it("ignores gaps shorter than the 30-minute minimum", () => {
    freeze(at(14, 6, 0));
    const busy = [iv(14, 7, 12), { start: at(14, 12, 20), end: at(14, 23) }];
    const today = nextSharedFreeWindows(busy, []).filter((w) => w.start.getDate() === 14);
    expect(today).toHaveLength(0); // the only gap is 20 minutes
  });

  it("caps how many windows it returns", () => {
    freeze(at(14, 6, 0));
    expect(nextSharedFreeWindows([], [], DEFAULT_FREE_TIME_PREFS, undefined, 3)).toHaveLength(3);
  });

  it("reports a day fully blocked out as having no free time", () => {
    freeze(at(14, 6, 0));
    const allDay = [{ start: at(14, 0), end: at(14, 23, 59) }];
    const today = nextSharedFreeWindows(allDay, []).filter((w) => w.start.getDate() === 14);
    expect(today).toHaveLength(0);
  });

  // The whole point of making these settings: a night-shift worker's free
  // morning starts when the default window says the day has barely begun.
  it("respects a custom day window", () => {
    freeze(at(14, 3, 0));
    const nights: FreeTimePrefs = { dayStartHour: 4, dayEndHour: 12, minFreeMinutes: 30 };
    const [first] = nextSharedFreeWindows([], [], nights);
    expect(first.start.getHours()).toBe(4);
    expect(first.end.getHours()).toBe(12);
  });

  // An end hour of 24 has to mean midnight at the END of this day, not the
  // start of it -- setHours(24) rolling over is what makes that work.
  it("treats an end hour of 24 as midnight at the end of the day", () => {
    freeze(at(14, 6, 0));
    const lateNights: FreeTimePrefs = { dayStartHour: 7, dayEndHour: 24, minFreeMinutes: 30 };
    const [first] = nextSharedFreeWindows([], [], lateNights);
    expect(first.end.getDate()).toBe(15);
    expect(first.end.getHours()).toBe(0);
  });

  it("respects a longer minimum", () => {
    freeze(at(14, 6, 0));
    // A clear 90-minute gap, and nothing else free all day.
    const busy = [iv(14, 7, 12), { start: at(14, 13, 30), end: at(14, 23) }];
    const twoHours: FreeTimePrefs = { dayStartHour: 7, dayEndHour: 23, minFreeMinutes: 120 };

    expect(
      nextSharedFreeWindows(busy, [], twoHours).filter((w) => w.start.getDate() === 14)
    ).toHaveLength(0);
    expect(
      nextSharedFreeWindows(busy, [], DEFAULT_FREE_TIME_PREFS).filter(
        (w) => w.start.getDate() === 14
      )
    ).toHaveLength(1);
  });
});

describe("formatWindow", () => {
  it("includes the day and both times", () => {
    const label = formatWindow(iv(14, 18, 20));
    expect(label).toMatch(/Sep/);
    expect(label).toMatch(/14/);
    expect(label).toContain("–");
  });
});

describe("two people, two time zones", () => {
  const both = (mine: string, theirs: string | null) => ({ mine, theirs });
  const freeze = (d: Date) => jest.useFakeTimers().setSystemTime(d);

  afterEach(() => jest.useRealTimers());

  // Sydney is 14 hours ahead of New York in September. With a 7am-11pm window
  // each, the only stretch where both are awake is the Sydney morning, which
  // is the New York evening before.
  it("finds the overlap between two distant evenings", () => {
    freeze(at(14, 6, 0));

    const windows = nextSharedFreeWindows(
      [],
      [],
      DEFAULT_FREE_TIME_PREFS,
      both("America/New_York", "Australia/Sydney")
    );

    expect(windows.length).toBeGreaterThan(0);

    for (const w of windows) {
      const nyHour = Number(
        new Intl.DateTimeFormat("en-US", {
          timeZone: "America/New_York",
          hour: "2-digit",
          hour12: false,
        }).format(w.start)
      );
      const sydHour = Number(
        new Intl.DateTimeFormat("en-US", {
          timeZone: "Australia/Sydney",
          hour: "2-digit",
          hour12: false,
        }).format(w.start)
      );

      // Inside both people's waking hours, in their own local time.
      expect(nyHour).toBeGreaterThanOrEqual(7);
      expect(nyHour).toBeLessThan(23);
      expect(sydHour).toBeGreaterThanOrEqual(7);
      expect(sydHour).toBeLessThan(23);
    }
  });

  // The case the old day-by-day loop could not express at all: it had to pick
  // whose day it was looping over.
  it("returns nothing when the two waking windows never meet", () => {
    freeze(at(14, 6, 0));

    // A four-hour window each, deliberately placed on opposite sides of the
    // world so they cannot overlap.
    const narrow = { dayStartHour: 9, dayEndHour: 13, minFreeMinutes: 30 };

    expect(
      nextSharedFreeWindows([], [], narrow, both("America/New_York", "Australia/Sydney"))
    ).toHaveLength(0);
  });

  it("is unchanged when both are in the same zone", () => {
    freeze(at(14, 6, 0));

    const apart = nextSharedFreeWindows(
      [],
      [],
      DEFAULT_FREE_TIME_PREFS,
      both("America/New_York", "America/New_York")
    );
    const together = nextSharedFreeWindows(
      [],
      [],
      DEFAULT_FREE_TIME_PREFS,
      both("America/New_York", null)
    );

    expect(apart).toEqual(together);
  });

  // Busy time is an absolute instant, so it has to cut the overlap wherever it
  // lands, regardless of whose clock it was entered against.
  it("subtracts a partner's busy time across the date line", () => {
    freeze(at(14, 6, 0));

    const zones = both("America/New_York", "Australia/Sydney");
    const clear = nextSharedFreeWindows([], [], DEFAULT_FREE_TIME_PREFS, zones);
    expect(clear.length).toBeGreaterThan(0);

    // Block out the whole of the first window from the partner's side.
    const theirBusy = [{ start: clear[0].start, end: clear[0].end }];
    const after = nextSharedFreeWindows([], theirBusy, DEFAULT_FREE_TIME_PREFS, zones);

    expect(after[0].start.getTime()).toBeGreaterThanOrEqual(clear[0].end.getTime());
  });

  it("copes with a half-hour offset zone", () => {
    freeze(at(14, 6, 0));

    const windows = nextSharedFreeWindows(
      [],
      [],
      DEFAULT_FREE_TIME_PREFS,
      both("Australia/Sydney", "Australia/Adelaide")
    );

    expect(windows.length).toBeGreaterThan(0);
    // Half an hour of the day is lost at each end, not a whole one.
    expect(windows[0].start.getMinutes() % 30).toBe(0);
  });
});

describe("subtractIntervals", () => {
  const iv2 = (h1: number, h2: number) => ({ start: at(14, h1), end: at(14, h2) });

  it("removes a block from the middle, leaving two pieces", () => {
    expect(subtractIntervals([iv2(9, 17)], [iv2(12, 13)])).toEqual([iv2(9, 12), iv2(13, 17)]);
  });

  it("trims an overlapping edge", () => {
    expect(subtractIntervals([iv2(9, 17)], [iv2(8, 10)])).toEqual([iv2(10, 17)]);
  });

  it("removes the whole thing when fully covered", () => {
    expect(subtractIntervals([iv2(9, 17)], [iv2(8, 18)])).toEqual([]);
  });

  it("leaves a non-overlapping block alone", () => {
    expect(subtractIntervals([iv2(9, 12)], [iv2(13, 14)])).toEqual([iv2(9, 12)]);
  });

  it("handles several blocks at once", () => {
    expect(subtractIntervals([iv2(9, 17)], [iv2(10, 11), iv2(14, 15)])).toEqual([
      iv2(9, 10),
      iv2(11, 14),
      iv2(15, 17),
    ]);
  });
});

describe("intersectIntervals", () => {
  const iv2 = (h1: number, h2: number) => ({ start: at(14, h1), end: at(14, h2) });

  it("keeps only the shared stretch", () => {
    expect(intersectIntervals([iv2(9, 17)], [iv2(12, 20)])).toEqual([iv2(12, 17)]);
  });

  it("is empty when they only touch", () => {
    expect(intersectIntervals([iv2(9, 12)], [iv2(12, 17)])).toEqual([]);
  });

  it("is empty when they do not meet", () => {
    expect(intersectIntervals([iv2(9, 10)], [iv2(14, 15)])).toEqual([]);
  });

  it("handles many against many", () => {
    expect(intersectIntervals([iv2(9, 12), iv2(14, 18)], [iv2(11, 15)])).toEqual([
      iv2(11, 12),
      iv2(14, 15),
    ]);
  });
});

describe("awakeIntervals with an overnight day", () => {
  // Someone on nights whose day runs 10pm to 6am. An end hour at or before the
  // start used to produce an interval finishing sixteen hours before it began,
  // which merged into nonsense and quietly offered nobody any time at all.
  const nights: FreeTimePrefs = { dayStartHour: 22, dayEndHour: 6, minFreeMinutes: 30 };

  it("runs the window into the following morning", () => {
    const windows = awakeIntervals(
      new Date(2026, 8, 14, 0, 0, 0, 0),
      new Date(2026, 8, 17, 0, 0, 0, 0),
      nights,
      "America/New_York"
    );

    expect(windows.length).toBeGreaterThan(0);
    for (const w of windows) expect(w.end.getTime()).toBeGreaterThan(w.start.getTime());

    // One that sits wholly inside the range starts at 10pm and ends at 6am.
    const whole = windows.find((w) => w.start.getHours() === 22);
    expect(whole).toBeDefined();
    expect(whole!.end.getHours()).toBe(6);
    expect(whole!.end.getDate()).toBe(whole!.start.getDate() + 1);
  });

  it("covers the whole day when the hours are equal", () => {
    const allDay: FreeTimePrefs = { dayStartHour: 9, dayEndHour: 9, minFreeMinutes: 30 };
    const windows = awakeIntervals(
      new Date(2026, 8, 14, 0, 0, 0, 0),
      new Date(2026, 8, 17, 0, 0, 0, 0),
      allDay,
      "America/New_York"
    );

    // Every day joins the next, so it merges into one continuous stretch.
    expect(windows).toHaveLength(1);
  });

  it("answers the range it was given rather than a fixed week", () => {
    const start = new Date(2026, 8, 14, 0, 0, 0, 0);
    const end = new Date(2026, 9, 14, 0, 0, 0, 0);
    const windows = awakeIntervals(start, end, DEFAULT_FREE_TIME_PREFS, "America/New_York");

    // Thirty days of 7am-11pm, not seven. A hard-coded length used to truncate
    // here and read as "you are never free again".
    expect(windows.length).toBeGreaterThan(25);
    expect(windows[windows.length - 1].end.getTime()).toBeGreaterThan(
      end.getTime() - 24 * 60 * 60 * 1000
    );
  });
});

// The suite runs in America/New_York, whose clocks go back on 1 November 2026
// and forward on 8 March 2026.
describe("awakeIntervals across the device's own transitions", () => {
  const partnerDays = (start: Date, end: Date, zone: string) =>
    new Set(
      awakeIntervals(start, end, DEFAULT_FREE_TIME_PREFS, zone).map((w) =>
        dateKeyInZone(w.start, zone)
      )
    );

  // Walking a local Date and reading its date in the partner's zone skipped
  // one of their dates entirely on the day the device's clocks went back --
  // a partner who appeared to be asleep all day, for no reason a user could
  // see.
  it("keeps every partner day when the clocks go back", () => {
    const days = partnerDays(new Date(2026, 9, 29, 19, 10), new Date(2026, 10, 5), "UTC");
    for (const key of ["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02", "2026-11-03"]) {
      expect(days.has(key)).toBe(true);
    }
  });

  it("does not repeat a partner day when the clocks go forward", () => {
    const windows = awakeIntervals(
      new Date(2026, 2, 5, 19, 10),
      new Date(2026, 2, 12),
      DEFAULT_FREE_TIME_PREFS,
      "UTC"
    );
    const keys = windows.map((w) => dateKeyInZone(w.start, "UTC"));
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toContain("2026-03-08");
    expect(keys).toContain("2026-03-09");
  });
});
