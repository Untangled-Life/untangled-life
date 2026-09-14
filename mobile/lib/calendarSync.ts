import * as Calendar from "expo-calendar/legacy";
import { supabase } from "@/lib/supabase";

const SYNC_WINDOW_DAYS = 30;

// How long a past busy block is kept. Nothing in the app reads them once
// they're over; this is simply so they don't pile up forever.
const RETENTION_DAYS = 7;

// Reads every event on every calendar already on this phone (Google,
// Apple/iCloud, Outlook, whatever's synced) for the next 30 days, and
// uploads ONLY start/end times to Supabase — never titles, locations or
// notes. That's what lets both partners see when the other is free without
// either one seeing what the other is actually doing.
export async function syncBusyBlocks(coupleId: string, userId: string): Promise<void> {
  const permission = await Calendar.getCalendarPermissionsAsync();
  if (permission.status !== "granted") return;

  const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
  const calendarIds = calendars.map((c) => c.id);
  if (calendarIds.length === 0) return;

  const now = new Date();
  const windowEnd = new Date(now);
  windowEnd.setDate(windowEnd.getDate() + SYNC_WINDOW_DAYS);

  const events = await Calendar.getEventsAsync(calendarIds, now, windowEnd);

  const blocks = events
    .filter((e) => !e.allDay)
    .map((e) => ({
      couple_id: coupleId,
      user_id: userId,
      start_at: new Date(e.startDate).toISOString(),
      end_at: new Date(e.endDate).toISOString(),
    }))
    // Drop anything that somehow ends before it starts or is already past.
    .filter((b) => new Date(b.end_at) > new Date(b.start_at) && new Date(b.end_at) > now);

  // Full-replace sync for this user's upcoming window — no diffing, just clear
  // what we're about to re-insert and write the current read.
  //
  // The delete MUST use the same rule as the insert filter above (end_at in
  // the future), not start_at. Clearing by start_at leaves anything already in
  // progress behind — its start is in the past — while the insert happily adds
  // it again, so every sync stacked another copy of the event you're currently
  // in.
  await supabase
    .from("busy_blocks")
    .delete()
    .eq("user_id", userId)
    .gt("end_at", now.toISOString());

  // Past blocks were never cleared, so a record of when you were busy built up
  // indefinitely. Nothing reads them -- free time only looks forward -- so
  // they're pure accumulation, and keeping a permanent history of someone's
  // movements is the opposite of what this table is for.
  const retentionCutoff = new Date(now);
  retentionCutoff.setDate(retentionCutoff.getDate() - RETENTION_DAYS);

  await supabase
    .from("busy_blocks")
    .delete()
    .eq("user_id", userId)
    .lt("end_at", retentionCutoff.toISOString());

  if (blocks.length > 0) {
    const { error } = await supabase.from("busy_blocks").insert(blocks);
    if (error) {
      // Nothing to alert here — this runs in the background — but a silent
      // failure means free time is computed as if both diaries were empty,
      // which looks like working software.
      console.warn("[calendarSync] couldn't store busy blocks:", error.message);
    }
  }
}
