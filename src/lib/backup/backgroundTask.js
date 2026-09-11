// src/lib/backup/backgroundTask.js
import * as BackgroundTask from "expo-background-task";
import * as TaskManager from "expo-task-manager";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { performBackup } from "./backupService";
import { isLoggedIn } from "./googleAuth";

export const BACKUP_TASK_NAME = "GDRIVE_AUTO_BACKUP";

// MUST be defined at module top-level (not inside a function)
TaskManager.defineTask(BACKUP_TASK_NAME, async () => {
  try {
    if (Platform.OS === "web" || !(await isLoggedIn())) {
      return BackgroundTask.BackgroundTaskResult.Success;
    }

    const result = await performBackup();

    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: "Backup Complete",
          body: `Saved to Google Drive: ${result.fileName}`,
          sound: false,
        },
        trigger: null,
      });
    } catch (notificationError) {
      console.warn(
        "[BackgroundBackup] Notification unavailable:",
        notificationError?.message,
      );
    }

    return BackgroundTask.BackgroundTaskResult.Success;
  } catch (e) {
    console.error("[BackgroundBackup] Error:", e.message);
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

export async function registerBackupTask() {
  if (Platform.OS === "web") return false;
  const status = await BackgroundTask.getStatusAsync();
  if (status === BackgroundTask.BackgroundTaskStatus.Restricted) {
    console.warn("[BackgroundBackup] Background task not available");
    return false;
  }

  const isRegistered =
    await TaskManager.isTaskRegisteredAsync(BACKUP_TASK_NAME);
  if (!isRegistered) {
    await BackgroundTask.registerTaskAsync(BACKUP_TASK_NAME, {
      minimumInterval: 24 * 60,
    });
  }
  return true;
}

export async function unregisterBackupTask() {
  if (Platform.OS === "web") return;
  if (await TaskManager.isTaskRegisteredAsync(BACKUP_TASK_NAME)) {
    await BackgroundTask.unregisterTaskAsync(BACKUP_TASK_NAME);
  }
}
