import {
  SECTIONS,
  SECTION_TITLES,
  byStartDate,
  byWhen,
  isPast,
  tripNights,
  tripWhen,
  type TripItem,
} from "@/lib/trips";

const item = (over: Partial<TripItem> & { id: string }): TripItem => ({
  trip_id: "t",
  kind: "todo",
  title: "Something",
  detail: null,
  at_date: null,
  at_time: null,
  reference: null,
  url: null,
  photo_path: null,
  booked: false,
  ...over,
});

describe("the sections", () => {
  it("has no duplicate kinds", () => {
    expect(new Set(SECTIONS.map((s) => s.kind)).size).toBe(SECTIONS.length);
  });

  it("names every kind the table allows", () => {
    // The check constraint in wishlists-and-travel.sql lists exactly these.
    expect(SECTIONS.map((s) => s.kind).sort()).toEqual(
      ["flight", "food", "note", "prep", "stay", "todo", "tour"].sort()
    );
  });

  it("can title every kind", () => {
    for (const section of SECTIONS) expect(SECTION_TITLES[section.kind]).toBe(section.title);
  });
});

describe("tripWhen", () => {
  it("says so when there are no dates, rather than nothing", () => {
    expect(tripWhen({ start_date: null, end_date: null })).toBe("No dates yet");
  });

  it("copes with only one end of it", () => {
    expect(tripWhen({ start_date: "2027-04-02", end_date: null })).toMatch(/^From /);
    expect(tripWhen({ start_date: null, end_date: "2027-04-16" })).toMatch(/^Until /);
  });

  it("does not repeat the year when both ends share one", () => {
    const label = tripWhen({ start_date: "2027-04-02", end_date: "2027-04-16" });
    expect(label.match(/2027/g)).toHaveLength(1);
  });

  it("keeps both years when a trip crosses new year", () => {
    const label = tripWhen({ start_date: "2027-12-28", end_date: "2028-01-04" });
    expect(label).toMatch(/2027/);
    expect(label).toMatch(/2028/);
  });
});

describe("tripNights", () => {
  it("counts nights, not days", () => {
    expect(tripNights({ start_date: "2027-04-02", end_date: "2027-04-16" })).toBe(14);
  });

  // The suite runs in America/New_York; 8 March 2026 is 23 hours long.
  it("survives a daylight-saving boundary", () => {
    expect(tripNights({ start_date: "2026-03-07", end_date: "2026-03-09" })).toBe(2);
    expect(tripNights({ start_date: "2026-10-31", end_date: "2026-11-02" })).toBe(2);
  });

  it("has no answer without both ends", () => {
    expect(tripNights({ start_date: "2027-04-02", end_date: null })).toBeNull();
  });
});

describe("isPast", () => {
  const now = new Date("2027-05-10T09:00:00");

  it("is about the last day, not the first", () => {
    expect(isPast({ start_date: "2027-05-01", end_date: "2027-05-12" }, now)).toBe(false);
    expect(isPast({ start_date: "2027-05-01", end_date: "2027-05-09" }, now)).toBe(true);
  });

  it("counts the last day itself as still happening", () => {
    expect(isPast({ start_date: "2027-05-01", end_date: "2027-05-10" }, now)).toBe(false);
  });

  // An idea is not something you have missed.
  it("never calls an undated trip past", () => {
    expect(isPast({ start_date: null, end_date: null }, now)).toBe(false);
  });

  // "Japan, from the 1st" with no end is somebody who has not decided how
  // long they are going for, not somebody whose trip is over.
  it("never retires a trip that has no end date", () => {
    expect(isPast({ start_date: "2027-05-01", end_date: null }, now)).toBe(false);
    expect(isPast({ start_date: "2020-01-01", end_date: null }, now)).toBe(false);
  });
});

describe("sorting", () => {
  it("puts the soonest trip first and the undated ones last", () => {
    const trips = [
      { start_date: null },
      { start_date: "2027-09-01" },
      { start_date: "2027-04-02" },
    ];

    expect([...trips].sort(byStartDate).map((t) => t.start_date)).toEqual([
      "2027-04-02",
      "2027-09-01",
      null,
    ]);
  });

  it("reads a section as a running order, with the loose ideas after it", () => {
    const items = [
      item({ id: "c", title: "Zoo" }),
      item({ id: "a", at_date: "2027-04-03", at_time: "18:30", title: "Dinner" }),
      item({ id: "b", at_date: "2027-04-03", at_time: "09:00", title: "Train" }),
      item({ id: "d", at_date: "2027-04-02", title: "Land" }),
      item({ id: "e", title: "Aquarium" }),
    ];

    expect([...items].sort(byWhen).map((i) => i.id)).toEqual(["d", "b", "a", "e", "c"]);
  });
});
