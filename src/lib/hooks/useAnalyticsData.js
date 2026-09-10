import { useState, useCallback, useMemo } from "react";
import { useFocusEffect } from "expo-router";
import { getAllExpenses, getAllIncome } from "../db/queries";
import {
  resolvePeriod,
  filterByPeriod,
  monthKey,
  applyCategoryFilter,
  categoryBreakdown,
  categoryTree,
  monthComparison,
  categoryMonthComparison,
  yearStats,
  savingsStats,
  savingsBreakdown,
  behaviourStats,
  buildInsights,
  topExpenses,
  methodBreakdown,
  dailySeries,
} from "../analytics";

const DEFAULT_FILTERS = {
  period: "month",
  custom: { start: null, end: null },
  category: null,
  subcategory: null,
  method: null,
  year: String(new Date().getFullYear()),
};

export const useAnalyticsData = () => {
  const [raw, setRaw] = useState({ expenses: [], incomes: [] });
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [expenses, incomes] = await Promise.all([
        getAllExpenses(),
        getAllIncome(),
      ]);
      setRaw({ expenses: expenses || [], incomes: incomes || [] });
    } catch (e) {
      console.error("Failed to load analytics data", e);
      setRaw({ expenses: [], incomes: [] });
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const updateFilter = useCallback(
    (patch) =>
      setFilters((prev) => {
        const next = { ...prev, ...patch };
        // Changing category invalidates any subcategory selection from the old parent.
        if (patch.category !== undefined && patch.category !== prev.category) {
          next.subcategory = null;
        }
        return next;
      }),
    [],
  );

  const resetFilters = useCallback(() => setFilters(DEFAULT_FILTERS), []);

  const derived = useMemo(() => {
    const now = new Date();
    const { start, end, label } = resolvePeriod(
      filters.period,
      now,
      filters.custom,
    );

    const applyAll = (txns) => {
      let out = filterByPeriod(txns, filters.period, now, filters.custom);
      out = applyCategoryFilter(out, filters);
      if (filters.method)
        out = out.filter((t) => (t.method || "Other") === filters.method);
      return out;
    };

    const expenses = applyAll(raw.expenses);
    // Income has no category/subcategory — only period + method filters apply.
    let incomes = filterByPeriod(
      raw.incomes,
      filters.period,
      now,
      filters.custom,
    );
    if (filters.method)
      incomes = incomes.filter((t) => (t.method || "Other") === filters.method);

    const currentMonth = monthKey(now);
    const behaviour = behaviourStats(expenses, start, end);
    const catComparisons = categoryMonthComparison(raw.expenses, currentMonth);
    const year = yearStats(raw.expenses, raw.incomes, filters.year);

    return {
      periodLabel: label,
      periodStart: start,
      periodEnd: end,
      expenses,
      incomes,
      isEmpty: expenses.length === 0 && incomes.length === 0,
      hasIncomeData: raw.incomes.length > 0,
      summary: savingsStats(expenses, incomes),
      behaviour,
      insights: buildInsights(behaviour, catComparisons),
      categories: categoryBreakdown(expenses),
      categoryTree: categoryTree(expenses),
      topExpenses: topExpenses(expenses, 5),
      methods: methodBreakdown(expenses, incomes),
      daily: dailySeries(expenses),
      month: monthComparison(raw.expenses, raw.incomes, currentMonth),
      categoryComparisons: catComparisons,
      year,
      savings: savingsBreakdown(year.comparison),
    };
  }, [raw, filters]);

  return {
    loading,
    filters,
    updateFilter,
    resetFilters,
    reload: load,
    ...derived,
  };
};
