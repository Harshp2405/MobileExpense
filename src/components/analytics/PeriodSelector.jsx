import { View, Text, TouchableOpacity, ScrollView } from "react-native";

const OPTIONS = [
  { key: "today", label: "Today" },
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
  { key: "year", label: "Year" },
  { key: "custom", label: "Custom" },
];

export default function PeriodSelector({ value, onChange }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View className="flex-row gap-2">
        {OPTIONS.map((o) => (
          <TouchableOpacity
            key={o.key}
            onPress={() => onChange(o.key)}
            className={`px-4 py-2 rounded-full border ${value === o.key ? "bg-blue-600 border-blue-600" : "bg-white dark:bg-zinc-800 border-gray-200 dark:border-zinc-700"}`}
          >
            <Text
              className={`text-xs font-bold ${value === o.key ? "text-white" : "text-gray-600 dark:text-gray-300"}`}
            >
              {o.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );
}
