import * as Calendar from "expo-calendar/legacy";
import { supabase } from "@/lib/supabase";
import { sharedCalendars } from "@/lib/calendarPrefs";

const SYNC_WINDOW_DAYS = 30;

// How long a past busy block is kept. Nothing in the app reads them once
// they're over; this is simply so they don't pile up forever.
const RETENTION_DAYS = 7;

/**
 * Reads the calendars you have chosen to share -- not every calendar on the
 * phone -- for the next 30 days, and uploads each event so that both of you
 * can see it.
 *
 * How much of each event travels depends on that calendar's share level. A
 * 'times' calendar uploads start and end only, so your partner sees that
 * you're busy and nothing more; a 'details' calendar carries the title,
 * location and notes as well. Anything set to off, or never chosen at all, is
 * not opened here.
 *
 * The stripping happens BEFORE the insert, not in the UI. A busy_blocks row
 * that carries a title is readable by the partner whatever the app chooses to
 * render, so "don't show it" and "don't store it" are not the same promise,
 * and only the second one is worth making.
 */
export async function syncBusyBlocks(coupleId: string, userId: string): Promise<void> {
  const now = new Date();

  // The retention sweep runs before anything else, and before the permission
  // check in particular.
  //
  // Revoking calendar access in the phone's settings is the most emphatic way
  // there is of saying "stop sharing this". If the permission check came
  // first, that action would freeze every uploaded row in place instead:
  // nothing would ever delete them, the Calendars screen would show an empty
  // list with no row to turn off, and the partner would keep reading those
  // event titles indefinitely. Both deletes here are plain database calls and
  // need no calendar access at all.
  const retentionCutoff = new Date(now);
  retentionCutoff.setDate(retentionCutoff.getDate() - RETENTION_DAYS);
  await supabase
    .from("busy_blocks")
    .delete()
    .eq("user_id", userId)
    .lt("end_at", retentionCutoff.toISOString());

  const sharing = await sharedCalendars(userId);

  const permission = await Calendar.getCalendarPermissionsAsync();
  const canRead = permission.status === "granted";

  // Everything we are about to re-insert, cleared first. Doing this on every
  // path rather than only the happy one is what keeps a row from outliving the
  // reason it existed -- permission withdrawn, nothing shared any more, or a
  // shared calendar that has vanished off the phone.
  const clearUpcoming = () =>
    supabase.from("busy_blocks").delete().eq("user_id", userId).gt("end_at", now.toISOString());

  if (!canRead || sharing.size === 0) {
    await clearUpcoming();
    return;
  }
  // A calendar can be removed from the phone entirely: an account signed out,
  // a subscription deleted, or a restore from backup reassigning its id.
  // Asking expo-calendar for an id that no longer exists throws, so only ask
  // for ones still present.
  const present = new Set(
    (await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT)).map((c) => c.id)
  );
  const readable = [...sharing.keys()].filter((id) => present.has(id));

  // Returning here without clearing was the same mistake as above, one step
  // further along: the pref row still says "details", so the "nothing shared"
  // branch doesn't catch it, and the vanished calendar's events would sit in
  // the database with full detail forever -- unreachable from the picker,
  // because a calendar that isn't on the phone never appears in it.
  if (readable.length === 0) {
    await clearUpcoming();
    return;
  }

  const windowEnd = new Date(now);
  windowEnd.setDate(windowEnd.getDate() + SYNC_WINDOW_DAYS);

  const events = await Calendar.getEventsAsync(readable, now, windowEnd);

  const blocks = events
    .map((e) => {
      const full = e.calendarId ? sharing.get(e.calendarId) === "details" : false;

      return {
        couple_id: coupleId,
        user_id: userId,
        start_at: new Date(e.startDate).toISOString(),
        end_at: new Date(e.endDate).toISOString(),
        // Trimmed so an empty title doesn't become an empty-looking row, and
        // capped so a pasted wall of notes doesn't travel with every sync.
        title: full ? clean(e.title, 200) : null,
        location: full ? clean(e.location, 200) : null,
        notes: full ? clean(e.notes, 500) : null,
        all_day: e.allDay === true,
        calendar_id: e.calendarId ?? null,
        // The phone's own id for this event, so the app can write a change
        // back to the calendar it came from. Meaningless on the partner's
        // device, which is the point: only the owner can edit it.
        //
        // For a repeating event this is the id of the SERIES, and every
        // occurrence carries the same one -- which is why the start time has
        // to be passed alongside it when editing, to say which occurrence.
        device_event_id: e.id ?? null,
        recurring: Boolean(e.recurrenceRule),
      };
    })
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
  await clearUpcoming();

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
