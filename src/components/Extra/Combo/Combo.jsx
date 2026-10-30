import { View, Text, Pressable, ScrollView, Image } from "react-native";
import React, { useState } from "react";
import { Ionicons } from "@expo/vector-icons";

/**
 * DropDown Component
 *
 * Props:
 * - label: string (optional label above the dropdown)
 * - options: Array of { label: string, value: any, image?: string (url) }
 * - value: currently selected value or can say ID
 * - onChange: (value) => void
 * - placeholder: string (default: "Select an option")
 * - disabled: boolean
 */
const Combo = ({
    options = [],
    values = [],
    onChange,
    placeholder = "Select options",
    label,
    disabled = false,
}) => {
    const [open, setOpen] = useState(false);

    const selectedOptions = options.filter((o) => values.includes(o.value));
    const triggerLabel =
        selectedOptions.length === 0
            ? placeholder
            : selectedOptions.length === 1
            ? selectedOptions[0].label
            : `${selectedOptions.length} selected`;

    const toggle = (value) => {
        if (disabled) return;
        const isSelected = values.includes(value);
        const updated = isSelected
            ? values.filter((v) => v !== value)
            : [...values, value];
        onChange?.(updated);
    };

    return (
        <View className="gap-1.5">
            {label && (
                <Text className="text-sm font-semibold text-foreground">{label}</Text>
            )}

            {/* Trigger */}
            <Pressable
                onPress={() => !disabled && setOpen((prev) => !prev)}
                className={`flex-row items-center justify-between rounded-2xl border border-border bg-card px-4 py-3 ${disabled ? "opacity-50" : ""
                    }`}
            >
                <View className="flex-row items-center gap-2 flex-1">
                    {selectedOptions.slice(0, 3).map((opt) =>
                        opt.image ? (
                            <Image
                                key={String(opt.value)}
                                source={{ uri: opt.image }}
                                className="size-7 rounded-full bg-muted"
                            />
                        ) : null,
                    )}
                    <Text
                        className={`text-base ${selectedOptions.length > 0 ? "text-card-foreground" : "text-muted-foreground"}`}
                    >
                        {triggerLabel}
                    </Text>
                </View>
                <Ionicons
                    name={open ? "chevron-up" : "chevron-down"}
                    size={18}
                    className="text-muted-foreground"
                />
            </Pressable>

            {/* Inline Combo list */}
            {open && (
                <View className="overflow-hidden rounded-2xl border border-border bg-card">
                    <ScrollView style={{ maxHeight: 260 }} nestedScrollEnabled showsVerticalScrollIndicator={false}>
                                {options.map((option, index) => {
                                    const isSelected = values.includes(option.value);
                                    const isLast = index === options.length - 1;
                
                                    return (
                                        <Pressable
                                            key={String(option.value)}
                                            onPress={() => toggle(option.value)}
                                            disabled={disabled}
                                            className={`flex-row items-center gap-3 px-4 py-3.5 ${
                                                !isLast ? "border-b border-border" : ""
                                            } ${isSelected ? "bg-primary/10" : ""} ${
                                                disabled ? "opacity-50" : ""
                                            }`}>
                                            {/* Checkbox box */}
                                            <View
                                                className={`size-5 items-center justify-center rounded-md border-2 ${
                                                    isSelected
                                                        ? "border-primary bg-primary"
                                                        : "border-border bg-background"
                                                }`}>
                                                {isSelected && (
                                                    <Ionicons name="checkmark" size={13} color="white" />
                                                )}
                                            </View>
                
                                            <Text
                                                className={`flex-1 text-base ${
                                                    isSelected
                                                        ? "font-semibold text-primary"
                                                        : "text-card-foreground"
                                                }`}>
                                                {option.label}
                                            </Text>
                                        </Pressable>
                                    );
                                })}
                    </ScrollView>

                    {/* Footer */}
                    <View className="flex-row items-center justify-between border-t border-border px-4 py-3">
                        <Text className="text-sm text-muted-foreground">
                            {values.length} of {options.length} selected
                        </Text>
                        <Pressable
                            onPress={() => setOpen(false)}
                            className="rounded-xl bg-primary px-4 py-1.5">
                            <Text className="text-sm font-semibold text-primary-foreground">Done</Text>
                        </Pressable>
                    </View>
                </View>
            )}
        </View>
    );
};

export default Combo;
