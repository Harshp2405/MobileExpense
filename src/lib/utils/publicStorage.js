import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";

const { StorageAccessFramework } = FileSystem;

export const EXPORT_FOLDER_NAME = "ExpenseManagement";
const DIRECTORY_KEY = "export:expenseManagementDirUri";
const LOCAL_EXPORT_DIR = `${FileSystem.documentDirectory}${EXPORT_FOLDER_NAME}/`;

export const MIME_TYPES = {
  pdf: "application/pdf",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

export class ExportCancelledError extends Error {
  constructor() {
    super("Folder selection was cancelled");
    this.name = "ExportCancelledError";
  }
}

function sanitizeFileName(name) {
  return String(name ?? "export")
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 120);
}

function stripExtension(fileName) {
  const dot = fileName.lastIndexOf(".");
  return dot > 0 ? fileName.slice(0, dot) : fileName;
}

function isExpenseFolderUri(uri) {
  const decoded = decodeURIComponent(uri);
  return (
    decoded.endsWith(`/${EXPORT_FOLDER_NAME}`) ||
    decoded.endsWith(`:${EXPORT_FOLDER_NAME}`)
  );
}

// "content://...primary%3ADownload%2FExpenseManagement" -> "Download/ExpenseManagement"
export function describeFolder(uri) {
  const decoded = decodeURIComponent(uri ?? "");
  const index = decoded.lastIndexOf("primary:");
  return index >= 0
    ? decoded.slice(index + "primary:".length)
    : EXPORT_FOLDER_NAME;
}

async function findOrCreateExpenseFolder(parentUri) {
  if (isExpenseFolderUri(parentUri)) return parentUri;

  const children = await StorageAccessFramework.readDirectoryAsync(parentUri);
  const existing = children.find(isExpenseFolderUri);
  if (existing) return existing;

  return StorageAccessFramework.makeDirectoryAsync(
    parentUri,
    EXPORT_FOLDER_NAME,
  );
}

async function pickAndroidExportFolder() {
  const initialUri =
    StorageAccessFramework.getUriForDirectoryInRoot("Download");
  const permission =
    await StorageAccessFramework.requestDirectoryPermissionsAsync(initialUri);
  if (!permission.granted) throw new ExportCancelledError();

  const folderUri = await findOrCreateExpenseFolder(permission.directoryUri);
  await AsyncStorage.setItem(DIRECTORY_KEY, folderUri);
  return folderUri;
}

async function getAndroidExportFolder() {
  const savedUri = await AsyncStorage.getItem(DIRECTORY_KEY);
  if (savedUri) {
    try {
      await StorageAccessFramework.readDirectoryAsync(savedUri);
      return savedUri;
    } catch {
      // Folder was deleted or permission was revoked in system settings.
      await AsyncStorage.removeItem(DIRECTORY_KEY);
    }
  }
  return pickAndroidExportFolder();
}

async function writeAndroidFile(folderUri, fileName, base64, mimeType) {
  // SAF adds the extension itself from the MIME type.
  const fileUri = await StorageAccessFramework.createFileAsync(
    folderUri,
    stripExtension(fileName),
    mimeType,
  );
  await FileSystem.writeAsStringAsync(fileUri, base64, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return fileUri;
}

async function saveOnAndroid(fileName, base64, mimeType) {
  let folderUri = await getAndroidExportFolder();
  let fileUri;

  try {
    fileUri = await writeAndroidFile(folderUri, fileName, base64, mimeType);
  } catch {
    await AsyncStorage.removeItem(DIRECTORY_KEY);
    folderUri = await pickAndroidExportFolder();
    fileUri = await writeAndroidFile(folderUri, fileName, base64, mimeType);
  }

  return { uri: fileUri, fileName, location: describeFolder(folderUri) };
}

async function saveOnIos(fileName, base64, mimeType) {
  const info = await FileSystem.getInfoAsync(LOCAL_EXPORT_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(LOCAL_EXPORT_DIR, {
      intermediates: true,
    });
  }

  const fileUri = `${LOCAL_EXPORT_DIR}${fileName}`;
  await FileSystem.writeAsStringAsync(fileUri, base64, {
    encoding: FileSystem.EncodingType.Base64,
  });

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(fileUri, {
      mimeType,
      UTI:
        mimeType === MIME_TYPES.pdf
          ? "com.adobe.pdf"
          : "org.openxmlformats.spreadsheetml.sheet",
    });
  }

  return { uri: fileUri, fileName, location: `Files/${EXPORT_FOLDER_NAME}` };
}

/**
 * Saves a base64 file into the user-visible ExpenseManagement folder.
 * Returns { uri, fileName, location }. Throws ExportCancelledError if the
 * user closes the Android folder picker.
 */
export async function saveExportFile({ fileName, base64, mimeType }) {
  if (Platform.OS === "web") {
    throw new Error("Saving files is only available in the mobile app");
  }
  if (typeof base64 !== "string" || base64.length === 0) {
    throw new Error("Export file is empty");
  }

  const safeName = sanitizeFileName(fileName);
  return Platform.OS === "android"
    ? saveOnAndroid(safeName, base64, mimeType)
    : saveOnIos(safeName, base64, mimeType);
}

// Lets a settings screen make the next export ask for a folder again.
export async function resetExportFolder() {
  await AsyncStorage.removeItem(DIRECTORY_KEY);
}
