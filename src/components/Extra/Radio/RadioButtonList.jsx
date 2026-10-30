import { View, Text, Pressable } from "react-native";
import React from "react";

/**
 * RadioButtonList Component
 *
 * Props:
 * - options: Array of { label: string, value: any }
 * - value: currently selected value or can say ID
 * - onChange: (value) => void
 * - label: string (optional label above the list)
 * - disabled: boolean
 */
const RadioButtonList = ({
  options = [],
  value,
  onChange,
  label,
  disabled = false,
}) => {
  const handleSelect = (optValue) => {
    if (disabled) return;
    onChange?.(optValue);
  };

  return (
    <View className="gap-1.5">
      {label && (
        <Text className="text-sm font-semibold text-foreground">{label}</Text>
      )}

      <View className="overflow-hidden rounded-2xl border border-border bg-card">
        {options.map((option, index) => {
          const isSelected = option.value === value;
          const isLast = index === options.length - 1;

          return (
            <Pressable
              key={String(option.value)}
              onPress={() => handleSelect(option.value)}
              disabled={disabled}
              className={`flex-row items-center gap-3 px-4 py-3.5 ${
                !isLast ? "border-b border-border" : ""
              } ${isSelected ? "bg-primary/10" : ""} ${
                disabled ? "opacity-50" : ""
              }`}
            >
              {/* Radio circle */}
              <View
                className={`size-5 items-center justify-center rounded-full border-2 ${
                  isSelected ? "border-primary" : "border-border"
                }`}
              >
                {isSelected && (
                  <View className="size-2.5 rounded-full bg-primary" />
                )}
              </View>

              <Text
                className={`flex-1 text-base ${
                  isSelected
                    ? "font-semibold text-primary"
                    : "text-card-foreground"
                }`}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
};

export default RadioButtonList;
