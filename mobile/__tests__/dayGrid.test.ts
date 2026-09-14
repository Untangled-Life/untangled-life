import { HOUR_HEIGHT, hourLabel, offsetFor, placeOnDay, slotAt } from "@/lib/dayGrid";

const day = new Date(2026, 8, 14);
const at = (h: number, m = 0, d = 14) => new Date(2026, 8, d, h, m, 0, 0);
const iv = (start: Date, end: Date) => ({ start, end });
const id = (x: { start: Date; end: Date }) => x;

describe("offsetFor", () => {
  it("is zero at midnight and one hour-height per hour", () => {
    expect(offsetFor(day, at(0))).toBe(0);
    expect(offsetFor(day, at(9))).toBe(9 * HOUR_HEIGHT);
    expect(offsetFor(day, at(9, 30))).toBe(9.5 * HOUR_HEIGHT);
  });

  it("clamps to the day at both ends", () => {
    expect(offsetFor(day, at(22, 0, 13))).toBe(0);
    expect(offsetFor(day, at(3, 0, 15))).toBe(24 * HOUR_HEIGHT);
  });
});

describe("placeOnDay", () => {
  it("places a normal event at its own time", () => {
    const [p] = placeOnDay(day, [iv(at(9), at(10))], id);
    expect(p.top).toBe(9 * HOUR_HEIGHT);
    expect(p.height).toBe(HOUR_HEIGHT);
    expect(p.startsEarlier).toBe(false);
    expect(p.endsLater).toBe(false);
  });

  it("leaves out anything that doesn't touch the day", () => {
    expect(placeOnDay(day, [iv(at(9, 0, 12), at(17, 0, 12))], id)).toHaveLength(0);
  });

  // An event ending at midnight belongs to the day before. Without this every
  // all-day event paints a phantom block at the top of the next morning.
  it("excludes an event that ends exactly at midnight", () => {
    expect(placeOnDay(day, [iv(at(9, 0, 13), at(0))], id)).toHaveLength(0);
  });

  it("clips an event that starts the day before and says so", () => {
    const [p] = placeOnDay(day, [iv(at(22, 0, 13), at(2))], id);
    expect(p.top).toBe(0);
    expect(p.height).toBe(2 * HOUR_HEIGHT);
    expect(p.startsEarlier).toBe(true);
    expect(p.endsLater).toBe(false);
  });

  it("clips an event running past midnight and says so", () => {
    const [p] = placeOnDay(day, [iv(at(23), at(1, 0, 15))], id);
    expect(p.top).toBe(23 * HOUR_HEIGHT);
    expect(p.height).toBe(HOUR_HEIGHT);
    expect(p.endsLater).toBe(true);
  });

  // A 15-minute block at true scale is a few pixels: unreadable and almost
  // untappable.
  it("gives a very short event a usable minimum height", () => {
    const [p] = placeOnDay(day, [iv(at(9), at(9, 10))], id);
    expect(p.height).toBeGreaterThanOrEqual(22);
  });

  describe("overlaps", () => {
    it("gives back-to-back events the same column", () => {
      const placed = placeOnDay(day, [iv(at(9), at(10)), iv(at(10), at(11))], id);
      expect(placed.map((p) => p.column)).toEqual([0, 0]);
      expect(placed[0].columns).toBe(1);
    });

    it("splits two overlapping events into two columns", () => {
      const placed = placeOnDay(day, [iv(at(9), at(11)), iv(at(10), at(12))], id);
      expect(placed.map((p) => p.column)).toEqual([0, 1]);
      expect(placed[0].columns).toBe(2);
      expect(placed[1].columns).toBe(2);
    });

    it("reuses a freed column rather than growing forever", () => {
      const placed = placeOnDay(
        day,
        [iv(at(9), at(11)), iv(at(10), at(12)), iv(at(13), at(14))], // third is clear
        id
      );
      expect(placed[2].column).toBe(0);
      expect(placed[2].columns).toBe(2);
    });

    it("sorts by start time regardless of input order", () => {
      const placed = placeOnDay(day, [iv(at(14), at(15)), iv(at(9), at(10))], id);
      expect(placed[0].top).toBe(9 * HOUR_HEIGHT);
    });

    // The padded height, not the real one, has to decide overlap -- otherwise
    // a 10-minute event drawn at its minimum sits on top of the next block.
    it("counts the drawn height when deciding overlap", () => {
      const placed = placeOnDay(day, [iv(at(9), at(9, 10)), iv(at(9, 15), at(10))], id);
      expect(placed[1].column).toBe(1);
    });
  });
});

describe("slotAt", () => {
  it("rounds down to the half hour", () => {
    expect(slotAt(day, 9 * HOUR_HEIGHT).getHours()).toBe(9);
    expect(slotAt(day, 9 * HOUR_HEIGHT).getMinutes()).toBe(0);
    expect(slotAt(day, 9.4 * HOUR_HEIGHT).getMinutes()).toBe(0);
    expect(slotAt(day, 9.6 * HOUR_HEIGHT).getMinutes()).toBe(30);
  });

  it("never offers a slot outside the day", () => {
    expect(slotAt(day, -500).getHours()).toBe(0);
    const late = slotAt(day, 999 * HOUR_HEIGHT);
    expect(late.getDate()).toBe(14);
    expect(late.getHours()).toBe(23);
    expect(late.getMinutes()).toBe(30);
  });
});

describe("hourLabel", () => {
  it("reads as a clock, not a number", () => {
    expect(hourLabel(0)).toBe("12 am");
    expect(hourLabel(9)).toBe("9 am");
    expect(hourLabel(12)).toBe("12 pm");
    expect(hourLabel(21)).toBe("9 pm");
  });
});
