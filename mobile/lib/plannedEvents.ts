import * as Calendar from "expo-calendar/legacy";
import { supabase } from "@/lib/supabase";
import { RepeatEvery, occurrencesBetween } from "@/lib/recurrence";

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
  repeat_every: RepeatEvery;
  /** Last day it may fall on, as YYYY-MM-DD. Null means it keeps going. */
  repeat_until: string | null;
};

export const EVENT_COLUMNS =
  "id, title, start_at, end_at, location, notes, cancelled, created_by, owner_user_id, push_to, repeat_every, repeat_until";

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
  repeatEvery?: RepeatEvery;
  /** YYYY-MM-DD. */
  repeatUntil?: string | null;
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
    repeat_every: input.repeatEvery ?? "none",
    repeat_until: input.repeatEvery && input.repeatEvery !== "none" ? (input.repeatUntil ?? null) : null,
  });
}

export async function updatePlannedEvent(
  id: string,
  patch: {
    /** Who is making the change, so the push goes to the other one. */
    byUserId?: string;
    title?: string;
    startAt?: Date;
    endAt?: Date;
    location?: string | null;
    notes?: string | null;
    ownerUserId?: string | null;
    pushTo?: string[];
    repeatEvery?: RepeatEvery;
    repeatUntil?: string | null;
  }
) {
  const row: Record<string, unknown> = {};
  // Always stamped, even when nothing else changed: created_by is the person
  // who booked it, and notifying them about their partner's edit -- while the
  // partner hears nothing -- is exactly backwards.
  if (patch.byUserId !== undefined) row.updated_by = patch.byUserId;
  if (patch.title !== undefined) row.title = patch.title;
  if (patch.startAt !== undefined) row.start_at = patch.startAt.toISOString();
  if (patch.endAt !== undefined) row.end_at = patch.endAt.toISOString();
  if (patch.location !== undefined) row.location = patch.location;
  if (patch.notes !== undefined) row.notes = patch.notes;
  if (patch.ownerUserId !== undefined) row.owner_user_id = patch.ownerUserId;
  if (patch.pushTo !== undefined) row.push_to = patch.pushTo;
  if (patch.repeatEvery !== undefined) {
    row.repeat_every = patch.repeatEvery;
    // An end date on something that no longer repeats is a contradiction, and
    // the database constraint rejects it -- so clearing the repeat has to
    // clear the end with it rather than failing the save.
    if (patch.repeatEvery === "none") row.repeat_until = null;
    else if (patch.repeatUntil !== undefined) row.repeat_until = patch.repeatUntil;
  } else if (patch.repeatUntil !== undefined) {
    row.repeat_until = patch.repeatUntil;
  }

  return supabase.from("planned_events").update(row).eq("id", id);
}

export async function deletePlannedEvent(id: string, byUserId?: string) {
  // Cancel rather than delete: each phone removes its own copy on the next
  // sync by reading the flag, and a row that has vanished can't tell anybody
  // to take the event off their calendar.
  return cancelPlannedEvent(id, byUserId);
}

/** Flag the plan cancelled. Both phones drop their own copy on next sync. */
export async function cancelPlannedEvent(id: string, byUserId?: string) {
  return supabase
    .from("planned_events")
    .update({ cancelled: true, ...(byUserId ? { updated_by: byUserId } : {}) })
    .eq("id", id);
}

/**
 * The repeat, in the shape expo-calendar wants.
 *
 * A fortnight is a weekly rule with an interval of two -- there is no
 * fortnightly frequency, and inventing one produces an event that silently
 * does not repeat.
 */
function recurrenceRuleFor(ev: PlannedEvent): Calendar.RecurrenceRule | null {
  // Null, not undefined. An undefined field is "leave this alone" to
  // updateEventAsync, so an event that STOPS repeating would keep its old rule
  // on the phone forever: turn a weekly dinner into a one-off and it still
  // appears every week, which looks exactly like the app ignoring you.
  if (!ev.repeat_every || ev.repeat_every === "none") return null;

  const endDate = ev.repeat_until ? new Date(`${ev.repeat_until}T23:59:59`) : undefined;

  if (ev.repeat_every === "month") {
    return { frequency: Calendar.Frequency.MONTHLY, endDate } as Calendar.RecurrenceRule;
  }

  return {
    frequency: Calendar.Frequency.WEEKLY,
    interval: ev.repeat_every === "fortnight" ? 2 : 1,
    endDate,
  } as Calendar.RecurrenceRule;
}

/**
 * Whether the phone's copy already repeats the way the shared record says.
 *
 * This has to be asked because the rule cannot be CHANGED in place. Both iOS
 * and Android read recurrenceRule only when it is present -- the native side
 * is a plain `if let rule = event.recurrenceRule` -- so null and undefined
 * mean the same thing to it: leave the rule alone. An event that stops
 * repeating would go on repeating on the phone forever, and there is no value
 * that says otherwise. Replacing the event is the only way to clear it.
 *
 * The end date is compared by DAY rather than to the millisecond, because the
 * phone's calendar normalises it and comparing exactly would delete and
 * recreate the same event on every sync.
 */
function sameRule(
  onPhone: Calendar.RecurrenceRule | null | undefined,
  wanted: Calendar.RecurrenceRule | null
): boolean {
  if (!onPhone || !wanted) return !onPhone && !wanted;
  if (onPhone.frequency !== wanted.frequency) return false;
  if ((onPhone.interval ?? 1) !== (wanted.interval ?? 1)) return false;

  const dayOf = (rule: Calendar.RecurrenceRule) => {
    const end = rule.endDate;
    if (!end) return null;
    const at = end instanceof Date ? end : new Date(end);
    return Number.isNaN(at.getTime()) ? null : at.toDateString();
  };

  return dayOf(onPhone) === dayOf(wanted);
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

  // The link rows come first, and they drive removal.
  //
  // Reading only future events and looping over those means a copy on this
  // phone can never be removed once its event falls outside that window --
  // and an event EDITED backwards out of the window is exactly the case where
  // the phone's copy is now wrong. Cancel a past event, or move next Friday's
  // dinner to yesterday, and the stale entry sits in the calendar forever with
  // nothing left that can reach it.
  const { data: links } = await supabase
    .from("planned_event_calendar_links")
    .select("planned_event_id, device_event_id")
    .eq("user_id", userId);

  const linkFor = new Map<string, string>(
    (links ?? []).map((l) => [l.planned_event_id as string, l.device_event_id as string])
  );

  // Anything linked is fetched regardless of when it is, alongside everything
  // upcoming. The union is what makes removal reachable.
  const linkedIds = [...linkFor.keys()];

  // A repeating event is fetched whatever its first occurrence was. Filtering
  // on end_at alone hides a weekly dinner from every phone that didn't happen
  // to be open the week it was created -- the row's end_at is the end of
  // occurrence one, which is in the past by the second week.
  //
  // A series that has already RUN OUT is a different matter: "weekly until
  // March" should not be put back on a phone in December. So repeats are taken
  // only while they are still running.
  const now = new Date();
  const nowIso = now.toISOString();
  const today = now.toISOString().slice(0, 10);

  const [upcomingRes, linkedRes] = await Promise.all([
    supabase
      .from("planned_events")
      .select(EVENT_COLUMNS)
      .or(
        `end_at.gte.${nowIso},and(repeat_every.neq.none,or(repeat_until.is.null,repeat_until.gte.${today}))`
      ),
    linkedIds.length > 0
      ? supabase.from("planned_events").select(EVENT_COLUMNS).in("id", linkedIds)
      : Promise.resolve({ data: [] as PlannedEvent[] }),
  ]);

  if (!upcomingRes.data) return result;

  const byId = new Map<string, PlannedEvent>();
  for (const ev of [
    ...((upcomingRes.data as PlannedEvent[]) ?? []),
    ...((linkedRes.data as PlannedEvent[]) ?? []),
  ]) {
    byId.set(ev.id, ev);
  }

  const events = [...byId.values()];

  // A link whose event has been deleted outright rather than cancelled. The
  // row can't tell us to remove anything any more, so the link is all we have.
  for (const [eventId, deviceEventId] of linkFor) {
    if (byId.has(eventId)) continue;

    try {
      await Calendar.deleteEventAsync(deviceEventId);
    } catch {
      // Already gone from the phone; dropping the link is still right.
    }
    await supabase
      .from("planned_event_calendar_links")
      .delete()
      .eq("planned_event_id", eventId)
      .eq("user_id", userId);
    result.removed += 1;
  }

  let writableCalendarId: string | null = null;

  for (const ev of events) {
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

    const wantedRule = recurrenceRuleFor(ev);
    let linkToReplace: string | null = null;

    if (existing) {
      // Does the copy on the phone repeat the way it should? If not, it has to
      // be replaced rather than updated: the calendar will not let a rule be
      // changed or removed through an update, so an event that stops repeating
      // keeps repeating, which looks exactly like the app ignoring you.
      let ruleMatches = true;
      try {
        const onPhone = await Calendar.getEventAsync(existing);
        ruleMatches = sameRule(onPhone?.recurrenceRule ?? null, wantedRule);
      } catch {
        // Could not read it. Leave it alone rather than churning somebody's
        // calendar over a momentarily unavailable event.
        ruleMatches = true;
      }

      if (!ruleMatches) {
        try {
          await Calendar.deleteEventAsync(existing);
        } catch {
          // Already gone; creating the replacement is still right.
        }
        linkToReplace = ev.id;
      }
    }

    if (existing && !linkToReplace) {
      // Already on this phone with the right rule. Keep its details in step
      // with the shared record, so editing an event's time in the app moves it
      // in the phone's calendar rather than leaving the two disagreeing.
      try {
        await Calendar.updateEventAsync(existing, {
          title: ev.title,
          startDate: new Date(ev.start_at),
          endDate: new Date(ev.end_at),
          location: ev.location ?? undefined,
          notes: ev.notes ?? undefined,
        });
      } catch {
        // An update can fail because the event was deleted by hand -- or
        // because its calendar is momentarily unavailable, read-only, or the
        // native call simply errored. Dropping the link on any of those
        // creates a SECOND copy on the next sync, and the first one is then
        // untracked and can never be removed by the app. So confirm it is
        // actually gone before letting go of it.
        let stillThere = false;
        try {
          stillThere = Boolean(await Calendar.getEventAsync(existing));
        } catch {
          stillThere = false;
        }

        if (!stillThere) {
          await supabase
            .from("planned_event_calendar_links")
            .delete()
            .eq("planned_event_id", ev.id)
            .eq("user_id", userId);
        }
      }
      continue;
    }

    if (linkToReplace) {
      // Drop the old link before writing the replacement, so a failure here
      // leaves nothing pointing at an event that is no longer on the phone.
      await supabase
        .from("planned_event_calendar_links")
        .delete()
        .eq("planned_event_id", linkToReplace)
        .eq("user_id", userId);
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
        // One event carrying the rule, not one per occurrence. The phone's own
        // calendar understands repeats, so handing it the rule keeps a weekly
        // date night as a single thing you can move rather than fifty-two
        // separate entries to clean up.
        //
        // Undefined rather than null when there is no repeat: an explicit null
        // is no clearer to the native side and the type does not want it.
        recurrenceRule: wantedRule ?? undefined,
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

/**
 * What's coming up, soonest first, with repeating events resolved to their
 * next occurrence.
 *
 * A repeating row is fetched whatever its start date -- a weekly dinner set up
 * in January is still on in December -- and then reported at the next time it
 * actually happens, because "Booked in" showing a date from ten months ago is
 * worse than not showing it.
 */
export async function loadUpcomingPlans(): Promise<UpcomingPlan[]> {
  const now = new Date();
  const horizon = new Date(now);
  horizon.setDate(horizon.getDate() + LOOKAHEAD_DAYS);

  const today = now.toISOString().slice(0, 10);

  const { data } = await supabase
    .from("planned_events")
    .select(EVENT_COLUMNS)
    .eq("cancelled", false)
    .or(
      `end_at.gte.${now.toISOString()},and(repeat_every.neq.none,or(repeat_until.is.null,repeat_until.gte.${today}))`
    );

  const rows = (data as PlannedEvent[]) ?? [];
  const out: UpcomingPlan[] = [];

  for (const ev of rows) {
    const [next] = occurrencesBetween(
      {
        start: new Date(ev.start_at),
        end: new Date(ev.end_at),
        repeatEvery: ev.repeat_every ?? "none",
        repeatUntil: ev.repeat_until ? new Date(`${ev.repeat_until}T00:00:00`) : null,
      },
      now,
      horizon
    );

    if (next) out.push({ ...ev, occurrenceStart: next.start, occurrenceEnd: next.end });
  }

  return out.sort((a, b) => a.occurrenceStart.getTime() - b.occurrenceStart.getTime());
}

/** A plan plus the specific occurrence being shown. */
export type UpcomingPlan = PlannedEvent & {
  occurrenceStart: Date;
  occurrenceEnd: Date;
};

/** How far ahead "coming up" looks. A repeat beyond this is not news yet. */
const LOOKAHEAD_DAYS = 60;

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
