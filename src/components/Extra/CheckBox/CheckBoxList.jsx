import { View, Text, Pressable } from "react-native";
import React from "react";
import { Ionicons } from "@expo/vector-icons";

/**
 * CheckBoxList Component
 *
 * Props:
 * - options: Array of { label: string, value: any }
 * - values: Array of selected values or can say ID
 * - onChange: (updatedValues: Array) => void
 * - label: string (optional label above the list)
 * - disabled: boolean
 */
const CheckBoxList = ({
	options = [],
	values = [],
	onChange,
	label,
	disabled = false,
}) => {
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

			<View className="overflow-hidden rounded-2xl border border-border bg-card">
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
			</View>
		</View>
	);
};

export default CheckBoxList;
