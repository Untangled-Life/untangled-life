import * as Calendar from "expo-calendar/legacy";
import { supabase } from "@/lib/supabase";

/**
 * How much of a calendar is shared with your partner.
 *
 * Three levels rather than a switch, because the common awkward case is a work
 * calendar: you want the hours counted as busy so nobody books over them, and
 * you do not want your partner reading what every meeting is about.
 *
 * The absence of a row means "off". That is deliberately the inconvenient
 * default -- sharing event titles shouldn't happen because nobody got around
 * to asking.
 */
export type ShareLevel = "off" | "times" | "details";

export const SHARE_LEVELS: { key: ShareLevel; label: string; blurb: string }[] = [
  { key: "off", label: "Off", blurb: "Never read. Nothing from it leaves your phone." },
  { key: "times", label: "Busy only", blurb: "They see that you're busy, not what you're doing." },
  { key: "details", label: "Full detail", blurb: "They see the title, place and notes." },
];

export type DeviceCalendar = {
  id: string;
  title: string;
  sourceName: string;
  /** The phone's own colour for this calendar, so the picker looks familiar. */
  color: string | null;
  shareLevel: ShareLevel;
  /** True when we have never recorded a choice for this calendar. */
  undecided: boolean;
};

type PrefRow = {
  calendar_id: string;
  share_level: ShareLevel;
};

/** Every event calendar on the phone, paired with the choice made about it. */
export async function listCalendars(userId: string): Promise<DeviceCalendar[]> {
  const permission = await Calendar.getCalendarPermissionsAsync();
  if (permission.status !== "granted") return [];

  const [calendars, prefsRes] = await Promise.all([
    Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT),
    supabase.from("calendar_prefs").select("calendar_id, share_level").eq("user_id", userId),
  ]);

  const prefs = new Map<string, ShareLevel>(
    ((prefsRes.data as PrefRow[]) ?? []).map((p) => [p.calendar_id, p.share_level])
  );

  return calendars.map((c) => {
    const recorded = prefs.get(c.id);
    return {
      id: c.id,
      title: c.title ?? "Calendar",
      // iOS calls it source.name, Android uses the account it syncs from.
      sourceName: c.source?.name ?? (c as { ownerAccount?: string }).ownerAccount ?? "",
      color: c.color ?? null,
      shareLevel: recorded ?? "off",
      undecided: recorded === undefined,
    };
  });
}

/**
 * The calendars to actually read, and how much of each to upload. An empty map
 * means nothing is read at all.
 */
export async function sharedCalendars(userId: string): Promise<Map<string, ShareLevel>> {
  const { data } = await supabase
    .from("calendar_prefs")
    .select("calendar_id, share_level")
    .eq("user_id", userId)
    .neq("share_level", "off");

  return new Map(((data as PrefRow[]) ?? []).map((p) => [p.calendar_id, p.share_level]));
}

export async function setShareLevel(
  userId: string,
  calendar: { id: string; title: string; sourceName: string },
  shareLevel: ShareLevel
): Promise<{ error: string | null }> {
  const { error } = await supabase.from("calendar_prefs").upsert(
    {
      user_id: userId,
      calendar_id: calendar.id,
      title: calendar.title,
      source_name: calendar.sourceName,
      share_level: shareLevel,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,calendar_id" }
  );

  if (error) return { error: error.message };

  // Turning a calendar off has to take its data with it immediately -- the
  // policy says the events it contributed are deleted, and "at the next sync"
  // isn't good enough when someone has just decided their partner shouldn't be
  // reading that calendar.
  //
  // Dropping from full detail to busy-only is the same problem in miniature:
  // the titles are already uploaded, and leaving them until the next sync
  // rewrites the row means the setting says one thing while the database says
  // another. The caller re-syncs straight after, which puts the times back.
  if (shareLevel !== "details") {
    await supabase
      .from("busy_blocks")
      .delete()
      .eq("user_id", userId)
      .eq("calendar_id", calendar.id);
  }

  return { error: null };
}

/**
 * Records "off" for every calendar we have never asked about, so the app stops
 * treating them as an open question. Used when someone leaves the picker
 * without choosing -- silence becomes a recorded no, not a recurring prompt.
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
      share_level: "off",
      updated_at: new Date().toISOString(),
    })),
    { onConflict: "user_id,calendar_id" }
  );
}
