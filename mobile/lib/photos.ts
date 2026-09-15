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

/**
 * What a photo is of, which decides the folder it lives in, the shape the
 * picker crops to, and who is allowed to read it.
 *
 * Everything except an avatar belongs to the couple, so everything except an
 * avatar is stored under the couple's id -- which is what the storage
 * policies check. A screenshot of a booking confirmation is not cropped at
 * all: the whole point of it is the small print.
 */
export type PhotoKind = "avatar" | "cover" | "wishlist" | "trip" | "date" | "document";

const FOLDERS: Record<PhotoKind, string> = {
  avatar: "avatars",
  cover: "covers",
  wishlist: "wishlists",
  trip: "trips",
  date: "dates",
  // A boarding pass and a hotel confirmation are the same folder as the trip
  // they belong to; only the handling differs.
  document: "trips",
};

const ASPECTS: Partial<Record<PhotoKind, [number, number]>> = {
  avatar: [1, 1],
  cover: [16, 9],
  wishlist: [3, 2],
  trip: [16, 9],
  // A face, usually.
  date: [4, 5],
};

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
  kind: PhotoKind
): Promise<{ photo: PickedPhoto | null; error: string | null }> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    return {
      photo: null,
      error:
        "Your phone hasn't given the app access to your photos. You can change that in Settings.",
    };
  }

  const aspect = ASPECTS[kind];

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    // A screenshot cropped to a nice shape is a screenshot with the booking
    // reference cut off it.
    allowsEditing: Boolean(aspect),
    aspect,
    quality: 1,
  });

  if (result.canceled || result.assets.length === 0) return { photo: null, error: null };

  const asset = result.assets[0];

  try {
    const context = ImageManipulator.manipulate(asset.uri);

    if (kind === "avatar") {
      context.resize({ width: AVATAR_SIZE, height: AVATAR_SIZE });
    } else if (asset.width > COVER_WIDTH) {
      context.resize({ width: COVER_WIDTH });
    }
    // Otherwise left alone. A phone screenshot is about 1170 wide, and
    // scaling it UP to 1400 before a lossy re-encode makes the upload bigger
    // and the booking reference on it softer -- which is the one thing a
    // screenshot is kept for.
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
  kind: PhotoKind,
  /** The user id for an avatar; the couple id for everything else. */
  ownerId: string,
  photo: PickedPhoto
): Promise<{ path: string | null; error: string | null }> {
  const folder = FOLDERS[kind];

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

/** The same for several at once, which is what deleting a trip needs. */
export async function removePhotos(paths: (string | null)[]): Promise<void> {
  const real = [...new Set(paths.filter((p): p is string => Boolean(p)))];
  if (real.length === 0) return;
  await supabase.storage.from(BUCKET).remove(real);
}

/**
 * Move the cover you had on your own to the couple you have just joined.
 *
 * Its path has the old couple's id in it, and both storage policies check
 * that segment against your couple -- so the moment you join somebody else's
 * couple, your own cover photo becomes a file nobody can read and nobody can
 * delete, including you. Deleting the row in SQL is not enough either: that
 * orphans the actual file in the object store rather than removing it.
 *
 * So the bytes are fetched first, while the old path is still readable, and
 * re-uploaded afterwards under the new couple -- but only if the couple being
 * joined has not got a cover of its own, because theirs is the one that wins.
 *
 * Returns nothing and throws nothing. A cover photo is worth carrying across
 * and not worth failing a pairing over.
 */
export async function carryCoverInto(
  oldCoupleId: string | null,
  read: () => Promise<{ coverPath: string | null }>,
  join: () => Promise<{ error: string | null }>,
  newCoupleId: () => string | null,
  setCover: (path: string) => Promise<void>
): Promise<{ error: string | null }> {
  let carried: ArrayBuffer | null = null;
  let oldPath: string | null = null;

  if (oldCoupleId) {
    try {
      const { coverPath } = await read();
      oldPath = coverPath;

      if (coverPath) {
        const { data } = await supabase.storage.from(BUCKET).download(coverPath);
        if (data) carried = await data.arrayBuffer();
      }
    } catch {
      // No cover, or it could not be read. Either way, carry on and pair.
    }
  }

  const { error } = await join();
  if (error) return { error };

  // Only now. Removing it first meant a code that turned out to be invalid,
  // already used, or simply offline took the person's cover photo with it
  // while the row still pointed at the file.
  //
  // Through the Storage API rather than left to the SQL, which only takes
  // the metadata row and leaves the file itself on the server forever.
  if (oldPath) {
    try {
      await supabase.storage.from(BUCKET).remove([oldPath]);
    } catch {
      // Nothing to do about it, and not a reason to stop.
    }
  }

  const joined = newCoupleId();
  if (!carried || !joined) return { error: null };

  try {
    const { data: couple } = await supabase
      .from("couples")
      .select("cover_path")
      .eq("id", joined)
      .maybeSingle();

    if (couple?.cover_path) return { error: null };

    const path = `covers/${joined}/${Date.now()}.jpg`;
    const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, carried, {
      contentType: "image/jpeg",
      upsert: false,
    });

    if (!uploadError) await setCover(path);
  } catch {
    // The pairing worked, which is the part that matters.
  }

  return { error: null };
}
