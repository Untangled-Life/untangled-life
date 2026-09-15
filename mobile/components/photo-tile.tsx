import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { press } from "@/components/press";
import { succeeded, warned } from "@/lib/haptics";
import { useThemedStyles, useTheme } from "@/contexts/theme";
import { Theme } from "@/theme/tokens";
import { PhotoKind, pickPhoto, removePhoto, signedUrl, uploadPhoto } from "@/lib/photos";

/**
 * A photo attached to something: a wishlist, a trip, a birthday, a booking.
 *
 * One component rather than the same forty lines on four screens, because
 * every one of them has to do the same awkward sequence -- pick, resize,
 * upload, store the path, sign a URL to show it, and tidy up the file the
 * new one replaced. The last of those is the one that gets forgotten, and
 * forgetting it leaves somebody's photograph on a server after they thought
 * they had changed it.
 *
 * The empty state is a real invitation rather than a grey box: these are all
 * places where a picture is the difference between a list and a memory.
 */
export function PhotoTile({
  path,
  kind,
  ownerId,
  onChange,
  label = "Add a photo",
  height = 160,
  rounded = true,
}: {
  path: string | null;
  kind: PhotoKind;
  /** The couple id for everything except an avatar. */
  ownerId: string | null;
  /**
   * Save the new path. MUST report whether it stuck: the old file is deleted
   * on the strength of this, and a save that quietly failed would take the
   * photograph with it and leave the row pointing at nothing.
   */
  onChange: (path: string | null) => Promise<boolean>;
  label?: string;
  height?: number;
  rounded?: boolean;
}) {
  const styles = useThemedStyles(createStyles);
  const t = useTheme();

  const [busy, setBusy] = useState(false);

  // Keyed by the path it was signed for, so a stale URL is never shown
  // against a photo that has since been replaced -- and so clearing the path
  // does not need an effect to set state synchronously.
  const [signed, setSigned] = useState<{ path: string; url: string | null } | null>(null);
  const url = signed && signed.path === path ? signed.url : null;

  useEffect(() => {
    if (!path) return;

    let cancelled = false;

    signedUrl(path).then((next) => {
      if (!cancelled) setSigned({ path, url: next });
    });

    return () => {
      cancelled = true;
    };
  }, [path]);

  const replace = useCallback(async () => {
    if (!ownerId || busy) return;

    const { photo, error } = await pickPhoto(kind);
    if (error) {
      warned();
      Alert.alert("Couldn't open your photos", error);
      return;
    }
    if (!photo) return;

    setBusy(true);
    const { path: uploaded, error: uploadError } = await uploadPhoto(kind, ownerId, photo);
    setBusy(false);

    if (uploadError || !uploaded) {
      warned();
      Alert.alert("Couldn't save that photo", uploadError ?? "Something went wrong.");
      return;
    }

    const previous = path;
    const saved = await onChange(uploaded);

    if (!saved) {
      // The row still points at the old photo, so the old photo has to stay.
      // What is spare is the one just uploaded.
      await removePhoto(uploaded);
      return;
    }

    succeeded();

    // Only now, and only because the row points at the new one: a failure
    // here leaves a spare file rather than a row pointing at nothing.
    if (previous) await removePhoto(previous);
  }, [busy, kind, onChange, ownerId, path]);

  function confirmRemove() {
    Alert.alert("Remove this photo?", "The picture goes; nothing else does.", [
      { text: "Keep it", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          const previous = path;
          const saved = await onChange(null);
          if (saved && previous) await removePhoto(previous);
        },
      },
    ]);
  }

  return (
    <Pressable
      style={press([styles.tile, rounded ? styles.rounded : null, { height }])}
      onPress={replace}
      onLongPress={path ? confirmRemove : undefined}
      accessibilityRole="button"
      accessibilityLabel={path ? "Change this photo" : label}
    >
      {url ? (
        <Image
          source={{ uri: url }}
          alt={label}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={200}
        />
      ) : null}

      {busy ? (
        <View style={styles.veil}>
          <ActivityIndicator color={t.textOnBrand} />
        </View>
      ) : null}

      {!url && !busy ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>{label}</Text>
        </View>
      ) : null}

      {url && !busy ? (
        <View style={styles.hintWrap}>
          <Text style={styles.hint}>Tap to change · hold to remove</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const createStyles = (t: Theme) =>
  StyleSheet.create({
    tile: {
      backgroundColor: t.surfaceSunken,
      overflow: "hidden",
      justifyContent: "flex-end",
    },
    rounded: { borderRadius: t.radius.lg },
    empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: t.space(4) },
    emptyText: { ...t.type.label, color: t.textMuted, textAlign: "center" },
    veil: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "rgba(12,10,7,0.45)",
    },
    hintWrap: {
      paddingHorizontal: t.space(3),
      paddingVertical: t.space(2),
      backgroundColor: "rgba(12,10,7,0.45)",
    },
    hint: { ...t.type.caption, color: "#FFFFFF" },
  });
