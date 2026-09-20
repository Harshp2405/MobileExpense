// src/components/LockScreen.jsx
import { View, Text, TouchableOpacity, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useColorScheme } from "nativewind";

/**
 * @param {{
 *   onUnlock: () => Promise<void>;
 *   isAuthenticating: boolean;
 *   error: string | null;
 * }} props
 */
export default function LockScreen({ onUnlock, isAuthenticating, error }) {
    const { colorScheme } = useColorScheme();
    const isDark = colorScheme === "dark";

    return (
        <SafeAreaView className="flex-1 items-center justify-center bg-gray-50 dark:bg-zinc-900 px-8">
            {/* App lock icon */}
            <View className="w-24 h-24 rounded-full bg-blue-50 dark:bg-blue-900/30 items-center justify-center mb-8 shadow-lg">
                <Ionicons
                    name="lock-closed"
                    size={44}
                    color={isDark ? "#60A5FA" : "#2563EB"}
                />
            </View>

            <Text className="text-2xl font-black text-gray-900 dark:text-gray-100 mb-2 text-center">
                App Locked
            </Text>

            <Text className="text-sm text-gray-500 dark:text-gray-400 text-center mb-10 leading-6">
                Verify your identity to access{"\n"}your financial data
            </Text>

            {/* Sanitized error — never leaks raw SDK error */}
            {error ? (
                <View className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl px-4 py-3 mb-6 w-full">
                    <Text className="text-red-600 dark:text-red-400 text-sm text-center font-medium">
                        {error}
                    </Text>
                </View>
            ) : null}

            {/* Unlock button */}
            <TouchableOpacity
                onPress={onUnlock}
                disabled={isAuthenticating}
                activeOpacity={0.8}
                className={`w-full py-4 rounded-2xl items-center flex-row justify-center gap-3 shadow-md ${isAuthenticating
                        ? "bg-blue-300 dark:bg-blue-800"
                        : "bg-blue-600 dark:bg-blue-500"
                    }`}
            >
                {isAuthenticating ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                    <Ionicons name="finger-print-outline" size={22} color="#FFFFFF" />
                )}
                <Text className="text-white font-bold text-base">
                    {isAuthenticating ? "Verifying..." : "Unlock with Biometrics"}
                </Text>
            </TouchableOpacity>

            <Text className="text-xs text-gray-400 dark:text-gray-600 mt-6 text-center">
                Falls back to your device PIN if biometrics fails
            </Text>
        </SafeAreaView>
    );
}
