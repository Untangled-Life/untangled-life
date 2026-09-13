import * as Notifications from "expo-notifications";
import { nextOccurrence } from "@/lib/keyDates";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// Card-and-gift reminders: 2 weeks, 1 week, and 3 days before each key date.
// These are purely local, on-device notifications — no push token or server
// involved, since each partner only needs a reminder on their own phone.
const REMINDER_OFFSETS_DAYS = [14, 7, 3];
const REMINDER_HOUR = 9; // 9am local time

export async function requestNotificationPermission(): Promise<boolean> {
  const existing = await Notifications.getPermissionsAsync();
  if (existing.granted) return true;
  const result = await Notifications.requestPermissionsAsync();
  return result.granted;
}

export type ReminderInput = {
  id: string;
  displayTitle: string;
  date: string;
  recurring: boolean;
};

export async function rescheduleKeyDateReminders(dates: ReminderInput[]): Promise<void> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled
      .filter((n) => n.identifier.startsWith("keydate-"))
      .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier))
  );

  for (const kd of dates) {
    const occurrence = nextOccurrence(kd.date, kd.recurring);

    for (const offset of REMINDER_OFFSETS_DAYS) {
      const reminderAt = new Date(occurrence);
      reminderAt.setDate(reminderAt.getDate() - offset);
      reminderAt.setHours(REMINDER_HOUR, 0, 0, 0);

      if (reminderAt.getTime() <= Date.now()) continue;

      await Notifications.scheduleNotificationAsync({
        identifier: `keydate-${kd.id}-${offset}`,
        content: {
          title: `${kd.displayTitle} is coming up`,
          body: `${offset} day${offset === 1 ? "" : "s"} to go — time to sort a card and a gift.`,
        },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: reminderAt },
      });
    }
  }
}
