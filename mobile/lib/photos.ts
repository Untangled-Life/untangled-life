import * as ImagePicker from "expo-image-picker";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { supabase } from "@/lib/supabase";

const BUCKET = "photos";

// Signed URLs are what keep the bucket private. An hour is long enough that
// nobody re-signs mid-session and short enough that a leaked link is useless
// by the time it's shared.
const SIGNED_URL_TTL_SECONDS = 60 * 60;

/**
 * Sizes chosen for where the images actually appear, not for fidelity. A
 * 4000px phone photo uploaded untouched costs the user several megabytes of
 * mobile data to send and again to display, for a picture rendered 100px wide.
 */
const AVATAR_SIZE = 512;
const COVER_WIDTH = 1400;

export type PickedPhoto = { uri: string; width: number; height: number };

/**
 * Opens the phone's photo picker and returns a resized, re-encoded JPEG.
 *
 * Re-encoding is not only about size: it drops the EXIF block, which on most
 * phone photos carries the GPS coordinates of where it was taken. Uploading a
 * cover photo should not quietly hand over the location of the house it was
 * taken in.
 */
export async function pickPhoto(
  kind: "avatar" | "cover"
): Promise<{ photo: PickedPhoto | null; error: string | null }> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    return {
      photo: null,
      error:
        "Your phone hasn't given the app access to your photos. You can change that in Settings.",
    };
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsEditing: true,
    aspect: kind === "avatar" ? [1, 1] : [16, 9],
    quality: 1,
  });

  if (result.canceled || result.assets.length === 0) return { photo: null, error: null };

  const asset = result.assets[0];

  try {
    const context = ImageManipulator.manipulate(asset.uri);
    context.resize(
      kind === "avatar" ? { width: AVATAR_SIZE, height: AVATAR_SIZE } : { width: COVER_WIDTH }
    );
    const rendered = await context.renderAsync();
    const saved = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.82 });

    return { photo: { uri: saved.uri, width: saved.width, height: saved.height }, error: null };
  } catch (e) {
    return { photo: null, error: e instanceof Error ? e.message : "Couldn't read that photo." };
  }
}

/**
 * Uploads to `avatars/<userId>/…` or `covers/<coupleId>/…` and returns the
 * stored path. The storage policies enforce exactly this shape, so a path
 * built any other way is rejected server-side rather than quietly landing
 * somewhere the partner can't read.
 */
export async function uploadPhoto(
  kind: "avatar" | "cover",
  ownerId: string,
  photo: PickedPhoto
): Promise<{ path: string | null; error: string | null }> {
  const folder = kind === "avatar" ? "avatars" : "covers";

  // A new filename every time, rather than overwriting a fixed one. Storage
  // and every image cache in between key on the URL, so reusing the name shows
  // the old picture until something evicts it -- which reads as "the upload
  // didn't work".
  const path = `${folder}/${ownerId}/${Date.now()}.jpg`;

  let body: ArrayBuffer;
  try {
    const response = await fetch(photo.uri);
    body = await response.arrayBuffer();
  } catch {
    return { path: null, error: "Couldn't read the photo off your phone." };
  }

  const { error } = await supabase.storage.from(BUCKET).upload(path, body, {
    contentType: "image/jpeg",
    upsert: false,
  });

  if (error) return { path: null, error: error.message };
  return { path, error: null };
}

/** A temporary URL for a stored path. Null for a missing or unreadable file. */
export async function signedUrl(path: string | null): Promise<string | null> {
  if (!path) return null;
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  return data?.signedUrl ?? null;
}

/** Signs several paths at once, keyed by path, skipping nulls and duplicates. */
export async function signedUrls(paths: (string | null)[]): Promise<Record<string, string>> {
  const unique = [...new Set(paths.filter((p): p is string => Boolean(p)))];
  if (unique.length === 0) return {};

  const { data } = await supabase.storage.from(BUCKET).createSignedUrls(unique, SIGNED_URL_TTL_SECONDS);

  const out: Record<string, string> = {};
  for (const row of data ?? []) {
    if (row.path && row.signedUrl) out[row.path] = row.signedUrl;
  }
  return out;
}

/** Best-effort tidy-up of a replaced photo. Failure here isn't worth an alert. */
export async function removePhoto(path: string | null): Promise<void> {
  if (!path) return;
  await supabase.storage.from(BUCKET).remove([path]);
}
