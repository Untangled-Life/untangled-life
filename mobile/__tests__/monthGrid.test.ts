import { MonthEvent, daysBetween, inMonth, packWeek, weeksOfMonth } from "@/lib/monthGrid";

// September 2026 starts on a Tuesday, so the first week of the grid runs from
// Monday 31 August.
const d = (day: number, month = 9, year = 2026) => new Date(year, month - 1, day);

const ev = (over: Partial<MonthEvent> & { id: string }): MonthEvent => ({
  title: "Something",
  start: d(14),
  end: d(14),
  kind: "plan",
  whose: null,
  ...over,
});

describe("daysBetween", () => {
  it("counts whole days", () => {
    expect(daysBetween(d(14), d(14))).toBe(0);
    expect(daysBetween(d(14), d(17))).toBe(3);
    expect(daysBetween(d(17), d(14))).toBe(-3);
  });

  // The suite runs in America/New_York, where 1 November 2026 is 25 hours
  // long. Dividing the millisecond gap floors to the day before and shifts
  // every bar in that week a column left.
  it("is right across a daylight-saving boundary", () => {
    expect(daysBetween(d(31, 10), d(2, 11))).toBe(2);
    expect(daysBetween(d(7, 3), d(9, 3))).toBe(2);
  });

  it("ignores the time of day", () => {
    const morning = new Date(2026, 8, 14, 7, 30);
    const night = new Date(2026, 8, 15, 23, 45);
    expect(daysBetween(morning, night)).toBe(1);
  });
});

describe("weeksOfMonth", () => {
  it("starts on the Monday on or before the first", () => {
    const weeks = weeksOfMonth(d(1));
    expect(weeks[0].getDate()).toBe(31);
    expect(weeks[0].getMonth()).toBe(7); // August
    expect(weeks[0].getDay()).toBe(1); // Monday
  });

  it("covers the whole month and no more", () => {
    const weeks = weeksOfMonth(d(1));
    expect(weeks).toHaveLength(5);

    const last = weeks[weeks.length - 1];
    expect(last.getDate()).toBe(28);
  });

  // February 2027 starts on a Monday and has 28 days: exactly four weeks, with
  // no padding at either end. The off-by-one case.
  it("handles a month that is exactly four weeks", () => {
    const weeks = weeksOfMonth(new Date(2027, 1, 1));
    expect(weeks).toHaveLength(4);
    expect(weeks[0].getDate()).toBe(1);
  });

  it("never returns more than six weeks", () => {
    for (let m = 0; m < 12; m++) {
      expect(weeksOfMonth(new Date(2026, m, 1)).length).toBeLessThanOrEqual(6);
    }
  });
});

describe("packWeek", () => {
  const weekStart = d(14); // Monday 14 September

  it("gives the seven days, Monday first", () => {
    const { days } = packWeek(weekStart, []);
    expect(days).toHaveLength(7);
    expect(days[0].getDate()).toBe(14);
    expect(days[6].getDate()).toBe(20);
    expect(days[0].getDay()).toBe(1);
  });

  it("places a one-day event in its own column", () => {
    const { lanes } = packWeek(weekStart, [ev({ id: "a", start: d(16), end: d(16) })]);
    expect(lanes[0][0]).toMatchObject({
      col: 2,
      span: 1,
      continuesLeft: false,
      continuesRight: false,
    });
  });

  // The whole reason for lanes. Drawn as five chips it reads as five separate
  // things rather than one trip.
  it("runs a multi-day event as one bar", () => {
    const { lanes } = packWeek(weekStart, [ev({ id: "a", start: d(15), end: d(18) })]);
    expect(lanes).toHaveLength(1);
    expect(lanes[0]).toHaveLength(1);
    expect(lanes[0][0]).toMatchObject({ col: 1, span: 4 });
  });

  it("clips an event that started before this week", () => {
    const { lanes } = packWeek(weekStart, [ev({ id: "a", start: d(10), end: d(16) })]);
    expect(lanes[0][0]).toMatchObject({
      col: 0,
      span: 3,
      continuesLeft: true,
      continuesRight: false,
    });
  });

  it("clips one that carries on after it", () => {
    const { lanes } = packWeek(weekStart, [ev({ id: "a", start: d(18), end: d(25) })]);
    expect(lanes[0][0]).toMatchObject({
      col: 4,
      span: 3,
      continuesLeft: false,
      continuesRight: true,
    });
  });

  it("clips both ends of an event that swallows the week", () => {
    const { lanes } = packWeek(weekStart, [ev({ id: "a", start: d(1), end: d(30) })]);
    expect(lanes[0][0]).toMatchObject({
      col: 0,
      span: 7,
      continuesLeft: true,
      continuesRight: true,
    });
  });

  it("leaves out anything that misses the week entirely", () => {
    const { lanes, overflow } = packWeek(weekStart, [
      ev({ id: "before", start: d(1), end: d(5) }),
      ev({ id: "after", start: d(25), end: d(27) }),
    ]);
    expect(lanes).toEqual([]);
    expect(overflow).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });

  it("puts two events on the same day in different lanes", () => {
    const { lanes } = packWeek(weekStart, [
      ev({ id: "a", start: d(16), end: d(16) }),
      ev({ id: "b", start: d(16), end: d(16) }),
    ]);
    expect(lanes).toHaveLength(2);
    expect(lanes[0][0].event.id).toBe("a");
    expect(lanes[1][0].event.id).toBe("b");
  });

  it("shares a lane between events that do not overlap", () => {
    const { lanes } = packWeek(weekStart, [
      ev({ id: "a", start: d(14), end: d(15) }),
      ev({ id: "b", start: d(17), end: d(18) }),
    ]);
    expect(lanes).toHaveLength(1);
    expect(lanes[0].map((c) => c.event.id)).toEqual(["a", "b"]);
  });

  // A long bar broken across lanes by a short one placed first reads as two
  // separate trips, so the long one goes down before anything shorter.
  it("puts the longest bar in the top lane", () => {
    const { lanes } = packWeek(weekStart, [
      ev({ id: "short", start: d(16), end: d(16) }),
      ev({ id: "trip", start: d(14), end: d(20) }),
    ]);
    expect(lanes[0][0].event.id).toBe("trip");
    expect(lanes[1][0].event.id).toBe("short");
  });

  // The lane a bar lands in is decided longest-first; the order it comes out
  // in has to be left to right regardless, because a renderer walking the
  // lane and emitting a gap before each chip cannot go backwards. Getting
  // this wrong put every bar in the lane in the wrong column at the wrong
  // width, and the widths no longer summed to a week.
  it("hands back each lane left to right, not in placement order", () => {
    const { lanes } = packWeek(weekStart, [
      ev({ id: "dinner", start: d(14), end: d(14) }),
      ev({ id: "trip", start: d(17), end: d(20) }),
    ]);

    expect(lanes).toHaveLength(1);
    expect(lanes[0].map((c) => c.event.id)).toEqual(["dinner", "trip"]);

    const covered = lanes[0].reduce((n, c) => n + c.span, 0);
    const gaps = lanes[0].reduce(
      (acc, c) => ({
        cursor: c.col + c.span,
        gap: acc.gap + (c.col - acc.cursor),
      }),
      { cursor: 0, gap: 0 }
    );
    expect(covered + gaps.gap + (7 - gaps.cursor)).toBe(7);
  });

  // Without a final tiebreak the lanes reshuffle whenever the query returns
  // rows in a different order, and the calendar twitches on every refresh.
  it("draws the same way whatever order it is given", () => {
    const events = [
      ev({ id: "c", start: d(16), end: d(16) }),
      ev({ id: "a", start: d(16), end: d(16) }),
      ev({ id: "b", start: d(16), end: d(16) }),
    ];
    const first = packWeek(weekStart, events).lanes.map((l) => l[0].event.id);
    const second = packWeek(weekStart, [...events].reverse()).lanes.map((l) => l[0].event.id);
    expect(first).toEqual(["a", "b", "c"]);
    expect(second).toEqual(first);
  });

  it("counts what did not fit, per day", () => {
    const events = Array.from({ length: 6 }, (_, i) =>
      ev({ id: `e${i}`, start: d(16), end: d(16) })
    );
    const { lanes, overflow } = packWeek(weekStart, events, 4);

    expect(lanes).toHaveLength(4);
    expect(overflow[2]).toBe(2);
    expect(overflow.filter((n) => n > 0)).toHaveLength(1);
  });

  it("counts an overflowing multi-day event on every day it covers", () => {
    const filler = Array.from({ length: 4 }, (_, i) =>
      ev({ id: `f${i}`, start: d(14), end: d(20) })
    );
    const { overflow } = packWeek(
      weekStart,
      [...filler, ev({ id: "late", start: d(15), end: d(17) })],
      4
    );
    expect(overflow).toEqual([0, 1, 1, 1, 0, 0, 0]);
  });

  it("respects a smaller lane budget", () => {
    const events = Array.from({ length: 3 }, (_, i) =>
      ev({ id: `e${i}`, start: d(16), end: d(16) })
    );
    const { lanes, overflow } = packWeek(weekStart, events, 1);
    expect(lanes).toHaveLength(1);
    expect(overflow[2]).toBe(2);
  });

  // A bad row rather than a zero-length event. Dropping it silently is how a
  // calendar loses something it was told about.
  it("shows an event whose end is before its start", () => {
    const { lanes } = packWeek(weekStart, [ev({ id: "a", start: d(16), end: d(15) })]);
    expect(lanes[0][0]).toMatchObject({ col: 2, span: 1 });
  });

  it("copes with a week that crosses a daylight-saving boundary", () => {
    // Monday 26 October 2026; the clocks go back on Sunday 1 November.
    const { days, lanes } = packWeek(d(26, 10), [ev({ id: "a", start: d(30, 10), end: d(2, 11) })]);

    expect(days[6].getDate()).toBe(1);
    expect(days[6].getMonth()).toBe(10);
    expect(lanes[0][0]).toMatchObject({
      col: 4,
      span: 3,
      continuesRight: true,
    });
  });
});

describe("inMonth", () => {
  it("knows the padding days are not part of it", () => {
    expect(inMonth(d(14), d(1))).toBe(true);
    expect(inMonth(d(31, 8), d(1))).toBe(false);
    expect(inMonth(d(1, 10), d(1))).toBe(false);
    expect(inMonth(new Date(2025, 8, 14), d(1))).toBe(false);
  });
});
