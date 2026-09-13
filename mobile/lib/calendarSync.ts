import * as Calendar from "expo-calendar/legacy";
import { supabase } from "@/lib/supabase";

const SYNC_WINDOW_DAYS = 30;

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

  // Simple full-replace sync for this user's upcoming window — no diffing,
  // just clear what's ahead of "now" and re-insert the current read. Cheap
  // and correct for a calendar that's read fresh on every app open.
  await supabase.from("busy_blocks").delete().eq("user_id", userId).gte("start_at", now.toISOString());

  if (blocks.length > 0) {
    await supabase.from("busy_blocks").insert(blocks);
  }
}
