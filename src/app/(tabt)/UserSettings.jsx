import { View, Text, TouchableOpacity, Switch, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useThemePersist } from "../../lib/utils/useThemePersist";
import { useBiometricAuth } from "../../lib/auth/useBiometricAuth";
import { usePrivacyMode } from "../../lib/privacy/usePrivacyMode";

const THEME_OPTIONS = [
  { key: "light", label: "Light", icon: "sunny-outline" },
  { key: "dark", label: "Dark", icon: "moon-outline" },
];

export default function UserSettings() {
  const { colorScheme, setTheme } = useThemePersist();
  const isDark = colorScheme === "dark";

  const {
    isEnabled: biometricEnabled,
    isAvailable: biometricAvailable,
    setEnabled: setBiometricEnabled,
  } = useBiometricAuth();

  const { isPrivate, togglePrivacy } = usePrivacyMode();

  return (
    <SafeAreaView className="flex-1 bg-gray-50 dark:bg-zinc-900 p-6">
      <Text className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">
        Settings
      </Text>
      <Text className="text-sm text-gray-500 dark:text-gray-400 mb-8">
        Customize your app experience
      </Text>

      {/* Appearance */}
      <View className="bg-white dark:bg-zinc-800 rounded-2xl p-5 border border-gray-100 dark:border-zinc-700 shadow-sm mb-5">
        <Text className="text-base font-bold text-gray-900 dark:text-gray-100 mb-1">
          Appearance
        </Text>
        <Text className="text-xs text-gray-500 dark:text-gray-400 mb-5">
          Choose your preferred theme
        </Text>

        <View className="flex-row gap-3">
          {THEME_OPTIONS.map((opt) => {
            const active = colorScheme === opt.key;
            return (
              <TouchableOpacity
                key={opt.key}
                onPress={() => setTheme(opt.key)}
                className={`flex-1 py-4 rounded-xl items-center border ${active
                  ? "bg-blue-600 border-blue-600"
                  : "bg-gray-50 dark:bg-zinc-700 border-gray-200 dark:border-zinc-600"
                  }`}
              >
                <Ionicons
                  name={opt.icon}
                  size={22}
                  color={active ? "#FFFFFF" : isDark ? "#D1D5DB" : "#4B5563"}
                />
                <Text
                  className={`text-xs font-bold mt-2 ${active ? "text-white" : "text-gray-700 dark:text-gray-300"
                    }`}
                >
                  {opt.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Security */}
      <View className="bg-white dark:bg-zinc-800 rounded-2xl p-5 border border-gray-100 dark:border-zinc-700 shadow-sm mb-5">
        <Text className="text-base font-bold text-gray-900 dark:text-gray-100 mb-1">
          Security
        </Text>
        <Text className="text-xs text-gray-500 dark:text-gray-400 mb-5">
          Protect your financial data
        </Text>

        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center gap-3 flex-1">
            <View className="w-10 h-10 rounded-full bg-blue-50 dark:bg-blue-900/30 items-center justify-center">
              <Ionicons name="finger-print-outline" size={20} color="#2563EB" />
            </View>
            <View className="flex-1">
              <Text className="text-sm font-bold text-gray-900 dark:text-gray-100">
                Biometric Lock
              </Text>
              <Text className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                {biometricAvailable
                  ? "Require Face ID / Fingerprint on open"
                  : "Not available on this device"}
              </Text>
            </View>
          </View>

          <Switch
            value={biometricEnabled}
            onValueChange={setBiometricEnabled}
            disabled={!biometricAvailable}
            trackColor={{ false: "#D1D5DB", true: "#2563EB" }}
            thumbColor={biometricEnabled ? "#FFFFFF" : "#F9FAFB"}
          />
        </View>

        {biometricEnabled && (
          <View className="mt-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl p-3">
            <Text className="text-xs text-blue-700 dark:text-blue-300">
              App will lock automatically after 60 seconds in background.
            </Text>
          </View>
        )}

        {!biometricAvailable && Platform.OS !== "web" && (
          <View className="mt-4 bg-amber-50 dark:bg-amber-900/20 rounded-xl p-3">
            <Text className="text-xs text-amber-700 dark:text-amber-300">
              No biometric or PIN enrolled. Go to device Settings → Security to set one up.
            </Text>
          </View>
        )}
      </View>

      {/* Privacy */}
      <View className="bg-white dark:bg-zinc-800 rounded-2xl p-5 border border-gray-100 dark:border-zinc-700 shadow-sm mb-5">
        <Text className="text-base font-bold text-gray-900 dark:text-gray-100 mb-1">
          Privacy
        </Text>
        <Text className="text-xs text-gray-500 dark:text-gray-400 mb-5">
          Control what is visible on screen
        </Text>

        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center gap-3 flex-1">
            <View className="w-10 h-10 rounded-full bg-purple-50 dark:bg-purple-900/30 items-center justify-center">
              <Ionicons
                name={isPrivate ? "eye-off-outline" : "eye-outline"}
                size={20}
                color="#7C3AED"
              />
            </View>
            <View className="flex-1">
              <Text className="text-sm font-bold text-gray-900 dark:text-gray-100">
                Stealth Mode
              </Text>
              <Text className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                {isPrivate
                  ? "Amounts hidden — tap to reveal"
                  : "All amounts visible — tap to hide"}
              </Text>
            </View>
          </View>

          <Switch
            value={isPrivate}
            onValueChange={togglePrivacy}
            trackColor={{ false: "#D1D5DB", true: "#7C3AED" }}
            thumbColor={isPrivate ? "#FFFFFF" : "#F9FAFB"}
          />
        </View>

        {isPrivate && (
          <View className="mt-4 bg-purple-50 dark:bg-purple-900/20 rounded-xl p-3">
            <Text className="text-xs text-purple-700 dark:text-purple-300">
              Stealth mode is ON. All balances appear as ₹ •••••• across the app.
            </Text>
          </View>
        )}
      </View>

      {/* Current Theme Indicator */}
      <View className="mt-1 bg-white dark:bg-zinc-800 rounded-2xl p-4 border border-gray-100 dark:border-zinc-700 flex-row items-center">
        <View className="w-10 h-10 rounded-full bg-blue-50 dark:bg-blue-900/30 items-center justify-center mr-3">
          <Ionicons
            name={isDark ? "moon" : "sunny"}
            size={20}
            color="#2563EB"
          />
        </View>
        <View>
          <Text className="text-sm font-bold text-gray-900 dark:text-gray-100">
            Currently:{" "}
            {colorScheme === "system"
              ? "System Default"
              : colorScheme === "dark"
                ? "Dark Mode"
                : "Light Mode"}
          </Text>
          <Text className="text-xs text-gray-400 dark:text-gray-500">
            Changes apply instantly across all screens
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}
