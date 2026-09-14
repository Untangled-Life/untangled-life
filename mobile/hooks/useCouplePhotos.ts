import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/auth";
import { useCoupleMembers } from "@/hooks/useCoupleMembers";
import { signedUrls } from "@/lib/photos";

type Photos = {
  coverUrl: string | null;
  coverPath: string | null;
  myAvatarUrl: string | null;
  partnerAvatarUrl: string | null;
  /** Look up either partner's avatar by user id -- for the shared calendar. */
  avatarUrlFor: (userId: string | null) => string | null;
  reload: () => Promise<void>;
};

/**
 * The couple's cover photo and both profile pictures, as URLs ready to render.
 *
 * The bucket is private, so what's stored is a path and what a component needs
 * is a signed URL. Signing happens here, once, in a single batched call --
 * doing it per <Image> would mean a network round trip for every row of the
 * calendar.
 */
export function useCouplePhotos(): Photos {
  const { profile } = useAuth();
  const { me, partner } = useCoupleMembers();

  const [coverPath, setCoverPath] = useState<string | null>(null);
  const [urls, setUrls] = useState<Record<string, string>>({});

  const coupleId = profile?.couple_id ?? null;
  const myAvatarPath = profile?.avatar_path ?? null;
  const partnerAvatarPath = partner?.avatar_path ?? null;

  const reload = useCallback(async () => {
    // Your own avatar has nothing to do with being in a couple -- the storage
    // policy allows it on `p.id = auth.uid()` alone. Returning early here left
    // a newly signed-up or just-unpaired user looking at "No photo yet" over a
    // profile that had one, and left the ex-partner's signed URLs sitting in
    // state, still rendering.
    if (!coupleId) {
      setCoverPath(null);
      setUrls(await signedUrls([myAvatarPath]));
      return;
    }

    const { data } = await supabase
      .from("couples")
      .select("cover_path")
      .eq("id", coupleId)
      .maybeSingle();

    const cover = (data?.cover_path as string | null) ?? null;
    setCoverPath(cover);
    setUrls(await signedUrls([cover, myAvatarPath, partnerAvatarPath]));
  }, [coupleId, myAvatarPath, partnerAvatarPath]);

  useEffect(() => {
    reload();
  }, [reload]);

  const avatarUrlFor = useCallback(
    (userId: string | null) => {
      if (!userId) return null;
      if (userId === me.id) return myAvatarPath ? (urls[myAvatarPath] ?? null) : null;
      if (partner && userId === partner.id) {
        return partnerAvatarPath ? (urls[partnerAvatarPath] ?? null) : null;
      }
      return null;
    },
    [me.id, partner, myAvatarPath, partnerAvatarPath, urls]
  );

  return {
    coverPath,
    coverUrl: coverPath ? (urls[coverPath] ?? null) : null,
    myAvatarUrl: myAvatarPath ? (urls[myAvatarPath] ?? null) : null,
    partnerAvatarUrl: partnerAvatarPath ? (urls[partnerAvatarPath] ?? null) : null,
    avatarUrlFor,
    reload,
  };
}
