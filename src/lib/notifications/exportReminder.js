import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

const CHANNEL_ID = "monthly-expense-export";
const REMINDER_HOUR = 9;
const REMINDER_MINUTE = 0;
const ACTION = "export-monthly-expenses";

export function getLastDay(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

export function getNextLastDay(now = new Date()) {
  const currentLastDay = getLastDay(now.getFullYear(), now.getMonth());
  const currentReminder = new Date(
    now.getFullYear(),
    now.getMonth(),
    currentLastDay,
    REMINDER_HOUR,
    REMINDER_MINUTE,
    0,
    0,
  );

  if (currentReminder > now) return currentReminder;

  const nextYear = now.getFullYear();
  const nextMonth = now.getMonth() + 1;
  return new Date(
    nextYear,
    nextMonth,
    getLastDay(nextYear, nextMonth),
    REMINDER_HOUR,
    REMINDER_MINUTE,
    0,
    0,
  );
}

export async function configureExportNotifications() {
  if (Platform.OS === "web") return;

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: "Monthly expense export",
      importance: Notifications.AndroidImportance.DEFAULT,
      sound: "default",
    });
  }

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

async function hasNotificationPermission() {
  const current = await Notifications.getPermissionsAsync();
  if (current.status === "granted") return true;

  const requested = await Notifications.requestPermissionsAsync();
  return requested.status === "granted";
}

function isExportReminder(notification) {
  return notification.content.data?.action === ACTION;
}

export async function cancelExportReminder() {
  if (Platform.OS === "web") return;

  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const reminders = scheduled.filter(isExportReminder);

  await Promise.all(
    reminders.map((reminder) =>
      Notifications.cancelScheduledNotificationAsync(reminder.identifier),
    ),
  );
}

export async function scheduleNextExportReminder(now = new Date()) {
  if (Platform.OS === "web") {
    return { success: false, error: "Notifications are unavailable on web" };
  }

  const allowed = await hasNotificationPermission();
  if (!allowed) {
    return { success: false, error: "Notification permission was denied" };
  }

  await cancelExportReminder();
  const scheduledFor = getNextLastDay(now);
  const identifier = await Notifications.scheduleNotificationAsync({
    content: {
      title: "Monthly Expense Export",
      body: "It is time to export this month's expenses.",
      sound: "default",
      data: { action: ACTION },
      ...(Platform.OS === "android" ? { channelId: CHANNEL_ID } : {}),
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: scheduledFor,
    },
  });

  return {
    success: true,
    identifier,
    scheduledFor: scheduledFor.toISOString(),
  };
}

export { ACTION as EXPORT_REMINDER_ACTION };
