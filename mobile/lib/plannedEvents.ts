import * as Calendar from "expo-calendar/legacy";
import { supabase } from "@/lib/supabase";

export type PlannedEvent = {
  id: string;
  title: string;
  start_at: string;
  end_at: string;
  location: string | null;
  notes: string | null;
  cancelled: boolean;
  created_by: string;
  /** Whose event it is. Null means it belongs to both of you. */
  owner_user_id: string | null;
  /** Whose phone calendar it should appear in. Empty means neither. */
  push_to: string[];
};

export const EVENT_COLUMNS =
  "id, title, start_at, end_at, location, notes, cancelled, created_by, owner_user_id, push_to";

/**
 * Create a plan. This only writes the shared record -- getting it onto the
 * phones is syncPlannedEventsToDevice's job, which runs right after on this
 * phone and on the partner's phone next time they open the app.
 */
export async function createPlannedEvent(input: {
  coupleId: string;
  userId: string;
  title: string;
  startAt: Date;
  endAt: Date;
  location?: string;
  notes?: string;
  /** Null for an event that belongs to both of you. */
  ownerUserId?: string | null;
  /** Whose phone calendar it goes to. Defaults to nobody's. */
  pushTo?: string[];
}) {
  return supabase.from("planned_events").insert({
    couple_id: input.coupleId,
    created_by: input.userId,
    title: input.title,
    start_at: input.startAt.toISOString(),
    end_at: input.endAt.toISOString(),
    location: input.location ?? null,
    notes: input.notes ?? null,
    owner_user_id: input.ownerUserId ?? null,
    push_to: input.pushTo ?? [],
  });
}

export async function updatePlannedEvent(
  id: string,
  patch: {
    title?: string;
    startAt?: Date;
    endAt?: Date;
    location?: string | null;
    notes?: string | null;
    ownerUserId?: string | null;
    pushTo?: string[];
  }
) {
  const row: Record<string, unknown> = {};
  if (patch.title !== undefined) row.title = patch.title;
  if (patch.startAt !== undefined) row.start_at = patch.startAt.toISOString();
  if (patch.endAt !== undefined) row.end_at = patch.endAt.toISOString();
  if (patch.location !== undefined) row.location = patch.location;
  if (patch.notes !== undefined) row.notes = patch.notes;
  if (patch.ownerUserId !== undefined) row.owner_user_id = patch.ownerUserId;
  if (patch.pushTo !== undefined) row.push_to = patch.pushTo;

  return supabase.from("planned_events").update(row).eq("id", id);
}

export async function deletePlannedEvent(id: string) {
  // Cancel rather than delete: each phone removes its own copy on the next
  // sync by reading the flag, and a row that has vanished can't tell anybody
  // to take the event off their calendar.
  return cancelPlannedEvent(id);
}

/** Flag the plan cancelled. Both phones drop their own copy on next sync. */
export async function cancelPlannedEvent(id: string) {
  return supabase.from("planned_events").update({ cancelled: true }).eq("id", id);
}

export type PlanSyncResult = {
  added: number;
  removed: number;
  problem?: string;
};

/**
 * The phone's default calendar isn't necessarily writable -- it can be a
 * subscribed or read-only one, in which case creating an event throws. Prefer
 * the default when it allows modifications, otherwise take the first calendar
 * that does.
 */
async function findWritableCalendarId(): Promise<string | null> {
  const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
  const writable = calendars.filter((c) => c.allowsModifications);

  if (writable.length === 0) return null;

  try {
    const preferred = await Calendar.getDefaultCalendarAsync();
    if (preferred?.id && writable.some((c) => c.id === preferred.id)) {
      return preferred.id;
    }
  } catch {
    // getDefaultCalendarAsync is iOS-only and can throw; fall through.
  }

  return writable[0].id;
}

/**
 * Reconcile this phone's calendar with the couple's plans: add any plan that
 * isn't on this phone yet, remove any that's been cancelled. Safe to call on
 * every app open -- it only touches events it created itself, tracked by the
 * link rows.
 *
 * Returns what it did (and what stopped it) rather than failing silently: a
 * booking that never reaches the calendar is the whole feature not working,
 * so the caller needs to be able to say so.
 */
export async function syncPlannedEventsToDevice(userId: string): Promise<PlanSyncResult> {
  const result: PlanSyncResult = { added: 0, removed: 0 };

  const permission = await Calendar.getCalendarPermissionsAsync();
  if (permission.status !== "granted") {
    result.problem = "Untangled Life doesn't have calendar access on this phone.";
    return result;
  }

  const { data: events } = await supabase
    .from("planned_events")
    .select(EVENT_COLUMNS)
    .gte("end_at", new Date().toISOString());

  if (!events) return result;

  const { data: links } = await supabase
    .from("planned_event_calendar_links")
    .select("planned_event_id, device_event_id")
    .eq("user_id", userId);

  const linkFor = new Map<string, string>(
    (links ?? []).map((l) => [l.planned_event_id as string, l.device_event_id as string])
  );

  let writableCalendarId: string | null = null;

  for (const ev of events as PlannedEvent[]) {
    const existing = linkFor.get(ev.id);

    // Whether THIS phone should be carrying it. push_to is a list of user ids
    // chosen in the event editor, separate from who the event belongs to: a
    // shared dinner is both of yours and wants to be on both phones, while
    // "Alyssa - school pickup" is hers but you may well want it in your diary
    // too. Untangling the two is the whole point of the toggles.
    const wanted = !ev.cancelled && (ev.push_to ?? []).includes(userId);

    // Cancelled and "no longer pushed to me" are the same job: take my copy
    // off this phone. Treating them separately is how you end up with an event
    // that stays in your calendar after you switch its toggle off, which looks
    // exactly like the toggle not working.
    if (!wanted) {
      if (existing) {
        try {
          await Calendar.deleteEventAsync(existing);
        } catch {
          // Already gone from the phone (deleted by hand, or the calendar was
          // removed) -- dropping the link row is still the right outcome.
        }
        await supabase
          .from("planned_event_calendar_links")
          .delete()
          .eq("planned_event_id", ev.id)
          .eq("user_id", userId);
        result.removed += 1;
      }
      continue;
    }

    if (existing) {
      // Already on this phone. Keep its details in step with the shared
      // record, so editing an event's time in the app moves it in the phone's
      // calendar rather than leaving the two disagreeing.
      try {
        await Calendar.updateEventAsync(existing, {
          title: ev.title,
          startDate: new Date(ev.start_at),
          endDate: new Date(ev.end_at),
          location: ev.location ?? undefined,
          notes: ev.notes ?? undefined,
        });
      } catch {
        // Deleted by hand on the phone, or its calendar removed. Drop the link
        // so the next sync puts it back rather than believing it's still there.
        await supabase
          .from("planned_event_calendar_links")
          .delete()
          .eq("planned_event_id", ev.id)
          .eq("user_id", userId);
      }
      continue;
    }

    if (!writableCalendarId) {
      writableCalendarId = await findWritableCalendarId();
      if (!writableCalendarId) {
        result.problem =
          "No calendar on this phone allows new events. Check that at least one calendar is writable.";
        return result;
      }
    }

    try {
      const deviceEventId = await Calendar.createEventAsync(writableCalendarId, {
        title: ev.title,
        startDate: new Date(ev.start_at),
        endDate: new Date(ev.end_at),
        location: ev.location ?? undefined,
        notes: ev.notes ?? undefined,
      });

      const { error: linkError } = await supabase
        .from("planned_event_calendar_links")
        .insert({
          planned_event_id: ev.id,
          user_id: userId,
          device_event_id: deviceEventId,
        });

      if (linkError) {
        // The event is on the phone but unlinked, so a later sync would add a
        // duplicate. Better to take it back off and report.
        await Calendar.deleteEventAsync(deviceEventId).catch(() => {});
        result.problem = `Saved to the calendar but couldn't record it: ${linkError.message}`;
        return result;
      }

      result.added += 1;
    } catch (e) {
      result.problem =
        e instanceof Error ? e.message : "Couldn't write the event to this phone's calendar.";
      return result;
    }
  }

  return result;
}

/** Upcoming, non-cancelled plans for the couple, soonest first. */
export async function loadUpcomingPlans(): Promise<PlannedEvent[]> {
  const { data } = await supabase
    .from("planned_events")
    .select(EVENT_COLUMNS)
    .eq("cancelled", false)
    .gte("end_at", new Date().toISOString())
    .order("start_at", { ascending: true });

  return (data as PlannedEvent[]) ?? [];
}

export function formatPlanWhen(startAt: string, endAt: string): string {
  const start = new Date(startAt);
  const end = new Date(endAt);
  const day = start.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const time = (d: Date) =>
    d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `${day}, ${time(start)} - ${time(end)}`;
}
