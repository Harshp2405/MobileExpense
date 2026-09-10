import { View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { formatPct } from "../../lib/analytics";

// invertColors: for expenses an increase is "bad"; for income/savings an increase is "good".
export default function ComparisonBadge({ changePct, invertColors = true }) {
  if (changePct === null || changePct === undefined) {
    return <Text className="text-[10px] text-gray-400">No prior data</Text>;
  }
  const up = changePct > 0;
  const good = invertColors ? !up : up;
  return (
    <View
      className={`flex-row items-center px-2 py-1 rounded-full ${good ? "bg-green-50 dark:bg-green-900/30" : "bg-red-50 dark:bg-red-900/30"}`}
    >
      <Ionicons
        name={up ? "arrow-up" : "arrow-down"}
        size={11}
        color={good ? "#10B981" : "#EF4444"}
      />
      <Text
        className={`text-[10px] font-bold ml-0.5 ${good ? "text-green-600" : "text-red-600"}`}
      >
        {formatPct(changePct)}
      </Text>
    </View>
  );
}
