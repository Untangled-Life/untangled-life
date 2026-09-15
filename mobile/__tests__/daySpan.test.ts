import { daysCovered, lastCoveredDay } from "@/lib/daySpan";

const at = (day: number, h = 0, m = 0) => new Date(2026, 8, day, h, m, 0, 0);
const key = (d: Date) => d.getDate();

describe("lastCoveredDay", () => {
  it("is the day the event ends on", () => {
    expect(key(lastCoveredDay({ start: at(10, 9), end: at(12, 17) }))).toBe(12);
  });

  // The one that matters: an all-day event's end is midnight, which belongs to
  // the NEXT day. Without this a one-day "Annual leave" shows as two.
  it("steps back a day when the event ends at midnight", () => {
    expect(key(lastCoveredDay({ start: at(10), end: at(11) }))).toBe(10);
    expect(key(lastCoveredDay({ start: at(10), end: at(15) }))).toBe(14);
  });

  it("does not step back for an end just after midnight", () => {
    expect(key(lastCoveredDay({ start: at(10), end: at(11, 0, 1) }))).toBe(11);
  });

  it("falls back to the start day for a zero-length or reversed event", () => {
    expect(key(lastCoveredDay({ start: at(10, 9), end: at(10, 9) }))).toBe(10);
    expect(key(lastCoveredDay({ start: at(10, 9), end: at(9, 9) }))).toBe(10);
  });
});

describe("daysCovered", () => {
  const month = { from: at(1), to: new Date(2026, 8, 30, 23, 59, 59, 999) };

  it("is just the one day for a normal event", () => {
    expect(daysCovered({ start: at(10, 9), end: at(10, 17) }, month.from, month.to).map(key)).toEqual(
      [10]
    );
  });

  it("covers every day in between", () => {
    expect(daysCovered({ start: at(10, 18), end: at(13, 9) }, month.from, month.to).map(key)).toEqual(
      [10, 11, 12, 13]
    );
  });

  it("counts an all-day span by its real days, not one too many", () => {
    // 10th to 14th inclusive, stored as ending at midnight on the 15th.
    expect(daysCovered({ start: at(10), end: at(15) }, month.from, month.to).map(key)).toEqual([
      10, 11, 12, 13, 14,
    ]);
  });

  // An event starting in the previous month is fetched when the month it runs
  // into is on screen, so the days that fall inside the view must still render
  // even though the start date doesn't.
  it("clips to the range and keeps the part that is inside it", () => {
    const across = { start: new Date(2026, 7, 29), end: at(3) };
    expect(daysCovered(across, month.from, month.to).map(key)).toEqual([1, 2]);
  });

  it("is empty when the event misses the range entirely", () => {
    const earlier = { start: new Date(2026, 6, 1), end: new Date(2026, 6, 3) };
    expect(daysCovered(earlier, month.from, month.to)).toEqual([]);
  });

  // A corrupt row shouldn't be able to hang the calendar screen.
  it("stops after a year rather than looping forever", () => {
    const absurd = { start: at(1), end: new Date(2046, 0, 1) };
    const wideOpen = new Date(2050, 0, 1);
    expect(daysCovered(absurd, at(1), wideOpen).length).toBeLessThanOrEqual(367);
  });
});

describe("an event that started long before the range", () => {
  // The walk is capped at a fixed number of steps, so starting it at the
  // event rather than at the range meant a long trip used every step getting
  // to the month on screen and had none left for it -- a bar on the grid
  // over a day list that said there was nothing on.
  it("still covers the days in range", () => {
    const from = new Date(2027, 0, 1);
    const to = new Date(2027, 0, 31, 23, 59, 59);

    const days = daysCovered(
      { start: new Date(2025, 0, 1), end: new Date(2027, 11, 31) },
      from,
      to
    );

    expect(days).toHaveLength(31);
    expect(days[0].getDate()).toBe(1);
    expect(days[30].getDate()).toBe(31);
  });

  it("does not report days before the range", () => {
    const from = new Date(2027, 0, 10);
    const to = new Date(2027, 0, 12, 23, 59, 59);

    const days = daysCovered({ start: new Date(2026, 0, 1), end: new Date(2027, 5, 1) }, from, to);

    expect(days.map((d) => d.getDate())).toEqual([10, 11, 12]);
  });
});
