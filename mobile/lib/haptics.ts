import * as Haptics from "expo-haptics";

/**
 * Thin wrappers so a missing haptic engine can never break a flow.
 *
 * Used sparingly and only where something genuinely happened -- a date booked,
 * a shift saved, something removed. Buzzing on every tap stops meaning
 * anything, and on a shared-calendar app the point is confirming that a thing
 * landed on both phones.
 */

export function tapped() {
  Haptics.selectionAsync().catch(() => {});
}

export function succeeded() {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}

export function warned() {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
}
