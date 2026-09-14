import { supabase } from "@/lib/supabase";

/**
 * Unpairing and account deletion.
 *
 * Both are a single RPC. The photos used to be deleted from here first, which
 * was wrong twice over: if the RPC then failed the pictures were already gone
 * with no way back, and "am I the last one out" was read from a hook that
 * hasn't resolved on a cold start -- so tapping quickly could delete the
 * couple's shared cover photo out from under the partner who was still there.
 *
 * The ordering can't simply be reversed either: after leave_couple() runs, the
 * caller's my_couple_id() is null and the storage policy denies the covers
 * path, and after delete_own_account() there is no session at all. So the
 * photos are dealt with inside the database functions, where the rules are the
 * same rules and the whole thing is one transaction.
 *
 * See supabase/leaving.sql.
 */
export async function leaveCouple(): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc("leave_couple");
  return { error: error?.message ?? null };
}

export async function deleteOwnAccount(): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc("delete_own_account");
  if (error) return { error: error.message };

  // The account is gone, but this device still holds its session. Signing out
  // clears it; without this the app sits on a token for a user that no longer
  // exists and every request fails in a way that looks like a bug.
  await supabase.auth.signOut();
  return { error: null };
}
