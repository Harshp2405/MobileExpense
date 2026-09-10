import { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useColorScheme } from "nativewind";
import { useAnalyticsData } from "../../lib/hooks/useAnalyticsData";
import { formatCurrency, formatPct, MONTH_LABELS } from "../../lib/analytics";
import SummaryCard from "../../components/analytics/SummaryCard";
import PeriodSelector from "../../components/analytics/PeriodSelector";
import ComparisonBadge from "../../components/analytics/ComparisonBadge";
import CategoryBreakdown from "../../components/analytics/CategoryBreakdown";
import TrendChart from "../../components/analytics/TrendChart";
import InsightList from "../../components/analytics/InsightList";
import EmptyState from "../../components/analytics/EmptyState";

const Section = ({ title, action, children }) => (
  <View className="mb-7">
    <View className="flex-row justify-between items-center mb-3">
      <Text className="text-lg font-black text-gray-900 dark:text-gray-100">
        {title}
      </Text>
      {action}
    </View>
    {children}
  </View>
);

export default function OverviewScreen() {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";
  const a = useAnalyticsData();
  const [expandedCategory, setExpandedCategory] = useState(null);
  const [trendMode, setTrendMode] = useState("expense");

  if (a.loading) {
    return (
      <SafeAreaView className="flex-1 bg-gray-50 dark:bg-zinc-900 items-center justify-center">
        <ActivityIndicator size="large" color="#2563EB" />
      </SafeAreaView>
    );
  }

  const { summary, behaviour, month, year, savings } = a;

  return (
    <SafeAreaView className="flex-1 bg-gray-50 dark:bg-zinc-900">
      <ScrollView
        contentContainerClassName="p-5"
        showsVerticalScrollIndicator={false}
      >
        <Text className="text-3xl font-black text-gray-900 dark:text-gray-100 mb-1">
          Overview
        </Text>
        <Text className="text-xs text-gray-400 mb-5">{a.periodLabel}</Text>

        <View className="mb-6">
          <PeriodSelector
            value={a.filters.period}
            onChange={(p) => a.updateFilter({ period: p })}
          />
        </View>

        {a.isEmpty ? (
          <EmptyState
            icon="documents-outline"
            title="No transactions found for the selected filters."
            subtitle="Add expenses from the Expenses tab to see analytics here."
          />
        ) : (
          <>
            {/* SUMMARY CARDS */}
            <View className="flex-row flex-wrap gap-3 mb-7">
              <SummaryCard
                label="Income"
                icon="arrow-down-circle-outline"
                value={
                  a.hasIncomeData ? formatCurrency(summary.totalIncome) : "—"
                }
                tone="good"
                footer={a.hasIncomeData ? null : "No income recorded"}
              />
              <SummaryCard
                label="Expenses"
                icon="arrow-up-circle-outline"
                value={formatCurrency(summary.totalExpense)}
                tone="bad"
              />
              <SummaryCard
                label="Net Balance"
                icon="wallet-outline"
                value={a.hasIncomeData ? formatCurrency(summary.savings) : "—"}
                tone={summary.savings >= 0 ? "good" : "bad"}
              />
              <SummaryCard
                label="Savings Rate"
                icon="trending-up-outline"
                value={
                  summary.savingsRate === null
                    ? "—"
                    : `${summary.savingsRate.toFixed(1)}%`
                }
              />
              <SummaryCard
                label="Avg / Day"
                icon="calendar-outline"
                value={formatCurrency(behaviour.avgDaily)}
              />
              <SummaryCard
                label="Transactions"
                icon="receipt-outline"
                value={String(behaviour.transactionCount)}
                footer={`Avg ${formatCurrency(behaviour.avgTransaction)}`}
              />
              <SummaryCard
                label="Top Category"
                icon="pricetag-outline"
                value={behaviour.topCategory?.name || "—"}
                footer={
                  behaviour.topCategory
                    ? formatCurrency(behaviour.topCategory.total)
                    : null
                }
              />
              <SummaryCard
                label="Highest Day"
                icon="flame-outline"
                value={
                  behaviour.highestDay
                    ? formatCurrency(behaviour.highestDay.total)
                    : "—"
                }
                footer={behaviour.highestDay?.key || null}
              />
            </View>

            {/* THIS MONTH vs LAST MONTH */}
            <Section title="This Month">
              <View className="bg-white dark:bg-zinc-800 rounded-3xl p-5 border border-gray-100 dark:border-zinc-700">
                <View className="flex-row justify-between items-center mb-4">
                  <View>
                    <Text className="text-[10px] font-bold text-gray-400 uppercase">
                      Spent
                    </Text>
                    <Text className="text-2xl font-black text-gray-900 dark:text-gray-100">
                      {formatCurrency(month.current.totalExpense)}
                    </Text>
                  </View>
                  <ComparisonBadge changePct={month.expenseChangePct} />
                </View>
                <View className="flex-row justify-between">
                  <Text className="text-[11px] text-gray-400">
                    Last month: {formatCurrency(month.previous.totalExpense)}
                  </Text>
                  <Text className="text-[11px] text-gray-400">
                    Avg/day: {formatCurrency(month.current.avgDailyExpense)}
                  </Text>
                </View>
                {!month.hasBaseline ? (
                  <Text className="text-[10px] text-gray-400 mt-3">
                    No previous month data to compare against yet.
                  </Text>
                ) : null}
              </View>
            </Section>

            {/* SPENDING TREND */}
            <Section title="Spending Trend">
              <View className="bg-white dark:bg-zinc-800 rounded-3xl p-5 border border-gray-100 dark:border-zinc-700">
                <TrendChart
                  series={year.comparison}
                  mode={trendMode}
                  onModeChange={setTrendMode}
                  isDark={isDark}
                  type="bar"
                />
              </View>
            </Section>

            {/* CATEGORY + SUBCATEGORY */}
            <Section title="Categories">
              <CategoryBreakdown
                tree={a.categoryTree}
                expanded={expandedCategory}
                onToggle={setExpandedCategory}
                isDark={isDark}
              />
            </Section>

            {/* TOP EXPENSES */}
            <Section title="Top Expenses">
              {a.topExpenses.length === 0 ? (
                <EmptyState
                  icon="list-outline"
                  title="No expenses in this period"
                />
              ) : (
                a.topExpenses.map((e, i) => (
                  <View
                    key={e.id ?? i}
                    className="flex-row items-center bg-white dark:bg-zinc-800 p-4 rounded-2xl mb-2 border border-gray-100 dark:border-zinc-700"
                  >
                    <View className="w-7 h-7 rounded-full bg-blue-50 dark:bg-blue-900/30 items-center justify-center mr-3">
                      <Text className="text-[11px] font-black text-blue-600">
                        {i + 1}
                      </Text>
                    </View>
                    <View className="flex-1">
                      <Text
                        className="text-sm font-bold text-gray-900 dark:text-gray-100"
                        numberOfLines={1}
                      >
                        {e.title}
                      </Text>
                      <Text className="text-[10px] text-gray-400">
                        {e.category || "Uncategorized"}
                        {e.subcategory ? ` › ${e.subcategory}` : ""} • {e.date}
                      </Text>
                    </View>
                    <Text className="text-sm font-black text-gray-900 dark:text-gray-100">
                      {formatCurrency(e.amount)}
                    </Text>
                  </View>
                ))
              )}
            </Section>

            {/* PAYMENT METHOD ("accounts") */}
            <Section title="By Payment Method">
              {a.methods.map((m) => (
                <View
                  key={m.name}
                  className="flex-row justify-between items-center bg-white dark:bg-zinc-800 p-4 rounded-2xl mb-2 border border-gray-100 dark:border-zinc-700"
                >
                  <View>
                    <Text className="text-sm font-bold text-gray-900 dark:text-gray-100">
                      {m.name}
                    </Text>
                    <Text className="text-[10px] text-gray-400">
                      {m.count} transactions
                    </Text>
                  </View>
                  <View className="items-end">
                    <Text className="text-sm font-black text-red-500">
                      -{formatCurrency(m.spent)}
                    </Text>
                    {m.earned > 0 ? (
                      <Text className="text-[10px] font-bold text-green-500">
                        +{formatCurrency(m.earned)}
                      </Text>
                    ) : null}
                  </View>
                </View>
              ))}
            </Section>

            {/* INSIGHTS */}
            <Section title="Insights">
              <InsightList insights={a.insights} />
            </Section>

            {/* YEARLY */}
            <Section title={`Year ${year.year}`}>
              <View className="bg-white dark:bg-zinc-800 rounded-3xl p-5 border border-gray-100 dark:border-zinc-700">
                <View className="flex-row flex-wrap gap-y-4 mb-4">
                  {[
                    ["Total Expense", formatCurrency(year.totalExpense)],
                    [
                      "Total Income",
                      a.hasIncomeData ? formatCurrency(year.totalIncome) : "—",
                    ],
                    [
                      "Savings",
                      a.hasIncomeData ? formatCurrency(year.totalSavings) : "—",
                    ],
                    ["Avg / Month", formatCurrency(year.avgMonthlyExpense)],
                    [
                      "Highest Month",
                      year.highestMonth
                        ? `${year.highestMonth.label} · ${formatCurrency(year.highestMonth.total)}`
                        : "—",
                    ],
                    [
                      "Lowest Month",
                      year.lowestMonth
                        ? `${year.lowestMonth.label} · ${formatCurrency(year.lowestMonth.total)}`
                        : "—",
                    ],
                    [
                      "Best Savings",
                      savings.best
                        ? `${savings.best.label} · ${formatCurrency(savings.best.savings)}`
                        : "—",
                    ],
                    ["Transactions", String(year.transactionCount)],
                  ].map(([label, value]) => (
                    <View key={label} className="w-1/2">
                      <Text className="text-[10px] font-bold text-gray-400 uppercase">
                        {label}
                      </Text>
                      <Text
                        className="text-sm font-black text-gray-900 dark:text-gray-100"
                        numberOfLines={1}
                      >
                        {value}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            </Section>
          </>
        )}
        <View className="h-10" />
      </ScrollView>
    </SafeAreaView>
  );
}
