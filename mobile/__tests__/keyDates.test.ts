import {
  displayTitleFor,
  nextOccurrence,
  daysUntil,
  describeReminders,
  reminderLabel,
  KeyDateRow,
} from "@/lib/keyDates";

const row = (over: Partial<KeyDateRow> = {}): KeyDateRow => ({
  id: "k1",
  title: "Anniversary",
  date: "2026-11-03",
  recurring: true,
  kind: "anniversary",
  subject_user_id: null,
  reminder_days: [14, 7, 3],
  notes: null,
  ...over,
});

describe("reminderLabel", () => {
  it("names the round offsets rather than counting days", () => {
    expect(reminderLabel(0)).toBe("on the day");
    expect(reminderLabel(1)).toBe("1 day");
    expect(reminderLabel(7)).toBe("1 week");
    expect(reminderLabel(14)).toBe("2 weeks");
    expect(reminderLabel(30)).toBe("1 month");
  });

  it("falls back to a day count for anything else", () => {
    expect(reminderLabel(5)).toBe("5 days");
  });
});

describe("describeReminders", () => {
  it("reads as a sentence, furthest out first", () => {
    expect(describeReminders([3, 14, 7])).toBe("2 weeks, 1 week and 3 days before");
  });

  it("handles a single reminder", () => {
    expect(describeReminders([1])).toBe("1 day before");
  });

  // "1 week and on the day before" is nonsense -- "on the day" already says
  // when it is, so the trailing "before" has to go.
  it("drops the trailing 'before' when the last reminder is on the day", () => {
    expect(describeReminders([7, 0])).toBe("1 week and on the day");
    expect(describeReminders([0])).toBe("on the day");
  });

  // Turning every reminder off is a real choice, not an empty list to paper
  // over -- the row still exists and still shows on the calendar.
  it("says so when there are none", () => {
    expect(describeReminders([])).toBe("No reminders");
  });
});

const names: Record<string, string> = { roy: "Roy", alyssa: "Alyssa" };
const nameFor = (id: string | null) => (id ? names[id] ?? "Partner" : "Partner");

describe("displayTitleFor", () => {
  it("uses the stored title for an anniversary", () => {
    expect(displayTitleFor(row(), nameFor)).toBe("Anniversary");
  });

  it("uses the stored title for a misc date", () => {
    expect(displayTitleFor(row({ kind: "misc", title: "Trip to Bali" }), nameFor)).toBe(
      "Trip to Bali"
    );
  });

  /**
   * REGRESSION — birthdays showed the wrong name.
   *
   * A single birthday row per couple was labelled with whoever the viewer's
   * partner was, so the same row read as a different person's birthday on each
   * phone. It must resolve from the subject, identically for both.
   */
  it("names the person whose birthday it is, not the viewer's partner", () => {
    const birthday = row({ kind: "birthday", subject_user_id: "alyssa" });
    expect(displayTitleFor(birthday, nameFor)).toBe("Alyssa's Birthday");
  });

  it("reads the same whichever partner is looking", () => {
    const birthday = row({ kind: "birthday", subject_user_id: "roy" });
    const asAlyssa = displayTitleFor(birthday, nameFor);
    const asRoy = displayTitleFor(birthday, nameFor);
    expect(asAlyssa).toBe(asRoy);
    expect(asAlyssa).toBe("Roy's Birthday");
  });
});

describe("nextOccurrence", () => {
  afterEach(() => jest.useRealTimers());
  const freeze = (d: Date) => jest.useFakeTimers().setSystemTime(d);

  it("rolls a recurring date forward to next year once it has passed", () => {
    freeze(new Date(2026, 10, 10)); // 10 Nov, after 3 Nov
    expect(nextOccurrence("2026-11-03", true).getFullYear()).toBe(2027);
  });

  it("keeps a recurring date this year when it is still ahead", () => {
    freeze(new Date(2026, 8, 13));
    expect(nextOccurrence("2026-11-03", true).getFullYear()).toBe(2026);
  });

  it("counts a date falling today as today, not next year", () => {
    freeze(new Date(2026, 10, 3, 14, 0));
    const next = nextOccurrence("2026-11-03", true);
    expect(next.getFullYear()).toBe(2026);
    expect(next.getDate()).toBe(3);
  });

  it("leaves a non-recurring date where it is", () => {
    freeze(new Date(2027, 0, 1));
    expect(nextOccurrence("2026-11-03", false).getFullYear()).toBe(2026);
  });

  it("uses the original day and month when rolling forward", () => {
    freeze(new Date(2026, 10, 10));
    const next = nextOccurrence("2026-11-03", true);
    expect(next.getMonth()).toBe(10);
    expect(next.getDate()).toBe(3);
  });
});

describe("daysUntil", () => {
  afterEach(() => jest.useRealTimers());
  const freeze = (d: Date) => jest.useFakeTimers().setSystemTime(d);

  it("is 0 on the day itself", () => {
    freeze(new Date(2026, 10, 3, 9, 0));
    expect(daysUntil("2026-11-03", true)).toBe(0);
  });

  it("is 1 the day before", () => {
    freeze(new Date(2026, 10, 2, 23, 0));
    expect(daysUntil("2026-11-03", true)).toBe(1);
  });

  it("ignores the time of day", () => {
    freeze(new Date(2026, 10, 1, 0, 1));
    const earlyMorning = daysUntil("2026-11-03", true);
    freeze(new Date(2026, 10, 1, 23, 59));
    expect(daysUntil("2026-11-03", true)).toBe(earlyMorning);
  });

  it("matches the reminder offsets the app schedules on", () => {
    freeze(new Date(2026, 9, 20)); // 14 days before 3 Nov
    expect(daysUntil("2026-11-03", true)).toBe(14);
  });
});
