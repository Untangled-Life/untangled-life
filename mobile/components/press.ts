import type { StyleProp, ViewStyle } from "react-native";

/**
 * Make a Pressable dim while it's held.
 *
 * Almost every Pressable in the app had a static style, so nothing responded
 * to touch — taps registered, but the screen gave no sign of it, which reads
 * as an unresponsive app rather than a fast one. This wraps a static style so
 * it dims on press without each call site growing a function body.
 */
export function press(base: StyleProp<ViewStyle>) {
  return ({ pressed }: { pressed: boolean }): StyleProp<ViewStyle> => [
    base,
    pressed ? { opacity: 0.55 } : null,
  ];
}
