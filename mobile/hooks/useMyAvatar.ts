import { useCallback, useState } from "react";
import { Alert } from "react-native";
import { useAuth } from "@/contexts/auth";
import { useCouplePhotos } from "@/hooks/useCouplePhotos";
import { pickPhoto, uploadPhoto, removePhoto } from "@/lib/photos";
import { supabase } from "@/lib/supabase";
import { succeeded, warned } from "@/lib/haptics";

/**
 * Your own face: reading it, changing it, taking it away.
 *
 * A hook rather than a screen's private business, because it is now offered
 * in two places -- Settings, where you would go looking for it, and the top
 * of the Menu, where you would actually see it -- and two copies of a
 * three-step upload that has to clean up after itself on every failure is two
 * copies that will not agree for long.
 */
export function useMyAvatar() {
  const { session, profile, refreshProfile } = useAuth();
  const { myAvatarUrl, reload: reloadPhotos } = useCouplePhotos();
  const [busy, setBusy] = useState(false);

  const userId = session?.user.id ?? null;
  const previousPath = profile?.avatar_path ?? null;

  const setAvatar = useCallback(
    async (path: string | null) => {
      if (!userId) return;

      const { error } = await supabase
        .from("profiles")
        .update({ avatar_path: path })
        .eq("id", userId);

      if (error) {
        // Undo the upload rather than leaving a file nothing points at.
        if (path) await removePhoto(path);
        warned();
        Alert.alert("Couldn't save that", error.message);
        return;
      }

      // Only once the row points somewhere else. The other order loses the
      // photo when the write fails.
      await removePhoto(previousPath);
      await refreshProfile();
      await reloadPhotos();
      succeeded();
    },
    [userId, previousPath, refreshProfile, reloadPhotos]
  );

  const changePhoto = useCallback(async () => {
    if (!userId || busy) return;

    const { photo, error } = await pickPhoto("avatar");
    if (error) {
      warned();
      Alert.alert("Couldn't use that photo", error);
      return;
    }
    if (!photo) return;

    setBusy(true);
    const upload = await uploadPhoto("avatar", userId, photo);
    if (upload.error || !upload.path) {
      setBusy(false);
      warned();
      Alert.alert("Couldn't save that photo", upload.error ?? "Please try again.");
      return;
    }

    await setAvatar(upload.path);
    setBusy(false);
  }, [userId, busy, setAvatar]);

  const confirmRemove = useCallback(() => {
    Alert.alert("Remove your photo?", "Your initials will show instead.", [
      { text: "Keep it", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          setBusy(true);
          await setAvatar(null);
          setBusy(false);
        },
      },
    ]);
  }, [setAvatar]);

  return { avatarUrl: myAvatarUrl, busy, changePhoto, confirmRemove };
}
