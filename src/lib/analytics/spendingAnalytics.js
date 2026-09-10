import {
  sum,
  average,
  groupBy,
  safeDiv,
  formatCurrency,
} from "./calculations";
import { toDate, dayKey, daysBetween } from "./dateFilters";
import { categoryBreakdown, subcategoryBreakdown } from "./categoryAnalytics";

export const dailySeries = (expenses) => {
  const map = {};
  expenses.forEach((e) => {
    const d = toDate(e);
    if (!d) return;
    const k = dayKey(d);
    if (!map[k])
      map[k] = { key: k, label: String(d.getDate()), total: 0, count: 0 };
    map[k].total += Number(e.amount) || 0;
    map[k].count += 1;
  });
  return Object.values(map).sort((a, b) => a.key.localeCompare(b.key));
};

export const topExpenses = (expenses, limit = 5) =>
  [...expenses]
    .sort((a, b) => Number(b.amount) - Number(a.amount))
    .slice(0, limit);

// "Accounts" are represented by the existing expenses.method field.
export const methodBreakdown = (expenses, incomes = []) => {
  const spend = groupBy(expenses, (e) => e.method, "Other");
  const earn = groupBy(incomes, (i) => i.method, "Other");
  const names = new Set([...spend, ...earn].map((g) => g.name));
  return Array.from(names)
    .map((name) => {
      const s = spend.find((g) => g.name === name);
      const e = earn.find((g) => g.name === name);
      return {
        name,
        spent: s?.total || 0,
        earned: e?.total || 0,
        balance: (e?.total || 0) - (s?.total || 0),
        count: (s?.count || 0) + (e?.count || 0),
      };
    })
    .sort((a, b) => b.spent - a.spent);
};

export const behaviourStats = (expenses, start, end) => {
  const days = dailySeries(expenses);
  const spanDays = start && end ? daysBetween(start, end) : days.length || 1;
  const cats = categoryBreakdown(expenses);
  const topCat = cats[0] || null;
  const subs = topCat ? subcategoryBreakdown(expenses, topCat.name) : [];

  return {
    total: sum(expenses),
    transactionCount: expenses.length,
    avgTransaction: average(expenses),
    avgDaily: safeDiv(sum(expenses), spanDays),
    avgTxnPerDay: safeDiv(expenses.length, spanDays),
    largestExpense: topExpenses(expenses, 1)[0] || null,
    highestDay: days.length
      ? days.reduce((a, b) => (b.total > a.total ? b : a))
      : null,
    lowestDay: days.length
      ? days.reduce((a, b) => (b.total < a.total ? b : a))
      : null,
    topCategory: topCat,
    topSubcategory: subs[0] || null,
    mostFrequentCategory:
      [...cats].sort((a, b) => b.count - a.count)[0] || null,
  };
};

// Natural-language insights derived strictly from real data. Returns [] when data is thin.
export const buildInsights = (stats, categoryComparisons) => {
  const out = [];
  if (stats.transactionCount === 0) return out;

  if (stats.topCategory) {
    out.push({
      icon: "trending-up-outline",
      tone: "neutral",
      text: `${stats.topCategory.name} is your highest spending category at ${formatCurrency(stats.topCategory.total)} (${stats.topCategory.percentage.toFixed(0)}%).`,
    });
  }
  if (stats.avgDaily > 0) {
    out.push({
      icon: "calendar-outline",
      tone: "neutral",
      text: `Your average daily spending is ${formatCurrency(stats.avgDaily)}.`,
    });
  }
  // Flag categories that moved more than 25% vs last month, only when a real baseline exists.
  (categoryComparisons || [])
    .filter(
      (c) =>
        c.previous > 0 && c.changePct !== null && Math.abs(c.changePct) >= 25,
    )
    .sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct))
    .slice(0, 3)
    .forEach((c) => {
      out.push({
        icon:
          c.changePct > 0
            ? "arrow-up-circle-outline"
            : "arrow-down-circle-outline",
        tone: c.changePct > 0 ? "bad" : "good",
        text: `Your ${c.name} spending is ${Math.abs(c.changePct).toFixed(0)}% ${c.changePct > 0 ? "higher" : "lower"} than last month.`,
      });
    });
  if (stats.largestExpense) {
    out.push({
      icon: "flame-outline",
      tone: "neutral",
      text: `Largest single expense: ${stats.largestExpense.title} — ${formatCurrency(stats.largestExpense.amount)}.`,
    });
  }
  return out;
};
