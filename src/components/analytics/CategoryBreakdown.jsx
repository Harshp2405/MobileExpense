import { View, Text, TouchableOpacity } from "react-native";
import { PieChart } from "react-native-gifted-charts";
import { Ionicons } from "@expo/vector-icons";
import { formatCurrency } from "../../lib/analytics";
import EmptyState from "./EmptyState";

const PALETTE = [
  "#EF4444",
  "#3B82F6",
  "#10B981",
  "#F59E0B",
  "#8B5CF6",
  "#EC4899",
  "#14B8A6",
  "#6366F1",
];

export default function CategoryBreakdown({
  tree,
  expanded,
  onToggle,
  isDark,
}) {
  if (!tree || tree.length === 0) {
    return (
      <EmptyState icon="pie-chart-outline" title="No spending in this period" />
    );
  }

  const pieData = tree.map((c, i) => ({
    value: c.total,
    color: PALETTE[i % PALETTE.length],
    text: `${c.percentage.toFixed(0)}%`,
  }));

  return (
    <View>
      <View className="items-center mb-5">
        <PieChart
          donut
          data={pieData}
          radius={90}
          innerRadius={58}
          innerCircleColor={isDark ? "#27272A" : "#FFFFFF"}
          centerLabelComponent={() => (
            <View className="items-center">
              <Text className="text-[10px] text-gray-400 font-bold uppercase">
                Total
              </Text>
              <Text className="text-base font-black text-gray-900 dark:text-gray-100">
                {formatCurrency(tree.reduce((a, c) => a + c.total, 0))}
              </Text>
            </View>
          )}
        />
      </View>

      {tree.map((cat, i) => {
        const open = expanded === cat.name;
        const color = PALETTE[i % PALETTE.length];
        return (
          <View key={cat.name} className="mb-2">
            <TouchableOpacity
              onPress={() => onToggle(open ? null : cat.name)}
              className="bg-white dark:bg-zinc-800 p-4 rounded-2xl border border-gray-100 dark:border-zinc-700"
            >
              <View className="flex-row items-center justify-between">
                <View className="flex-row items-center flex-1">
                  <View
                    className="w-3 h-3 rounded-full mr-2"
                    style={{ backgroundColor: color }}
                  />
                  <View className="flex-1">
                    <Text className="text-sm font-black text-gray-900 dark:text-gray-100">
                      {cat.name}
                    </Text>
                    <Text className="text-[10px] text-gray-400 font-semibold mt-0.5">
                      {cat.count} {cat.count === 1 ? "txn" : "txns"} •{" "}
                      {cat.percentage.toFixed(1)}%
                    </Text>
                  </View>
                </View>
                <Text className="text-sm font-black text-gray-900 dark:text-gray-100 mr-2">
                  {formatCurrency(cat.total)}
                </Text>
                {cat.subcategories.length > 0 ? (
                  <Ionicons
                    name={open ? "chevron-up" : "chevron-down"}
                    size={14}
                    color="#9CA3AF"
                  />
                ) : null}
              </View>
              <View className="h-1.5 w-full bg-gray-100 dark:bg-zinc-700 rounded-full mt-3 overflow-hidden">
                <View
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.min(cat.percentage, 100)}%`,
                    backgroundColor: color,
                  }}
                />
              </View>
            </TouchableOpacity>

            {open && cat.subcategories.length > 0 && (
              <View className="mt-1 ml-4 bg-white dark:bg-zinc-800 rounded-2xl px-4 py-2 border border-gray-100 dark:border-zinc-700">
                {cat.subcategories.map((sub) => (
                  <View
                    key={sub.name}
                    className="flex-row justify-between items-center py-2"
                  >
                    <Text className="text-xs text-gray-600 dark:text-gray-300 flex-1">
                      {sub.name}
                    </Text>
                    <Text className="text-[10px] text-gray-400 mr-3">
                      {sub.percentage.toFixed(0)}%
                    </Text>
                    <Text className="text-xs font-bold text-gray-900 dark:text-gray-100">
                      {formatCurrency(sub.total)}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}
