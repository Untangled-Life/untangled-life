import { supabase } from "@/lib/supabase";
import type { ValuedAnswers } from "@/lib/valued";
import type { Verdict } from "@/lib/dateHistory";

/**
 * The reads the planner needs, kept out of lib/ideaRanking.ts, which is pure
 * and tested. The rule for this codebase is that logic files do not import
 * the client.
 */

/**
 * What your partner said, if they have shared it.
 *
 * The policy does the gating: an unshared answer never comes back at all.
 * Scoped to the couple and limited rather than maybeSingle(), because a
 * couple row is reused across a pairing and an old answer can sit beside a
 * new one for a moment.
 */
export async function loadPartnerValued(
  coupleId: string | null,
  myId: string | null
): Promise<ValuedAnswers | null> {
  if (!coupleId) return null;

  const { data } = await supabase
    .from("valued_answers")
    .select("user_id, couple_id, ranking, feels_valued, little_things, hard_week, shared, updated_at")
    .eq("couple_id", coupleId)
    .neq("user_id", myId ?? "")
    .order("updated_at", { ascending: false })
    .limit(1);

  return (data?.[0] as ValuedAnswers | undefined) ?? null;
}

/** Every review either of you has left, with the title it was about. */
export async function loadVerdictRows(): Promise<{ title: string | null; verdict: Verdict }[]> {
  const { data } = await supabase
    .from("date_reviews")
    .select("verdict, planned_events(title)");

  type Row = { verdict: Verdict; planned_events: { title: string } | { title: string }[] | null };
  return ((data as Row[] | null) ?? []).map((row) => {
    const joined = Array.isArray(row.planned_events) ? row.planned_events[0] : row.planned_events;
    return { title: joined?.title ?? null, verdict: row.verdict };
  });
}

/** The ids the couple has saved, newest first. */
export async function loadSavedIdeas(): Promise<string[]> {
  const { data } = await supabase
    .from("date_idea_saves")
    .select("idea_id")
    .order("created_at", { ascending: false });
  return ((data as { idea_id: string }[] | null) ?? []).map((r) => r.idea_id);
}

export async function saveIdea(coupleId: string, userId: string, ideaId: string) {
  return supabase
    .from("date_idea_saves")
    .upsert({ couple_id: coupleId, idea_id: ideaId, saved_by: userId }, { onConflict: "couple_id,idea_id" });
}

export async function unsaveIdea(coupleId: string, ideaId: string) {
  return supabase.from("date_idea_saves").delete().eq("couple_id", coupleId).eq("idea_id", ideaId);
}
