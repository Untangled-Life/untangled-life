import { badgeLabel, buildInbox } from "@/lib/inbox";
import { KeyDateRow } from "@/lib/keyDates";
import { OnboardingStep } from "@/lib/onboarding";

const nameFor = () => "Alyssa";

const keyDate = (over: Partial<KeyDateRow>): KeyDateRow =>
  ({
    id: "k1",
    title: "Anniversary",
    kind: "misc",
    date: "2026-09-20",
    recurring: false,
    subject_user_id: null,
    reminder_days: [14, 7, 3],
    reminders_on: true,
    notes: null,
    end_date: null,
    pinned: false,
    ...over,
  }) as KeyDateRow;

const step = (key: string, title: string): OnboardingStep =>
  ({ key, title, blurb: "because", route: null, done: false }) as OnboardingStep;

const empty = { outstanding: [], keyDates: [], plans: [], nudging: false, nameFor };

describe("buildInbox", () => {
  beforeAll(() => jest.useFakeTimers().setSystemTime(new Date(2026, 8, 15, 9, 0, 0)));
  afterAll(() => jest.useRealTimers());

  it("is empty when nothing is waiting", () => {
    expect(buildInbox(empty)).toEqual([]);
  });

  // A date 300 days out is not news. A bell that is always lit is one nobody
  // reads, which costs you the day it matters.
  it("leaves out a key date outside its own reminder window", () => {
    const far = keyDate({ date: "2027-06-01", recurring: false });
    expect(buildInbox({ ...empty, keyDates: [far] })).toEqual([]);
  });

  it("includes one inside the window", () => {
    const soon = keyDate({ date: "2026-09-20" });
    const items = buildInbox({ ...empty, keyDates: [soon] });
    expect(items).toHaveLength(1);
    expect(items[0].detail).toBe("In 5 days");
  });

  it("respects reminders being switched off", () => {
    const off = keyDate({ date: "2026-09-20", reminders_on: false });
    expect(buildInbox({ ...empty, keyDates: [off] })).toEqual([]);
  });

  // The whole point of the ordering: what it costs to ignore, not what type
  // it is.
  it("puts a date tomorrow above an unfinished setup step", () => {
    const items = buildInbox({
      ...empty,
      keyDates: [keyDate({ date: "2026-09-16" })],
      outstanding: [step("calendars", "Connect your calendar")],
      nudging: true,
    });

    expect(items.map((i) => i.kind)).toEqual(["keyDate", "nudge", "setup"]);
    expect(items[0].detail).toBe("Tomorrow");
  });

  it("sorts several key dates by how close they are", () => {
    const items = buildInbox({
      ...empty,
      keyDates: [
        keyDate({ id: "a", date: "2026-09-20" }),
        keyDate({ id: "b", date: "2026-09-16" }),
      ],
    });
    expect(items.map((i) => i.id)).toEqual(["keyDate:b", "keyDate:a"]);
  });

  it("carries every outstanding setup step", () => {
    const items = buildInbox({
      ...empty,
      outstanding: [step("photo", "Add your photo"), step("cover", "Add a photo of you both")],
    });
    expect(items).toHaveLength(2);
    expect(items.every((i) => i.route === "/welcome")).toBe(true);
  });
});

describe("badgeLabel", () => {
  it("says nothing at zero", () => {
    expect(badgeLabel(0)).toBeNull();
    expect(badgeLabel(-1)).toBeNull();
  });

  it("counts up to nine, then stops counting", () => {
    expect(badgeLabel(1)).toBe("1");
    expect(badgeLabel(9)).toBe("9");
    expect(badgeLabel(10)).toBe("9+");
    expect(badgeLabel(400)).toBe("9+");
  });
});

describe("proposals in the bell", () => {
  beforeAll(() => jest.useFakeTimers().setSystemTime(new Date(2026, 8, 15, 9, 0, 0)));
  afterAll(() => jest.useRealTimers());

  const proposal = { id: "p1", title: "Dinner", options: [{}, {}], proposed_by: "her" };

  // Somebody asked you a question and is waiting. The cost of ignoring it is
  // that they think you did not care, which beats forgetting a date.
  it("sits above everything else", () => {
    const items = buildInbox({
      ...empty,
      proposalsForYou: [proposal],
      keyDates: [keyDate({ date: "2026-09-15" })],
      outstanding: [step("photo", "Add your photo")],
      nudging: true,
    });

    expect(items[0].kind).toBe("proposal");
    expect(items[0].detail).toBe("Alyssa suggested 2 times");
  });

  it("says 'a time' when there is only one", () => {
    const one = { ...proposal, options: [{}] };
    const items = buildInbox({ ...empty, proposalsForYou: [one] });
    expect(items[0].detail).toBe("Alyssa suggested a time");
  });

  it("is answered where it sits rather than routing somewhere", () => {
    const items = buildInbox({ ...empty, proposalsForYou: [proposal] });
    expect(items[0].route).toBeNull();
    expect(items[0].proposalId).toBe("p1");
  });
});
