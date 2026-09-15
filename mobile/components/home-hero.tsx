import { StyleSheet, Text, View, Pressable, useWindowDimensions } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Avatar } from "@/components/avatar";
import { press } from "@/components/press";
import { useThemedStyles, useTheme } from "@/contexts/theme";
import { Theme } from "@/theme/tokens";

/**
 * The top of Home: the two of you.
 *
 * This is the first thing anyone sees, and it is most of what a screenshot on
 * the website will show, so it earns the space. It runs full bleed rather than
 * sitting in the page's gutter -- a photo inset on all four sides reads as an
 * attachment, a photo running to the edges reads as the page itself.
 *
 * The empty state matters as much as the filled one and gets the same layout,
 * because every new couple starts there and it is what a reviewer sees. A
 * dashed grey box saying "no image" would undo the rest of the screen.
 */
/**
 * How tall the cover runs at a given screen width.
 *
 * Exported because Home has to know where the photo ends: that is the point
 * the page's own scrim takes over from the shade the hero draws, and a second
 * copy of this arithmetic would drift the moment either changed.
 *
 * Proportional rather than fixed, so it is a band on a small phone and not a
 * whole screen on a large one.
 */
export function heroHeight(width: number): number {
  return Math.round(Math.min(Math.max(width * 0.72, 240), 320));
}

export function HomeHero({
  coverUrl,
  myAvatarUrl,
  partnerAvatarUrl,
  myName,
  partnerName,
  hasPartner,
  uploading,
  onChangeCover,
}: {
  coverUrl: string | null;
  myAvatarUrl: string | null;
  partnerAvatarUrl: string | null;
  myName: string | null;
  partnerName: string | null;
  /**
   * Whether there is somebody else in this couple at all.
   *
   * Passed rather than inferred from the name or the photo: both are null for
   * a real partner who has not filled them in, and guessing from them dropped
   * their circle off the screen.
   */
  hasPartner: boolean;
  uploading: boolean;
  onChangeCover: () => void;
}) {
  const styles = useThemedStyles(createStyles);
  const t = useTheme();
  const { width } = useWindowDimensions();

  const hasPhoto = Boolean(coverUrl);

  const height = heroHeight(width);

  const today = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  const names = hasPartner
    ? `${myName ?? "You"} & ${partnerName ?? "them"}`
    : (myName ?? "You");

  return (
    <View style={[styles.hero, { height }]}>
      {hasPhoto ? (
        <>
          <Image
            source={{ uri: coverUrl as string }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            transition={250}
          />
          {/* A scrim rather than a flat overlay: the names have to stay
              readable over a bright sky or a dark room, and dimming the whole
              picture to guarantee that would waste the picture. */}
          <LinearGradient
            colors={["rgba(12,10,7,0)", "rgba(12,10,7,0.25)", "rgba(12,10,7,0.78)"]}
            locations={[0.35, 0.62, 1]}
            style={StyleSheet.absoluteFill}
          />
        </>
      ) : (
        <LinearGradient
          colors={[t.brandSoft, t.surface]}
          start={{ x: 0.1, y: 0 }}
          end={{ x: 0.9, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      )}

      <View style={styles.content}>
        <View style={styles.faces}>
          <View style={styles.faceRing}>
            <Avatar url={myAvatarUrl} name={myName} size={52} />
          </View>
          {/* Overlapped rather than side by side: two circles touching reads
              as a couple, two circles apart reads as a list of users. */}
          {hasPartner ? (
            <View style={[styles.faceRing, styles.faceOverlap]}>
              <Avatar url={partnerAvatarUrl} name={partnerName} size={52} />
            </View>
          ) : null}
        </View>

        <Text style={[styles.eyebrow, hasPhoto ? styles.onPhotoMuted : null]}>{today}</Text>
        <Text style={[styles.names, hasPhoto ? styles.onPhoto : null]} numberOfLines={2}>
          {names}
        </Text>

        {!hasPhoto ? (
          <Pressable
            style={press(styles.addPhoto)}
            onPress={onChangeCover}
            accessibilityRole="button"
            accessibilityLabel="Add a cover photo"
          >
            <Text style={styles.addPhotoText}>
              {uploading ? "Adding your photo…" : "Add a photo of the two of you"}
            </Text>
          </Pressable>
        ) : null}
      </View>

      {/* With a photo, the whole band is the tap target for changing it. The
          invitation only needs to be spelled out while there isn't one. */}
      {hasPhoto ? (
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onChangeCover}
          accessibilityRole="button"
          accessibilityLabel="Change cover photo"
        />
      ) : null}
    </View>
  );
}

const createStyles = (t: Theme) =>
  StyleSheet.create({
    hero: {
      borderBottomLeftRadius: t.radius.xl,
      borderBottomRightRadius: t.radius.xl,
      overflow: "hidden",
      justifyContent: "flex-end",
      backgroundColor: t.surface,
    },
    content: { padding: t.space(6), gap: t.space(1) },
    faces: { flexDirection: "row", marginBottom: t.space(3) },
    faceRing: {
      borderRadius: 999,
      borderWidth: 2.5,
      borderColor: t.surface,
      // The ring is what keeps a face legible against a busy photo. Without it
      // a dark jumper against a dark background loses its edge entirely.
      ...t.shadow,
    },
    faceOverlap: { marginLeft: -16 },
    eyebrow: { ...t.type.eyebrow, color: t.textMuted },
    names: { ...t.type.display, color: t.textPrimary },
    onPhoto: { color: "#FFFFFF" },
    onPhotoMuted: { color: "rgba(255,255,255,0.78)" },
    addPhoto: {
      alignSelf: "flex-start",
      marginTop: t.space(3),
      paddingVertical: t.space(2),
      paddingHorizontal: t.space(4),
      borderRadius: t.radius.pill,
      backgroundColor: t.surface,
      borderWidth: 1,
      borderColor: t.border,
    },
    addPhotoText: { ...t.type.label, color: t.brand },
  });
