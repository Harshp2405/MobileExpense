import { View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";

export default function EmptyState({
  icon = "bar-chart-outline",
  title,
  subtitle,
}) {
  return (
    <View className="items-center justify-center py-12">
      <Ionicons name={icon} size={48} color="#D1D5DB" />
      <Text className="text-gray-400 dark:text-gray-500 mt-3 text-base font-semibold text-center">
        {title}
      </Text>
      {subtitle ? (
        <Text className="text-gray-400 dark:text-gray-600 mt-1 text-xs text-center px-8">
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}
