import * as Calendar from "expo-calendar/legacy";
import { supabase } from "@/lib/supabase";

/**
 * Editing an event that lives in the phone's own calendar.
 *
 * These are the events synced in from Google, Apple or Outlook. The app shows
 * them on the grid, and moving one here writes straight back to the calendar
 * it came from -- there is no copy in our database to keep in step, because
 * busy_blocks is rewritten wholesale on every sync. The calendar is the source
 * of truth and stays that way.
 */

export type DeviceEventRow = {
  id: string;
  user_id: string;
  start_at: string;
  end_at: string;
  title: string | null;
  location: string | null;
  notes: string | null;
  all_day: boolean;
  calendar_id: string | null;
  device_event_id: string | null;
  recurring: boolean;
};

export const DEVICE_EVENT_COLUMNS =
  "id, user_id, start_at, end_at, title, location, notes, all_day, calendar_id, device_event_id, recurring";

export async function loadDeviceEvent(id: string): Promise<DeviceEventRow | null> {
  const { data } = await supabase
    .from("busy_blocks")
    .select(DEVICE_EVENT_COLUMNS)
    .eq("id", id)
    .maybeSingle();

  return (data as DeviceEventRow) ?? null;
}

export type Editability =
  | { editable: true }
  | { editable: false; reason: string };

/**
 * Whether this phone can change this event, and if not, why.
 *
 * Checked up front rather than letting the write fail, because every reason
 * here is something a person can act on and none of them is obvious from a
 * native error.
 */
export async function canEdit(
  row: DeviceEventRow,
  userId: string
): Promise<Editability> {
  if (row.user_id !== userId) {
    return {
      editable: false,
      reason:
        "This is on your partner's calendar. A phone can only change its own calendars, so they'll need to move it on theirs.",
    };
  }

  if (!row.device_event_id) {
    return {
      editable: false,
      reason:
        "This event was synced before the app started recording which event it was. Pull to refresh on Home and try again.",
    };
  }

  const permission = await Calendar.getCalendarPermissionsAsync();
  if (permission.status !== "granted") {
    return {
      editable: false,
      reason: "Untangled Life doesn't have calendar access on this phone any more.",
    };
  }

  if (row.calendar_id) {
    const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
    const source = calendars.find((c) => c.id === row.calendar_id);

    if (!source) {
      return {
        editable: false,
        reason: "The calendar this came from isn't on this phone any more.",
      };
    }

    // A subscribed calendar -- a holiday feed, a shared read-only roster --
    // looks identical on the grid and simply refuses writes.
    if (!source.allowsModifications) {
      return {
        editable: false,
        reason: `"${source.title}" is read-only on this phone, so its events can't be changed here.`,
      };
    }
  }

  return { editable: true };
}

export type SeriesScope = "single" | "future";

export async function updateDeviceEvent(
  row: DeviceEventRow,
  changes: {
    title: string;
    startDate: Date;
    endDate: Date;
    location: string | null;
    notes: string | null;
  },
  scope: SeriesScope
): Promise<{ error: string | null }> {
  if (!row.device_event_id) return { error: "No event id recorded for this one." };

  try {
    await Calendar.updateEventAsync(
      row.device_event_id,
      {
        title: changes.title,
        startDate: changes.startDate,
        endDate: changes.endDate,
        location: changes.location ?? undefined,
        notes: changes.notes ?? undefined,
      },
      row.recurring
        ? {
            // futureEvents:false is this occurrence alone; true is this one and
            // everything after it, which is what Apple and Google mean by
            // "all". instanceStartDate says WHICH occurrence, and without it
            // the phone edits the first one in the series -- so a change to
            // next Tuesday's gym would silently move a session from months ago.
            futureEvents: scope === "future",
            instanceStartDate: new Date(row.start_at),
          }
        : undefined
    );

    return { error: null };
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "The phone wouldn't accept that change.",
    };
  }
}

export async function deleteDeviceEvent(
  row: DeviceEventRow,
  scope: SeriesScope
): Promise<{ error: string | null }> {
  if (!row.device_event_id) return { error: "No event id recorded for this one." };

  try {
    await Calendar.deleteEventAsync(
      row.device_event_id,
      row.recurring
        ? { futureEvents: scope === "future", instanceStartDate: new Date(row.start_at) }
        : undefined
    );
    return { error: null };
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "The phone wouldn't accept that.",
    };
  }
}
