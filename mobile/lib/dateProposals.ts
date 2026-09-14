import { supabase } from "@/lib/supabase";
import { Interval } from "@/lib/freeTime";
import { MAX_OPTIONS } from "@/lib/dateIdeas";

/**
 * Proposing a date rather than booking one.
 *
 * Booking stays unilateral and always will: sometimes you have the babysitter
 * and you just want it in the diary. But the commonest failure in a couple's
 * calendar is not disagreement, it is nobody going first. A proposal is going
 * first without committing the other person to a time they have not seen.
 */
export type ProposalOption = { start_at: string; end_at: string };

export type DateProposal = {
  id: string;
  couple_id: string;
  proposed_by: string;
  title: string;
  note: string | null;
  options: ProposalOption[];
  chosen_index: number | null;
  planned_event_id: string | null;
  status: "open" | "accepted" | "declined" | "withdrawn";
  created_at: string;
  answered_at: string | null;
};

export const PROPOSAL_COLUMNS =
  "id, couple_id, proposed_by, title, note, options, chosen_index, planned_event_id, status, created_at, answered_at";

export async function createProposal(input: {
  coupleId: string;
  userId: string;
  title: string;
  note?: string | null;
  options: Interval[];
}) {
  return supabase.from("date_proposals").insert({
    couple_id: input.coupleId,
    proposed_by: input.userId,
    title: input.title,
    note: input.note ?? null,
    options: input.options.slice(0, MAX_OPTIONS).map((o) => ({
      start_at: o.start.toISOString(),
      end_at: o.end.toISOString(),
    })),
  });
}

/**
 * Answer one.
 *
 * A single RPC rather than three calls, because creating the event, marking
 * the proposal accepted and linking the two have to happen together or not at
 * all. Done from here a dropped connection could leave a proposal saying
 * "accepted" and pointing at nothing.
 */
export async function answerProposal(
  proposalId: string,
  decision: "accepted" | "declined",
  optionIndex = 0
) {
  return supabase.rpc("answer_date_proposal", {
    proposal: proposalId,
    option_index: optionIndex,
    decision,
  });
}

export async function withdrawProposal(id: string) {
  return supabase
    .from("date_proposals")
    .update({ status: "withdrawn", answered_at: new Date().toISOString() })
    .eq("id", id);
}

/** Every proposal still waiting on somebody. */
export async function loadOpenProposals(): Promise<DateProposal[]> {
  const { data } = await supabase
    .from("date_proposals")
    .select(PROPOSAL_COLUMNS)
    .eq("status", "open")
    .order("created_at", { ascending: false });

  return (data as DateProposal[]) ?? [];
}

/**
 * Split by who has to do something about it.
 *
 * Two quite different things wearing the same shape: one is a question you
 * have been asked, the other is a question you are waiting on. Showing them
 * together as "proposals" makes the person hunt for which is which.
 */
export function splitProposals(proposals: DateProposal[], userId: string) {
  return {
    forYou: proposals.filter((p) => p.proposed_by !== userId),
    fromYou: proposals.filter((p) => p.proposed_by === userId),
  };
}
