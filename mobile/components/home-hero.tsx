import { Animated, StyleSheet, Text, View, Pressable, useWindowDimensions } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Avatar } from "@/components/avatar";
import { press } from "@/components/press";
import { useThemedStyles, useTheme } from "@/contexts/theme";
import { Theme } from "@/theme/tokens";
import { withAlpha } from "@/lib/palette";

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
  scrollY,
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
  /**
   * The page's scroll position, if the screen wants the photo to stretch.
   *
   * Pulling down at the top of a list is the one gesture people do without
   * meaning to do anything, and answering it with a band of empty page above
   * the photograph makes the screen look like it ends there. Growing the
   * picture into the gap is what every photo-led app does, and it costs a
   * transform.
   */
  scrollY?: Animated.Value;
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

  // Anchored at the top and grown downwards from the bottom edge it already
  // has: scale about the centre and then lift by half of what the scale
  // added, which leaves the bottom of the photo exactly where the page
  // expects it and the top pinned to the top of the screen at any pull.
  //
  // Both halves are linear in the scroll position, so extending past the
  // range rather than clamping it stays exactly right however hard it is
  // pulled. Clamped on the other side, because scrolling UP is the page
  // leaving and the photo should go with it.
  const stretch = scrollY
    ? {
        transform: [
          {
            translateY: scrollY.interpolate({
              inputRange: [-height, 0],
              outputRange: [-height / 2, 0],
              extrapolateRight: "clamp" as const,
            }),
          },
          {
            scale: scrollY.interpolate({
              inputRange: [-height, 0],
              outputRange: [2, 1],
              extrapolateRight: "clamp" as const,
            }),
          },
        ],
      }
    : null;

  const names = hasPartner
    ? `${myName ?? "You"} & ${partnerName ?? "them"}`
    : (myName ?? "You");

  return (
    <View style={[styles.hero, { height }]}>
      {/* The picture and its shade, in their own layer. The clipping and the
          rounded bottom corners live here rather than on the hero, because
          the hero must NOT clip -- the whole point is the photo drawing above
          its own top edge into the gap a pull opens up. The corners are part
          of this layer, so they stretch with it. */}
      <Animated.View style={[styles.backdrop, stretch]}>
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
              locations={[0.35, 0.62, 0.88]}
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
      </Animated.View>

      {/* The page, coming up to meet the photograph.

          A photograph that simply stops is a seam, and the rounded corners
          were hiding one rather than solving it. This is the same idea as
          the scrim under the status bar, upside down: the picture runs out
          into the colour of the page instead of ending on a line.

          Outside the stretching layer, so it keeps its height: inside it,
          a hard pull would scale the band along with the photo and eat
          half the picture in cream. The dark scrim above now tops out at
          88%, so this fades from the photograph rather than from a black
          bar. */}
      <LinearGradient
        colors={[withAlpha(t.bg, 0), withAlpha(t.bg, 0.55), t.bg]}
        locations={[0, 0.55, 1]}
        style={styles.taper}
        pointerEvents="none"
      />

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
    hero: { justifyContent: "flex-end" },
    backdrop: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      overflow: "hidden",
      backgroundColor: t.surface,
    },
    content: { padding: t.space(6), paddingBottom: t.space(11), gap: t.space(1) },
    // Deep enough to read as the page arriving rather than as a line somebody
    // drew, and no deeper: every pixel of it is a pixel of photograph nobody
    // gets to see.
    taper: { position: "absolute", left: 0, right: 0, bottom: 0, height: 56 },
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
