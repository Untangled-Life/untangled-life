// The "it's been a while" nudge.
//
// Unlike notify-partner, nothing triggers this: it is a daily sweep, run by a
// scheduled job (see ../README.md). It asks the database which couples have
// drifted and pushes the same message to both people.
//
// Both, and identically. A nudge that goes to one of them casts that person as
// the one who forgot, and the other as the one who has to be booked -- which
// is a claim this app has no business making about anybody's relationship.
//
// Runs with the service role key: couples_due_a_nudge() reads across every
// couple, which no signed-in user may do.

import { createClient } from "jsr:@supabase/supabase-js@2";

const EXPO_PUSH_ENDPOINT = "https://exp.host/--/api/v2/push/send";

// Expo takes up to 100 messages per request.
const BATCH = 100;

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const TITLE = "Keep the fire alive";
const BODY = "It’s been a while since you had a date. 🤍 Keep the fire alive. 🔥";

type DueRow = { couple_id: string; member_ids: string[] };

async function sendAll(messages: Record<string, unknown>[]) {
  const auth = Deno.env.get("EXPO_ACCESS_TOKEN");

  for (let i = 0; i < messages.length; i += BATCH) {
    await fetch(EXPO_PUSH_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(auth ? { Authorization: `Bearer ${auth}` } : {}),
      },
      body: JSON.stringify(messages.slice(i, i + BATCH)),
    });
  }
}

Deno.serve(async (req) => {
  // The scheduler is the only caller, and it holds the service role key. An
  // open endpoint here would let anyone in the world nudge every couple.
  const auth = req.headers.get("Authorization") ?? "";
  if (auth !== `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`) {
    return new Response(JSON.stringify({ error: "unauthorised" }), { status: 401 });
  }

  try {
    const { data: due, error } = await supabase.rpc("couples_due_a_nudge");
    if (error) throw error;

    const rows = (due as DueRow[]) ?? [];
    if (rows.length === 0) {
      return new Response(JSON.stringify({ nudged: 0 }), { status: 200 });
    }

    const userIds = rows.flatMap((r) => r.member_ids ?? []);

    const { data: tokens } = await supabase
      .from("push_tokens")
      .select("user_id, expo_push_token")
      .in("user_id", userIds);

    const tokenFor = new Map<string, string>(
      (tokens ?? []).map((t) => [t.user_id as string, t.expo_push_token as string])
    );

    const messages: Record<string, unknown>[] = [];
    // A couple is stamped whether or not either phone had a token. Otherwise
    // a couple with notifications switched off is "due" every single day, and
    // the moment one of them ever registers a token they get a nudge about a
    // fortnight that ended months ago.
    const stamped: string[] = [];

    for (const row of rows) {
      stamped.push(row.couple_id);

      for (const userId of row.member_ids ?? []) {
        const token = tokenFor.get(userId);
        if (!token) continue;

        messages.push({
          to: token,
          sound: "default",
          title: TITLE,
          body: BODY,
          data: { kind: "date-nudge" },
        });
      }
    }

    if (messages.length > 0) await sendAll(messages);

    // Stamped AFTER the send, so a push failure leaves the couple due
    // tomorrow rather than silently skipping a fortnight.
    for (const coupleId of stamped) {
      await supabase.rpc("mark_couple_nudged", { target: coupleId });
    }

    return new Response(
      JSON.stringify({ nudged: stamped.length, pushed: messages.length }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("nudge-date failed", error);
    return new Response(JSON.stringify({ error: String(error) }), { status: 500 });
  }
});
