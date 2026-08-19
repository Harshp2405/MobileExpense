import { View, Text, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useThemePersist } from "../../lib/utils/useThemePersist";

const THEME_OPTIONS = [
  { key: "light", label: "Light", icon: "sunny-outline" },
  { key: "dark", label: "Dark", icon: "moon-outline" },
  { key: "system", label: "System", icon: "phone-portrait-outline" },
];

export default function UserSettings() {
  const { colorScheme, setTheme } = useThemePersist();
  const isDark = colorScheme === "dark";

  return (
    <SafeAreaView className="flex-1 bg-gray-50 dark:bg-zinc-900 p-6">
      <Text className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">
        Settings
      </Text>
      <Text className="text-sm text-gray-500 dark:text-gray-400 mb-8">
        Customize your app experience
      </Text>

      {/* Theme Section */}
      <View className="bg-white dark:bg-zinc-800 rounded-2xl p-5 border border-gray-100 dark:border-zinc-700 shadow-sm">
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
                className={`flex-1 py-4 rounded-xl items-center border ${
                  active
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
                  className={`text-xs font-bold mt-2 ${
                    active ? "text-white" : "text-gray-700 dark:text-gray-300"
                  }`}
                >
                  {opt.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Current Theme Indicator */}
      <View className="mt-6 bg-white dark:bg-zinc-800 rounded-2xl p-4 border border-gray-100 dark:border-zinc-700 flex-row items-center">
        <View className="w-10 h-10 rounded-full bg-blue-50 dark:bg-blue-900/30 items-center justify-center mr-3">
          <Ionicons
            name={isDark ? "moon" : "sunny"}
            size={20}
            color="#2563EB"
          />
        </View>
        <View>
          <Text className="text-sm font-bold text-gray-900 dark:text-gray-100">
            Currently: {colorScheme === "system" ? "System Default" : colorScheme === "dark" ? "Dark Mode" : "Light Mode"}
          </Text>
          <Text className="text-xs text-gray-400 dark:text-gray-500">
            Changes apply instantly across all screens
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}