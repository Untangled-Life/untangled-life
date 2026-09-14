import * as Calendar from "expo-calendar/legacy";
import { supabase } from "@/lib/supabase";
import { connectedCalendarIds } from "@/lib/calendarPrefs";

const SYNC_WINDOW_DAYS = 30;

// How long a past busy block is kept. Nothing in the app reads them once
// they're over; this is simply so they don't pile up forever.
const RETENTION_DAYS = 7;

/**
 * Reads the calendars you have CONNECTED -- not every calendar on the phone --
 * for the next 30 days, and uploads each event so that both of you can see it.
 *
 * This used to upload start and end times only, which made the shared calendar
 * a wall of anonymous grey blocks. It now carries the title, location and
 * notes, which is far more useful and considerably more revealing, so the set
 * of calendars it reads is no longer "all of them": it's whatever you ticked
 * in Calendars. An unticked calendar is never opened here, and a calendar you
 * have never been asked about counts as unticked.
 */
export async function syncBusyBlocks(coupleId: string, userId: string): Promise<void> {
  const permission = await Calendar.getCalendarPermissionsAsync();
  if (permission.status !== "granted") return;

  const now = new Date();

  // Always run the retention sweep, even with nothing connected: someone who
  // has just disconnected everything should still see their history age out.
  const retentionCutoff = new Date(now);
  retentionCutoff.setDate(retentionCutoff.getDate() - RETENTION_DAYS);
  await supabase
    .from("busy_blocks")
    .delete()
    .eq("user_id", userId)
    .lt("end_at", retentionCutoff.toISOString());

  const calendarIds = await connectedCalendarIds(userId);
  if (calendarIds.length === 0) {
    // Nothing connected: clear anything a previously-connected calendar left
    // behind and stop. Not returning early before this would leave stale
    // events visible to a partner after the last calendar was switched off.
    await supabase
      .from("busy_blocks")
      .delete()
      .eq("user_id", userId)
      .gt("end_at", now.toISOString());
    return;
  }

  // A calendar can be removed from the phone entirely (an account signed out,
  // a subscription deleted). Asking expo-calendar for an id that no longer
  // exists throws, so only ask for ones still present.
  const present = new Set(
    (await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT)).map((c) => c.id)
  );
  const readable = calendarIds.filter((id) => present.has(id));
  if (readable.length === 0) return;

  const windowEnd = new Date(now);
  windowEnd.setDate(windowEnd.getDate() + SYNC_WINDOW_DAYS);

  const events = await Calendar.getEventsAsync(readable, now, windowEnd);

  const blocks = events
    .map((e) => ({
      couple_id: coupleId,
      user_id: userId,
      start_at: new Date(e.startDate).toISOString(),
      end_at: new Date(e.endDate).toISOString(),
      // Trimmed so an empty title doesn't become an empty-looking row, and
      // capped so a pasted wall of notes doesn't travel with every sync.
      title: clean(e.title, 200),
      location: clean(e.location, 200),
      notes: clean(e.notes, 500),
      all_day: e.allDay === true,
      calendar_id: e.calendarId ?? null,
    }))
    // Drop anything that somehow ends before it starts or is already past.
    .filter((b) => new Date(b.end_at) > new Date(b.start_at) && new Date(b.end_at) > now);

  // Full-replace sync for this user's upcoming window -- no diffing, just clear
  // what we're about to re-insert and write the current read.
  //
  // The delete MUST use the same rule as the insert filter above (end_at in
  // the future), not start_at. Clearing by start_at leaves anything already in
  // progress behind -- its start is in the past -- while the insert happily adds
  // it again, so every sync stacked another copy of the event you're currently
  // in.
  await supabase
    .from("busy_blocks")
    .delete()
    .eq("user_id", userId)
    .gt("end_at", now.toISOString());

  if (blocks.length > 0) {
    const { error } = await supabase.from("busy_blocks").insert(blocks);
    if (error) {
      // Nothing to alert here -- this runs in the background -- but a silent
      // failure means free time is computed as if both diaries were empty,
      // which looks like working software.
      console.warn("[calendarSync] couldn't store busy blocks:", error.message);
    }
  }
}

function clean(value: string | null | undefined, max: number): string | null {
  const trimmed = (value ?? "").trim();
  if (trimmed.length === 0) return null;
  return trimmed.slice(0, max);
}
