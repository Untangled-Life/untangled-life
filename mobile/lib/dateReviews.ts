import { supabase } from "@/lib/supabase";
import { AwaitingReview, LovedDate, Verdict } from "@/lib/dateHistory";

/**
 * Reading and writing the reviews.
 *
 * Split from lib/dateHistory.ts, which is pure, because a module that
 * imports supabase drags AsyncStorage into every test that touches it. The
 * rule for this codebase is that logic files do not import the client.
 */

/**
 * The most recent date nobody has asked you about.
 *
 * One at a time on purpose. A queue of five "how was it?" cards after a busy
 * fortnight is a chore, and the honest answer to the fifth is whatever gets
 * rid of it fastest.
 */
export async function nextAwaitingReview(): Promise<AwaitingReview | null> {
  const { data } = await supabase.rpc("dates_awaiting_review");
  const rows = (data as AwaitingReview[]) ?? [];
  return rows[0] ?? null;
}

export async function saveReview(input: {
  plannedEventId: string;
  userId: string;
  coupleId: string;
  verdict: Verdict;
  note?: string | null;
}) {
  return supabase.from("date_reviews").upsert(
    {
      planned_event_id: input.plannedEventId,
      user_id: input.userId,
      couple_id: input.coupleId,
      verdict: input.verdict,
      note: input.note ?? null,
    },
    { onConflict: "planned_event_id,user_id" }
  );
}

/** The ones you BOTH loved. One of you loving it is a much weaker signal. */
export async function lovedTogether(): Promise<LovedDate[]> {
  const { data } = await supabase.rpc("dates_you_both_loved");
  return (data as LovedDate[]) ?? [];
}
