// src/lib/utils/imageManager.js
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import { Alert, Platform } from "react-native";

const RECEIPTS_DIR = `${FileSystem.documentDirectory}receipts/`;

// Ensure persistent receipts directory exists
async function ensureDirExists() {
  if (Platform.OS === "web") return;
  const dirInfo = await FileSystem.getInfoAsync(RECEIPTS_DIR);
  if (!dirInfo.exists) {
    await FileSystem.makeDirectoryAsync(RECEIPTS_DIR, { intermediates: true });
  }
}

/**
 * Capture receipt via Camera
 */
export async function takePhoto() {
  try {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(
        "Permission Denied",
        "Camera permission is required to capture bill photos.",
      );
      return null;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      quality: 0.6, //Compress to ~60% to save disk space
      allowsMultipleSelection: true,
      exif: false,
      selectionLimit: 3,
    });

    if (result.canceled || !result.assets || result.assets.length === 0) {
      return null;
    }
    // console.log(result , " From Camera")
    return await saveImageLocally(result.assets[0].uri);
  } catch (error) {
    console.error("Error taking photo:", error);
    Alert.alert("Error", "Could not capture photo.");
    return null;
  }
}

/**
 * Pick receipt from Gallery / Photos
 */
export async function pickImageFromGallery() {
  try {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(
        "Permission Denied",
        "Gallery access is required to select bill images.",
      );
      return null;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      quality: 0.6,
      allowsMultipleSelection: true,
      exif: false,
      orderedSelection: true,
      selectionLimit: 3,
      shouldDownloadFromNetwork: true,
    });

    if (result.canceled || !result.assets || result.assets.length === 0) {
      return null;
    }
    // console.log(result , " From Camera")
    return await saveImageLocally(result.assets[0].uri);
  } catch (error) {
    console.error("Error picking image:", error);
    Alert.alert("Error", "Could not select image.");
    return null;
  }
}

/**
 * Copies temporary image to permanent app documents folder
 */
export async function saveImageLocally(tempUri) {
  if (Platform.OS === "web") {
    return tempUri;
  }

  await ensureDirExists();
  const filename = `receipt_${Date.now()}_${Math.floor(Math.random() * 10000)}.jpg`;
  const permanentUri = `${RECEIPTS_DIR}${filename}`;

  await FileSystem.copyAsync({
    from: tempUri,
    to: permanentUri,
  });

  return permanentUri;
}

/**
 * Deletes local receipt file when expense is deleted
 */
export async function deleteLocalImage(imageUri) {
  if (!imageUri || Platform.OS === "web") return;
  try {
    const fileInfo = await FileSystem.getInfoAsync(imageUri);
    if (fileInfo.exists) {
      await FileSystem.deleteAsync(imageUri, { idempotent: true });
    }
  } catch (error) {
    console.warn("Failed to delete local receipt image:", error);
  }
}