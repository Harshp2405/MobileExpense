import { useState, useMemo } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAnalyticsData } from "../../lib/hooks/useAnalyticsData";
import { formatCurrency } from "../../lib/analytics";
import PeriodSelector from "../../components/analytics/PeriodSelector";
import EmptyState from "../../components/analytics/EmptyState";

const TYPES = ["all", "expense", "income"];

export default function TransactionsScreen() {
  const a = useAnalyticsData();
  const [type, setType] = useState("all");
  const [search, setSearch] = useState("");

  // Merge expenses + income into one normalized, searchable, sorted list.
  const rows = useMemo(() => {
    const expenses = a.expenses.map((e) => ({ ...e, _type: "expense" }));
    const incomes = a.incomes.map((i) => ({
      ...i,
      _type: "income",
      category: i.source || "Income",
    }));
    let all =
      type === "expense"
        ? expenses
        : type === "income"
          ? incomes
          : [...expenses, ...incomes];

    const q = search.trim().toLowerCase();
    if (q) {
      all = all.filter((t) =>
        [t.title, t.category, t.subcategory, t.method, t.description]
          .filter(Boolean)
          .some((f) => String(f).toLowerCase().includes(q)),
      );
    }
    return all.sort((x, y) => new Date(y.createdAt) - new Date(x.createdAt));
  }, [a.expenses, a.incomes, type, search]);

  const totals = useMemo(() => {
    const inc = rows
      .filter((r) => r._type === "income")
      .reduce((s, r) => s + Number(r.amount || 0), 0);
    const exp = rows
      .filter((r) => r._type === "expense")
      .reduce((s, r) => s + Number(r.amount || 0), 0);
    return { inc, exp, net: inc - exp };
  }, [rows]);

  const categoryChips = useMemo(
    () => a.categories.map((c) => c.name),
    [a.categories],
  );
  const subChips = useMemo(() => {
    if (!a.filters.category) return [];
    return (
      a.categoryTree.find((c) => c.name === a.filters.category)
        ?.subcategories || []
    ).map((s) => s.name);
  }, [a.categoryTree, a.filters.category]);

  if (a.loading) {
    return (
      <SafeAreaView className="flex-1 bg-gray-50 dark:bg-zinc-900 items-center justify-center">
        <ActivityIndicator size="large" color="#2563EB" />
      </SafeAreaView>
    );
  }

  const Chip = ({ label, active, onPress }) => (
    <TouchableOpacity
      onPress={onPress}
      className={`px-3 py-1.5 rounded-full border ${active ? "bg-blue-600 border-blue-600" : "bg-white dark:bg-zinc-800 border-gray-200 dark:border-zinc-700"}`}
    >
      <Text
        className={`text-[11px] font-bold ${active ? "text-white" : "text-gray-600 dark:text-gray-300"}`}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView className="flex-1 bg-gray-50 dark:bg-zinc-900">
      <FlatList
        data={rows}
        contentContainerClassName="p-5"
        keyExtractor={(item) => `${item._type}-${item.id}`}
        ListHeaderComponent={
          <View className="mb-4">
            <Text className="text-3xl font-black text-gray-900 dark:text-gray-100 mb-4">
              Transactions
            </Text>

            <View className="flex-row items-center bg-white dark:bg-zinc-800 rounded-2xl px-4 py-1 border border-gray-200 dark:border-zinc-700 mb-4">
              <Ionicons name="search-outline" size={16} color="#9CA3AF" />
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="Search title, category, method..."
                placeholderTextColor="#9CA3AF"
                className="flex-1 ml-2 py-2.5 text-sm text-gray-900 dark:text-gray-100"
              />
              {search ? (
                <TouchableOpacity onPress={() => setSearch("")}>
                  <Ionicons name="close-circle" size={16} color="#9CA3AF" />
                </TouchableOpacity>
              ) : null}
            </View>

            <View className="mb-3">
              <PeriodSelector
                value={a.filters.period}
                onChange={(p) => a.updateFilter({ period: p })}
              />
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              className="mb-3"
            >
              <View className="flex-row gap-2">
                {TYPES.map((t) => (
                  <Chip
                    key={t}
                    label={
                      t === "all"
                        ? "All"
                        : t === "expense"
                          ? "Expenses"
                          : "Income"
                    }
                    active={type === t}
                    onPress={() => setType(t)}
                  />
                ))}
              </View>
            </ScrollView>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              className="mb-2"
            >
              <View className="flex-row gap-2">
                <Chip
                  label="All Categories"
                  active={!a.filters.category}
                  onPress={() => a.updateFilter({ category: null })}
                />
                {categoryChips.map((c) => (
                  <Chip
                    key={c}
                    label={c}
                    active={a.filters.category === c}
                    onPress={() => a.updateFilter({ category: c })}
                  />
                ))}
              </View>
            </ScrollView>

            {subChips.length > 0 ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                className="mb-2"
              >
                <View className="flex-row gap-2">
                  <Chip
                    label="All Subcategories"
                    active={!a.filters.subcategory}
                    onPress={() => a.updateFilter({ subcategory: null })}
                  />
                  {subChips.map((s) => (
                    <Chip
                      key={s}
                      label={s}
                      active={a.filters.subcategory === s}
                      onPress={() => a.updateFilter({ subcategory: s })}
                    />
                  ))}
                </View>
              </ScrollView>
            ) : null}

            <View className="flex-row justify-between bg-white dark:bg-zinc-800 rounded-2xl p-4 border border-gray-100 dark:border-zinc-700 mt-3">
              <View>
                <Text className="text-[10px] font-bold text-gray-400 uppercase">
                  Income
                </Text>
                <Text className="text-sm font-black text-green-500">
                  {formatCurrency(totals.inc)}
                </Text>
              </View>
              <View>
                <Text className="text-[10px] font-bold text-gray-400 uppercase">
                  Expense
                </Text>
                <Text className="text-sm font-black text-red-500">
                  {formatCurrency(totals.exp)}
                </Text>
              </View>
              <View>
                <Text className="text-[10px] font-bold text-gray-400 uppercase">
                  Net
                </Text>
                <Text
                  className={`text-sm font-black ${totals.net >= 0 ? "text-green-500" : "text-red-500"}`}
                >
                  {formatCurrency(totals.net)}
                </Text>
              </View>
            </View>
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            icon="receipt-outline"
            title="No transactions found for the selected filters."
            subtitle="Try a different period, category or search term."
          />
        }
        renderItem={({ item }) => {
          const isIncome = item._type === "income";
          return (
            <View className="flex-row items-center bg-white dark:bg-zinc-800 p-4 rounded-2xl mb-2 border border-gray-100 dark:border-zinc-700">
              <View
                className={`w-10 h-10 rounded-full items-center justify-center mr-3 ${isIncome ? "bg-green-50 dark:bg-green-900/30" : "bg-red-50 dark:bg-red-900/30"}`}
              >
                <Ionicons
                  name={isIncome ? "arrow-down-outline" : "arrow-up-outline"}
                  size={18}
                  color={isIncome ? "#10B981" : "#EF4444"}
                />
              </View>
              <View className="flex-1">
                <Text
                  className="text-sm font-bold text-gray-900 dark:text-gray-100"
                  numberOfLines={1}
                >
                  {item.title}
                </Text>
                <Text className="text-[10px] text-gray-400" numberOfLines={1}>
                  {item.method || "Other"} • {item.category || "Uncategorized"}
                  {item.subcategory ? ` › ${item.subcategory}` : ""} •{" "}
                  {item.date}
                </Text>
              </View>
              <Text
                className={`text-sm font-black ${isIncome ? "text-green-500" : "text-gray-900 dark:text-gray-100"}`}
              >
                {isIncome ? "+" : "-"}
                {formatCurrency(item.amount)}
              </Text>
            </View>
          );
        }}
      />
    </SafeAreaView>
  );
}
