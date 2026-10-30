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
const DropDown = ({
	options = [],
	value,
	onChange,
	placeholder = "Select an option",
	label,
	disabled = false,
}) => {
	const [open, setOpen] = useState(false);

	const selectedOption = options.find((opt) => opt.value === value);

	const handleSelect = (option) => {
		onChange?.(option.value);
		setOpen(false);
	};

	return (
		<View className="gap-1.5">
			{label && (
				<Text className="text-sm font-semibold text-foreground">{label}</Text>
			)}

			{/* Trigger */}
			<Pressable
				onPress={() => !disabled && setOpen((prev) => !prev)}
				className={`flex-row items-center justify-between rounded-2xl border border-border bg-card px-4 py-3 ${
					disabled ? "opacity-50" : ""
				}`}>
				<View className="flex-row items-center gap-3">
					{selectedOption?.image && (
						<Image
							source={{ uri: selectedOption.image }}
							className="size-8 rounded-full bg-muted"
						/>
					)}
					<Text
						className={`text-base ${
							selectedOption ? "text-card-foreground" : "text-muted-foreground"
						}`}>
						{selectedOption ? selectedOption.label : placeholder}
					</Text>
				</View>
				<Ionicons
					name={open ? "chevron-up" : "chevron-down"}
					size={18}
					className="text-muted-foreground"
				/>
			</Pressable>

			{/* Inline dropdown list */}
			{open && (
				<View className="overflow-hidden rounded-2xl border border-border bg-card">
					<ScrollView
						style={{ maxHeight: 240 }}
						nestedScrollEnabled
						showsVerticalScrollIndicator={false}>
						{options.map((item, index) => {
							const isSelected = item.value === value;
							const isLast = index === options.length - 1;
							return (
								<Pressable
									key={String(item.value)}
									onPress={() => handleSelect(item)}
									className={`flex-row items-center gap-3 px-4 py-3 ${
										!isLast ? "border-b border-border" : ""
									} ${isSelected ? "bg-primary/10" : ""}`}>
									{item.image && (
										<Image
											source={{ uri: item.image }}
											className="size-8 rounded-full bg-muted"
										/>
									)}
									<Text
										className={`flex-1 text-base ${
											isSelected
												? "font-semibold text-primary"
												: "text-card-foreground"
										}`}>
										{item.label}
									</Text>
									{isSelected && (
										<Ionicons
											name="checkmark"
											size={18}
											className="text-primary"
										/>
									)}
								</Pressable>
							);
						})}
					</ScrollView>
				</View>
			)}
		</View>
	);
};

export default DropDown;

