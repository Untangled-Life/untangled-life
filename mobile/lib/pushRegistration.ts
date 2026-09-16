import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { Platform } from "react-native";
import { supabase } from "@/lib/supabase";

/**
 * Register this phone for remote push and store the token against the user, so
 * the partner's phone can be reached when they book a date or add a key date.
 *
 * Quietly does nothing when it can't work rather than throwing: simulators
 * can't issue a token, permission may be denied, and there's no EAS project id
 * until `eas init` has been run. None of those should break app startup.
 */
export async function registerForPushNotifications(userId: string): Promise<void> {
  try {
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "Untangled Life",
        importance: Notifications.AndroidImportance.DEFAULT,
        lightColor: "#EF7A62",
      });
    }

    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;

    if (status !== "granted") {
      const requested = await Notifications.requestPermissionsAsync();
      status = requested.status;
    }

    if (status !== "granted") return;

    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      (Constants as { easConfig?: { projectId?: string } }).easConfig?.projectId;

    if (!projectId) return;

    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });

    await supabase.from("push_tokens").upsert(
      {
        user_id: userId,
        expo_push_token: token,
        platform: Platform.OS,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );
  } catch {
    // Simulator, no EAS project yet, or the push service is unreachable --
    // local key-date reminders still work, so don't surface this.
  }
}
