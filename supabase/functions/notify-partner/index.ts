// Sends a push to the OTHER partner when one of them books a date, adds a key
// date, or CHANGES a date they'd already booked. Triggered by three database
// webhooks (see ../README.md): planned_events INSERT, planned_events UPDATE,
// and key_dates INSERT.
//
// Runs with the service role key so it can read the partner's push token --
// push_tokens' RLS deliberately doesn't let partners read each other's rows.

import { createClient } from "jsr:@supabase/supabase-js@2";

type WebhookPayload = {
  type: "INSERT" | "UPDATE" | "DELETE";
  table: string;
  schema: string;
  record: Record<string, string | boolean | null>;
  old_record: Record<string, string | boolean | null> | null;
};

const EXPO_PUSH_ENDPOINT = "https://exp.host/--/api/v2/push/send";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

// Times are rendered in the RECIPIENT'S zone, which is the only one that makes
// sense: the notification lands on their phone and tells them when to be
// somewhere. It used to be hard-coded to Australia/Sydney, so a partner
// anywhere else was told the wrong hour with complete confidence.
//
// Sydney remains the fallback for somebody whose phone has not reported a zone
// yet -- a wrong guess for a minority beats no time at all for everyone.
const FALLBACK_ZONE = "Australia/Sydney";

function formatDateTime(iso: string, timeZone: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  });
}

// A key date is a DAY, not an instant, so it is read at midday to keep it on
// the right side of midnight in every zone. Formatting "2026-11-03" at
// 00:00 UTC gives the 2nd of November to anyone west of Greenwich.
function formatDate(dateOnly: string, timeZone: string): string {
  const d = new Date(`${dateOnly}T12:00:00Z`);
  return d.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "long",
    timeZone,
  });
}

type Row = Record<string, string | boolean | null>;

/**
 * What actually changed, in the order worth mentioning.
 *
 * An update fires on every write, including ones nobody needs to hear about --
 * a push toggle, an owner, a note. Saying "Roy changed Dinner" when Roy ticked
 * a checkbox trains people to ignore the notifications.
 *
 * One constraint worth knowing before extending this. Unpairing rewrites
 * created_by, owner_user_id, push_to and updated_by on every event the leaver
 * touched, which fires this webhook four times per event. All four are silent
 * today because none of those columns is checked below. Add an owner_user_id
 * case ("Roy made this yours") and unpairing immediately starts emitting it
 * for every one of the leaver's events, attributed to nobody, at the worst
 * possible moment.
 */
function describeChange(
  record: Row,
  old: Row | null,
  actorName: string,
  timeZone: string
): string | null {
  const title = String(record.title);

  if (record.cancelled === true && old?.cancelled !== true) {
    return `${actorName} cancelled "${title}". It's off your calendar.`;
  }

  // A cancelled event that changes again is still cancelled; nothing to say.
  if (record.cancelled === true) return null;

  const movedStart = old && String(record.start_at) !== String(old.start_at);
  const movedEnd = old && String(record.end_at) !== String(old.end_at);
  const renamed = old && String(record.title) !== String(old.title);

  if (movedStart) {
    return `${actorName} moved "${title}" to ${formatDateTime(String(record.start_at), timeZone)}. Your calendar's been updated.`;
  }

  if (renamed) {
    return `${actorName} renamed "${String(old.title)}" to "${title}".`;
  }

  if (movedEnd) {
    return `${actorName} changed how long "${title}" runs for.`;
  }

  const movedLocation = old && String(record.location ?? "") !== String(old.location ?? "");
  if (movedLocation && record.location) {
    return `${actorName} set "${title}" to be at ${String(record.location)}.`;
  }

  return null;
}

function buildMessage(
  table: string,
  type: "INSERT" | "UPDATE",
  record: Row,
  oldRecord: Row | null,
  actorName: string,
  timeZone: string
): { title: string; body: string; data: Record<string, unknown> } | null {
  if (table === "planned_events") {
    if (type === "UPDATE") {
      const body = describeChange(record, oldRecord, actorName, timeZone);
      if (!body) return null;

      return {
        title: record.cancelled === true ? "Date cancelled" : "Date changed",
        // The data payload matters as much as the words: the app syncs on
        // receiving this, so the change lands in the calendar without anyone
        // having to open anything.
        body,
        data: { type: "planned_event", id: record.id, action: "changed" },
      };
    }

    if (record.cancelled === true) return null;
    return {
      title: "You've got a date",
      body: `${actorName} booked "${record.title}" for ${formatDateTime(String(record.start_at), timeZone)}. It's in your calendar.`,
      data: { type: "planned_event", id: record.id, action: "created" },
    };
  }

  if (table === "key_dates") {
    return {
      title: "New key date",
      body: `${actorName} added "${record.title}" for ${formatDate(String(record.date), timeZone)}. It's counting down on your home screen too, and you'll get the usual nudges.`,
      data: { type: "key_date", id: record.id },
    };
  }

  return null;
}

Deno.serve(async (req: Request) => {
  try {
    const payload: WebhookPayload = await req.json();

    if (payload.type !== "INSERT" && payload.type !== "UPDATE") {
      return new Response(JSON.stringify({ skipped: "not an insert or update" }), { status: 200 });
    }

    const coupleId = payload.record.couple_id;

    // On an update the actor is whoever made the change, not whoever created
    // the event. Getting this wrong sends someone their own edit and tells
    // their partner nothing.
    const actorId =
      payload.type === "UPDATE"
        ? (payload.record.updated_by ?? payload.record.created_by)
        : payload.record.created_by;

    if (!coupleId || !actorId) {
      return new Response(JSON.stringify({ skipped: "no couple or actor" }), { status: 200 });
    }

    // Both members of the couple; the partner is whichever one isn't the actor.
    const { data: members } = await supabase
      .from("profiles")
      .select("id, display_name, time_zone")
      .eq("couple_id", coupleId);

    const actor = members?.find((m) => m.id === actorId);
    const partner = members?.find((m) => m.id !== actorId);

    if (!partner) {
      return new Response(JSON.stringify({ skipped: "no partner paired yet" }), { status: 200 });
    }

    const { data: tokenRow } = await supabase
      .from("push_tokens")
      .select("expo_push_token")
      .eq("user_id", partner.id)
      .maybeSingle();

    if (!tokenRow?.expo_push_token) {
      return new Response(JSON.stringify({ skipped: "partner has no push token" }), { status: 200 });
    }

    const message = buildMessage(
      payload.table,
      payload.type,
      payload.record,
      payload.old_record,
      actor?.display_name ?? "Your partner",
      partner.time_zone ?? FALLBACK_ZONE
    );

    if (!message) {
      return new Response(JSON.stringify({ skipped: "nothing to say" }), { status: 200 });
    }

    const expoResponse = await fetch(EXPO_PUSH_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        // Only needed if "Enhanced Security for Push Notifications" is switched
        // on in the Expo account; harmless otherwise.
        ...(Deno.env.get("EXPO_ACCESS_TOKEN")
          ? { Authorization: `Bearer ${Deno.env.get("EXPO_ACCESS_TOKEN")}` }
          : {}),
      },
      body: JSON.stringify({
        to: tokenRow.expo_push_token,
        sound: "default",
        title: message.title,
        body: message.body,
        data: message.data,
      }),
    });

    const result = await expoResponse.json();
    return new Response(JSON.stringify({ sent: true, result }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("notify-partner failed", error);
    return new Response(JSON.stringify({ error: String(error) }), { status: 500 });
  }
});
