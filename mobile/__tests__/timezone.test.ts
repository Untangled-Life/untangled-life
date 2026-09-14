import {
  dateKeyInZone,
  offsetMinutesAt,
  shortZoneName,
  supportsNamedZones,
  zonedTimeToInstant,
  zonesDifferAt,
} from "@/lib/timezone";

// The suite runs in America/New_York (jest.setup.js), so "local" below means
// New York and the Australian zones exercise the cross-zone paths.

describe("supportsNamedZones", () => {
  // If this ever fails in CI the rest of the file is meaningless, so it is
  // asserted rather than assumed.
  it("is true in the test environment", () => {
    expect(supportsNamedZones()).toBe(true);
  });
});

describe("offsetMinutesAt", () => {
  it("reads a fixed-offset zone", () => {
    // Brisbane does not observe daylight saving: always UTC+10.
    expect(offsetMinutesAt(new Date("2026-01-15T00:00:00Z"), "Australia/Brisbane")).toBe(600);
    expect(offsetMinutesAt(new Date("2026-07-15T00:00:00Z"), "Australia/Brisbane")).toBe(600);
  });

  // The whole reason this takes an instant rather than answering once.
  it("follows a zone across its own daylight saving change", () => {
    // Sydney is UTC+11 in January (summer) and UTC+10 in July.
    expect(offsetMinutesAt(new Date("2026-01-15T00:00:00Z"), "Australia/Sydney")).toBe(660);
    expect(offsetMinutesAt(new Date("2026-07-15T00:00:00Z"), "Australia/Sydney")).toBe(600);
  });

  it("handles zones behind UTC", () => {
    expect(offsetMinutesAt(new Date("2026-01-15T00:00:00Z"), "America/New_York")).toBe(-300);
    expect(offsetMinutesAt(new Date("2026-07-15T00:00:00Z"), "America/New_York")).toBe(-240);
  });

  it("handles a half-hour zone", () => {
    expect(offsetMinutesAt(new Date("2026-06-15T00:00:00Z"), "Australia/Adelaide")).toBe(570);
  });

  it("is zero for UTC", () => {
    expect(offsetMinutesAt(new Date("2026-06-15T00:00:00Z"), "UTC")).toBe(0);
  });
});

describe("zonedTimeToInstant", () => {
  it("turns a wall clock into the right instant", () => {
    // 9am on 15 June in Sydney (UTC+10) is 23:00 UTC on the 14th.
    const at = zonedTimeToInstant(2026, 6, 15, 9, 0, "Australia/Sydney");
    expect(at.toISOString()).toBe("2026-06-14T23:00:00.000Z");
  });

  it("round-trips against offsetMinutesAt", () => {
    for (const zone of ["Australia/Sydney", "America/New_York", "Europe/London", "Asia/Kolkata"]) {
      const at = zonedTimeToInstant(2026, 9, 14, 14, 30, zone);
      expect(dateKeyInZone(at, zone)).toBe("2026-09-14");
    }
  });

  // The two-pass correction exists for these. A single pass picks the offset
  // on the wrong side of the transition and lands an hour out.
  it("is right on the day the clocks go forward", () => {
    // Sydney springs forward at 2am on 4 October 2026: 2am does not exist.
    const before = zonedTimeToInstant(2026, 10, 4, 1, 0, "Australia/Sydney");
    expect(dateKeyInZone(before, "Australia/Sydney")).toBe("2026-10-04");

    const after = zonedTimeToInstant(2026, 10, 4, 6, 0, "Australia/Sydney");
    expect(after.toISOString()).toBe("2026-10-03T19:00:00.000Z");
  });

  it("is right on the day the clocks go back", () => {
    // Sydney falls back at 3am on 5 April 2026.
    const at = zonedTimeToInstant(2026, 4, 5, 9, 0, "Australia/Sydney");
    expect(dateKeyInZone(at, "Australia/Sydney")).toBe("2026-04-05");
    expect(at.toISOString()).toBe("2026-04-04T23:00:00.000Z");
  });

  it("handles midnight", () => {
    const at = zonedTimeToInstant(2026, 6, 15, 0, 0, "Australia/Sydney");
    expect(at.toISOString()).toBe("2026-06-14T14:00:00.000Z");
  });
});

describe("dateKeyInZone", () => {
  // The same instant is two different days depending on where you stand --
  // which is exactly why a day view cannot bucket by the device's own clock.
  it("gives a different day either side of the world", () => {
    const instant = new Date("2026-09-14T02:00:00Z");
    expect(dateKeyInZone(instant, "Australia/Sydney")).toBe("2026-09-14");
    expect(dateKeyInZone(instant, "America/New_York")).toBe("2026-09-13");
  });
});

describe("zonesDifferAt", () => {
  it("is false for the same zone, or a missing one", () => {
    const now = new Date("2026-06-15T00:00:00Z");
    expect(zonesDifferAt(now, "Australia/Sydney", "Australia/Sydney")).toBe(false);
    expect(zonesDifferAt(now, null, "Australia/Sydney")).toBe(false);
    expect(zonesDifferAt(now, "Australia/Sydney", null)).toBe(false);
  });

  it("is true for genuinely different clocks", () => {
    expect(zonesDifferAt(new Date("2026-06-15T00:00:00Z"), "Australia/Sydney", "Australia/Perth")).toBe(
      true
    );
  });

  // Two names, one clock. Labelling every time with "their time" here would be
  // noise, so the comparison is on offset rather than name.
  it("is false for different names showing the same time", () => {
    expect(
      zonesDifferAt(new Date("2026-01-15T00:00:00Z"), "Europe/London", "Europe/Dublin")
    ).toBe(false);
  });

  // ...and true again once they diverge. Sydney and Brisbane are the same in
  // winter and an hour apart in summer.
  it("notices when two zones diverge later in the year", () => {
    expect(
      zonesDifferAt(new Date("2026-07-15T00:00:00Z"), "Australia/Sydney", "Australia/Brisbane")
    ).toBe(false);
    expect(
      zonesDifferAt(new Date("2026-01-15T00:00:00Z"), "Australia/Sydney", "Australia/Brisbane")
    ).toBe(true);
  });
});

describe("shortZoneName", () => {
  it("takes the city off the end", () => {
    expect(shortZoneName("Australia/Sydney")).toBe("Sydney");
    expect(shortZoneName("America/New_York")).toBe("New York");
    expect(shortZoneName("UTC")).toBe("UTC");
    expect(shortZoneName(null)).toBe("");
  });
});
