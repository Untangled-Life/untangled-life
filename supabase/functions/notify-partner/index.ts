// Sends a push to the OTHER partner when one of them books a date or adds a
// key date. Triggered by two database webhooks (see ../README.md), one on
// planned_events INSERT and one on key_dates INSERT.
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

// Times are rendered in Australia/Sydney for now. If this ever ships beyond
// AU, store each user's timezone on their profile and read it here instead.
function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Australia/Sydney",
  });
}

function formatDate(dateOnly: string): string {
  const d = new Date(`${dateOnly}T12:00:00Z`);
  return d.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "long",
    timeZone: "Australia/Sydney",
  });
}

function buildMessage(
  table: string,
  record: Record<string, string | boolean | null>,
  actorName: string
): { title: string; body: string; data: Record<string, unknown> } | null {
  if (table === "planned_events") {
    if (record.cancelled === true) return null;
    return {
      title: "You've got a date",
      body: `${actorName} booked "${record.title}" for ${formatDateTime(String(record.start_at))}. It's in your calendar.`,
      data: { type: "planned_event", id: record.id },
    };
  }

  if (table === "key_dates") {
    return {
      title: "New key date",
      body: `${actorName} added "${record.title}" for ${formatDate(String(record.date))}. It's counting down on your home screen too, and you'll get the usual nudges.`,
      data: { type: "key_date", id: record.id },
    };
  }

  return null;
}

Deno.serve(async (req: Request) => {
  try {
    const payload: WebhookPayload = await req.json();

    if (payload.type !== "INSERT") {
      return new Response(JSON.stringify({ skipped: "not an insert" }), { status: 200 });
    }

    const coupleId = payload.record.couple_id;
    const actorId = payload.record.created_by;

    if (!coupleId || !actorId) {
      return new Response(JSON.stringify({ skipped: "no couple or actor" }), { status: 200 });
    }

    // Both members of the couple; the partner is whichever one isn't the actor.
    const { data: members } = await supabase
      .from("profiles")
      .select("id, display_name")
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
      payload.record,
      actor?.display_name ?? "Your partner"
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
