import { Animated, StyleProp, StyleSheet, ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/contexts/theme";



/**
 * A short fade at the top of the screen, under the status bar.
 *
 * Every scrolling screen runs its content full height, which is right -- text
 * disappearing behind a hard edge looks like a page, text stopping short of
 * one looks like a mistake. But with nothing over it, a line of body copy
 * scrolls straight through the clock and the battery icon and the two become
 * illegible together.
 *
 * A fade rather than a solid bar, for the same reason the cover photo gets one
 * rather than being dimmed: a bar is a piece of chrome you have to design
 * around on every screen, and a fade is just the page running out.
 *
 * Home passes a style because it has to fade the scrim itself IN. Its cover
 * photo runs to the top edge on purpose, so a cream wash sitting over it from
 * the start would be a bar across two faces -- but once the photo has scrolled
 * away, the names underneath collide with the clock exactly like anywhere
 * else. So there it appears as the photo leaves.
 */
export function TopScrim({
  style,
  tone = "page",
  depth,
}: {
  style?: Animated.WithAnimatedValue<StyleProp<ViewStyle>>;
  /**
   * What is behind it. "page" is the cream wash that every scrolling screen
   * uses; "photo" is the dark one Home needs while its cover photo is still
   * under the clock. A light wash over a dark photograph reads as fog across
   * whoever is in the picture, and white icons on a bright sky are illegible
   * without something behind them -- so the protection has to match what it
   * is protecting against, not the page it will eventually sit on.
   */
  tone?: "page" | "photo";
  /**
   * How far down the fade reaches, over the safe-area inset.
   *
   * The page's own scrim only ever has the status bar to cover, which is the
   * default. Home needs more, because its three buttons are pinned over the
   * page rather than over the photo now, and text scrolling through them is
   * the mess this exists to prevent.
   */
  depth?: number;
} = {}) {
  const insets = useSafeAreaInsets();
  const t = useTheme();

  // Opaque across the status bar itself, then gone. Fourteen pixels past the
  // inset ended in a visible edge rather than a fade -- over a photograph the
  // eye finds a straight horizontal line immediately, and what should read as
  // the page running out read as a bar somebody forgot to style.
  const height = insets.top + (depth ?? (tone === "photo" ? 96 : 32));

  // Deep enough for the three buttons that float over the photo, which is
  // what the dark one is mostly there for. The page's own scrim only ever has
  // the status bar to cover.
  const colors: [string, string, string] =
    tone === "photo"
      ? ["rgba(12,10,7,0.62)", "rgba(12,10,7,0.3)", "rgba(12,10,7,0)"]
      : [t.bg, t.bg, withAlpha(t.bg, 0)];

  const locations: [number, number, number] = tone === "photo" ? [0, 0.5, 1] : [0, 0.45, 1];

  // The animation goes on a plain Animated.View wrapping the gradient rather
  // than on the gradient itself. Animated.createAnimatedComponent around a
  // third-party component only works if that component forwards its ref to a
  // native view; expo-linear-gradient does not reliably, so the opacity was
  // silently dropped and the scrim sat at full strength over the cover photo
  // from the moment the screen opened. An Animated.View is RN's own and is
  // always native-drivable.
  return (
    <Animated.View pointerEvents="none" style={[styles.scrim, { height }, style]}>
      <LinearGradient colors={colors} locations={locations} style={StyleSheet.absoluteFill} />
    </Animated.View>
  );
}

/**
 * The same colour at a different alpha.
 *
 * Fading to the string "transparent" is the obvious move and the wrong one:
 * on Android that interpolates towards transparent BLACK, so a cream scrim
 * develops a grey bruise through its middle. The end stop has to be this
 * colour at zero.
 */
function withAlpha(hex: string, alpha: number): string {
  const value = hex.replace("#", "");
  const full =
    value.length === 3
      ? value
          .split("")
          .map((c) => c + c)
          .join("")
      : value;

  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);

  if ([r, g, b].some(Number.isNaN)) return hex;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const styles = StyleSheet.create({
  scrim: { position: "absolute", top: 0, left: 0, right: 0 },
});
