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
};

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
}) {
  return supabase.from("planned_events").insert({
    couple_id: input.coupleId,
    created_by: input.userId,
    title: input.title,
    start_at: input.startAt.toISOString(),
    end_at: input.endAt.toISOString(),
    location: input.location ?? null,
    notes: input.notes ?? null,
  });
}

/** Flag the plan cancelled. Both phones drop their own copy on next sync. */
export async function cancelPlannedEvent(id: string) {
  return supabase.from("planned_events").update({ cancelled: true }).eq("id", id);
}

/**
 * Reconcile this phone's calendar with the couple's plans: add any plan that
 * isn't on this phone yet, remove any that's been cancelled. Safe to call on
 * every app open -- it only touches events it created itself, tracked by the
 * link rows.
 */
export async function syncPlannedEventsToDevice(userId: string): Promise<void> {
  const permission = await Calendar.getCalendarPermissionsAsync();
  if (permission.status !== "granted") return;

  const { data: events } = await supabase
    .from("planned_events")
    .select("id, title, start_at, end_at, location, notes, cancelled, created_by")
    .gte("end_at", new Date().toISOString());

  if (!events || events.length === 0) return;

  const { data: links } = await supabase
    .from("planned_event_calendar_links")
    .select("planned_event_id, device_event_id")
    .eq("user_id", userId);

  const linkFor = new Map<string, string>(
    (links ?? []).map((l) => [l.planned_event_id as string, l.device_event_id as string])
  );

  let defaultCalendarId: string | null = null;

  for (const ev of events as PlannedEvent[]) {
    const existing = linkFor.get(ev.id);

    if (ev.cancelled) {
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
      }
      continue;
    }

    if (existing) continue;

    if (!defaultCalendarId) {
      const defaultCalendar = await Calendar.getDefaultCalendarAsync();
      if (!defaultCalendar?.id) return;
      defaultCalendarId = defaultCalendar.id;
    }

    const deviceEventId = await Calendar.createEventAsync(defaultCalendarId, {
      title: ev.title,
      startDate: new Date(ev.start_at),
      endDate: new Date(ev.end_at),
      location: ev.location ?? undefined,
      notes: ev.notes ?? undefined,
    });

    await supabase.from("planned_event_calendar_links").insert({
      planned_event_id: ev.id,
      user_id: userId,
      device_event_id: deviceEventId,
    });
  }
}

/** Upcoming, non-cancelled plans for the couple, soonest first. */
export async function loadUpcomingPlans(): Promise<PlannedEvent[]> {
  const { data } = await supabase
    .from("planned_events")
    .select("id, title, start_at, end_at, location, notes, cancelled, created_by")
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
