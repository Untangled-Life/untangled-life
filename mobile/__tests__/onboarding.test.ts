import {
  OnboardingFacts,
  allDone,
  nextStep,
  onboardingSteps,
  outstandingSteps,
  progress,
  weeklyShifts,
  WEEKDAYS_DEFAULT,
} from "@/lib/onboarding";

const nothing: OnboardingFacts = {
  calendarAccess: false,
  calendarsShared: 0,
  hasWorkPattern: false,
  hasAvatar: false,
  hasCover: false,
  dismissed: [],
};

const everything: OnboardingFacts = {
  calendarAccess: true,
  calendarsShared: 2,
  hasWorkPattern: true,
  hasAvatar: true,
  hasCover: true,
  dismissed: ["personalisation"],
};

describe("onboarding steps", () => {
  it("starts a brand-new couple at the calendar", () => {
    expect(nextStep(nothing)?.key).toBe("calendars");
    expect(progress(nothing)).toEqual({ done: 0, total: 5 });
  });

  // Granting access and sharing nothing is the state that looks finished and
  // is not: the app can read the phone and has been told to read none of it.
  it("does not count calendar access on its own", () => {
    const granted = { ...nothing, calendarAccess: true };
    expect(nextStep(granted)?.key).toBe("calendars");
  });

  it("counts the calendar step once something is shared", () => {
    const shared = { ...nothing, calendarAccess: true, calendarsShared: 1 };
    expect(nextStep(shared)?.key).toBe("hours");
  });

  it("finishes when everything is done", () => {
    expect(allDone(everything)).toBe(true);
    expect(nextStep(everything)).toBeNull();
    expect(outstandingSteps(everything)).toEqual([]);
  });

  // The cover belongs to the couple. One partner setting it finishes the step
  // for both, and asking the second person for a photo that already exists is
  // how an app teaches you it isn't paying attention.
  it("treats the cover as shared", () => {
    const partnerSetIt = { ...nothing, hasCover: true };
    expect(onboardingSteps(partnerSetIt).find((s) => s.key === "cover")?.done).toBe(true);
  });

  // Personalisation has nothing to measure, so it can only ever be finished by
  // being said so.
  it("only finishes personalisation when it is dismissed", () => {
    const all = { ...everything, dismissed: [] };
    expect(allDone(all)).toBe(false);
    expect(nextStep(all)?.key).toBe("personalisation");

    expect(allDone({ ...all, dismissed: ["personalisation"] })).toBe(true);
  });

  // Skipping writes nothing, on purpose. "Later" has to mean later.
  it("keeps a skipped step outstanding so the bell can hold it", () => {
    const skippedHours = { ...nothing, calendarAccess: true, calendarsShared: 1 };
    expect(outstandingSteps(skippedHours).map((s) => s.key)).toEqual([
      "hours",
      "photo",
      "cover",
      "personalisation",
    ]);
  });

  it("lets a step be dismissed for good", () => {
    const noShifts = { ...everything, hasWorkPattern: false };
    expect(outstandingSteps(noShifts).map((s) => s.key)).toEqual(["hours"]);

    const dismissed = { ...noShifts, dismissed: [...noShifts.dismissed, "hours"] };
    expect(allDone(dismissed)).toBe(true);
  });

  // A step done elsewhere counts. All five can be, which is why the
  // walkthrough derives its position rather than storing an index.
  it("re-reads its position rather than tracking one", () => {
    const skippedToEnd = { ...nothing, hasAvatar: true, hasCover: true };
    expect(nextStep(skippedToEnd)?.key).toBe("calendars");

    const calendarDoneLater = { ...skippedToEnd, calendarAccess: true, calendarsShared: 1 };
    expect(nextStep(calendarDoneLater)?.key).toBe("hours");
  });
});

describe("weeklyShifts", () => {
  it("builds one shift per chosen day, all in week zero", () => {
    expect(weeklyShifts([1, 3], "09:00", "17:00")).toEqual([
      { week: 0, weekday: 1, start: "09:00", end: "17:00" },
      { week: 0, weekday: 3, start: "09:00", end: "17:00" },
    ]);
  });

  it("sorts and de-duplicates whatever it is given", () => {
    expect(weeklyShifts([5, 1, 5], "08:00", "16:00").map((s) => s.weekday)).toEqual([1, 5]);
  });

  it("defaults to the working week", () => {
    expect(weeklyShifts(WEEKDAYS_DEFAULT, "09:00", "17:00")).toHaveLength(5);
  });
});
