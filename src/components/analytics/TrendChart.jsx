import { View, Text, TouchableOpacity, Dimensions } from "react-native";
import { BarChart, LineChart } from "react-native-gifted-charts";
import EmptyState from "./EmptyState";

const MODES = [
  { key: "expense", label: "Expense", color: "#EF4444" },
  { key: "income", label: "Income", color: "#10B981" },
  { key: "net", label: "Net", color: "#3B82F6" },
];

export default function TrendChart({
  series,
  mode,
  onModeChange,
  isDark,
  type = "bar",
}) {
  const active = MODES.find((m) => m.key === mode) || MODES[0];
  const width = Dimensions.get("window").width - 80;

  const data = (series || []).map((p) => ({
    value: Math.max(0, Number(p[mode] ?? p.total) || 0),
    label: p.label,
    frontColor: active.color,
  }));

  const hasData = data.some((d) => d.value > 0);

  return (
    <View>
      <View className="flex-row gap-2 mb-4">
        {MODES.map((m) => (
          <TouchableOpacity
            key={m.key}
            onPress={() => onModeChange(m.key)}
            className={`px-3 py-1.5 rounded-full border ${mode === m.key ? "bg-blue-600 border-blue-600" : "bg-white dark:bg-zinc-800 border-gray-200 dark:border-zinc-700"}`}
          >
            <Text
              className={`text-[11px] font-bold ${mode === m.key ? "text-white" : "text-gray-600 dark:text-gray-300"}`}
            >
              {m.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {!hasData ? (
        <EmptyState icon="analytics-outline" title="Not enough data to chart" />
      ) : type === "line" ? (
        <LineChart
          data={data}
          width={width}
          color={active.color}
          thickness={2}
          hideDataPoints={data.length > 15}
          yAxisTextStyle={{
            color: isDark ? "#9CA3AF" : "#6B7280",
            fontSize: 10,
          }}
          xAxisLabelTextStyle={{
            color: isDark ? "#9CA3AF" : "#6B7280",
            fontSize: 9,
          }}
          rulesColor={isDark ? "#3F3F46" : "#F3F4F6"}
        />
      ) : (
        <BarChart
          data={data}
          width={width}
          barWidth={data.length > 12 ? 8 : 16}
          spacing={data.length > 12 ? 6 : 14}
          roundedTop
          noOfSections={4}
          yAxisTextStyle={{
            color: isDark ? "#9CA3AF" : "#6B7280",
            fontSize: 10,
          }}
          xAxisLabelTextStyle={{
            color: isDark ? "#9CA3AF" : "#6B7280",
            fontSize: 9,
          }}
          rulesColor={isDark ? "#3F3F46" : "#F3F4F6"}
          yAxisThickness={0}
          xAxisThickness={0}
        />
      )}
    </View>
  );
}
