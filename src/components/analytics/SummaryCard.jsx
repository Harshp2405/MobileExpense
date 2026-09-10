import { View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";

export default function SummaryCard({
  label,
  value,
  icon,
  tone = "neutral",
  footer,
}) {
  const toneColor =
    tone === "good"
      ? "text-green-500"
      : tone === "bad"
        ? "text-red-500"
        : "text-gray-900 dark:text-gray-100";
  return (
    <View className="bg-white dark:bg-zinc-800 rounded-3xl p-4 border border-gray-100 dark:border-zinc-700 shadow-sm flex-1 min-w-[45%]">
      <View className="flex-row items-center mb-2">
        {icon ? <Ionicons name={icon} size={16} color="#6B7280" /> : null}
        <Text className="text-[10px] font-bold text-gray-400 uppercase tracking-wider ml-1">
          {label}
        </Text>
      </View>
      <Text className={`text-xl font-black ${toneColor}`} numberOfLines={1}>
        {value}
      </Text>
      {footer ? (
        <Text className="text-[10px] text-gray-400 mt-1" numberOfLines={1}>
          {footer}
        </Text>
      ) : null}
    </View>
  );
}
