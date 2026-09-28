import { HStack, Text, VStack } from "@expo/ui/swift-ui";
import { font, foregroundStyle, padding } from "@expo/ui/swift-ui/modifiers";
import { createWidget } from "expo-widgets";

const SpendingWidget = (props, environment) => {
  "widget";
  const dark = environment.colorScheme === "dark";
  const primary = dark ? "#F4F4F5" : "#111827";
  const secondary = dark ? "#A1A1AA" : "#6B7280";
  const slices = props?.slices ?? [];
  const limit = environment.widgetFamily === "systemSmall" ? 3 : 6;
  const total = Number(props?.total) || 0;
  const totalText =
    total >= 1000 ? `₹${(total / 1000).toFixed(1)}k` : `₹${total.toFixed(0)}`;

  if (slices.length === 0) {
    return (
      <VStack modifiers={[padding({ all: 12 })]}>
        <Text
          modifiers={[
            font({ weight: "bold", size: 14 }),
            foregroundStyle(primary),
          ]}
        >
          Spending
        </Text>
        <Text modifiers={[font({ size: 12 }), foregroundStyle(secondary)]}>
          No expenses this month
        </Text>
      </VStack>
    );
  }

  return (
    <VStack modifiers={[padding({ all: 12 })]}>
      <Text
        modifiers={[
          font({ weight: "bold", size: 14 }),
          foregroundStyle(primary),
        ]}
      >
        {props.monthLabel}
      </Text>
      <Text
        modifiers={[
          font({ weight: "bold", size: 22 }),
          foregroundStyle(primary),
        ]}
      >
        {totalText}
      </Text>
      {slices.slice(0, limit).map((slice) => (
        <HStack key={slice.name}>
          <Text modifiers={[font({ size: 12 }), foregroundStyle(slice.color)]}>
            ●
          </Text>
          <Text modifiers={[font({ size: 12 }), foregroundStyle(primary)]}>
            {slice.name}
          </Text>
          <Text
            modifiers={[
              font({ weight: "bold", size: 12 }),
              foregroundStyle(secondary),
            ]}
          >
            {`${slice.percentage.toFixed(0)}%`}
          </Text>
        </HStack>
      ))}
    </VStack>
  );
};

export default createWidget("SpendingBreakdown", SpendingWidget);
