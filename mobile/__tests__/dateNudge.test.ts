import { shouldNudge, suggestedSlot, NUDGE_AFTER_DAYS } from "@/lib/dateNudge";
import { UpcomingPlan } from "@/lib/plannedEvents";

const NOW = new Date(2026, 8, 14, 18, 30, 0, 0);
const days = (n: number) => n * 24 * 60 * 60 * 1000;

const plan = (startsInDays: number): UpcomingPlan =>
  ({
    occurrenceStart: new Date(NOW.getTime() + days(startsInDays)),
    occurrenceEnd: new Date(NOW.getTime() + days(startsInDays) + 2 * 60 * 60 * 1000),
  }) as UpcomingPlan;

describe("shouldNudge", () => {
  it("stays quiet when something is booked inside the window", () => {
    expect(shouldNudge([plan(3)], null, NOW)).toBe(false);
  });

  it("stays quiet on the last day of the window", () => {
    expect(shouldNudge([plan(NUDGE_AFTER_DAYS)], null, NOW)).toBe(false);
  });

  // A holiday in March is not a reason to say nothing for five months.
  it("still nudges when the only plan is beyond the window", () => {
    expect(shouldNudge([plan(NUDGE_AFTER_DAYS + 1)], new Date(NOW.getTime() - days(30)), NOW)).toBe(
      true
    );
  });

  it("stays quiet when something was planned recently, even for later", () => {
    const bookedYesterday = new Date(NOW.getTime() - days(1));
    expect(shouldNudge([plan(60)], bookedYesterday, NOW)).toBe(false);
  });

  it("nudges a couple who have never planned anything", () => {
    expect(shouldNudge([], null, NOW)).toBe(true);
  });

  it("waits the full window before the first nudge", () => {
    const almost = new Date(NOW.getTime() - days(NUDGE_AFTER_DAYS) + 1000);
    expect(shouldNudge([], almost, NOW)).toBe(false);

    const exactly = new Date(NOW.getTime() - days(NUDGE_AFTER_DAYS));
    expect(shouldNudge([], exactly, NOW)).toBe(true);
  });
});

describe("suggestedSlot", () => {
  it("takes the next window you are both free", () => {
    const windows = [
      { start: new Date(2026, 8, 14, 12, 0), end: new Date(2026, 8, 14, 13, 0) }, // past
      { start: new Date(2026, 8, 15, 19, 30), end: new Date(2026, 8, 15, 22, 0) },
    ];
    expect(suggestedSlot(windows, NOW)).toEqual({ date: "2026-09-15", start: "19:30" });
  });

  it("falls back to this evening when there are no windows", () => {
    const morning = new Date(2026, 8, 14, 9, 0, 0, 0);
    expect(suggestedSlot([], morning)).toEqual({ date: "2026-09-14", start: "19:00" });
  });

  it("rolls to tomorrow when the evening has gone", () => {
    const lateNight = new Date(2026, 8, 14, 22, 0, 0, 0);
    expect(suggestedSlot([], lateNight)).toEqual({ date: "2026-09-15", start: "19:00" });
  });
});
