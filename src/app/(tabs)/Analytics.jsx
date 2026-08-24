import React, { useState, useCallback } from "react";
import {
	View,
	Text,
	ScrollView,
	TouchableOpacity,
	ActivityIndicator,
	Dimensions,
	Modal,
	FlatList,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { PieChart, BarChart } from "react-native-gifted-charts";
import { getExpensesByMonth, getCategories } from "../../lib/db/queries";
import { useColorScheme } from "nativewind";

const screenWidth = Dimensions.Dimensions?.get
	? Dimensions.Dimensions.get("window").width
	: Dimensions.get("window").width;

const MONTHS = [
	"January",
	"February",
	"March",
	"April",
	"May",
	"June",
	"July",
	"August",
	"September",
	"October",
	"November",
	"December",
];

const YEARS = Array.from({ length: 101 }, (_, i) => 2010 + i);

const CATEGORY_COLORS = {
	Food: "#EF4444",
	Groceries: "#10B981",
	Transport: "#3B82F6",
	Shopping: "#F59E0B",
	Entertainment: "#8B5CF6",
	Bills: "#14B8A6",
	General: "#6B7280",
};

const METHOD_COLORS = {
	Cash: "#10B981",
	Card: "#3B82F6",
	UPI: "#8B5CF6",
	Other: "#6B7280",
};

export default function AnalyticsScreen() {
	const { colorScheme } = useColorScheme();
	const isDark = colorScheme === "dark";
	const [loading, setLoading] = useState(true);
	const [expenses, setExpenses] = useState([]);
	const [categories, setCategories] = useState([]);

	// Filter Selector State
	const now = new Date();
	const [selectedMonth, setSelectedMonth] = useState(now.getMonth()); // 0-11
	const [selectedYear, setSelectedYear] = useState(now.getFullYear()); // 2010-2110
	const [monthPickerVisible, setMonthPickerVisible] = useState(false);
	const [yearPickerVisible, setYearPickerVisible] = useState(false);

	const monthKey = `${selectedYear}-${String(selectedMonth + 1).padStart(2, "0")}`;

	const loadData = async () => {
		try {
			setLoading(true);
			const expenseData = await getExpensesByMonth(monthKey);
			setExpenses(expenseData || []);

			const catData = await getCategories();
			setCategories(catData || []);
		} catch (error) {
			console.error("Failed to load analytics data", error);
		} finally {
			setLoading(false);
		}
	};

	useFocusEffect(
		useCallback(() => {
			loadData();
		}, [monthKey])
	);

	// ----------------------------------------------------
	// DATA PROCESSING
	// ----------------------------------------------------

	// Calculate totals and limits
	const totalSpent = expenses.reduce((sum, e) => sum + Number(e.amount), 0);

	// 1. Category aggregation
	const categoryTotals = {};
	expenses.forEach((e) => {
		const cat = e.category || "General";
		categoryTotals[cat] = (categoryTotals[cat] || 0) + Number(e.amount);
	});

	const categoryData = Object.entries(categoryTotals)
		.map(([name, amount]) => {
			// Find color from database categories or standard color map
			const dbCat = categories.find(
				(c) => c.name.toLowerCase() === name.toLowerCase(),
			);
			const color = dbCat?.color || CATEGORY_COLORS[name] || "#6B7280";
			return {
				name,
				value: amount,
				color,
				percentage: totalSpent > 0 ? (amount / totalSpent) * 100 : 0,
			};
		})
		.sort((a, b) => b.value - a.value);

	// Format data for PieChart
	const pieData = categoryData.map((item) => ({
		value: item.value,
		name: item.name,
		color: item.color,
		text: `${item.percentage.toFixed(0)}%`,
	}));

	// 2. Method aggregation
	const methodTotals = { Cash: 0, Card: 0, UPI: 0, Other: 0 };
	expenses.forEach((e) => {
		const method = e.method || "Cash";
		if (methodTotals[method] !== undefined) {
			methodTotals[method] += Number(e.amount);
		} else {
			methodTotals["Other"] += Number(e.amount);
		}
	});

	const methodData = Object.entries(methodTotals).map(([label, value]) => ({
		value,
		label,
		frontColor: METHOD_COLORS[label] || "#6B7280",
	}));

	// Find most expensive category
	const topCategory = categoryData[0] || null;

	return (
		<SafeAreaView className="flex-1 bg-gray-50 dark:bg-zinc-900" 
		//edges={["top"]}
		>
			{/* HEADER SECTION */}
			<View className="bg-white dark:bg-zinc-800 px-6 pt-4 pb-5 border-b border-gray-100 dark:border-zinc-700 shadow-sm flex-row justify-between items-center">
				<View>
					<Text className="text-2xl font-black text-gray-900 dark:text-gray-100 tracking-tight">
						Analytics
					</Text>
					<Text className="text-xs font-semibold text-gray-400 dark:text-gray-500 mt-0.5">
						Visualize your spending habits
					</Text>
				</View>

				{/* Dynamic Month/Year Selectors */}
				<View className="flex-row gap-2">
					<TouchableOpacity
						onPress={() => setMonthPickerVisible(true)}
						className="flex-row items-center bg-gray-50 dark:bg-zinc-700 px-3 py-2 rounded-xl border border-gray-100 dark:border-zinc-600 shadow-sm">
						<Text className="text-xs font-bold text-gray-700 dark:text-gray-300 mr-1.5">
							{MONTHS[selectedMonth].substring(0, 3)}
						</Text>
						<Ionicons name="chevron-down" size={12} color={isDark ? '#9CA3AF' : '#4B5563'} />
					</TouchableOpacity>

					<TouchableOpacity
						onPress={() => setYearPickerVisible(true)}
						className="flex-row items-center bg-gray-50 dark:bg-zinc-700 px-3 py-2 rounded-xl border border-gray-100 dark:border-zinc-600 shadow-sm">
						<Text className="text-xs font-bold text-gray-700 dark:text-gray-300 mr-1.5">
							{selectedYear}
						</Text>
						<Ionicons name="chevron-down" size={12} color={isDark ? '#9CA3AF' : '#4B5563'} />
					</TouchableOpacity>
				</View>
			</View>

			{loading ? (
				<View className="flex-1 items-center justify-center">
					<ActivityIndicator size="large" color="#2563EB" />
					<Text className="text-gray-400 font-medium mt-3">
						Loading stats...
					</Text>
				</View>
			) : expenses.length === 0 ? (
				<View className="flex-1 items-center justify-center px-8">
					<View className="w-20 h-20 bg-blue-50 dark:bg-blue-900/30 rounded-full items-center justify-center mb-5">
						<Ionicons name="bar-chart-outline" size={40} color="#2563EB" />
					</View>
					<Text className="text-xl font-bold text-gray-900 dark:text-gray-100 text-center mb-2">
						No Expense Records
					</Text>
					<Text className="text-sm font-medium text-gray-400 dark:text-gray-500 text-center leading-relaxed">
						There are no expenses logged for {MONTHS[selectedMonth]}{" "}
						{selectedYear} yet. Log some expenses to view insights!
					</Text>
				</View>
			) : (
				<ScrollView
					showsVerticalScrollIndicator={false}
					contentContainerStyle={{ paddingBottom: 40 }}>
					{/* TOTAL SPENT BANNER */}
					<View className="px-6 pt-5">
						<LinearGradient
							colors={["#2563EB", "#1D4ED8"]}
							start={{ x: 0, y: 0 }}
							end={{ x: 1, y: 1 }}
							className="p-6 rounded-3xl shadow-md flex-row justify-between items-center">
							<View>
								<Text className="text-white/80 text-xs font-bold uppercase tracking-wider mb-1">
									Total Month Spend
								</Text>
								<Text className="text-white text-3xl font-black">
									₹{totalSpent.toFixed(2)}
								</Text>
							</View>
							<View className="bg-white/10 p-3 rounded-full">
								<Ionicons name="wallet-outline" size={28} color="white" />
							</View>
						</LinearGradient>
					</View>

					{/* INSIGHT MINI-CARDS */}
					{topCategory && (
						<View className="px-6 pt-4 flex-row gap-4">
							<View className="flex-1 bg-white dark:bg-zinc-800 p-4 rounded-2xl border border-gray-100 dark:border-zinc-700 shadow-sm flex-row items-center">
								<View className="w-10 h-10 rounded-full items-center justify-center mr-3 bg-red-50 dark:bg-red-900/30">
									<Ionicons
										name="trending-up-outline"
										size={20}
										color="#EF4444"
									/>
								</View>
								<View className="flex-1">
									<Text className="text-gray-400 dark:text-gray-500 text-[10px] font-bold uppercase tracking-wider">
										Highest Area
									</Text>
									<Text className="text-gray-900 dark:text-gray-100 text-sm font-black truncate">
										{topCategory.name}
									</Text>
									<Text className="text-gray-500 dark:text-gray-400 text-xs font-bold">
										₹{topCategory.value.toFixed(0)} (
										{topCategory.percentage.toFixed(0)}%)
									</Text>
								</View>
							</View>
						</View>
					)}
					<View className="flex-1 flex-col">
						{/* CATEGORY BREAKDOWN CHART */}
						<View className="px-6 pt-5">
							<View className="bg-white dark:bg-zinc-800 p-6 rounded-3xl border border-gray-100 dark:border-zinc-700 shadow-sm">
								<Text className="text-base font-black text-gray-900 dark:text-gray-100 mb-5">
									Category Breakdown
								</Text>

								<View className="items-center justify-center my-2">
									<PieChart
										data={pieData}
										donut
										focusOnPress
										radius={screenWidth * 0.27}
										innerRadius={screenWidth * 0.17}
										showText
										textColor="white"
										textSize={12}
										fontWeight="bold"
										centerLabelComponent={() => (
											<View className="items-center justify-center">
												<Text className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
													Total
												</Text>
												<Text className="text-lg font-black text-gray-900">
													₹
													{totalSpent > 1000
														? `${(totalSpent / 1000).toFixed(1)}k`
														: totalSpent.toFixed(0)}
												</Text>
											</View>
										)}
									/>
								</View>

								{/* Legends */}
								<View className="mt-5 space-y-3">
									{categoryData.map((item, index) => (
										<View
											key={index}
											className="flex-row justify-between items-center">
											<View className="flex-row items-center flex-1">
												<View
													className="w-3.5 h-3.5 rounded-full mr-2.5"
													style={{ backgroundColor: item.color }}
												/>
												<Text className="text-sm font-semibold text-gray-700 dark:text-gray-300">

													{item.name}
												</Text>
											</View>
											<View className="items-end">
												<Text className="text-sm font-black text-gray-900 dark:text-gray-100">

													₹{item.value.toFixed(2)}
												</Text>
												<Text className="text-[10px] font-bold text-gray-400">
													{item.percentage.toFixed(1)}%
												</Text>
											</View>
										</View>
									))}
								</View>
							</View>
						</View>
						{/* <View className="flex-1 flex-col"> */}
						{/* PAYMENT METHOD WISE CHART */}
						<View className="px-6 pt-5">
							<View className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
								<Text className="text-base font-black text-gray-900 mb-5">
									Payment Methods
								</Text>

								<View className="items-center justify-center mt-2">
									<BarChart
										data={methodData}
										barWidth={24}
										spacing={30}
										noOfSections={4}
										barBorderRadius={6}
										yAxisThickness={0}
										xAxisThickness={1}
										xAxisColor="#E5E7EB"
										yAxisTextStyle={{
											color: "#9CA3AF",
											fontSize: 10,
											fontWeight: "bold",
										}}
										xAxisLabelTextStyle={{
											color: "#4B5563",
											fontSize: 10,
											fontWeight: "bold",
										}}
										height={150}
										width={screenWidth * 0.65}
									/>
								</View>

								{/* Method Detail Listing */}
								<View className="mt-6 flex-row flex-wrap justify-between gap-y-3">
									{methodData.map((item, index) => (
										<View
											key={index}
											className="w-[47%] bg-gray-50 p-3 rounded-2xl border border-gray-100 flex-row items-center">
											<View
												className="w-3 h-3 rounded-full mr-2"
												style={{ backgroundColor: item.frontColor }}
											/>
											<View>
												<Text className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
													{item.label}
												</Text>
												<Text className="text-sm font-black text-gray-900">
													₹{item.value.toFixed(0)}
												</Text>
											</View>
										</View>
									))}
								</View>
							</View>
						</View>
						{/* </View> */}
					</View>
				</ScrollView>
			)}

			{/* MONTH PICKER MODAL */}
			<Modal visible={monthPickerVisible} animationType="slide" transparent>
				<View className="flex-1 justify-end bg-black/40">
					<View className="bg-white rounded-t-3xl p-6 h-[400px]">
						<View className="flex-row justify-between items-center mb-6">
							<Text className="text-xl font-bold text-gray-900">
								Select Month
							</Text>
							<TouchableOpacity onPress={() => setMonthPickerVisible(false)}>
								<Ionicons name="close" size={24} color="#6B7280" />
							</TouchableOpacity>
						</View>

						<FlatList
							data={MONTHS}
							keyExtractor={(item) => item}
							showsVerticalScrollIndicator={false}
							renderItem={({ item, index }) => (
								<TouchableOpacity
									onPress={() => {
										setSelectedMonth(index);
										setMonthPickerVisible(false);
									}}
									className={`p-4 rounded-xl items-center mb-2 border ${selectedMonth === index
											? "bg-blue-600 border-blue-600"
											: "bg-gray-50 border-gray-100"
										}`}>
									<Text
										className={`font-bold ${selectedMonth === index ? "text-white" : "text-gray-700"
											}`}>
										{item}
									</Text>
								</TouchableOpacity>
							)}
						/>
					</View>
				</View>
			</Modal>

			{/* YEAR PICKER MODAL */}
			<Modal visible={yearPickerVisible} animationType="slide" transparent>
				<View className="flex-1 justify-end bg-black/40">
					<View className="bg-white rounded-t-3xl p-6 h-[400px]">
						<View className="flex-row justify-between items-center mb-6">
							<Text className="text-xl font-bold text-gray-900">
								Select Year
							</Text>
							<TouchableOpacity onPress={() => setYearPickerVisible(false)}>
								<Ionicons name="close" size={24} color="#6B7280" />
							</TouchableOpacity>
						</View>

						<FlatList
							data={YEARS}
							keyExtractor={(item) => item.toString()}
							showsVerticalScrollIndicator={false}
							renderItem={({ item }) => (
								<TouchableOpacity
									onPress={() => {
										setSelectedYear(item);
										setYearPickerVisible(false);
									}}
									className={`p-4 rounded-xl items-center mb-2 border ${selectedYear === item
											? "bg-blue-600 border-blue-600"
											: "bg-gray-50 border-gray-100"
										}`}>
									<Text
										className={`font-bold ${selectedYear === item ? "text-white" : "text-gray-700"
											}`}>
										{item}
									</Text>
								</TouchableOpacity>
							)}
						/>
					</View>
				</View>
			</Modal>
		</SafeAreaView>
	);
}
