import * as Notifications from "expo-notifications";
import { nextOccurrence, reminderLabel } from "@/lib/keyDates";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// Card-and-gift reminders. Purely local, on-device notifications -- no push
// token or server involved, since each partner only needs a reminder on their
// own phone.
//
// The offsets come from the date itself now rather than being fixed here: two
// weeks' warning is right for an anniversary and silly for a friend's birthday
// you just want a day's notice about.
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
  reminderDays: number[];
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

    for (const offset of kd.reminderDays) {
      const reminderAt = new Date(occurrence);
      reminderAt.setDate(reminderAt.getDate() - offset);
      reminderAt.setHours(REMINDER_HOUR, 0, 0, 0);

      if (reminderAt.getTime() <= Date.now()) continue;

      await Notifications.scheduleNotificationAsync({
        identifier: `keydate-${kd.id}-${offset}`,
        content: {
          title:
            offset === 0 ? `${kd.displayTitle} is today` : `${kd.displayTitle} is coming up`,
          body:
            offset === 0
              ? "Today's the day."
              : `${reminderLabel(offset)} to go — time to sort a card and a gift.`,
        },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: reminderAt },
      });
    }
  }
}
