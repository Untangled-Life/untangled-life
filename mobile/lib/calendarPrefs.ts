import * as Calendar from "expo-calendar/legacy";
import { supabase } from "@/lib/supabase";

/**
 * Which of the calendars on this phone are connected to Untangled Life.
 *
 * The rule the privacy policy commits to: a calendar is read only if you have
 * connected it, and a calendar you have not connected never leaves the phone.
 * So the absence of a row means NOT connected. That is deliberately the
 * inconvenient default -- connecting a calendar makes its event titles
 * readable by your partner, and that shouldn't happen because nobody got
 * around to asking.
 */
export type DeviceCalendar = {
  id: string;
  title: string;
  sourceName: string;
  /** The phone's own colour for this calendar, so the picker looks familiar. */
  color: string | null;
  connected: boolean;
  /** True when we have never recorded a choice for this calendar. */
  undecided: boolean;
};

type PrefRow = {
  calendar_id: string;
  connected: boolean;
};

/** Every event calendar on the phone, paired with the choice made about it. */
export async function listCalendars(userId: string): Promise<DeviceCalendar[]> {
  const permission = await Calendar.getCalendarPermissionsAsync();
  if (permission.status !== "granted") return [];

  const [calendars, prefsRes] = await Promise.all([
    Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT),
    supabase.from("calendar_prefs").select("calendar_id, connected").eq("user_id", userId),
  ]);

  const prefs = new Map<string, boolean>(
    ((prefsRes.data as PrefRow[]) ?? []).map((p) => [p.calendar_id, p.connected])
  );

  return calendars.map((c) => {
    const recorded = prefs.get(c.id);
    return {
      id: c.id,
      title: c.title ?? "Calendar",
      // iOS calls it source.name, Android uses the account it syncs from.
      sourceName: c.source?.name ?? (c as { ownerAccount?: string }).ownerAccount ?? "",
      color: c.color ?? null,
      connected: recorded === true,
      undecided: recorded === undefined,
    };
  });
}

/** The ids to actually read. Empty means nothing is uploaded at all. */
export async function connectedCalendarIds(userId: string): Promise<string[]> {
  const { data } = await supabase
    .from("calendar_prefs")
    .select("calendar_id, connected")
    .eq("user_id", userId)
    .eq("connected", true);

  return ((data as PrefRow[]) ?? []).map((p) => p.calendar_id);
}

export async function setCalendarConnected(
  userId: string,
  calendar: { id: string; title: string; sourceName: string },
  connected: boolean
): Promise<{ error: string | null }> {
  const { error } = await supabase.from("calendar_prefs").upsert(
    {
      user_id: userId,
      calendar_id: calendar.id,
      title: calendar.title,
      source_name: calendar.sourceName,
      connected,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,calendar_id" }
  );

  if (error) return { error: error.message };

  // Disconnecting has to take the data with it, immediately -- the policy says
  // the events a calendar contributed are deleted, and "on the next sync"
  // isn't good enough when someone has just decided their partner shouldn't be
  // reading that calendar.
  if (!connected) {
    await supabase
      .from("busy_blocks")
      .delete()
      .eq("user_id", userId)
      .eq("calendar_id", calendar.id);
  }

  return { error: null };
}

/**
 * Records "no" for every calendar we have never asked about, so the app stops
 * treating them as an open question. Used when someone dismisses the picker
 * without connecting anything -- silence becomes a recorded no, not a
 * recurring prompt.
 */
export async function declineUndecided(
  userId: string,
  calendars: DeviceCalendar[]
): Promise<void> {
  const undecided = calendars.filter((c) => c.undecided);
  if (undecided.length === 0) return;

  await supabase.from("calendar_prefs").upsert(
    undecided.map((c) => ({
      user_id: userId,
      calendar_id: c.id,
      title: c.title,
      source_name: c.sourceName,
      connected: false,
      updated_at: new Date().toISOString(),
    })),
    { onConflict: "user_id,calendar_id" }
  );
}
