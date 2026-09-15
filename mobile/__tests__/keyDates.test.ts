import {
  displayTitleFor,
  nextOccurrence,
  daysUntil,
  describeReminders,
  reminderLabel,
  nextReminderDays,
  daysLabel,
  tripNights,
  countdownLabel,
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
  reminders_on: true,
  notes: null,
  end_date: null,
  pinned: false,
  photo_path: null,
  ...over,
});

// Fixed "today" so the countdown tests don't drift. Jest's fake timers move
// Date.now and `new Date()` together, which is what these read.
function on(day: string, fn: () => void) {
  jest.useFakeTimers().setSystemTime(new Date(day + "T09:00:00"));
  try {
    fn();
  } finally {
    jest.useRealTimers();
  }
}

describe("tripNights", () => {
  it("counts nights, not days", () => {
    expect(tripNights({ date: "2026-10-01", end_date: "2026-10-08" })).toBe(7);
  });

  // A day out is a legitimate zero, not a missing end date.
  it("is zero for a same-day range", () => {
    expect(tripNights({ date: "2026-10-01", end_date: "2026-10-01" })).toBe(0);
  });

  it("is zero when there's no end date at all", () => {
    expect(tripNights({ date: "2026-10-01", end_date: null })).toBe(0);
  });
});

describe("countdownLabel", () => {
  const trip = { date: "2026-10-10", end_date: "2026-10-17", recurring: false };

  it("counts down in days", () => {
    on("2026-09-23", () => expect(countdownLabel(trip)).toBe("17 days to go"));
  });

  it("names tomorrow and today", () => {
    on("2026-10-09", () => expect(countdownLabel(trip)).toBe("Tomorrow"));
    on("2026-10-10", () => expect(countdownLabel(trip)).toBe("Today"));
  });

  // The whole reason this function exists: mid-trip, "0 days to go" is worse
  // than saying nothing.
  it("switches to time remaining once a trip has started", () => {
    on("2026-10-13", () => expect(countdownLabel(trip)).toBe("4 days left"));
    on("2026-10-16", () => expect(countdownLabel(trip)).toBe("Last day tomorrow"));
    on("2026-10-17", () => expect(countdownLabel(trip)).toBe("Last day"));
  });

  it("says so once it is over", () => {
    on("2026-10-18", () => expect(countdownLabel(trip)).toBe("Been and gone"));
  });

  // A recurring date never goes past -- daysUntil rolls it to next year.
  it("never reports a recurring date as gone", () => {
    on("2026-11-04", () =>
      expect(countdownLabel({ date: "2026-11-03", end_date: null, recurring: true })).toBe(
        "364 days to go"
      )
    );
  });
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
    expect(describeReminders([])).toBe("No reminder days chosen");
  });
});

describe("nextReminderDays", () => {
  // The example from the brief: an anniversary 341 days out, reminders at
  // 14/7/3, so the next thing that happens is the 14-day nudge in 327 days.
  it("counts to the furthest-out reminder still ahead", () => {
    expect(nextReminderDays(341, [14, 7, 3])).toBe(327);
  });

  it("moves to the next one once the first has passed", () => {
    expect(nextReminderDays(10, [14, 7, 3])).toBe(3);
    expect(nextReminderDays(5, [14, 7, 3])).toBe(2);
  });

  it("is zero when a reminder is due today", () => {
    expect(nextReminderDays(14, [14, 7, 3])).toBe(0);
    expect(nextReminderDays(3, [14, 7, 3])).toBe(0);
  });

  // A one-off date whose reminders have all gone past. A recurring one never
  // gets here, because daysUntil rolls it to next year.
  it("is null when nothing is left to fire", () => {
    expect(nextReminderDays(2, [14, 7, 3])).toBeNull();
    expect(nextReminderDays(0, [14, 7, 3])).toBeNull();
  });

  it("is null when no reminder days are chosen at all", () => {
    expect(nextReminderDays(341, [])).toBeNull();
  });

  // "On the day" is a reminder like any other and fires on the date itself.
  it("handles an on-the-day reminder", () => {
    expect(nextReminderDays(5, [0])).toBe(5);
    expect(nextReminderDays(0, [0])).toBe(0);
  });

  it("does not care what order the offsets are in", () => {
    expect(nextReminderDays(341, [3, 14, 7])).toBe(327);
  });
});

describe("daysLabel", () => {
  it("reads as a sentence ending", () => {
    expect(daysLabel(341)).toBe("in 341 days");
    expect(daysLabel(2)).toBe("in 2 days");
    expect(daysLabel(1)).toBe("tomorrow");
    expect(daysLabel(0)).toBe("today");
  });

  // Only reachable for a one-off date that has been and gone.
  it("does not count backwards", () => {
    expect(daysLabel(-5)).toBe("today");
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
   * REGRESSION -- birthdays showed the wrong name.
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
