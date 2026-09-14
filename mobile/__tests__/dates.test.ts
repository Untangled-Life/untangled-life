import {
  toISODate,
  fromISODate,
  toDisplayDate,
  fromDisplayDate,
  toFriendlyDate,
  toTimeString,
  fromTimeString,
  toDisplayTime,
  isValidTimeString,
} from "@/lib/dates";

describe("ISO <-> Date", () => {
  it("round-trips a date", () => {
    const d = new Date(2026, 8, 20);
    expect(toISODate(d)).toBe("2026-09-20");
    expect(fromISODate("2026-09-20")).toEqual(d);
  });

  it("pads single-digit days and months", () => {
    expect(toISODate(new Date(2026, 0, 5))).toBe("2026-01-05");
  });

  /**
   * `new Date("2026-09-20")` parses as UTC midnight, which in Australia is the
   * morning of the 20th but in the Americas is the evening of the 19th --
   * countdowns would be a day out. Parsing field by field keeps it local.
   */
  it("treats an ISO string as a local date, not UTC", () => {
    const d = fromISODate("2026-09-20")!;
    expect(d.getDate()).toBe(20);
    expect(d.getHours()).toBe(0);
  });

  it("rejects malformed input", () => {
    expect(fromISODate("20-09-2026")).toBeNull();
    expect(fromISODate("2026-9-20")).toBeNull();
    expect(fromISODate("")).toBeNull();
    expect(fromISODate("nonsense")).toBeNull();
  });

  it("rejects dates that do not exist rather than rolling them over", () => {
    expect(fromISODate("2026-02-31")).toBeNull();
    expect(fromISODate("2026-13-01")).toBeNull();
  });

  it("accepts a leap day in a leap year and rejects it otherwise", () => {
    expect(fromISODate("2028-02-29")).not.toBeNull();
    expect(fromISODate("2026-02-29")).toBeNull();
  });
});

describe("display format (DD-MM-YYYY)", () => {
  it("shows Australian order", () => {
    expect(toDisplayDate("2026-09-20")).toBe("20-09-2026");
  });

  it("reads Australian order back", () => {
    expect(fromDisplayDate("20-09-2026")).toBe("2026-09-20");
  });

  it("accepts slashes, dots and spaces as separators", () => {
    expect(fromDisplayDate("20/09/2026")).toBe("2026-09-20");
    expect(fromDisplayDate("20.09.2026")).toBe("2026-09-20");
    expect(fromDisplayDate("20 09 2026")).toBe("2026-09-20");
  });

  it("accepts unpadded day and month", () => {
    expect(fromDisplayDate("5/9/2026")).toBe("2026-09-05");
  });

  it("round-trips", () => {
    expect(fromDisplayDate(toDisplayDate("2026-01-05"))).toBe("2026-01-05");
  });

  /** 20-09 is the 20th of September, never the 9th of the 20th month. */
  it("never reads the first number as a month", () => {
    expect(fromDisplayDate("09-20-2026")).toBeNull();
  });

  it("returns empty rather than throwing on bad input", () => {
    expect(toDisplayDate(null)).toBe("");
    expect(toDisplayDate(undefined)).toBe("");
    expect(toDisplayDate("rubbish")).toBe("");
  });

  it("tolerates a full timestamp by using its date part", () => {
    expect(toDisplayDate("2026-09-20T13:00:00+00:00")).toBe("20-09-2026");
  });

  it("rejects an impossible date", () => {
    expect(fromDisplayDate("31-02-2026")).toBeNull();
  });
});

describe("toFriendlyDate", () => {
  it("reads as a human would say it", () => {
    expect(toFriendlyDate("2026-09-20")).toBe("Sun 20 Sep 2026");
  });

  it("can drop the year", () => {
    expect(toFriendlyDate("2026-09-20", false)).toBe("Sun 20 Sep");
  });

  it("is empty for bad input", () => {
    expect(toFriendlyDate("nope")).toBe("");
  });
});

describe("times", () => {
  it("formats a Date as a 24-hour wall-clock string", () => {
    expect(toTimeString(new Date(2026, 8, 20, 8, 30))).toBe("08:30");
    expect(toTimeString(new Date(2026, 8, 20, 17, 5))).toBe("17:05");
  });

  it("seeds a picker from a stored time", () => {
    const d = fromTimeString("08:30");
    expect(d.getHours()).toBe(8);
    expect(d.getMinutes()).toBe(30);
  });

  it("tolerates seconds on a stored time", () => {
    const d = fromTimeString("17:30:00");
    expect(d.getHours()).toBe(17);
    expect(d.getMinutes()).toBe(30);
  });

  it("falls back to 9am rather than an invalid date", () => {
    expect(fromTimeString("").getHours()).toBe(9);
  });

  it("shows times in 12-hour for reading", () => {
    expect(toDisplayTime("08:30")).toBe("8:30 am");
    expect(toDisplayTime("17:30")).toBe("5:30 pm");
  });

  it("gets both ends of the day right", () => {
    expect(toDisplayTime("00:00")).toBe("12:00 am");
    expect(toDisplayTime("12:00")).toBe("12:00 pm");
    expect(toDisplayTime("23:59")).toBe("11:59 pm");
  });

  it("validates 24-hour input", () => {
    expect(isValidTimeString("09:00")).toBe(true);
    expect(isValidTimeString("9:00")).toBe(true);
    expect(isValidTimeString("23:59")).toBe(true);
    expect(isValidTimeString("24:00")).toBe(false);
    expect(isValidTimeString("09:60")).toBe(false);
    expect(isValidTimeString("9am")).toBe(false);
  });
});
