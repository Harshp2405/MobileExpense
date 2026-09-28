import "expo-router/entry";
import { Platform } from "react-native";

if (Platform.OS === "android") {
  try {
    const { registerWidgetTaskHandler } = require("react-native-android-widget");
    const {
      widgetTaskHandler,
    } = require("./src/widgets/android/widgetTaskHandler");
    registerWidgetTaskHandler(widgetTaskHandler);
  } catch (error) {
    console.warn("[index.js] registerWidgetTaskHandler failed:", error);
  }
}
