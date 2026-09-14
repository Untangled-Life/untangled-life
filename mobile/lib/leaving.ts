import { supabase } from "@/lib/supabase";
import { removePhoto } from "@/lib/photos";

/**
 * Unpairing and account deletion.
 *
 * The database side (supabase/leaving.sql) hands shared things to the
 * remaining partner before removing you, so a couple's history isn't destroyed
 * by whichever of them happened to type it in.
 *
 * What it can't do is reach into storage: files in the photos bucket aren't
 * foreign keys and nothing cascades them. So the photos are removed from here,
 * first -- an orphaned file in a private bucket is unreachable but it is still
 * a photo of two people that nobody asked us to keep.
 */
async function removePhotos(opts: {
  avatarPath: string | null;
  coverPath: string | null;
  lastOneOut: boolean;
}): Promise<void> {
  await removePhoto(opts.avatarPath);
  // The cover belongs to the couple, so it only goes when the couple does.
  if (opts.lastOneOut) await removePhoto(opts.coverPath);
}

export async function leaveCouple(opts: {
  avatarPath: string | null;
  coverPath: string | null;
  lastOneOut: boolean;
}): Promise<{ error: string | null }> {
  await removePhotos(opts);

  const { error } = await supabase.rpc("leave_couple");
  return { error: error?.message ?? null };
}

export async function deleteOwnAccount(opts: {
  avatarPath: string | null;
  coverPath: string | null;
  lastOneOut: boolean;
}): Promise<{ error: string | null }> {
  await removePhotos(opts);

  const { error } = await supabase.rpc("delete_own_account");
  if (error) return { error: error.message };

  // The account is gone, but this device still holds its session. Signing out
  // clears it; without this the app sits on a token for a user that no longer
  // exists and every request fails in a way that looks like a bug.
  await supabase.auth.signOut();
  return { error: null };
}
