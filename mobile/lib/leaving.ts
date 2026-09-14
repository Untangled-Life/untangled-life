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

export async function leaveCouple(
  userId: string,
  coupleId: string | null
): Promise<{ error: string | null }> {
  await clearDeviceEvents(userId);

  // Unpairing keeps your account, so it keeps your profile picture. Only the
  // couple's cover goes, and only if nobody is left to look at it.
  if (coupleId) {
    const { data: members } = await supabase
      .from("profiles")
      .select("id")
      .eq("couple_id", coupleId);

    if ((members ?? []).length <= 1) {
      const { data: couple } = await supabase
        .from("couples")
        .select("cover_path")
        .eq("id", coupleId)
        .maybeSingle();

      const coverPath = (couple?.cover_path as string | null) ?? null;
      if (coverPath) await supabase.storage.from("photos").remove([coverPath]);
    }
  }

  const { error } = await supabase.rpc("leave_couple");
  return { error: error?.message ?? null };
}

/**
 * Delete the photo FILES, not just their rows.
 *
 * Deleting from storage.objects in SQL removes the metadata and orphans the
 * actual file in the object store -- only the Storage API removes the file. So
 * an account deletion that relied on the SQL alone would report success while
 * the user's photo of themselves stayed on a server, which is the retained
 * personal data the whole thing exists to prevent.
 *
 * It has to run BEFORE the RPC: afterwards there is no session, and after
 * leave_couple there is no couple, so the storage policy denies the covers
 * path. Membership is read fresh here rather than from a hook -- an earlier
 * version took it from one that hadn't resolved on a cold start and deleted
 * the couple's shared cover out from under the partner who was still there.
 */
async function clearPhotoFiles(userId: string, coupleId: string | null): Promise<void> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("avatar_path")
    .eq("id", userId)
    .maybeSingle();

  const avatarPath = (profile?.avatar_path as string | null) ?? null;
  if (avatarPath) await supabase.storage.from("photos").remove([avatarPath]);

  if (!coupleId) return;

  const { data: members } = await supabase
    .from("profiles")
    .select("id")
    .eq("couple_id", coupleId);

  // The cover belongs to the couple, so it only goes when the couple does.
  const lastOneOut = (members ?? []).length <= 1;
  if (!lastOneOut) return;

  const { data: couple } = await supabase
    .from("couples")
    .select("cover_path")
    .eq("id", coupleId)
    .maybeSingle();

  const coverPath = (couple?.cover_path as string | null) ?? null;
  if (coverPath) await supabase.storage.from("photos").remove([coverPath]);
}

export async function deleteOwnAccount(
  userId: string,
  coupleId: string | null
): Promise<{ error: string | null }> {
  await clearDeviceEvents(userId);
  await clearPhotoFiles(userId, coupleId);

  const { error } = await supabase.rpc("delete_own_account");
  if (error) return { error: error.message };

  // The account is gone, but this device still holds its session. Signing out
  // clears it; without this the app sits on a token for a user that no longer
  // exists and every request fails in a way that looks like a bug.
  await supabase.auth.signOut();
  return { error: null };
}
