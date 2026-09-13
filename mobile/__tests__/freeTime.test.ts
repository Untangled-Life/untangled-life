import { mergeIntervals, nextSharedFreeWindows, formatWindow } from "@/lib/freeTime";

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
   * REGRESSION — bookings never reached the calendar.
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
    expect(nextSharedFreeWindows([], [], 3)).toHaveLength(3);
  });

  it("reports a day fully blocked out as having no free time", () => {
    freeze(at(14, 6, 0));
    const allDay = [{ start: at(14, 0), end: at(14, 23, 59) }];
    const today = nextSharedFreeWindows(allDay, []).filter((w) => w.start.getDate() === 14);
    expect(today).toHaveLength(0);
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
