import { supabase } from "@/lib/supabase";
import {
  DEFAULT_FREE_TIME_PREFS,
  FreeTimePrefs,
  Interval,
  nextSharedFreeWindows,
} from "@/lib/freeTime";
import { WorkPattern, WorkShift, expandWorkHours, toDateKey } from "@/lib/workHours";

/**
 * When the two of you are free, read from everything that has a claim on it.
 *
 * Lives here rather than on Home because two screens need the same answer now,
 * and the same answer worked out twice is the shape every hard bug in this app
 * has had: a read filtered one way and its twin filtered another. Plan a date
 * offering a window Home does not show would be exactly that.
 */
export type FreeWindowsResult = {
  windows: Interval[];
  prefs: FreeTimePrefs;
  /** This person's own roster, which Home shows separately. */
  myPattern: WorkPattern | null;
  /**
   * True when there is no overlap even with both diaries empty and no minimum
   * length, which means the waking hours themselves never meet. A different
   * problem with a different fix, and telling somebody their calendar looks
   * packed when it is empty sends them to the wrong screen.
   */
  noZoneOverlap: boolean;
};

const EMPTY: FreeWindowsResult = {
  windows: [],
  prefs: DEFAULT_FREE_TIME_PREFS,
  myPattern: null,
  noZoneOverlap: false,
};

export async function loadFreeWindows(
  userId: string | null,
  coupleId: string | null,
  zones: { mine: string; theirs: string | null },
  lookaheadDays = 8
): Promise<FreeWindowsResult> {
  if (!userId) return EMPTY;

  const now = new Date();
  const windowEnd = new Date(now);
  windowEnd.setDate(windowEnd.getDate() + lookaheadDays);

  // What counts as a free window is a per-couple setting, read alongside the
  // busy blocks rather than in its own pass, so the windows are never computed
  // once with the defaults and again with the real values. That shows as the
  // list visibly changing under you.
  const prefsRes = await supabase
    .from("couples")
    .select("day_start_hour, day_end_hour, min_free_minutes")
    .eq("id", coupleId ?? "")
    .maybeSingle();

  const prefs: FreeTimePrefs = prefsRes.data
    ? {
        dayStartHour:
          (prefsRes.data.day_start_hour as number) ?? DEFAULT_FREE_TIME_PREFS.dayStartHour,
        dayEndHour: (prefsRes.data.day_end_hour as number) ?? DEFAULT_FREE_TIME_PREFS.dayEndHour,
        minFreeMinutes:
          (prefsRes.data.min_free_minutes as number) ?? DEFAULT_FREE_TIME_PREFS.minFreeMinutes,
      }
    : DEFAULT_FREE_TIME_PREFS;

  // all_day is excluded on purpose. An all-day event syncs, because it is
  // worth seeing "Alyssa - annual leave" on the shared calendar, but treating
  // it as twenty-four hours of busy would wipe out every window that day, and
  // being on leave is the opposite of being unavailable.
  const { data } = await supabase
    .from("busy_blocks")
    .select("user_id, start_at, end_at")
    .eq("all_day", false)
    .lte("start_at", windowEnd.toISOString())
    .gte("end_at", now.toISOString());

  const blocks = data ?? [];

  const toInterval = (b: { start_at: string; end_at: string }): Interval => ({
    start: new Date(b.start_at),
    end: new Date(b.end_at),
  });

  const mine = blocks.filter((b) => b.user_id === userId).map(toInterval);
  const theirs = blocks.filter((b) => b.user_id !== userId).map(toInterval);

  // Working hours count as busy too. Without them, "free together" happily
  // suggests the middle of a shift.
  const [patternRes, shiftRes] = await Promise.all([
    supabase
      .from("work_patterns")
      .select("id, user_id, mode, cycle_weeks, anchor_date, shifts, time_zone"),
    supabase
      .from("work_shifts")
      .select("id, user_id, date, start_time, end_time, kind, time_zone")
      .gte("date", toDateKey(now))
      .lte("date", toDateKey(windowEnd)),
  ]);

  const patterns = (patternRes.data as WorkPattern[]) ?? [];
  const workShifts = (shiftRes.data as WorkShift[]) ?? [];

  const userIds = new Set<string>([
    ...patterns.map((p) => p.user_id),
    ...workShifts.map((w) => w.user_id),
  ]);

  const myWork: Interval[] = [];
  const theirWork: Interval[] = [];

  for (const uid of userIds) {
    const intervals = expandWorkHours(
      patterns.find((p) => p.user_id === uid) ?? null,
      workShifts.filter((w) => w.user_id === uid),
      now,
      windowEnd
    );
    if (uid === userId) myWork.push(...intervals);
    else theirWork.push(...intervals);
  }

  const windows = nextSharedFreeWindows(
    [...mine, ...myWork],
    [...theirs, ...theirWork],
    prefs,
    zones
  );

  return {
    windows,
    prefs,
    myPattern: patterns.find((p) => p.user_id === userId) ?? null,
    // Only asked when the answer was empty. Keeping the minimum in the probe
    // would blame the zones for an overlap that exists but is shorter than the
    // couple asked to hear about, and send them to the wrong setting.
    noZoneOverlap:
      windows.length === 0 &&
      nextSharedFreeWindows([], [], { ...prefs, minFreeMinutes: 0 }, zones).length === 0,
  };
}
