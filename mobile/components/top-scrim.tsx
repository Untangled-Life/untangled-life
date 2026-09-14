import { StyleSheet } from "react-native";
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
 */
export function TopScrim() {
  const insets = useSafeAreaInsets();
  const t = useTheme();

  // Opaque across the status bar itself, then gone within about a line of
  // text. Long enough to catch anything scrolling up into it, short enough
  // that it never reads as a header.
  const height = insets.top + 14;

  return (
    <LinearGradient
      pointerEvents="none"
      colors={[t.bg, t.bg, withAlpha(t.bg, 0)]}
      locations={[0, 0.62, 1]}
      style={[styles.scrim, { height }]}
    />
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
