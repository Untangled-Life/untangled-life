import * as Calendar from "expo-calendar/legacy";
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
/**
 * Take the couple's events off THIS phone's calendar before leaving.
 *
 * It has to happen first and it has to happen here. purge_personal_data
 * deletes this user's link rows, and leave_couple then clears their couple_id
 * -- after which planned_events is unreadable to them and the only record of
 * which calendar entries the app created is gone. Every shared dinner and
 * every one of their ex-partner's appointments would sit in their phone
 * calendar permanently, with nothing in the app able to remove them. And a
 * phone can only write to its own calendar, so the database cannot do this.
 */
async function clearDeviceEvents(userId: string): Promise<void> {
  const permission = await Calendar.getCalendarPermissionsAsync();
  if (permission.status !== "granted") return;

  const { data } = await supabase
    .from("planned_event_calendar_links")
    .select("device_event_id")
    .eq("user_id", userId);

  for (const link of data ?? []) {
    try {
      await Calendar.deleteEventAsync(link.device_event_id as string);
    } catch {
      // Already gone by hand, or its calendar was removed. Nothing to do.
    }
  }
}

export async function leaveCouple(userId: string): Promise<{ error: string | null }> {
  await clearDeviceEvents(userId);

  const { error } = await supabase.rpc("leave_couple");
  return { error: error?.message ?? null };
}

export async function deleteOwnAccount(userId: string): Promise<{ error: string | null }> {
  await clearDeviceEvents(userId);

  const { error } = await supabase.rpc("delete_own_account");
  if (error) return { error: error.message };

  // The account is gone, but this device still holds its session. Signing out
  // clears it; without this the app sits on a token for a user that no longer
  // exists and every request fails in a way that looks like a bug.
  await supabase.auth.signOut();
  return { error: null };
}
