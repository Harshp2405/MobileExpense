import { View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import EmptyState from "./EmptyState";

export default function InsightList({ insights }) {
  if (!insights || insights.length === 0) {
    return (
      <EmptyState
        icon="bulb-outline"
        title="No insights yet"
        subtitle="Add a few transactions to see spending patterns."
      />
    );
  }
  return (
    <View>
      {insights.map((ins, i) => (
        <View
          key={i}
          className="flex-row items-start bg-white dark:bg-zinc-800 p-4 rounded-2xl mb-2 border border-gray-100 dark:border-zinc-700"
        >
          <Ionicons
            name={ins.icon}
            size={18}
            color={
              ins.tone === "bad"
                ? "#EF4444"
                : ins.tone === "good"
                  ? "#10B981"
                  : "#2563EB"
            }
          />
          <Text className="text-xs text-gray-700 dark:text-gray-300 ml-3 flex-1 leading-5">
            {ins.text}
          </Text>
        </View>
      ))}
    </View>
  );
}
